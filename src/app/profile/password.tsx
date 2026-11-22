import { router } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { changePassword, hasPasswordLogin, type ChangePasswordResult } from '@/auth/email'
import { useSession } from '@/auth/session'
import { stripEmoji } from '@/lib/profileValidation'
import { LIMITS, validateConfirmPassword, validatePassword } from '@/lib/signUpValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { PasswordChecklist } from '@/ui/PasswordChecklist'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

type Failure = Exclude<Extract<ChangePasswordResult, { ok: false }>['kind'], 'wrong-password' | 'same'> | 'no-email'
// What happened, why and the next step. A wrong current password and a repeated one show on their fields instead.
const FAILURE: Record<Failure, { title: string; body: string }> = {
  'rate-limit': { title: 'Too many attempts.', body: 'Your password was not changed. Wait a few minutes, then try again.' },
  network: { title: 'Your password was not changed.', body: 'The connection dropped before we got a response. Check your connection and try again.' },
  server: { title: 'Your password was not changed.', body: 'Something went wrong on our side. Try again in a moment.' },
  expired: { title: 'Your session has expired.', body: 'Your password was not changed. Sign out, sign in again, then change it from your profile.' },
  'no-email': { title: 'This account has no email address to verify.', body: 'Your password was not changed. Sign in with an account that has an email address to change it.' },
  weak: { title: 'Your password was not changed.', body: 'The sign-in service found the new password too weak. Choose a longer or less common password, then try again.' },
}

// Its own screen, linked from Edit Profile: the profile form saves once, this one re-checks the current password first.
export default function ChangePassword() {
  const styles = useStyles()
  const { type } = useTheme()
  const { session, loading } = useSession()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [password, setPasswordText] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({ current: false, password: false, confirm: false })
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [wrong, setWrong] = useState(false)
  const [same, setSame] = useState(false)
  const inFlight = useRef(false)
  const opening = useRef(false)
  const mounted = useRef(true)
  const currentRef = useRef<ComponentRef<typeof TextInput>>(null)
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null)
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null)

  useEffect(() => () => { mounted.current = false }, [])

  const currentError = current ? undefined : 'Enter your current password.'
  const passwordError = validatePassword(password) ?? (current && password === current ? 'Choose a password different from your current one.' : undefined)
  const confirmError = validateConfirmPassword(password, confirm) ?? undefined

  const open = (path: '/sign-in' | '/forgot-password') => {
    if (opening.current) return
    opening.current = true
    router.push(path)
  }

  async function submit() {
    if (inFlight.current) return
    setTouched({ current: true, password: true, confirm: true })
    if (currentError) return currentRef.current?.focus()
    if (passwordError) return passwordRef.current?.focus()
    if (confirmError) return confirmRef.current?.focus()
    const email = session?.user.email
    if (!email) return setFailure('no-email')

    inFlight.current = true
    setPending(true)
    setFailure(null)
    setWrong(false)
    setSame(false)
    const result = await changePassword(email, current, password) // never throws: failures come back as a kind
    inFlight.current = false
    setPending(false)
    if (result.ok) {
      setCurrent('')
      setPasswordText('')
      setConfirm('')
      setTouched({ current: false, password: false, confirm: false })
      return toast('Password updated.')
    }
    // Gone from the screen: nothing shows the failure, so say it once as a toast.
    if (!mounted.current) {
      if (result.kind === 'wrong-password') return toast('Your password was not changed. The current password was incorrect.')
      if (result.kind === 'same') return toast('Your password was not changed. The new one matches your current password.')
      return toast(`${FAILURE[result.kind].title} ${FAILURE[result.kind].body}`)
    }
    if (result.kind === 'wrong-password') {
      setWrong(true)
      return currentRef.current?.focus()
    }
    if (result.kind === 'same') {
      setSame(true)
      return passwordRef.current?.focus()
    }
    setFailure(result.kind)
  }

  if (loading) {
    return (
      <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
        <Skeleton width="60%" height={32} />
        {[0, 1, 2].map((i) => <Skeleton key={i} height={56} />)}
        <Skeleton height={48} />
      </View>
    )
  }
  if (!session) {
    return (
      <View style={styles.content}>
        <StateMessage title="Sign in to change your password" message="Your account settings appear here once you sign in." actionLabel="Sign In" onAction={() => open('/sign-in')} testID="password-sign-in" />
      </View>
    )
  }
  if (!hasPasswordLogin(session.user)) {
    return (
      <View testID="password-google" style={styles.content}>
        <StateMessage title="No password to change" message="You signed in with Google. Set a password via Forgot password." actionLabel="Forgot Password" onAction={() => open('/forgot-password')} testID="password-forgot" />
      </View>
    )
  }

  const field = { editable: !pending, secureTextEntry: true, maxLength: LIMITS.passwordMaxLength, autoCapitalize: 'none', autoCorrect: false } as const
  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FloatingField
          {...field}
          ref={currentRef}
          testID="password-current"
          toggleTestID="password-toggle-current"
          label="Current password"
          value={current}
          onChangeText={(text) => {
            setCurrent(text)
            setWrong(false)
          }}
          onBlur={() => setTouched((t) => ({ ...t, current: true }))}
          error={wrong ? 'Current password is incorrect.' : touched.current ? currentError : undefined}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <FloatingField
          {...field}
          ref={passwordRef}
          testID="password-new"
          toggleTestID="password-toggle-new"
          label="New password"
          value={password}
          onChangeText={(text) => {
            setPasswordText(stripEmoji(text))
            setSame(false)
          }}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={same ? 'This is already your password. Choose a different one.' : touched.password ? passwordError : undefined}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordChecklist testID="password-checklist" password={password} email={session.user.email ?? ''} firstName="" />
        <FloatingField
          {...field}
          ref={confirmRef}
          testID="password-confirm"
          toggleTestID="password-toggle-confirm"
          label="Confirm password"
          value={confirm}
          onChangeText={(text) => setConfirm(stripEmoji(text))}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={touched.confirm ? confirmError : undefined}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {failure && (
          <View testID="password-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={[type.body, styles.bold]}>{FAILURE[failure].title}</Text>
            <Text style={type.body}>{FAILURE[failure].body}</Text>
          </View>
        )}
        <Button testID="password-submit" label="Update Password" pending={pending} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardScreen>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.lg, backgroundColor: color.paper },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md, gap: space.xs },
  bold: { fontFamily: font.semibold },
}))
