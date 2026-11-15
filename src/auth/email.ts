import * as Linking from 'expo-linking'

import { readCallback } from '@/auth/google'
import { supabase } from '@/lib/supabase'

// Email links come back through these deep links; the screens at auth/reset and auth/confirm read them.
export const RESET_REDIRECT = Linking.createURL('auth/reset')
export const CONFIRM_REDIRECT = Linking.createURL('auth/confirm')

export type SignUpPayload = {
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  email: string
  birthday: string
  password: string
}
export type SignUpErrorKind = 'network' | 'rate-limit' | 'weak-password' | 'invalid-email' | 'signup-disabled' | 'server'
export type MailErrorKind = 'rate-limit' | 'network' | 'server'
export type SetPasswordErrorKind = 'same' | 'weak' | 'rate-limit' | 'network' | 'expired' | 'server'
export type LinkOutcome = 'expired' | 'missing' | 'network' | 'rate-limit' | 'ok'

type AuthFailure = { status?: number; code?: string; name?: string; message?: string }

// An already-registered email must read as success so sign-up never reveals which emails exist.
const EXISTING_CODES = ['user_already_exists', 'email_exists']
const INVALID_EMAIL_CODES = ['email_address_invalid', 'email_address_not_authorized', 'validation_failed']
const DISABLED_CODES = ['signup_disabled', 'email_provider_disabled']
// Same test as the web AuthCallbackPage: a used, expired or never-started link.
const EXPIRED = /otp|expired|flow_state|invalid|not_found|used/i
const EXCHANGE_TIMEOUT_MS = 15_000
const SESSION_GONE = /^(session_|bad_jwt|refresh_token_|user_not_found)/

// Module-level on purpose: a deep link to check-email must not be able to put a stranger's address on the screen.
let lastSignupEmail = ''
let lastHandledCode: string | null = null
export const signedUpEmail = () => lastSignupEmail

// supabase-js reports a dropped connection as status 0; a thrown TypeError is a fetch failure.
const failureOf = (error: unknown): AuthFailure => (error instanceof TypeError ? { status: 0 } : ((error ?? {}) as AuthFailure))

function mailKind({ status, code }: AuthFailure): MailErrorKind {
  if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'rate-limit'
  return status === 0 ? 'network' : 'server'
}

function signUpKind(error: AuthFailure): SignUpErrorKind {
  const { code } = error
  if (code === 'weak_password') return 'weak-password'
  if (code && INVALID_EMAIL_CODES.includes(code)) return 'invalid-email'
  if (code && DISABLED_CODES.includes(code)) return 'signup-disabled'
  return mailKind(error)
}

/** Creates the account. The project requires email confirmation, so `signedIn` is normally false and the user must open the emailed link. */
export async function signUp({ firstName, middleName, lastName, suffix, email, birthday, password }: SignUpPayload): Promise<{ ok: true; signedIn: boolean } | { ok: false; kind: SignUpErrorKind }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          suffix,
          birthday,
          full_name: [firstName, middleName, lastName, suffix].filter(Boolean).join(' '),
        },
        emailRedirectTo: CONFIRM_REDIRECT,
      },
    })
    if (error && !(error.code && EXISTING_CODES.includes(error.code))) return { ok: false, kind: signUpKind(error) }
    lastSignupEmail = email
    return { ok: true, signedIn: !!data?.session }
  } catch (failure) {
    return { ok: false, kind: signUpKind(failureOf(failure)) }
  }
}

type MailResult = { ok: true } | { ok: false; kind: MailErrorKind }

/** Emails a reset link. Supabase answers success for unknown addresses too, so this never reveals whether an account exists. */
export async function requestPasswordReset(email: string): Promise<MailResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT })
    return error ? { ok: false, kind: mailKind(error) } : { ok: true }
  } catch (failure) {
    return { ok: false, kind: mailKind(failureOf(failure)) }
  }
}

