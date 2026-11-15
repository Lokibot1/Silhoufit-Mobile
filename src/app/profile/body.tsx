import { Ionicons } from '@expo/vector-icons'
import { router, useNavigation, usePreventRemove } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchBodyProfile, saveBodyProfile, updateBodyProfile, type BodyBuildId, type BodyModelId, type BodyProfile } from '@/api/bodyProfile'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { changedFields, fieldsFor, rangeOf, readTexts, SPECS, sameValue, sanitizeInput, toPayload, toTexts, warnings, type Field, type Texts } from '@/lib/bodyMeasurements'
import { useRequest } from '@/lib/useRequest'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { FloatingField } from '@/ui/FloatingField'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

const MODELS: { value: BodyModelId; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]
const BUILDS: { value: BodyBuildId; label: string }[] = [
  { value: 'skinny', label: 'Skinny' },
  { value: 'lean', label: 'Lean' },
  { value: 'skinny_fat', label: 'Skinny Fat' },
  { value: 'regular', label: 'Regular' },
  { value: 'muscular', label: 'Muscular' },
  { value: 'overweight', label: 'Fat / Overweight' },
]
const GROUPS: { title: string; fields: Field[] }[] = [
  { title: '(Basics)', fields: ['height', 'weight'] },
  { title: '(Upper Body)', fields: ['shoulders', 'sleeve', 'bust', 'chest', 'torso'] },
  { title: '(Waist and Legs)', fields: ['waist', 'hips', 'thigh', 'inseam', 'outseam'] },
]

function failureCopy(failure: unknown): string {
  if (failure instanceof ApiError && failure.kind === 'validation') return `We couldn't save your measurements. The server said: ${failure.detail ?? 'a value is not valid'}. Check each field, then save again.`
  return `We couldn't save your measurements. ${errorMessage(failure)}`
}

function Form({ saved: initial }: { saved: BodyProfile | null }) {
  const { signOut } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const [saved, setSaved] = useState(initial)
  const [texts, setTexts] = useState<Texts>(() => toTexts(initial))
  const [model, setModel] = useState<BodyModelId | null>(initial?.bodyModel ?? null)
  const [build, setBuild] = useState<BodyBuildId | null>(initial?.bodyBuild ?? null)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [finished, setFinished] = useState(false)
  const refs = useRef<Partial<Record<Field, ComponentRef<typeof TextInput> | null>>>({})

  const baseTexts = toTexts(saved)
  const { entered, errors, notes: savedNotes } = readTexts(texts, model, baseTexts)
  const fields = fieldsFor(model)
  const dirty = fields.some((f) => !sameValue(texts[f], baseTexts[f])) || model !== (saved?.bodyModel ?? null) || build !== (saved?.bodyBuild ?? null)
  const notes = [...savedNotes, ...warnings(entered)]

  // Unsaved-changes guard: covers the header back, the swipe and hardware back.
  usePreventRemove(dirty && !finished, ({ data }) =>
    Alert.alert('Discard changes?', 'Your measurements have not been saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]),
  )

  // Leaves once a save has gone through (after the guard has let go).
  useEffect(() => {
    if (!finished) return
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/profile')
  }, [finished])

  function setText(field: Field, text: string) {
    setFailure(null)
    setTexts((current) => ({ ...current, [field]: sanitizeInput(text) }))
  }

  async function save() {
    if (inFlight.current || !dirty) return
    setTouched(Object.fromEntries(fields.map((f) => [f, true])))
    const invalid = fields.find((f) => errors[f])
    if (invalid) return refs.current[invalid]?.focus()
    const payload = toPayload(entered, model, build, saved)
    if (!payload) return

    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const patch = saved ? changedFields(payload, saved) : null
      let updated: BodyProfile
      if (!patch) updated = await saveBodyProfile(payload)
      else if (!Object.keys(patch).length) updated = saved!
      else {
        try {
          updated = await updateBodyProfile(patch)
        } catch (reason) {
          // The profile was deleted elsewhere (web) since this screen loaded: create it instead.
          if (!(reason instanceof ApiError && reason.kind === 'not-found')) throw reason
          updated = await saveBodyProfile(payload)
        }
      }
      setSaved(updated)
      toast('Measurements saved')
      setFinished(true) // stays pending until this screen unmounts, so the button cannot be tapped twice
    } catch (reason) {
      inFlight.current = false
      setPending(false)
      if (reason instanceof ApiError && reason.status === 401) {
        toast('Your session has expired. Sign in again.')
        void signOut()
      } else setFailure(failureCopy(reason))
    }
  }

  return (
    <KeyboardScreen style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={type.h1}>Body Profile</Text>
        <Text testID="body-intro" style={styles.copy}>
          {saved ? 'Keep your measurements up to date for the best size advice.' : 'Your measurements help us suggest the right size and power AR try-on.'}
        </Text>
        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={16} color={color.graphite} />
          <Text testID="body-privacy" style={[type.small, styles.privacyText]}>Only you can see your measurements. All lengths are in centimetres (cm) and weight is in kilograms (kg).</Text>
        </View>

        <View style={styles.group}>
          <Text style={type.label}>(Body Model)</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {MODELS.map((option) => (
              <Chip tall radio key={option.value} testID={`body-model-${option.value}`} label={option.label} selected={model === option.value} disabled={pending} onPress={() => setModel(option.value)} />
            ))}
          </View>
        </View>
        <View style={styles.group}>
          <Text style={type.label}>(Build)</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {BUILDS.map((option) => (
              <Chip tall radio key={option.value} testID={`body-build-${option.value}`} label={option.label} selected={build === option.value} disabled={pending} onPress={() => setBuild(option.value)} />
            ))}
          </View>
        </View>

        {GROUPS.map((group) => {
          const shown = group.fields.filter((f) => fields.includes(f))
          return (
            <View key={group.title} style={styles.group}>
              <Text style={type.label}>{group.title}</Text>
              {shown.map((field) => (
                <FloatingField
                  key={field}
                  ref={(node) => {
                    refs.current[field] = node
                  }}
                  testID={`body-${field}`}
                  numeric
                  label={`${SPECS[field].label}${field === 'height' ? '' : ' (optional)'}`}
                  value={texts[field]}
                  onChangeText={(text) => setText(field, text)}
                  onBlur={() => setTouched((current) => ({ ...current, [field]: true }))}
                  error={touched[field] ? errors[field] : undefined}
                  helper={`${SPECS[field].what} ${rangeOf(field)}.`}
                  editable={!pending}
                  keyboardType="decimal-pad"
                />
              ))}
            </View>
          )
        })}

        {notes.length > 0 && (
          <View testID="body-warnings" accessibilityLiveRegion="polite" style={styles.banner}>
            {notes.map((note) => (
              <Text key={note} style={type.body}>{note}</Text>
            ))}
          </View>
        )}
        {failure && (
          <View testID="body-banner" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure}</Text>
          </View>
        )}

        <Button testID="body-save" label="Save Measurements" pending={pending} disabled={!dirty} onPress={save} />
      </ScrollView>
    </KeyboardScreen>
  )
}

