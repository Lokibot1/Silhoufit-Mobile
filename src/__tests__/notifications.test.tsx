import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import NotificationsScreen from '../app/(tabs)/notifications'

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('@/api/orders', () => ({ ...jest.requireActual('@/api/orders'), fetchOrdersPage: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  useIsFocused: () => jest.requireActual('react').useSyncExternalStore((sub: () => void) => (mockFocus.subs.add(sub), () => mockFocus.subs.delete(sub)), () => mockFocus.on),
  router: { push: jest.fn(), navigate: jest.fn() },
  // Models focus and blur: the effect runs while focused and its cleanup runs on blur.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const react = jest.requireActual('react')
    const on = react.useSyncExternalStore(
      (sub: () => void) => (mockFocus.subs.add(sub), () => mockFocus.subs.delete(sub)),
      () => mockFocus.on,
    )
    react.useEffect(() => (on ? effect() : undefined), [effect, on])
  },
}))
const mockFocus = { on: true, subs: new Set<() => void>() }
const setFocus = (on: boolean) =>
  act(async () => {
    mockFocus.on = on
    mockFocus.subs.forEach((sub) => sub())
  })
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('@/api/orders')
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router

const signedIn = { session: { user: { id: 'u1' } }, loading: false, signOut: jest.fn() }
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  orderNumber: `SHF-${id}`,
  status: 'PAID',
  paymentStatus: 'PAID',
  subtotal: 1100,
  shipping: 150,
  discount: 0,
  total: 1250,
  createdAt: '2026-11-14T05:00:00.000Z',
  updatedAt: '2026-11-14T05:00:00.000Z',
  paidAt: '2026-11-14T05:49:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  address: null,
  items: [],
  shipment: null,
  ...over,
})
const pageOf = (items: ReturnType<typeof order>[]) => ({ items, total: items.length, page: 1, hasNextPage: false })
const KEY = 'kral:notifications-seen:u1'

beforeEach(async () => {
  jest.clearAllMocks() // not reset: that would wipe the async-storage mock's implementations
  await AsyncStorage.clear()
  mockFocus.on = true
  mockUseSession.mockReturnValue(signedIn)
})

it('shows the skeleton, then the update with label, order number and 12-hour time, loading 20 orders', async () => {
  let resolve: (page: unknown) => void = () => {}
  api.fetchOrdersPage.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<NotificationsScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve(pageOf([order('a')])))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.queryByText('(Order Updates)')).toBeNull()
  expect(screen.getByText('Notifications')).toBeTruthy()
  expect(screen.getByText('Payment received')).toBeTruthy()
  expect(screen.getByText('Order SHF-a')).toBeTruthy()
  expect(screen.getByText('Nov 14, 2026, 1:49 PM')).toBeTruthy()
  expect(api.fetchOrdersPage).toHaveBeenCalledWith({ page: 1, limit: 20 }, expect.any(AbortSignal))
})

it('shows the sign-in prompt when signed out', async () => {
  mockUseSession.mockReturnValue({ ...signedIn, session: null })
  await render(<NotificationsScreen />)
  expect(screen.getByText('Sign in to see your order updates')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-sign-in'))
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchOrdersPage).not.toHaveBeenCalled()
})

it('shows the error with Retry, and retrying loads the updates', async () => {
  api.fetchOrdersPage.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(pageOf([order('a')]))
  await render(<NotificationsScreen />)
  expect(await screen.findByTestId('notifications-retry')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-retry'))
  expect(await screen.findByTestId('notifications-list')).toBeTruthy()
})

it('shows the empty state, whose action goes to the Shop', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a', { paidAt: null })]))
  await render(<NotificationsScreen />)
  expect(await screen.findByText('No updates yet')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('opens the order when a row is tapped, once even on a double tap', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a')]))
  await render(<NotificationsScreen />)
  const row = await screen.findByTestId('notification-row-a-paid')
  await fireEvent.press(row)
  await fireEvent.press(row)
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'a' } })
})

it('marks only events newer than the stored time as New, and stores the latest time only on leaving', async () => {
  await AsyncStorage.setItem(KEY, '2026-11-14T06:00:00.000Z')
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('old'), order('fresh', { paidAt: '2026-11-14T08:00:00.000Z' })]))
  await render(<NotificationsScreen />)
  const fresh = await screen.findByTestId('notification-row-fresh-paid')
  expect(fresh.props.accessibilityLabel).toBe('Payment received, order SHF-fresh, Nov 14, 2026, 4:00 PM, new')
  expect(screen.getAllByTestId('notification-new')).toHaveLength(1)
  expect(screen.getByTestId('notification-row-old-paid').props.accessibilityLabel).not.toMatch(/new$/)
  expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T06:00:00.000Z')
  await setFocus(false)
  expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T08:00:00.000Z')
})

it('marks nothing New on the first visit, but stores the latest time', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a')]))
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-a-paid')
  expect(screen.queryByTestId('notification-new')).toBeNull()
  expect(await AsyncStorage.getItem(KEY)).toBeNull()
  await setFocus(false)
  expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T05:49:00.000Z')
})

const fresh = () => api.fetchOrdersPage.mockResolvedValue(pageOf([order('old'), order('fresh', { paidAt: '2026-11-14T08:00:00.000Z' })]))

