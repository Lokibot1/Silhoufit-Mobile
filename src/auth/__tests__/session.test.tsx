import { act, render, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState, Text } from 'react-native'

import { SessionProvider, useSession, type SessionValue } from '../session'

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: jest.fn(), signInWithPassword: jest.fn(), signOut: jest.fn(), startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() } },
}))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), onAccountDeactivated: jest.fn() }))
jest.mock('@/api/me', () => ({ fetchMe: jest.fn() }))
const mockAuth = jest.requireMock('@/lib/supabase').supabase.auth
const mockOnDeactivated = jest.requireMock('@/lib/api').onAccountDeactivated as jest.Mock
const mockFetchMe = jest.requireMock('@/api/me').fetchMe

const me = { id: 'u1', email: 'a@b.co', role: 'customer', firstName: 'Ana', lastName: 'Cruz', fullName: null, avatarUrl: null }
let emit: (session: unknown) => void
let current: SessionValue

function Probe() {
  const value = useSession()
  useEffect(() => {
    current = value
  })
  return <Text>{value.profile?.firstName ?? 'none'}</Text>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.onAuthStateChange.mockImplementation((callback: (event: string, session: unknown) => void) => {
    emit = (session) => callback('INITIAL_SESSION', session)
    return { data: { subscription: { unsubscribe: jest.fn() } } }
  })
  mockAuth.signOut.mockResolvedValue({ error: null })
})

it('loads the profile from /users/me once a session is restored', async () => {
  mockFetchMe.mockResolvedValue(me)
  await render(<SessionProvider><Probe /></SessionProvider>)
  expect(current.loading).toBe(true)
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(await screen.findByText('Ana')).toBeTruthy()
  expect(current.loading).toBe(false)
})

it('is signed out, not loading, with no stored session', async () => {
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit(null))
  expect(current.loading).toBe(false)
  expect(current.session).toBeNull()
  expect(mockFetchMe).not.toHaveBeenCalled()
})

it('maps a bad password to friendly copy', async () => {
  await render(<SessionProvider><Probe /></SessionProvider>)
  mockAuth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400 } })
  let result
  await act(async () => (result = await current.signIn('a@b.co', 'x')))
  expect(result).toEqual({ ok: false, message: 'Email or password is incorrect. Check both and try again.' })
})

it('maps a network failure to friendly copy', async () => {
  await render(<SessionProvider><Probe /></SessionProvider>)
  mockAuth.signInWithPassword.mockResolvedValue({ error: { status: 0 } })
  let result
  await act(async () => (result = await current.signIn('a@b.co', 'x')))
  expect(result).toMatchObject({ ok: false, message: "Can't reach the sign-in service. Check your connection and try again." })
})

it('signs out when /users/me answers forbidden', async () => {
  const { ApiError } = jest.requireActual('@/lib/api')
  mockFetchMe.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(mockAuth.signOut).toHaveBeenCalled()
})

it('falls back to a local sign out when the global one fails', async () => {
  await render(<SessionProvider><Probe /></SessionProvider>)
  mockAuth.signOut.mockResolvedValueOnce({ error: new Error('offline') })
  await act(async () => current.signOut())
  expect(mockAuth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
})

it('does not refetch /users/me when the token refreshes for the same user', async () => {
  mockFetchMe.mockResolvedValue(me)
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  await act(async () => emit({ user: { id: 'u1' }, access_token: 'new' }))
  expect(mockFetchMe).toHaveBeenCalledTimes(1)
})

it('sets error on a /users/me 500 and retry() refetches', async () => {
  mockFetchMe.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(me)
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(current.error).toBeTruthy()
  await act(async () => current.retry())
  expect(mockFetchMe).toHaveBeenCalledTimes(2)
  expect(current.error).toBeNull()
  expect(current.profile?.firstName).toBe('Ana')
})

it('clears the error when a different user signs in after a failure', async () => {
  mockFetchMe.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ...me, id: 'u2', firstName: 'Ben' })
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(current.error).toBeTruthy()
  await act(async () => emit({ user: { id: 'u2' } }))
  expect(current.error).toBeNull()
  expect(current.profile?.firstName).toBe('Ben')
})

it('maps 429 and banned accounts to friendly copy', async () => {
  await render(<SessionProvider><Probe /></SessionProvider>)
  mockAuth.signInWithPassword.mockResolvedValueOnce({ error: { status: 429 } })
  let result
  await act(async () => (result = await current.signIn('a@b.co', 'x')))
  expect(result).toEqual({ ok: false, message: 'Too many sign-in attempts. Wait a minute and try again.' })
  mockAuth.signInWithPassword.mockResolvedValueOnce({ error: { code: 'user_banned', status: 400 } })
  await act(async () => (result = await current.signIn('a@b.co', 'x')))
  expect(result).toEqual({ ok: false, message: 'This account has been deactivated. Contact the store for help.' })
})

it('update() sets the loaded profile and clears a profile error, without refetching', async () => {
  mockFetchMe.mockRejectedValueOnce(new Error('boom'))
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(current.error).toBeTruthy()
  await act(async () => current.update({ ...me, firstName: 'Anna' } as never))
  expect(current.error).toBeNull()
  expect(current.profile?.firstName).toBe('Anna')
  expect(mockFetchMe).toHaveBeenCalledTimes(1)
})

it('update() replaces a loaded profile', async () => {
  mockFetchMe.mockResolvedValue(me)
  await render(<SessionProvider><Probe /></SessionProvider>)
  await act(async () => emit({ user: { id: 'u1' } }))
  await act(async () => current.update({ ...me, firstName: 'Anna' } as never))
  expect(await screen.findByText('Anna')).toBeTruthy()
})

it('signs out and keeps the deactivated flag, even signed out, until acknowledged', async () => {
  mockFetchMe.mockResolvedValue(me)
  await render(<SessionProvider><Probe /></SessionProvider>)
  const handler = mockOnDeactivated.mock.calls[0][0] as () => void
  await act(async () => emit({ user: { id: 'u1' } }))
  expect(current.deactivated).toBe(false)
  await act(async () => handler())
  expect(mockAuth.signOut).toHaveBeenCalled()
  expect(current.deactivated).toBe(true)
  await act(async () => emit(null))
  expect(current.deactivated).toBe(true)
  await act(async () => current.acknowledgeDeactivated())
  expect(current.deactivated).toBe(false)
})

it('stops auto refresh in the background and restarts it when active', async () => {
  let listener: (state: string) => void = () => {}
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
    listener = cb as (state: string) => void
    return { remove: jest.fn() }
  })
  await render(<SessionProvider><Probe /></SessionProvider>)
  act(() => listener('background'))
  expect(mockAuth.stopAutoRefresh).toHaveBeenCalled()
  mockAuth.startAutoRefresh.mockClear()
  act(() => listener('active'))
  expect(mockAuth.startAutoRefresh).toHaveBeenCalled()
})
