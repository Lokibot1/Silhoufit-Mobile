import { router } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { RESET_REDIRECT, setPassword, type SetPasswordErrorKind } from '@/auth/email'
import { useSession } from '@/auth/session'
import { useEmailLink } from '@/auth/useEmailLink'
import { stripEmoji } from '@/lib/profileValidation'
import { LIMITS, validateConfirmPassword, validatePassword } from '@/lib/signUpValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { PasswordChecklist } from '@/ui/PasswordChecklist'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

// What happened, why and the next step. `same` shows on the field and `expired` swaps the screen for the expired state.
const FAILURE: Record<Exclude<SetPasswordErrorKind, 'same' | 'weak' | 'expired'>, { title: string; body: string }> = {
  'rate-limit': { title: 'Too many attempts.', body: 'Your password was not set. Wait a few minutes, then try again.' },
  network: { title: 'Your password was not set.', body: 'The connection dropped before we got a response. Check your connection and try again.' },
  server: { title: 'Your password was not set.', body: 'Something went wrong on our side. Try again in a moment.' },
}

export default function ResetPassword() {
  const { state, retry } = useEmailLink(RESET_REDIRECT)
  const { session, profile, signOut } = useSession()
  const toast = useToast()
  const [password, setPasswordText] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null)
  const [same, setSame] = useState(false)
  const [gone, setGone] = useState(false)
  const inFlight = useRef(false)
  const saved = useRef(false)
  const leave = useRef<() => void>(() => {})
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null)
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null)

  // Leaving before a password is set must not leave the recovery session signed in.
  leave.current = () => {
    if (state === 'ok' && !saved.current) signOut().catch(() => {})
  }
  useEffect(() => () => leave.current(), [])

  const passwordError = validatePassword(password) ?? undefined
  const confirmError = validateConfirmPassword(password, confirm) ?? undefined

  async function submit() {
    if (inFlight.current) return
    setTouched({ password: true, confirm: true })
    if (passwordError) return passwordRef.current?.focus()
    if (confirmError) return confirmRef.current?.focus()

    inFlight.current = true
    setPending(true)
    setFailure(null)
    setSame(false)
    const result = await setPassword(password) // never throws: failures come back as a kind
    inFlight.current = false
    setPending(false)
    if (result.ok) {
      saved.current = true
      // A reset ends the recovery session: sign in again with the new password.
      await signOut().catch(() => {})
      toast('Password updated. Sign in with your new password.')
      return router.replace('/sign-in')
    }
    if (result.kind === 'expired') return setGone(true)
    if (result.kind === 'same') {
      setSame(true)
      return passwordRef.current?.focus()
    }
    if (result.kind === 'weak') {
      return setFailure({ title: 'Your password was not set.', body: `${result.detail ?? 'The sign-in service found the password too weak.'} Choose a longer or less common password, then try again.` })
    }
    setFailure(FAILURE[result.kind])
  }

  if (state === 'checking') {
    return (
      <View testID="reset-checking" accessibilityLiveRegion="polite" accessibilityLabel="Checking your link" style={styles.center}>
        <ActivityIndicator color={color.obsidian} />
      </View>
    )
  }
  if (state === 'network' || state === 'rate-limit') {
    const limited = state === 'rate-limit'
    return (
      <View style={styles.content}>
        <StateMessage
          alert
          testID="reset-retry"
          title={limited ? 'Too Many Attempts' : "Can't check your link"}
          message={limited ? 'Too many attempts. Try again in a few minutes.' : 'The connection dropped before we could check your link. Check your connection and try again.'}
          actionLabel="Retry"
          onAction={retry}
        />
      </View>
    )
  }
  if (state !== 'ok' || gone) {
    return (
      <View style={styles.content}>
        <StateMessage
          alert
          testID="reset-expired"
          title="Link Expired"
          message="This link has expired or was already used. Request a new link on this phone."
          actionLabel="Send a New Reset Email"
          onAction={() => router.replace('/forgot-password')}
        />
        <Button testID="reset-shop" variant="secondary" label="Back to Shop" onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={type.h1}>Choose a New Password</Text>
        <FloatingField
          ref={passwordRef}
          testID="reset-password"
          toggleTestID="reset-toggle-password"
          label="New password"
          value={password}
          onChangeText={(text) => {
            setPasswordText(stripEmoji(text))
            setSame(false)
          }}
          onBlur={() => setTouched((current) => ({ ...current, password: true }))}
          error={same ? 'This is already your password. Choose a different one.' : touched.password ? passwordError : undefined}
          editable={!pending}
          secureTextEntry
          maxLength={LIMITS.passwordMaxLength}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordChecklist testID="reset-checklist" password={password} email={session?.user.email ?? ''} firstName={profile?.firstName ?? ''} />
        <FloatingField
          ref={confirmRef}
          testID="reset-confirm"
          toggleTestID="reset-toggle-confirm"
          label="Confirm password"
          value={confirm}
          onChangeText={(text) => setConfirm(stripEmoji(text))}
          onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
          error={touched.confirm ? confirmError : undefined}
          editable={!pending}
          secureTextEntry
          maxLength={LIMITS.passwordMaxLength}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {failure && (
          <View testID="reset-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={[type.body, styles.bold]}>{failure.title}</Text>
            <Text style={type.body}>{failure.body}</Text>
          </View>
        )}
        <Button testID="reset-submit" label={failure ? 'Try Again' : 'Set Password'} pending={pending} onPress={submit} />
      </ScrollView>
    </KeyboardScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  center: { flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg, gap: space.lg },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md, gap: space.xs },
  bold: { fontFamily: font.semibold },
})
