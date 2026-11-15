import { router, useNavigation } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'

import { updateMe } from '@/api/me'
import { useSession } from '@/auth/session'
import { errorMessage } from '@/lib/api'
import { normalizeBirthday } from '@/lib/profileValidation'
import { UNDERAGE_MESSAGE, validateAdultBirthday } from '@/lib/signUpValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

import { KeyboardScreen } from '@/ui/KeyboardScreen'
// Shown once after a first Google sign-in, which gives no birthday: the web asks the same before letting a new account in.
export default function Age() {
  const { session, loading, signOut, update } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const [birthday, setBirthday] = useState('')
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [underage, setUnderage] = useState(false)
  const inFlight = useRef(false)
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null)
  const error = validateAdultBirthday(birthday) ?? undefined

  async function back() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    await signOut()
    router.replace('/sign-in')
  }

  async function submit() {
    if (inFlight.current) return
    setTouched(true)
    if (error === UNDERAGE_MESSAGE) {
      inFlight.current = true
      setPending(true)
      await signOut()
      inFlight.current = false
      setPending(false)
      return setUnderage(true)
    }
    if (error) return inputRef.current?.focus()

    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      update(await updateMe({ birthday: normalizeBirthday(birthday)! }))
      toast('Birthday saved. Welcome to KRAL.')
      if (!navigation.isFocused()) return
      if (router.canGoBack()) router.back()
      else router.replace('/(tabs)')
    } catch (failed) {
      setFailure(errorMessage(failed))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  if (underage) {
    return (
      <View style={styles.content}>
        <StateMessage alert testID="age-underage" title="Under 18" message={UNDERAGE_MESSAGE} actionLabel="Back to Sign In" onAction={() => router.replace('/sign-in')} />
      </View>
    )
  }
  if (loading) {
    return (
      <View testID="age-loading" accessibilityLiveRegion="polite" accessibilityLabel="Loading" style={styles.center}>
        <ActivityIndicator color={color.obsidian} />
      </View>
    )
  }
  if (!session) {
    return (
      <View style={styles.content}>
        <StateMessage testID="age-signin" title="Sign In to Continue" message="You need to be signed in to confirm your age." actionLabel="Sign In" onAction={() => router.replace('/sign-in')} />
      </View>
    )
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={type.h1}>Confirm Your Age</Text>
        <Text style={[type.body, { color: color.graphite }]}>Google did not share your birthday. KRAL accounts are for people 18 or older, so enter yours to continue.</Text>
        <FloatingField
          ref={inputRef}
          testID="age-birthday"
          label="Birthday (YYYY-MM-DD)"
          value={birthday}
          onChangeText={(text) => setBirthday(text.replace(/[^\d\-/.]/g, ''))}
          onBlur={() => setTouched(true)}
          error={touched && error !== UNDERAGE_MESSAGE ? error : undefined}
          helper="You must be 18 or older."
          editable={!pending}
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {failure && (
          <View testID="age-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{`We couldn't save your birthday. ${failure}`}</Text>
          </View>
        )}
        <Button testID="age-submit" label={failure ? 'Try Again' : 'Continue'} pending={pending} onPress={submit} />
        <Button testID="age-back" variant="secondary" label="Back to Sign In" disabled={pending} onPress={back} />
      </ScrollView>
    </KeyboardScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  center: { flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg, gap: space.lg },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
