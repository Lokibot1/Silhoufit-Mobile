import { supabase } from '@/lib/supabase'

import { changePassword, CONFIRM_REDIRECT, hasPasswordLogin, openEmailLink, requestPasswordReset, RESET_REDIRECT, resendConfirmation, setPassword, signedUpEmail, signUp } from '../email'

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), signOut: jest.fn(), signUp: jest.fn(), resetPasswordForEmail: jest.fn(), resend: jest.fn(), exchangeCodeForSession: jest.fn(), updateUser: jest.fn(), getSession: jest.fn() } },
}))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}` }))

const auth = supabase.auth as unknown as Record<'signInWithPassword' | 'signOut' | 'signUp' | 'resetPasswordForEmail' | 'resend' | 'exchangeCodeForSession' | 'updateUser' | 'getSession', jest.Mock>
const payload = { firstName: 'Ana', middleName: null, lastName: 'Cruz', suffix: 'Jr.', email: 'ana@example.com', password: 'Abcdefg1!' }

beforeEach(() => jest.resetAllMocks())

it('uses the two deep links', () => {
  expect(RESET_REDIRECT).toBe('silhoufitmobile://auth/reset')
  expect(CONFIRM_REDIRECT).toBe('silhoufitmobile://auth/confirm')
})

describe('signUp', () => {
  it('sends the profile as user metadata and the confirm link', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    expect(await signUp(payload)).toEqual({ ok: true, signedIn: false })
    expect(signedUpEmail()).toBe('ana@example.com')
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'Abcdefg1!',
      options: {
        data: { first_name: 'Ana', middle_name: null, last_name: 'Cruz', suffix: 'Jr.', full_name: 'Ana Cruz Jr.' },
        emailRedirectTo: CONFIRM_REDIRECT,
      },
    })
  })
  it('reports a session when confirmation is off', async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null })
    expect(await signUp(payload)).toEqual({ ok: true, signedIn: true })
  })
  it.each(['user_already_exists', 'email_exists'])('counts %s as success so emails are never revealed', async (code) => {
    auth.signUp.mockResolvedValue({ data: {}, error: { code, status: 422 } })
    expect(await signUp(payload)).toEqual({ ok: true, signedIn: false })
  })
  it.each([
    [{ status: 429 }, 'rate-limit'],
    [{ status: 0 }, 'network'],
    [{ status: 422, code: 'weak_password' }, 'weak-password'],
    [{ status: 400, code: 'email_address_invalid' }, 'invalid-email'],
    [{ status: 422, code: 'validation_failed' }, 'invalid-email'],
    [{ status: 422, code: 'signup_disabled' }, 'signup-disabled'],
    [{ status: 500 }, 'server'],
  ])('maps %j to %s', async (error, kind) => {
    auth.signUp.mockResolvedValue({ data: {}, error })
    expect(await signUp(payload)).toEqual({ ok: false, kind })
  })
  it('maps a thrown fetch failure to network and anything else to server', async () => {
    auth.signUp.mockRejectedValueOnce(new TypeError('Network request failed'))
    expect(await signUp(payload)).toEqual({ ok: false, kind: 'network' })
    auth.signUp.mockRejectedValueOnce(new Error('boom'))
    expect(await signUp(payload)).toEqual({ ok: false, kind: 'server' })
  })
})

describe('requestPasswordReset', () => {
  it('asks for the reset link on our deep link and succeeds', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    expect(await requestPasswordReset('nobody@example.com')).toEqual({ ok: true })
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('nobody@example.com', { redirectTo: RESET_REDIRECT })
  })
  it.each([
    [{ status: 429 }, 'rate-limit'],
    [{ status: 400, code: 'over_email_send_rate_limit' }, 'rate-limit'],
    [{ status: 0 }, 'network'],
    [{ status: 500 }, 'server'],
  ])('maps %j to %s', async (error, kind) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: null, error })
    expect(await requestPasswordReset('a@b.co')).toEqual({ ok: false, kind })
  })
  it('maps a thrown fetch failure to network', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new TypeError('Network request failed'))
    expect(await requestPasswordReset('a@b.co')).toEqual({ ok: false, kind: 'network' })
  })
})

describe('resendConfirmation', () => {
  it('resends the signup email with the confirm link', async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null })
    expect(await resendConfirmation('ana@example.com')).toEqual({ ok: true })
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@example.com', options: { emailRedirectTo: CONFIRM_REDIRECT } })
  })
  it('maps failures', async () => {
    auth.resend.mockResolvedValue({ data: {}, error: { status: 429 } })
    expect(await resendConfirmation('a@b.co')).toEqual({ ok: false, kind: 'rate-limit' })
  })
})

describe('openEmailLink', () => {
  const base = RESET_REDIRECT
  it('exchanges the code: ok', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: null })
    expect(await openEmailLink(`${base}?code=fresh`, base)).toBe('ok')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('fresh')
  })
  it('is missing for another address or a link without a code', async () => {
    expect(await openEmailLink(`${CONFIRM_REDIRECT}?code=abc`, base)).toBe('missing')
    expect(await openEmailLink(base, base)).toBe('missing')
    expect(await openEmailLink(`${base}#error=access_denied&error_code=unexpected_failure`, base)).toBe('missing')
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })
  it('is expired when the link itself reports an expired or used code', async () => {
    expect(await openEmailLink(`${base}#error=access_denied&error_code=otp_expired`, base)).toBe('expired')
  })
  it('is expired when the exchange refuses the code', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { status: 400, code: 'flow_state_not_found' } })
    expect(await openEmailLink(`${base}?code=abc`, base)).toBe('expired')
  })
  it('is rate-limit on a 429, so it can be retried', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { status: 429, code: 'over_request_rate_limit' } })
    expect(await openEmailLink(`${base}?code=abc`, base)).toBe('rate-limit')
  })
  it('is network when the exchange hangs', async () => {
    jest.useFakeTimers()
    auth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}))
    const outcome = openEmailLink(`${base}?code=hang`, base)
    await jest.advanceTimersByTimeAsync(15_000)
    expect(await outcome).toBe('network')
    jest.useRealTimers()
  })
  it('treats a repeat of an exchanged code as ok while the session is alive, and as spent once it is gone', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: null })
    expect(await openEmailLink(`${base}?code=once`, base)).toBe('ok')
    auth.getSession.mockResolvedValueOnce({ data: { session: {} } })
    expect(await openEmailLink(`${base}?code=once`, base)).toBe('ok')
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
    auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { status: 400, code: 'flow_state_not_found' } })
    expect(await openEmailLink(`${base}?code=once`, base)).toBe('expired')
  })
  it('is network when the connection drops or the server fails, so it can be retried', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { status: 0 } })
    expect(await openEmailLink(`${base}?code=abc`, base)).toBe('network')
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { status: 503 } })
    expect(await openEmailLink(`${base}?code=abc`, base)).toBe('network')
    auth.exchangeCodeForSession.mockRejectedValueOnce(new TypeError('Network request failed'))
    expect(await openEmailLink(`${base}?code=abc`, base)).toBe('network')
  })
})

