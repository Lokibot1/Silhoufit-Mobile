import { router, useFocusEffect, useNavigation } from 'expo-router'
import { useCallback, useRef, useState, type ComponentRef } from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { updateMe, type Gender, type Me, type MePatch } from '@/api/me'
import { hasPasswordLogin } from '@/auth/email'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { NAME_MAX, GENDER_OPTIONS, SUFFIX_MAX, normalizeBirthday, normalizeName, validateBirthday, validateName, validateSuffix } from '@/lib/profileValidation'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { FloatingField } from '@/ui/FloatingField'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type Field = 'firstName' | 'middleName' | 'lastName' | 'suffix' | 'birthday'
type Values = Record<Field, string> & { gender: Gender | null }

const ORDER: Field[] = ['firstName', 'middleName', 'lastName', 'suffix', 'birthday']

const fromMe = (me: Me): Values => ({ firstName: me.firstName, middleName: me.middleName ?? '', lastName: me.lastName, suffix: me.suffix ?? '', birthday: me.birthday ?? '', gender: me.gender })

function validate(v: Values): Partial<Record<Field, string>> {
  const found = {
    firstName: validateName(v.firstName, 'First name', true),
    middleName: validateName(v.middleName, 'Middle name', false),
    lastName: validateName(v.lastName, 'Last name', true),
    suffix: validateSuffix(v.suffix),
    birthday: validateBirthday(v.birthday),
  }
  return Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as Partial<Record<Field, string>>
}

// Only the fields that differ from what is saved; a blank optional field becomes null, which clears it on the server.
function changes(v: Values, saved: Values): MePatch {
  const patch: MePatch = {}
  // The saved value is normalized too, so a server name with stray spaces is not a change.
  if (normalizeName(v.firstName) !== normalizeName(saved.firstName)) patch.firstName = normalizeName(v.firstName)
  if (normalizeName(v.lastName) !== normalizeName(saved.lastName)) patch.lastName = normalizeName(v.lastName)
  if (normalizeName(v.middleName) !== normalizeName(saved.middleName)) patch.middleName = normalizeName(v.middleName) || null
  if (v.suffix.trim() !== saved.suffix.trim()) patch.suffix = v.suffix.trim() || null
  const birthday = v.birthday.trim() ? (normalizeBirthday(v.birthday) ?? v.birthday.trim()) : ''
  if (birthday !== saved.birthday) patch.birthday = birthday || null
  if (v.gender !== saved.gender) patch.gender = v.gender
  return patch
}

function failureCopy(failure: unknown): string {
  if (failure instanceof ApiError && failure.kind === 'validation') return `We couldn't save your profile. The server said: ${failure.detail ?? 'a field is not valid'}. Check each field, then save again.`
  if (failure instanceof ApiError && failure.kind === 'forbidden') return "We couldn't save your profile. This account isn't allowed to change it. Contact the store for help."
  return `We couldn't save your profile. ${errorMessage(failure)}`
}