it('keeps the markers when the user tabs away and back before the list rendered', async () => {
  await AsyncStorage.setItem(KEY, '2026-11-14T06:00:00.000Z')
  api.fetchOrdersPage.mockReturnValue(new Promise(() => {})) // still loading when they leave
  await render(<NotificationsScreen />)
  await setFocus(false)
  fresh()
  await setFocus(true)
  await screen.findByTestId('notification-row-fresh-paid')
  expect(screen.getAllByTestId('notification-new')).toHaveLength(1)
  expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T06:00:00.000Z')
})

it('clears the markers after a real leave and return, and keeps them through a pull-to-refresh', async () => {
  await AsyncStorage.setItem(KEY, '2026-11-14T06:00:00.000Z')
  fresh()
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-fresh-paid')
  await act(async () => screen.getByTestId('notifications-list').props.onRefresh())
  expect(screen.getAllByTestId('notification-new')).toHaveLength(1)
  await setFocus(false)
  await setFocus(true)
  await screen.findByTestId('notification-row-fresh-paid')
  expect(screen.queryByTestId('notification-new')).toBeNull()
})

it('does not show or store the seen time of one account for another', async () => {
  await AsyncStorage.setItem(KEY, '2026-11-14T06:00:00.000Z')
  fresh()
  const view = await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-fresh-paid')
  mockUseSession.mockReturnValue({ ...signedIn, session: { user: { id: 'u2' } } })
  await view.rerender(<NotificationsScreen />)
  await screen.findByTestId('notification-row-fresh-paid')
  expect(screen.queryByTestId('notification-new')).toBeNull() // u2 has no stored time: first visit
  expect(await AsyncStorage.getItem('kral:notifications-seen:u2')).toBeNull()
  expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T08:00:00.000Z') // u1 was left, so u1 is stored
})

describe('live polling', () => {
  const POLL = 20_000
  const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)))
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('a poll adds a new update in place without the skeleton, and does not mark it seen', async () => {
    await AsyncStorage.setItem(KEY, '2026-11-14T06:00:00.000Z')
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('old')])).mockResolvedValue(pageOf([order('old'), order('fresh', { paidAt: '2026-11-14T08:00:00.000Z' })]))
    await render(<NotificationsScreen />)
    await act(async () => {})
    expect(screen.queryByTestId('notification-row-fresh-paid')).toBeNull()
    await tick(POLL)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId('notification-row-fresh-paid')).toBeTruthy()
    expect(screen.getAllByTestId('notification-new')).toHaveLength(1)
    expect(await AsyncStorage.getItem(KEY)).toBe('2026-11-14T06:00:00.000Z') // only leaving the tab marks it seen
  })

  it('a failed poll keeps the list with no toast, and an unchanged one changes nothing', async () => {
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('a')])).mockRejectedValueOnce(new ApiError('network')).mockResolvedValue(pageOf([order('a')]))
    await render(<NotificationsScreen />)
    await act(async () => {})
    await tick(POLL)
    expect(screen.getByTestId('notification-row-a-paid')).toBeTruthy()
    expect(mockToast).not.toHaveBeenCalled()
    await tick(2 * POLL) // backed off to 40 s
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('notification-row-a-paid')).toBeTruthy()
  })

  it('shares one request with a read in flight, and pauses while the tab is unfocused', async () => {
    let resolve: (page: unknown) => void = () => {}
    api.fetchOrdersPage.mockReturnValue(new Promise((r) => (resolve = r)))
    await render(<NotificationsScreen />)
    await tick(5 * POLL)
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(1)
    await act(async () => resolve(pageOf([order('a')])))
    await setFocus(false)
    await tick(5 * POLL)
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(1)
  })

  it('a pull-to-refresh started during a quiet poll is not swallowed when the poll is aborted', async () => {
    let finish: (page: unknown) => void = () => {}
    api.fetchOrdersPage
      .mockResolvedValueOnce(pageOf([order('old')]))
      .mockReturnValueOnce(new Promise(() => {})) // the poll
      .mockReturnValueOnce(new Promise((r) => (finish = r))) // the refresh
    await render(<NotificationsScreen />)
    await act(async () => {})
    await tick(POLL)
    await act(async () => screen.getByTestId('notifications-list').props.onRefresh())
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(3)
    await setFocus(false) // aborts the poll
    await act(async () => finish(pageOf([order('old'), order('fresh', { paidAt: '2026-11-14T08:00:00.000Z' })])))
    expect(screen.getByTestId('notification-row-fresh-paid')).toBeTruthy()
    expect(screen.getByTestId('notifications-list').props.refreshing).toBe(false)
  })

  it('a failed refresh that replaced a poll still toasts', async () => {
    let fail: (reason: unknown) => void = () => {}
    api.fetchOrdersPage
      .mockResolvedValueOnce(pageOf([order('old')]))
      .mockReturnValueOnce(new Promise(() => {}))
      .mockReturnValueOnce(new Promise((_, r) => (fail = r)))
    await render(<NotificationsScreen />)
    await act(async () => {})
    await tick(POLL)
    await act(async () => screen.getByTestId('notifications-list').props.onRefresh())
    await act(async () => fail(new ApiError('network')))
    expect(mockToast).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.")
    expect(screen.getByTestId('notifications-list').props.refreshing).toBe(false)
  })

  it('does not poll while signed out', async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, signOut: jest.fn() })
    await render(<NotificationsScreen />)
    await tick(5 * POLL)
    expect(api.fetchOrdersPage).not.toHaveBeenCalled()
  })
})

it('marks nothing New and does not crash when storage fails', async () => {
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('disk'))
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('disk'))
  fresh()
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-fresh-paid')
  expect(screen.queryByTestId('notification-new')).toBeNull()
  await setFocus(false)
  jest.restoreAllMocks()
})