function Loader() {
  const { status, data, error, retry } = useRequest('body-profile', fetchBodyProfile)
  const { signOut } = useSession()
  const opening = useRef(false)

  if (status === 'loading') {
    return (
      <View testID="body-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
        <Skeleton width="30%" height={20} />
        <Skeleton width="50%" height={32} />
        <Skeleton height={48} />
        <Skeleton height={24} />
        {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={76} />)}
        <Skeleton height={48} />
      </View>
    )
  }
  if (status === 'error') {
    if (error instanceof ApiError && error.status === 401) {
      return (
        <View style={styles.content}>
          <StateMessage
            alert
            title="Sign in again"
            message="Your session has expired. Sign in to see your measurements."
            actionLabel="Sign In"
            testID="body-sign-in"
            onAction={() => {
              if (opening.current) return
              opening.current = true
              void signOut().finally(() => router.push('/sign-in'))
            }}
          />
        </View>
      )
    }
    return (
      <View style={styles.content}>
        <StateMessage alert title="Couldn't load your measurements" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="body-retry" />
      </View>
    )
  }
  return <Form saved={data ?? null} />
}

// Needs a session; the four states are the skeleton, the load error, the first-time form (empty) and the saved form.
export default function BodyProfileScreen() {
  const { session, loading } = useSession()
  const opening = useRef(false)

  if (loading) {
    return (
      <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
        <Skeleton width="30%" height={20} />
        <Skeleton width="50%" height={32} />
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={76} />)}
      </View>
    )
  }
  if (!session) {
    return (
      <View style={styles.content}>
        <StateMessage
          title="Sign in to add your measurements"
          message="Your measurements are saved to your account once you sign in."
          actionLabel="Sign In"
          onAction={() => {
            if (opening.current) return
            opening.current = true
            router.push('/sign-in')
          }}
          testID="body-signed-out"
        />
      </View>
    )
  }
  return <Loader />
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.md, backgroundColor: color.paper },
  copy: { ...type.body, color: color.graphite },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  privacyText: { flex: 1, color: color.graphite },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  banner: { gap: space.sm, borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
