import { router } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { requestPasswordReset, type MailErrorKind } from '@/auth/email'
import { validateEmail } from '@/lib/loginValidation'
import { stripEmoji } from '@/lib/profileValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { KralLogo } from '@/ui/KralLogo'
import { space, themed, useTheme } from '@/ui/theme'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

// Identical for every address: the screen must never reveal whether an account exists.
const SENT = 'If an account exists for that address, we sent a link to reset your password. The link expires in 30 minutes.'
// What happened, why, and the next step.
const FAILURE: Record<MailErrorKind, string> = {
  network: "We couldn't send the link. The connection dropped before we got a response. Check your connection and try again.",
  'rate-limit': 'Too many reset requests. Our servers are limiting emails for now, so nothing was sent. Wait a minute, then try again.',
  server: "We couldn't send the link. Something went wrong on our side. Try again in a moment.",
}

export default function ForgotPassword() {
  const styles = useStyles()
  const { color, type } = useTheme()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<MailErrorKind | null>(null)
  const [sent, setSent] = useState(false)
  const inFlight = useRef(false)
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null)

  function change(text: string) {
    const clean = stripEmoji(text)
    setEmail(clean)
    if (touched) setError(validateEmail(clean) ?? undefined)
  }

  function back() {
    if (router.canGoBack()) router.back()
    else router.replace('/sign-in')
  }

  async function submit() {
    if (inFlight.current) return
    const invalid = validateEmail(email)
    setTouched(true)
    setError(invalid ?? undefined)
    if (invalid) return emailRef.current?.focus()

    inFlight.current = true
    setPending(true)
    setFailure(null)
    const result = await requestPasswordReset(email.trim()) // never throws: failures come back as a kind
    inFlight.current = false
    setPending(false)
    if (result.ok) setSent(true)
    else setFailure(result.kind)
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <KralLogo width={120} />
        <Text accessibilityRole="header" style={type.h1}>{sent ? 'Check Your Email' : 'Forgot Password'}</Text>

        {sent ? (
          <>
            <View testID="forgot-sent" accessibilityLiveRegion="polite">
              <Text style={type.body}>{SENT}</Text>
            </View>
            <Button testID="forgot-back" label="Back to Sign In" onPress={back} />
          </>
        ) : (
          <>
            <Text style={[type.body, { color: color.graphite }]}>Enter the email you signed up with and we will send you a link to choose a new password.</Text>
            <FloatingField
              ref={emailRef}
              testID="forgot-email"
              label="Email"
              value={email}
              onChangeText={change}
              onBlur={() => {
                setTouched(true)
                setError(validateEmail(email) ?? undefined)
              }}
              error={error}
              editable={!pending}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={254}
              returnKeyType="send"
              onSubmitEditing={submit}
            />
            {failure && (
              <View testID="forgot-error" accessibilityRole="alert" style={styles.banner}>
                <Text style={type.body}>{FAILURE[failure]}</Text>
              </View>
            )}
            <Button testID="forgot-submit" label={failure ? 'Try Again' : 'Send Reset Link'} pending={pending} onPress={submit} />
            <Button testID="forgot-back" variant="secondary" label="Back to Sign In" disabled={pending} onPress={back} />
          </>
        )}
      </ScrollView>
    </KeyboardScreen>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { padding: space.lg, gap: space.lg },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
}))
