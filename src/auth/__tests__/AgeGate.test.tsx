import { fireEvent, render, screen } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

import { AgeGate } from '../AgeGate'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/auth/session', () => ({ useSession: () => mockSession }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, usePathname: () => mockPath }))
const mockRetry = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
let mockPath = '/(tabs)'
let mockSession: Record<string, unknown>
const replace = jest.requireMock('expo-router').router.replace as jest.Mock

const customer = (birthday: string | null) => ({ role: 'customer', birthday })
const base = { session: {}, error: null, retry: mockRetry, signOut: mockSignOut }

let backListeners: (() => boolean)[]
beforeEach(() => {
  jest.clearAllMocks()
  mockPath = '/(tabs)'
  backListeners = []
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backListeners.push(handler as () => boolean)
    return { remove: () => void backListeners.splice(backListeners.indexOf(handler as () => boolean), 1) }
  })
})
afterEach(() => jest.restoreAllMocks())

it('sends a customer with no birthday to the age step', async () => {
  mockSession = { ...base, profile: customer(null) }
  await render(<AgeGate />)
  expect(replace).toHaveBeenCalledWith('/auth/age')
})

it('sends them back if they navigate away, and stays put once on the age step', async () => {
  mockSession = { ...base, profile: customer(null) }
  mockPath = '/auth/age'
  const { rerender } = await render(<AgeGate />)
  expect(replace).not.toHaveBeenCalled()
  mockPath = '/(tabs)/orders'
  await rerender(<AgeGate />)
  expect(replace).toHaveBeenCalledWith('/auth/age')
})

it('blocks hardware back while the age step is required', async () => {
  mockSession = { ...base, profile: customer(null) }
  mockPath = '/auth/age'
  await render(<AgeGate />)
  expect(backListeners).toHaveLength(1)
  expect(backListeners[0]()).toBe(true)
})

it.each([
  ['a customer with a birthday', { ...base, profile: customer('1995-05-15') }],
  ['staff with no birthday', { ...base, profile: { role: 'staff', birthday: null } }],
  ['a signed-out visitor', { ...base, session: null, profile: null }],
])('does nothing for %s', async (_name, value) => {
  mockSession = value
  await render(<AgeGate />)
  expect(replace).not.toHaveBeenCalled()
  expect(backListeners).toHaveLength(0)
  expect(screen.queryByTestId('gate-cover')).toBeNull()
})

it('covers the app with a spinner, and does not redirect, while the profile loads', async () => {
  mockSession = { ...base, profile: null }
  await render(<AgeGate />)
  expect(screen.getByTestId('gate-loading')).toBeTruthy()
  expect(replace).not.toHaveBeenCalled()
})

it('does not wave the user through when the profile failed: Retry or Sign Out', async () => {
  mockSession = { ...base, profile: null, error: 'The server is unreachable.' }
  await render(<AgeGate />)
  expect(screen.getByTestId('gate-cover')).toBeTruthy()
  expect(screen.getByText(/The server is unreachable\./)).toBeTruthy()
  expect(replace).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('gate-retry'))
  expect(mockRetry).toHaveBeenCalledTimes(1)
  await fireEvent.press(screen.getByTestId('gate-signout'))
  expect(mockSignOut).toHaveBeenCalledTimes(1)
})

it('clears the gate once the birthday is saved', async () => {
  mockSession = { ...base, profile: customer(null) }
  mockPath = '/auth/age'
  const { rerender } = await render(<AgeGate />)
  expect(backListeners).toHaveLength(1)
  mockSession = { ...base, profile: customer('1995-05-15') }
  await rerender(<AgeGate />)
  expect(backListeners).toHaveLength(0)
  expect(screen.queryByTestId('gate-cover')).toBeNull()
})
