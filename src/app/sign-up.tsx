import { router, useNavigation } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { signUp, type SignUpErrorKind } from '@/auth/email'
import { signInWithGoogle } from '@/auth/google'
import { normalizeBirthday, normalizeName, stripEmoji } from '@/lib/profileValidation'
import { openLegal } from '@/lib/site'
import {
  LIMITS,
  sanitizeName,
  sanitizeSuffix,
  validateAdultBirthday,
  validateConfirmPassword,
  validateEmail,
  validateMiddleName,
  validateName,
  validatePassword,
  validateSuffix,
} from '@/lib/signUpValidation'
import { Button } from '@/ui/Button'
import { BirthdayField } from '@/ui/BirthdayField'
import { FloatingField } from '@/ui/FloatingField'
import { GoogleMark } from '@/ui/GoogleMark'
import { KralLogo } from '@/ui/KralLogo'
import { PasswordChecklist } from '@/ui/PasswordChecklist'
import { PressableScale } from '@/ui/PressableScale'
import { color, font, hairline, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

type Field = 'firstName' | 'lastName' | 'middleName' | 'suffix' | 'email' | 'birthday' | 'password' | 'confirm'
const ORDER: Field[] = ['firstName', 'lastName', 'middleName', 'suffix', 'email', 'birthday', 'password', 'confirm']
const IDS: Record<Field, string> = { firstName: 'first-name', lastName: 'last-name', middleName: 'middle-name', suffix: 'suffix', email: 'email', birthday: 'birthday', password: 'password', confirm: 'confirm' }
const EMPTY: Record<Field, string> = { firstName: '', lastName: '', middleName: '', suffix: '', email: '', birthday: '', password: '', confirm: '' }

// Same as the web sign-up: applied on every change, so pasted text is cleaned too.
const SANITIZERS: Partial<Record<Field, (input: string) => string>> = {
  firstName: sanitizeName,
  lastName: sanitizeName,
  middleName: sanitizeName,
  suffix: sanitizeSuffix,
  email: (input) => stripEmoji(input).replace(/\s/g, ''),
  password: stripEmoji,
  confirm: stripEmoji,
}

const CONSENT_ERROR = 'Please read and accept the Terms of Service and Privacy Policy to create an account.'

// What happened, why and the next step. weak-password and invalid-email show inline on their field instead.
const FAILURE: Record<Exclude<SignUpErrorKind, 'weak-password' | 'invalid-email'>, { title: string; body: string }> = {
  network: { title: "We couldn't create your account.", body: 'The connection dropped before we got a response. Nothing was saved. Check your connection and try again.' },
  'rate-limit': { title: 'Too many sign-up attempts.', body: 'Our servers are limiting requests right now. Nothing was saved. Wait a minute, then try again.' },
  'signup-disabled': { title: 'Sign-ups are unavailable right now.', body: "New accounts can't be created at the moment. Nothing was saved. Try again later or contact support." },
  server: { title: "We couldn't create your account.", body: 'Something went wrong on our side. Nothing was saved. Try again in a moment.' },
}
const INLINE: Partial<Record<SignUpErrorKind, { field: 'password' | 'email'; message: string }>> = {
  'weak-password': { field: 'password', message: 'That password was rejected. It is too easy to guess or has appeared in a data breach. Choose a longer, less predictable password.' },
  'invalid-email': { field: 'email', message: 'That email address was rejected. Check it for typos or use a different one.' },
}

export default function SignUp() {
  const toast = useToast()
  const navigation = useNavigation()
  const [values, setValues] = useState(EMPTY)
  const [consent, setConsent] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<Field | 'consent', boolean>>>({})
  const [server, setServer] = useState<Partial<Record<'password' | 'email', string>>>({})
  const [pending, setPending] = useState<'email' | 'google' | null>(null)
  const [failure, setFailure] = useState<{ title: string; body: string } | null>(null)
  const inFlight = useRef(false)
  // Plain map, not a ref: the inputs register themselves and are only read from event handlers.
  const [inputs] = useState<Partial<Record<Field, ComponentRef<typeof TextInput> | null>>>({})
  const ref = (field: Field) => (node: ComponentRef<typeof TextInput> | null) => {
    inputs[field] = node
  }

  const errors: Record<Field | 'consent', string | null> = {
    firstName: validateName(values.firstName, 'First name'),
    lastName: validateName(values.lastName, 'Last name'),
    middleName: validateMiddleName(values.middleName),
    suffix: validateSuffix(values.suffix),
    email: validateEmail(values.email),
    birthday: validateAdultBirthday(values.birthday),
    password: validatePassword(values.password),
    confirm: validateConfirmPassword(values.password, values.confirm),
    consent: consent ? null : CONSENT_ERROR,
  }
  // Errors show after the field is left, then update live.
  const shown = (field: Field | 'consent') => (touched[field] ? (errors[field] ?? undefined) : undefined)
  const errorOf = (field: Field) => shown(field) ?? (field === 'password' || field === 'email' ? server[field] : undefined)
  const count = (field: 'firstName' | 'lastName' | 'middleName' | 'suffix') => `${values[field].length}/${field === 'suffix' ? LIMITS.suffixMaxLength : LIMITS.nameMaxLength}`

  function change(field: Field, text: string) {
    setValues((current) => ({ ...current, [field]: SANITIZERS[field]?.(text) ?? text }))
    if (field === 'password' || field === 'email') setServer((current) => ({ ...current, [field]: undefined }))
  }
  const blur = (field: Field | 'consent') => setTouched((current) => ({ ...current, [field]: true }))
  const field = (name: Field) => ({
    ref: ref(name),
    testID: `sign-up-${IDS[name]}`,
    value: values[name],
    onChangeText: (text: string) => change(name, text),
    onBlur: () => blur(name),
    error: errorOf(name),
    editable: pending === null,
    returnKeyType: (name === 'confirm' ? 'go' : 'next') as 'go' | 'next',
    onSubmitEditing: () => advance(name),
  })

  function advance(name: Field) {
    if (name === 'confirm') submit()
    else inputs[ORDER[ORDER.indexOf(name) + 1]]?.focus()
  }
  function toggleConsent() {
    setConsent((on) => !on)
    blur('consent')
  }
  function openDoc(doc: 'terms' | 'privacy') {
    openLegal(doc).catch(() => toast("Couldn't open the page. Check your connection and try again."))
  }

  // Read focus at call time: if this screen is gone or covered by now, going back would pop an unrelated screen.
  function leave() {
    if (!navigation.isFocused()) return
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  async function submit() {
    if (inFlight.current) return
    setTouched({ ...Object.fromEntries(ORDER.map((name) => [name, true])), consent: true })
    const invalid = ORDER.find((name) => errors[name])
    if (invalid) return inputs[invalid]?.focus()
    if (errors.consent) return

    inFlight.current = true
    setPending('email')
    setFailure(null)
    setServer({})
    const email = values.email.trim()
    const result = await signUp({
      firstName: normalizeName(values.firstName),
      middleName: normalizeName(values.middleName) || null,
      lastName: normalizeName(values.lastName),
      suffix: values.suffix.trim() || null,
      email,
      birthday: normalizeBirthday(values.birthday)!,
      password: values.password,
    }) // never throws: failures come back as a kind
    inFlight.current = false
    setPending(null)
    if (!result.ok) {
      const inline = INLINE[result.kind]
      if (inline) {
        setServer({ [inline.field]: inline.message })
        return inputs[inline.field]?.focus()
      }
      return setFailure(FAILURE[result.kind as keyof typeof FAILURE])
    }
    if (result.signedIn) {
      toast('Account created. Welcome to KRAL.')
      return leave()
    }
    toast('Account created. Check your email to finish setting up.')
    router.replace({ pathname: '/check-email', params: { email } })
  }

  async function google() {
    if (inFlight.current) return
    if (errors.consent) return blur('consent')
    inFlight.current = true
    setPending('google')
    setFailure(null)
    try {
      const result = await signInWithGoogle()
      if (!result.ok) return result.cancelled ? undefined : setFailure({ title: "We couldn't continue with Google.", body: result.message })
      toast('Signed in with Google')
      leave() // the root gate sends a customer with no birthday to the age step
    } catch {
      setFailure(FAILURE.server)
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  return (
    <KeyboardScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <KralLogo width={120} />
        <Text accessibilityRole="header" style={type.h1}>Create Account</Text>

        <FloatingField {...field('firstName')} label="First name" helper={count('firstName')} maxLength={LIMITS.nameMaxLength} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" autoCorrect={false} />
        <FloatingField {...field('lastName')} label="Last name" helper={count('lastName')} maxLength={LIMITS.nameMaxLength} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" autoCorrect={false} />
        <FloatingField {...field('middleName')} label="Middle name (optional)" helper={count('middleName')} maxLength={LIMITS.nameMaxLength} autoComplete="additional-name" textContentType="middleName" autoCapitalize="words" autoCorrect={false} />
        <FloatingField {...field('suffix')} label="Suffix (optional)" helper={count('suffix')} maxLength={LIMITS.suffixMaxLength} autoCapitalize="words" autoCorrect={false} />
        <FloatingField
          {...field('email')}
          label="Email"
          maxLength={LIMITS.emailMaxLength}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />
        <BirthdayField testID="sign-up-birthday" value={values.birthday} onChange={(iso) => change('birthday', iso)} onClose={() => blur('birthday')} error={errorOf('birthday')} helper="You must be 18 or older." editable={pending === null} />
        <FloatingField
          {...field('password')}
          toggleTestID="sign-up-toggle-password"
          label="Password"
          secureTextEntry
          maxLength={LIMITS.passwordMaxLength}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordChecklist testID="sign-up-checklist" password={values.password} email={values.email} firstName={values.firstName} />
        <FloatingField
          {...field('confirm')}
          toggleTestID="sign-up-toggle-confirm"
          label="Confirm password"
          secureTextEntry
          maxLength={LIMITS.passwordMaxLength}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <View style={styles.consent}>
          <PressableScale
            testID="sign-up-consent"
            accessibilityRole="checkbox"
            accessibilityLabel="I have read and agree to the Terms of Service and Privacy Policy."
            accessibilityState={{ checked: consent, disabled: pending !== null }}
            disabled={pending !== null}
            onPress={toggleConsent}
            style={styles.consentRow}>
            <View style={[styles.box, consent && styles.boxOn]}>{consent && <Ionicons name="checkmark" size={16} color={color.paper} />}</View>
            <Text style={[type.body, styles.consentText]}>I have read and agree to the Terms of Service and Privacy Policy.</Text>
          </PressableScale>
          <View style={styles.links}>
            <PressableScale testID="sign-up-terms" accessibilityRole="link" accessibilityLabel="Read the Terms of Service" onPress={() => openDoc('terms')} style={styles.link}>
              <Text style={[type.body, styles.linkText]}>Terms of Service</Text>
            </PressableScale>
            <PressableScale testID="sign-up-privacy" accessibilityRole="link" accessibilityLabel="Read the Privacy Policy" onPress={() => openDoc('privacy')} style={styles.link}>
              <Text style={[type.body, styles.linkText]}>Privacy Policy</Text>
            </PressableScale>
          </View>
          <Text testID="sign-up-consent-error" accessibilityLiveRegion="polite" style={[type.small, styles.consentError]}>{shown('consent')}</Text>
        </View>

        {failure && (
          <View testID="sign-up-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={[type.body, styles.bold]}>{failure.title}</Text>
            <Text style={type.body}>{failure.body}</Text>
          </View>
        )}

        <Button testID="sign-up-submit" label={failure ? 'Try Again' : 'Create Account'} pending={pending === 'email'} disabled={pending === 'google'} onPress={submit} />

        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.divider}>
          <View style={styles.rule} />
          <Text style={type.label}>(OR)</Text>
          <View style={styles.rule} />
        </View>

        <Button
          testID="sign-up-google"
          variant="secondary"
          label="Continue with Google"
          icon={<GoogleMark />}
          pending={pending === 'google'}
          disabled={pending === 'email'}
          onPress={google}
        />

        <PressableScale testID="sign-up-signin" accessibilityRole="link" accessibilityLabel="Already registered? Sign In" onPress={() => router.replace('/sign-in')} style={styles.switch}>
          <Text style={type.body}>Already registered? <Text style={styles.linkText}>Sign In</Text></Text>
        </PressableScale>
      </ScrollView>
    </KeyboardScreen>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { padding: space.lg, gap: space.lg },
  consent: { gap: space.xs },
  consentRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.md },
  consentText: { flex: 1 },
  box: { ...hairline, borderColor: color.obsidian, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.obsidian },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { textDecorationLine: 'underline' },
  consentError: { color: color.red, minHeight: 20 },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md, gap: space.xs },
  bold: { fontFamily: font.semibold },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1, backgroundColor: color.porcelain },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
