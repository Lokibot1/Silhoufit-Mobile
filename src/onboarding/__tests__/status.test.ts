import { onboardingDone, saveOnboarding } from '../status'

const mockStore: Record<string, string> = {}
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => Promise.resolve((mockStore[key] = value, undefined))),
}))
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn(), updateUser: jest.fn() } } }))
const auth = jest.requireMock('@/lib/supabase').supabase.auth as Record<'getSession' | 'updateUser', jest.Mock>

const user = (metadata: Record<string, unknown> = {}) => ({ id: 'u1', user_metadata: metadata }) as never
beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(mockStore)) delete mockStore[key]
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', user_metadata: { keep: 'me' } } } } })
  auth.updateUser.mockResolvedValue({ error: null })
})

it('is not done for a fresh account and done once the account metadata says so (web shape)', async () => {
  expect(await onboardingDone(user())).toBe(false)
  expect(await onboardingDone(user({ onboarding: { status: 'skipped', at: 'x' } }))).toBe(true)
})

it('sends only user_metadata.onboarding (Supabase merges top-level keys), never a stale snapshot of the rest', async () => {
  expect(await saveOnboarding('u1', 'skipped')).toBe(true)
  const { data } = auth.updateUser.mock.calls[0][0]
  expect(Object.keys(data)).toEqual(['onboarding'])
  expect(data).toMatchObject({ onboarding: { status: 'skipped' } })
  expect(typeof data.onboarding.at).toBe('string')
})

it('offline: the save fails without throwing, the device remembers it, and the next launch retries silently without showing the tour again', async () => {
  auth.updateUser.mockRejectedValue(new Error('offline'))
  expect(await saveOnboarding('u1', 'completed')).toBe(false)
  expect(await onboardingDone(user())).toBe(true)
  expect(auth.updateUser).toHaveBeenCalledTimes(2)
  auth.updateUser.mockResolvedValue({ error: null })
  expect(await onboardingDone(user())).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(auth.updateUser).toHaveBeenCalledTimes(3)
  // Synced now: no more retries.
  await onboardingDone(user())
  expect(auth.updateUser).toHaveBeenCalledTimes(3)
})

it('another account on the same device does not inherit the choice', async () => {
  await saveOnboarding('u1', 'skipped')
  expect(await onboardingDone({ id: 'u2', user_metadata: {} } as never)).toBe(false)
})

it('keeps one entry per account: an unsynced save for A survives B signing in', async () => {
  auth.updateUser.mockRejectedValue(new Error('offline'))
  await saveOnboarding('u1', 'skipped')
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u2', user_metadata: {} } } } })
  auth.updateUser.mockResolvedValue({ error: null })
  await saveOnboarding('u2', 'completed')
  auth.updateUser.mockClear()
  expect(await onboardingDone(user())).toBe(true)
  expect(auth.updateUser).not.toHaveBeenCalled() // session is u2, so u1's retry waits for u1 but is still remembered
  expect(JSON.parse(mockStore['silhoufit-onboarding']).u1).toEqual({ status: 'skipped', synced: false })
})
