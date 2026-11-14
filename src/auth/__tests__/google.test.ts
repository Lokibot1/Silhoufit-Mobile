import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

import { readCallback, signInWithGoogle } from '../google'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: jest.fn(), exchangeCodeForSession: jest.fn() } } }))
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }))
jest.mock('expo-linking', () => ({ createURL: () => 'silhoufitmobile://auth/callback', addEventListener: jest.fn(), getInitialURL: jest.fn() }))

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
const oauth = supabase.auth.signInWithOAuth as jest.Mock
const exchange = supabase.auth.exchangeCodeForSession as jest.Mock
const open = WebBrowser.openAuthSessionAsync as jest.Mock
const CB = 'silhoufitmobile://auth/callback'
const authorize = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/authorize?provider=google`

const returns = (url: string) => open.mockResolvedValue({ type: 'success', url })
const message = async () => ((await signInWithGoogle()) as { message: string }).message

const listen = Linking.addEventListener as jest.Mock
const remove = jest.fn()
let emit: (url: string) => void

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers()
  oauth.mockResolvedValue({ data: { url: authorize }, error: null })
  exchange.mockResolvedValue({ error: null })
  ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(null)
  listen.mockImplementation((_type, handler) => {
    emit = (url) => handler({ url })
    return { remove }
  })
})
afterEach(() => jest.useRealTimers())

/** Runs sign-in to the end, letting the short wait for a late redirect expire. */
const settle = async (run: () => Promise<unknown>) => {
  const promise = run()
  await jest.advanceTimersByTimeAsync(1000)
  return promise
}

it('exchanges the code once and succeeds', async () => {
  returns(`${CB}?code=abc`)
  expect(await signInWithGoogle()).toEqual({ ok: true })
  expect(exchange).toHaveBeenCalledTimes(1)
  expect(exchange).toHaveBeenCalledWith('abc')
  expect(open).toHaveBeenCalledWith(authorize, CB)
})

it.each(['cancel', 'dismiss'])('treats %s with no redirect as a quiet cancel with no exchange', async (type) => {
  open.mockResolvedValue({ type })
  expect(await settle(signInWithGoogle)).toEqual({ ok: false, cancelled: true })
  expect(exchange).not.toHaveBeenCalled()
  expect(remove).toHaveBeenCalledTimes(1)
})

it('still exchanges once when dismiss arrives and the redirect event lands afterwards', async () => {
  open.mockResolvedValue({ type: 'dismiss' })
  const promise = signInWithGoogle()
  await jest.advanceTimersByTimeAsync(100)
  emit(`${CB}?code=late`)
  emit(`${CB}?code=again`)
  expect(await promise).toEqual({ ok: true })
  expect(exchange).toHaveBeenCalledTimes(1)
  expect(exchange).toHaveBeenCalledWith('late')
  expect(remove).toHaveBeenCalledTimes(1)
})

it('uses a redirect event that fired before dismiss was reported', async () => {
  open.mockImplementation(async () => {
    emit(`${CB}?code=early`)
    return { type: 'dismiss' }
  })
  expect(await signInWithGoogle()).toEqual({ ok: true })
  expect(exchange).toHaveBeenCalledWith('early')
})

it('uses the initial URL when dismiss arrives and the app was opened by the redirect', async () => {
  open.mockResolvedValue({ type: 'dismiss' })
  ;(Linking.getInitialURL as jest.Mock).mockResolvedValue(`${CB}?code=boot`)
  expect(await signInWithGoogle()).toEqual({ ok: true })
  expect(exchange).toHaveBeenCalledWith('boot')
})

it('ignores link events for other addresses while waiting', async () => {
  open.mockResolvedValue({ type: 'dismiss' })
  const promise = signInWithGoogle()
  await jest.advanceTimersByTimeAsync(100)
  emit('other://auth/callback?code=x')
  await jest.advanceTimersByTimeAsync(1000)
  expect(await promise).toEqual({ ok: false, cancelled: true })
  expect(exchange).not.toHaveBeenCalled()
})

it('removes the link listener when opening the browser throws', async () => {
  open.mockRejectedValue(new Error('boom'))
  await expect(signInWithGoogle()).rejects.toThrow('boom')
  expect(remove).toHaveBeenCalledTimes(1)
})

it('treats access_denied as a cancel', async () => {
  returns(`${CB}?error=access_denied&error_description=User+denied`)
  expect(await signInWithGoogle()).toEqual({ ok: false, cancelled: true })
  expect(exchange).not.toHaveBeenCalled()
})

it('shows the deactivated copy for user_banned, even with access_denied', async () => {
  returns(`${CB}?error=access_denied&error_code=user_banned`)
  expect(await message()).toBe('This account has been deactivated. Contact the store for help.')
})

it('never shows the raw error_description', async () => {
  returns(`${CB}?error=server_error&error_description=secret+provider+text`)
  const text = await message()
  expect(text).toMatch(/didn't finish/)
  expect(text).not.toMatch(/secret/)
  expect(exchange).not.toHaveBeenCalled()
})

it('reads an error that arrives only in the # fragment', async () => {
  returns(`${CB}#error=server_error&error_code=unexpected_failure`)
  expect(await message()).toMatch(/didn't finish/)
})

