import { router, useNavigation } from 'expo-router'
import { useRef, useState, type ComponentRef } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { signInWithGoogle } from '@/auth/google'
import { useSession } from '@/auth/session'
import { validateEmail, validateLoginPassword } from '@/lib/loginValidation'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { GoogleMark } from '@/ui/GoogleMark'
import { KralLogo } from '@/ui/KralLogo'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type Field = 'email' | 'password'
const validators = { email: validateEmail, password: validateLoginPassword }

export default function SignIn() {
  const { signIn } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [pending, setPending] = useState<'password' | 'google' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  const emailRef =useRef<ComponentRef<typeof TextInput>>(null)
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null)

  function validate(field: Field, value: string) {
    setErrors((current) => ({ ...current, [field]: validators[field](value) ?? undefined }))
  }
  function change(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (touched[field]) validate(field, value)
  }
  function blur(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }))
    validate(field, values[field])
  }

  // Read focus at call time: if this screen is gone or covered by now, going back would pop an unrelated screen.
  function leave() {
    if (!navigation.isFocused()) return
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  async function submit() {
    if (inFlight.current) return
    const found = { email: validateEmail(values.email) ?? undefined, password: validateLoginPassword(values.password) ?? undefined }
    setErrors(found)
    setTouched({ email: true, password: true })
    if (found.email) return emailRef.current?.focus()
    if (found.password) return passwordRef.current?.focus()

    inFlight.current = true
    setPending('password')
    setFailure(null)
    let result
    try {
      result = await signIn(values.email, values.password)
    } catch {
      return setFailure('Sign-in failed on our side. Please try again.')
    } finally {
      inFlight.current = false
      setPending(null)
    }
    if (!result.ok) return setFailure(result.message)
    toast(`Signed in as ${values.email.trim()}`)
    leave()
  }

  async function google() {
    if (inFlight.current) return
    inFlight.current = true
    setPending('google')
    setFailure(null)
    let result
    try {
      result = await signInWithGoogle()
    } catch {
      return setFailure('Sign-in failed on our side. Please try again.')
    } finally {
      inFlight.current = false
      setPending(null)
    }
    if (!result.ok) return result.cancelled ? undefined : setFailure(result.message)
    toast('Signed in with Google')
    leave()
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <KralLogo width={120} />
        <Text accessibilityRole="header" style={type.h1}>Sign In</Text>

        <FloatingField
          ref={emailRef}
          testID="sign-in-email"
          label="Email"
          value={values.email}
          onChangeText={(text) => change('email', text)}
          onBlur={() => blur('email')}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={254}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <FloatingField
          ref={passwordRef}
          testID="sign-in-password"
          toggleTestID="sign-in-toggle-password"
          label="Password"
          value={values.password}
          onChangeText={(text) => change('password', text)}
          onBlur={() => blur('password')}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          maxLength={64}
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {failure && (
          <View testID="sign-in-banner" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure}</Text>
          </View>
        )}

        <Button testID="sign-in-submit" label="Sign In" pending={pending === 'password'} disabled={pending === 'google'} onPress={submit} />

        <View testID="sign-in-divider" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.divider}>
          <View style={styles.rule} />
          <Text style={type.label}>(OR)</Text>
          <View style={styles.rule} />
        </View>

        <Button
          testID="sign-in-google"
          variant="secondary"
          label="Continue with Google"
          accessibilityLabel="Continue with Google"
          icon={<GoogleMark />}
          pending={pending === 'google'}
          disabled={pending === 'password'}
          onPress={google}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { padding: space.lg, gap: space.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1, backgroundColor: color.porcelain },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
