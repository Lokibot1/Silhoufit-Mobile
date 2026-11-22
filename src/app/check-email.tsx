import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { resendConfirmation, signedUpEmail } from '@/auth/email'
import { validateEmail } from '@/lib/loginValidation'
import { stripEmoji } from '@/lib/profileValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { KralLogo } from '@/ui/KralLogo'
import { font, space, themed, useTheme } from '@/ui/theme'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

const COOLDOWN_MS = 60_000
// Identical for every address: the screen must never reveal whether an account exists.
const SENT = 'If that address is waiting for confirmation, we sent a new link.'
const RATE_LIMIT = 'Too many emails. Try again in a few minutes.'
const SERVER = "Couldn't send the email. Try again."
const NETWORK = "We couldn't send the link. The connection dropped before we got a response. Check your connection and try again."

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export default function CheckEmail() {
  const styles = useStyles()
  const { color, type } = useTheme()
  const params = useLocalSearchParams<{ email?: string }>()
  // Only the address typed into sign-up in this session is echoed; a deep link's own param is ignored.
  const known = typeof params.email === 'string' && params.email === signedUpEmail() ? params.email : ''
  const [email, setEmail] = useState(known)
  const [error, setError] = useState<string>()
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<'sent' | 'rate-limit' | 'network' | 'server' | null>(null)
  // Arriving from sign-up means a mail was just sent, so Resend waits a minute.
  const [until, setUntil] = useState(() => (known ? Date.now() + COOLDOWN_MS : 0))
  const [now, setNow] = useState(() => Date.now())
  const inFlight = useRef(false)
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null)
  const remaining = Math.max(0, Math.ceil((until - now) / 1000))

  useEffect(() => {
    if (until <= Date.now()) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])

  function change(text: string) {
    const clean = stripEmoji(text).replace(/\s/g, '')
    setEmail(clean)
    if (touched) setError(validateEmail(clean) ?? undefined)
  }

  async function resend() {
    if (inFlight.current || remaining > 0) return
    const invalid = validateEmail(email)
    setTouched(true)
    setError(invalid ?? undefined)
    if (invalid) return emailRef.current?.focus()

    inFlight.current = true
    setPending(true)
    setNotice(null)
    const result = await resendConfirmation(email.trim()) // never throws: failures come back as a kind
    inFlight.current = false
    setPending(false)
    if (!result.ok && (result.kind === 'network' || result.kind === 'server')) return setNotice(result.kind)
    setNotice(!result.ok && result.kind === 'rate-limit' ? 'rate-limit' : 'sent')
    setNow(Date.now())
    setUntil(Date.now() + COOLDOWN_MS)
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <KralLogo width={120} />
        <Text accessibilityRole="header" style={type.h1}>Check Your Email</Text>

        {known ? (
          <Text testID="check-email-address" style={type.body}>
            We sent a confirmation link to <Text style={styles.bold}>{known}</Text>. Open it on this phone to finish setting up your account.
          </Text>
        ) : (
          <>
            <Text style={[type.body, { color: color.graphite }]}>Enter the email you signed up with and we will send a new confirmation link.</Text>
            <FloatingField
              ref={emailRef}
              testID="check-email-input"
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
              onSubmitEditing={resend}
            />
          </>
        )}

        {notice === 'sent' && (
          <View testID="check-email-sent" accessibilityLiveRegion="polite">
            <Text style={type.body}>{SENT}</Text>
          </View>
        )}
        {(notice === 'rate-limit' || notice === 'network' || notice === 'server') && (
          <View testID="check-email-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{notice === 'rate-limit' ? RATE_LIMIT : notice === 'server' ? SERVER : NETWORK}</Text>
          </View>
        )}

        <Button
          testID="check-email-resend"
          label={remaining > 0 ? `Resend in ${clock(remaining)}` : 'Resend Link'}
          accessibilityLabel={remaining > 0 ? `Resend link in ${remaining} seconds` : 'Resend Link'}
          labelStyle={type.numeric}
          pending={pending}
          disabled={remaining > 0}
          onPress={resend}
        />
        <Button testID="check-email-back" variant="secondary" label="Back to Sign In" disabled={pending} onPress={() => router.replace('/sign-in')} />
      </ScrollView>
    </KeyboardScreen>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { padding: space.lg, gap: space.lg },
  bold: { fontFamily: font.semibold },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
}))