function Form({ me }: { me: Me }) {
  const { session, signOut, update } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const saved = fromMe(me)
  const [values, setValues] = useState<Values>(saved)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  const opening = useRef(false)
  // A fast double tap must not stack two password screens; allow it again when this screen regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
  const firstNameRef = useRef<ComponentRef<typeof TextInput>>(null)
  const middleNameRef = useRef<ComponentRef<typeof TextInput>>(null)
  const lastNameRef = useRef<ComponentRef<typeof TextInput>>(null)
  const suffixRef = useRef<ComponentRef<typeof TextInput>>(null)
  const birthdayRef = useRef<ComponentRef<typeof TextInput>>(null)

  const errors = validate(values)
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined)
  const patch = changes(values, saved)
  const changed = Object.keys(patch).length > 0

  function set(next: Partial<Values>) {
    setFailure(null)
    setValues((current) => ({ ...current, ...next }))
  }
  function blur(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }))
    // Show a forgivingly typed birthday the way it will be saved.
    if (field === 'birthday') set({ birthday: normalizeBirthday(values.birthday) ?? values.birthday })
  }

  // Read focus at call time: if this screen is gone or covered by now, going back would pop an unrelated screen.
  function leave() {
    if (!navigation.isFocused()) {
      // Not leaving: free the form so there is no stuck spinner when the user returns.
      inFlight.current = false
      setPending(false)
      return
    }
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/profile')
  }

  async function save() {
    if (inFlight.current || !changed) return
    setTouched({ firstName: true, middleName: true, lastName: true, suffix: true, birthday: true })
    const invalid = ORDER.find((field) => errors[field])
    if (invalid) return { firstName: firstNameRef, middleName: middleNameRef, lastName: lastNameRef, suffix: suffixRef, birthday: birthdayRef }[invalid].current?.focus()

    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      const updated = await updateMe(patch)
      update(updated)
      toast('Profile updated')
      leave() // stays "pending" until this screen unmounts, so the button cannot be tapped twice
    } catch (reason) {
      inFlight.current = false
      setPending(false)
      // The backend can reject a token Supabase still holds: sign out so the sign-in prompt is truthful.
      if (reason instanceof ApiError && reason.status === 401) {
        toast('Your session has expired. Sign in again.')
        void signOut()
      } else setFailure(failureCopy(reason))
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={type.label}>(Account)</Text>
        <Text accessibilityRole="header" style={type.h1}>Edit Profile</Text>

        <FloatingField
          ref={firstNameRef}
          testID="edit-first-name"
          label="First name"
          value={values.firstName}
          onChangeText={(text) => set({ firstName: text })}
          onBlur={() => blur('firstName')}
          error={shown('firstName')}
          editable={!pending}
          autoCapitalize="words"
          autoComplete="name-given"
          textContentType="givenName"
          maxLength={NAME_MAX}
          returnKeyType="next"
          onSubmitEditing={() => middleNameRef.current?.focus()}
        />
        <FloatingField
          ref={middleNameRef}
          testID="edit-middle-name"
          label="Middle name (optional)"
          value={values.middleName}
          onChangeText={(text) => set({ middleName: text })}
          onBlur={() => blur('middleName')}
          error={shown('middleName')}
          editable={!pending}
          autoCapitalize="words"
          autoComplete="name-middle"
          textContentType="middleName"
          maxLength={NAME_MAX}
          returnKeyType="next"
          onSubmitEditing={() => lastNameRef.current?.focus()}
        />
        <FloatingField
          ref={lastNameRef}
          testID="edit-last-name"
          label="Last name"
          value={values.lastName}
          onChangeText={(text) => set({ lastName: text })}
          onBlur={() => blur('lastName')}
          error={shown('lastName')}
          editable={!pending}
          autoCapitalize="words"
          autoComplete="name-family"
          textContentType="familyName"
          maxLength={NAME_MAX}
          returnKeyType="next"
          onSubmitEditing={() => suffixRef.current?.focus()}
        />
        <FloatingField
          ref={suffixRef}
          testID="edit-suffix"
          label="Suffix (optional)"
          value={values.suffix}
          onChangeText={(text) => set({ suffix: text })}
          onBlur={() => blur('suffix')}
          error={shown('suffix')}
          helper={`${values.suffix.length}/${SUFFIX_MAX}`}
          editable={!pending}
          autoCorrect={false}
          textContentType="nameSuffix"
          maxLength={SUFFIX_MAX}
          returnKeyType="next"
          onSubmitEditing={() => birthdayRef.current?.focus()}
        />
        <FloatingField
          ref={birthdayRef}
          testID="edit-birthday"
          label="Birthday (optional)"
          value={values.birthday}
          onChangeText={(text) => set({ birthday: text })}
          onBlur={() => blur('birthday')}
          error={shown('birthday')}
          helper="YYYY-MM-DD, like 1995-05-15"
          editable={!pending}
          keyboardType={Platform.select({ ios: 'numbers-and-punctuation', default: 'default' })}
          autoCorrect={false}
          maxLength={14}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <View style={styles.group}>
          <Text style={type.label}>(Gender)</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {GENDER_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                testID={`edit-gender-${option.value ?? 'none'}`}
                label={option.label}
                selected={values.gender === option.value}
                onPress={() => !pending && set({ gender: option.value })}
              />
            ))}
          </View>
        </View>

        {failure && (
          <View testID="edit-banner" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure}</Text>
          </View>
        )}

        <Button testID="edit-save" label="Save Changes" pending={pending} disabled={!changed} onPress={save} />
        {hasPasswordLogin(session?.user) && (
          <Button
            testID="edit-change-password"
            variant="secondary"
            label="Change Password"
            disabled={pending}
            onPress={() => {
              if (opening.current) return
              opening.current = true
              router.push('/profile/password')
            }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// Needs a session and a loaded profile; the four states are the skeleton, the profile error, the sign-in prompt and the form.
export default function EditProfile() {
  const { session, profile, loading, error, retry } = useSession()
  const opening = useRef(false)

  if (loading) {
    return (
      <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
        <Skeleton width="30%" height={20} />
        <Skeleton width="60%" height={32} />
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} />)}
        <Skeleton height={36} />
        <Skeleton height={48} />
      </View>
    )
  }
  if (profile) return <Form me={profile} />
  return (
    <View style={styles.content}>
      {error ? (
        <StateMessage alert title="Couldn't load your profile" message={error} actionLabel="Retry" onAction={retry} testID="edit-retry" />
      ) : (
        !session && (
          <StateMessage
            title="Sign in to edit your profile"
            message="Your details appear here once you sign in."
            actionLabel="Sign In"
            onAction={() => {
              if (opening.current) return
              opening.current = true
              router.push('/sign-in')
            }}
            testID="edit-sign-in"
          />
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.md, backgroundColor: color.paper },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