it('shows the network copy and opens no browser when starting fails offline', async () => {
  oauth.mockResolvedValue({ data: { url: null }, error: { status: 0 } })
  expect(await message()).toMatch(/Can't reach Google sign-in/)
  expect(open).not.toHaveBeenCalled()
})

it('shows the server copy when starting fails otherwise', async () => {
  oauth.mockResolvedValue({ data: { url: null }, error: { status: 500 } })
  expect(await message()).toMatch(/couldn't start Google sign-in/)
})

it.each([
  'http://x.test/auth/v1/authorize',
  'http://proj.supabase.co/auth/v1/authorize',
  'https://evil.test/auth/v1/authorize',
  'https://proj.supabase.co.evil.com/auth/v1/authorize',
  'https://proj.supabase.co@evil.com/auth/v1/authorize',
  'https://proj.supabase.co/auth/v1/authorizeX',
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/other`,
  'not a url',
  null,
])('does not open %s', async (url) => {
  oauth.mockResolvedValue({ data: { url }, error: null })
  expect(await message()).toMatch(/couldn't start Google sign-in/)
  expect(open).not.toHaveBeenCalled()
})

describe('when the Supabase address is not configured as expected', () => {
  const original = process.env.EXPO_PUBLIC_SUPABASE_URL
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = original
  })

  it.each([undefined, ''])('does not open the browser when it is %p', async (value) => {
    if (value === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL
    else process.env.EXPO_PUBLIC_SUPABASE_URL = value
    expect(await message()).toMatch(/couldn't start Google sign-in/)
    expect(open).not.toHaveBeenCalled()
  })

  it('accepts the legitimate address when the env var has a trailing slash', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co/'
    returns(`${CB}?code=abc`)
    expect(await signInWithGoogle()).toEqual({ ok: true })
    expect(open).toHaveBeenCalledWith(authorize, CB)
  })
})

it('ignores a callback with a foreign scheme', async () => {
  returns('evil://auth/callback?code=abc')
  expect(await message()).toMatch(/didn't finish/)
  expect(exchange).not.toHaveBeenCalled()
})

it('shows the network copy when the exchange cannot reach Supabase', async () => {
  returns(`${CB}?code=abc`)
  exchange.mockResolvedValue({ error: { status: 0 } })
  expect(await message()).toMatch(/Can't reach Google sign-in/)
})

it('maps exchange failures: banned and everything else', async () => {
  returns(`${CB}?code=abc`)
  exchange.mockResolvedValue({ error: { status: 400, code: 'user_banned' } })
  expect(await message()).toMatch(/deactivated/)
  exchange.mockResolvedValue({ error: { status: 400, code: 'flow_state_not_found' } })
  expect(await message()).toMatch(/didn't finish/)
})

describe('readCallback', () => {
  it('reads the query, the fragment, and rejects other addresses', () => {
    expect(readCallback(`${CB}?code=a`)).toMatchObject({ code: 'a', error: null })
    expect(readCallback(`${CB}#error=x&error_code=y&error_description=z`)).toEqual({ code: null, error: 'x', errorCode: 'y', errorDescription: 'z' })
    expect(readCallback(`${CB}?code=a#error=x`)).toMatchObject({ code: 'a', error: 'x' })
    expect(readCallback('other://auth/callback?code=a')).toBeNull()
    expect(readCallback(`${CB}evil?code=a`)).toBeNull()
    expect(readCallback(`${CB}evil`)).toBeNull()
    expect(readCallback(`${CB}/extra?code=a`)).toBeNull()
  })
})
