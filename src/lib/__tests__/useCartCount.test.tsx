import { act, renderHook, waitFor } from '@testing-library/react-native'

import { useCartCount } from '../useCartCount'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/cart', () => ({ fetchCart: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: () => mockSession }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn((cb) => jest.requireActual('react').useEffect(cb, [cb])) }))
let mockSession: { session: { user: { id: string } } | null } = { session: null }
const mockCart: jest.Mock = jest.requireMock('@/api/cart').fetchCart
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockSession = { session: null }
})

it('is 0 and fetches nothing when signed out', async () => {
  const { result } = await renderHook(() => useCartCount())
  expect(result.current.count).toBe(0)
  expect(mockCart).not.toHaveBeenCalled()
})

it('reads the total items when signed in and again on refresh', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockCart.mockResolvedValue({ totalItems: 3 })
  const { result } = await renderHook(() => useCartCount())
  await waitFor(() => expect(result.current.count).toBe(3))
  mockCart.mockResolvedValue({ totalItems: 4 })
  await act(async () => result.current.refresh())
  await waitFor(() => expect(result.current.count).toBe(4))
})

it('resets when the account changes', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockCart.mockResolvedValue({ totalItems: 3 })
  const { result, rerender } = await renderHook(() => useCartCount())
  await waitFor(() => expect(result.current.count).toBe(3))
  mockCart.mockReturnValue(never())
  mockSession = { session: { user: { id: 'u2' } } }
  await rerender({})
  expect(result.current.count).toBe(0)
})

it('keeps the old value when a refresh fails', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockCart.mockResolvedValue({ totalItems: 3 })
  const { result } = await renderHook(() => useCartCount())
  await waitFor(() => expect(result.current.count).toBe(3))
  mockCart.mockRejectedValue(new Error('x'))
  await act(async () => result.current.refresh())
  await waitFor(() => expect(mockCart).toHaveBeenCalledTimes(2))
  expect(result.current.count).toBe(3)
})

it('aborts the request on unmount', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockCart.mockReturnValue(never())
  const { unmount } = await renderHook(() => useCartCount())
  const signal: AbortSignal = mockCart.mock.calls[0][0]
  await unmount()
  expect(signal.aborted).toBe(true)
})