export async function resendConfirmation(email: string): Promise<MailResult> {
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: CONFIRM_REDIRECT } })
    return error ? { ok: false, kind: mailKind(error) } : { ok: true }
  } catch (failure) {
    return { ok: false, kind: mailKind(failureOf(failure)) }
  }
}

/** Trades the code in an email link (reset or confirm, picked by `base`) for a session. A 5xx, a hang or a dropped connection is 'network' and a 429 is 'rate-limit' (both retryable); any other refusal means the link is spent (a PKCE link opened on another device lands here too: that device has no code verifier). Re-opening a code that was already exchanged while its session is still alive is a success. */
export async function openEmailLink(url: string, base: string): Promise<LinkOutcome> {
  const callback = readCallback(url, base)
  if (!callback) return 'missing'
  if (callback.error || callback.errorCode) return EXPIRED.test(callback.errorCode ?? '') ? 'expired' : 'missing'
  if (!callback.code) return 'missing'
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (callback.code === lastHandledCode && (await supabase.auth.getSession()).data.session) return 'ok'
    const hang = new Promise<'hang'>((resolve) => {
      timer = setTimeout(() => resolve('hang'), EXCHANGE_TIMEOUT_MS)
    })
    const result = await Promise.race([supabase.auth.exchangeCodeForSession(callback.code), hang])
    if (result === 'hang') return 'network'
    if (!result.error) {
      lastHandledCode = callback.code
      return 'ok'
    }
    const { status } = result.error as AuthFailure
    if (status === 429) return 'rate-limit'
    return status === 0 || (status !== undefined && status >= 500) ? 'network' : 'expired'
  } catch (failure) {
    return failure instanceof TypeError ? 'network' : 'expired'
  } finally {
    clearTimeout(timer)
  }
}

/** Sets the password of the session an emailed link just opened. */
export async function setPassword(password: string): Promise<{ ok: true } | { ok: false; kind: SetPasswordErrorKind; detail?: string }> {
  let failure: AuthFailure | null = null
  try {
    const { error } = await supabase.auth.updateUser({ password })
    failure = error
  } catch (thrown) {
    failure = failureOf(thrown)
  }
  if (!failure) return { ok: true }
  const { code, status, name, message } = failure
  if (code === 'same_password') return { ok: false, kind: 'same' }
  if (code === 'weak_password') return { ok: false, kind: 'weak', detail: message }
  if (status === 429 || code === 'over_request_rate_limit') return { ok: false, kind: 'rate-limit' }
  if (status === 0) return { ok: false, kind: 'network' }
  if (status === 401 || status === 403 || name === 'AuthSessionMissingError' || SESSION_GONE.test(code ?? '')) return { ok: false, kind: 'expired' }
  return { ok: false, kind: 'server' }
}

export type ChangePasswordResult = { ok: true } | { ok: false; kind: SetPasswordErrorKind | 'wrong-password'; detail?: string }

/** False for an account that signs in only with Google (or another provider): it has no password to change. Unknown reads as true. */
export function hasPasswordLogin(user: { identities?: { provider: string }[] | null; app_metadata?: { providers?: unknown } } | null | undefined): boolean {
  const providers = [...(user?.identities ?? []).map((identity) => identity.provider), ...(Array.isArray(user?.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : [])]
  return providers.length === 0 || providers.includes('email')
}

/** Checks the current password by signing in with it again (as the web does), then sets the new one. Then signs out every other session. */
export async function changePassword(email: string, current: string, next: string): Promise<ChangePasswordResult> {
  let failure: AuthFailure | null = null
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password: current })
    failure = error
  } catch (thrown) {
    failure = failureOf(thrown)
  }
  if (failure) {
    if (failure.code === 'invalid_credentials') return { ok: false, kind: 'wrong-password' }
    if (failure.code === 'user_banned') return { ok: false, kind: 'expired' } // same as the web: the account can no longer sign in
    return { ok: false, kind: mailKind(failure) }
  }
  const result = await setPassword(next)
  // Best effort: ends the account's other sessions so a stolen one does not survive the change.
  if (result.ok) await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
  return result
}
