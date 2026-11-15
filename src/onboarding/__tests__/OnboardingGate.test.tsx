import { render, waitFor } from '@testing-library/react-native'
import { View } from 'react-native'

import { AgeGate } from '@/auth/AgeGate'
import { OnboardingGate } from '../OnboardingGate'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/auth/session', () => ({ useSession: () => mockSession }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, usePathname: () => mockPath }))
jest.mock('../status', () => ({ onboardingDone: jest.fn() }))
const mockDone: jest.Mock = jest.requireMock('../status').onboardingDone
const { router } = jest.requireMock('expo-router')
let mockPath = '/'
let mockSession: Record<string, unknown>

const customer = (birthday: string | null) => ({ role: 'customer', birthday })
const signedIn = (profile: unknown) => ({ session: { user: { id: 'u1' } }, profile, error: null, retry: jest.fn(), signOut: jest.fn() })

beforeEach(() => {
  jest.clearAllMocks()
  mockPath = '/'
  mockDone.mockResolvedValue(false)
  mockSession = signedIn(customer('1995-05-15'))
})

it('offers the tour once to a customer who has not seen it', async () => {
  const { rerender } = await render(<OnboardingGate enabled />)
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/onboarding'))
  // A new session object (token refresh) or another screen must not offer it again.
  mockSession = signedIn(customer('1995-05-15'))
  mockPath = '/orders'
  await rerender(<OnboardingGate enabled />)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(router.push).toHaveBeenCalledTimes(1)
})

it('does not offer it when the account already finished or skipped it', async () => {
  mockDone.mockResolvedValue(true)
  await render(<OnboardingGate enabled />)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(router.push).not.toHaveBeenCalled()
})

it.each([
  ['signed out', { session: null, profile: null }],
  ['staff', { profile: { role: 'staff', birthday: null } }],
  ['a profile that is still loading', { profile: null }],
])('shows nothing for %s', async (_name, patch) => {
  mockSession = { ...signedIn(customer('1995-05-15')), ...patch }
  await render(<OnboardingGate enabled />)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(router.push).not.toHaveBeenCalled()
})

it('waits while the cold-start loader is up and on sign-in or checkout screens', async () => {
  const { rerender } = await render(<OnboardingGate enabled={false} />)
  mockPath = '/sign-in'
  await rerender(<OnboardingGate enabled />)
  mockPath = '/checkout'
  await rerender(<OnboardingGate enabled />)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(router.push).not.toHaveBeenCalled()
  mockPath = '/'
  await rerender(<OnboardingGate enabled />)
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
})

it('the age gate wins: a customer with no birthday goes to the age step and never to the tour', async () => {
  mockSession = signedIn(customer(null))
  await render(
    <View>
      <AgeGate />
      <OnboardingGate enabled />
    </View>,
  )
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(router.replace).toHaveBeenCalledWith('/auth/age')
  expect(router.push).not.toHaveBeenCalled()
  expect(mockDone).not.toHaveBeenCalled()
})