describe('setPassword', () => {
  it('succeeds', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null })
    expect(await setPassword('Abcdefg1!')).toEqual({ ok: true })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Abcdefg1!' })
  })
  it.each([
    [{ status: 422, code: 'same_password' }, 'same'],
    [{ status: 422, code: 'weak_password' }, 'weak'],
    [{ status: 429 }, 'rate-limit'],
    [{ status: 0 }, 'network'],
    [{ status: 401 }, 'expired'],
    [{ status: 400, name: 'AuthSessionMissingError' }, 'expired'],
    [{ status: 400, code: 'session_not_found' }, 'expired'],
    [{ status: 500 }, 'server'],
  ])('maps %j to %s', async (error, kind) => {
    auth.updateUser.mockResolvedValue({ data: {}, error })
    expect(await setPassword('Abcdefg1!')).toMatchObject({ ok: false, kind })
  })
  it('passes the weak-password reason on', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: { status: 422, code: 'weak_password', message: 'Password is known to be weak.' } })
    expect(await setPassword('Abcdefg1!')).toEqual({ ok: false, kind: 'weak', detail: 'Password is known to be weak.' })
  })
})

describe('hasPasswordLogin', () => {
  it('is true with an email identity, false for Google only, true when unknown', () => {
    expect(hasPasswordLogin({ identities: [{ provider: 'google' }, { provider: 'email' }] })).toBe(true)
    expect(hasPasswordLogin({ identities: [{ provider: 'google' }], app_metadata: { providers: ['google'] } })).toBe(false)
    expect(hasPasswordLogin({ app_metadata: { providers: ['google', 'email'] } })).toBe(true)
    expect(hasPasswordLogin({})).toBe(true)
    expect(hasPasswordLogin(null)).toBe(true)
  })
})

describe('changePassword', () => {
  beforeEach(() => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })
    auth.updateUser.mockResolvedValue({ data: {}, error: null })
    auth.signOut.mockResolvedValue({ error: null })
  })
  it('re-checks the current password, sets the new one and signs out the other sessions', async () => {
    expect(await changePassword('ana@example.com', 'Old1!aaa', 'New2@bbb')).toEqual({ ok: true })
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'Old1!aaa' })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'New2@bbb' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
  it.each([['rejects', () => auth.signOut.mockRejectedValue(new TypeError('offline'))], ['errors', () => auth.signOut.mockResolvedValue({ error: { status: 500 } })]])('still succeeds when signing out the others %s', async (_name, arrange) => {
    arrange()
    expect(await changePassword('ana@example.com', 'Old1!aaa', 'New2@bbb')).toEqual({ ok: true })
  })
  it('maps a wrong password, a banned account and a failed update without touching other sessions', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 400, code: 'invalid_credentials' } })
    expect(await changePassword('a@b.co', 'x', 'y')).toEqual({ ok: false, kind: 'wrong-password' })
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 400, code: 'user_banned' } })
    expect(await changePassword('a@b.co', 'x', 'y')).toEqual({ ok: false, kind: 'expired' })
    auth.updateUser.mockResolvedValueOnce({ data: {}, error: { status: 422, code: 'same_password' } })
    expect(await changePassword('a@b.co', 'x', 'y')).toMatchObject({ ok: false, kind: 'same' })
    expect(auth.signOut).not.toHaveBeenCalled()
  })
})
