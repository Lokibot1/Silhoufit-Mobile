import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import OrdersScreen from '../app/(tabs)/orders'

jest.mock('@/api/orders', () => ({ ...jest.requireActual('@/api/orders'), fetchAllOrders: jest.fn() }))
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus.current = effect
    // Like the real hook: re-runs only while the screen is focused, never for an unfocused tab.
    jest.requireActual('react').useEffect(() => (mockFocused.on ? effect() : undefined), [effect])
  },
}))
const mockFocus: { current: () => void | (() => void) } = { current: () => {} }
const mockFocused = { on: true }
const mockParams: { tab?: string; nav?: string } = {}
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('@/api/orders')
const mockBrowser = jest.requireMock('expo-web-browser').openBrowserAsync
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router

const mockSignOut = jest.fn()
const as = (id: string) => ({ session: { user: { id } }, loading: false, signOut: mockSignOut })
const signedIn = as('u1')
const signedOut = { session: null, loading: false, signOut: mockSignOut }
const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  orderNumber: `SHF-${id}`,
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  subtotal: 1100,
  shipping: 150,
  discount: 0,
  total: 1250,
  createdAt: '2026-11-14T05:49:00.000Z',
  paidAt: null,
  cancelledAt: null,
  cancellationReason: null,
  address: null,
  items: [{ id: `i-${id}`, name: 'Tee', size: 'M', color: 'Red', quantity: 2, unitPrice: 550, lineTotal: 1100, imageUrl: null }],
  shipment: null,
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  mockFocused.on = true
  delete mockParams.tab
  delete mockParams.nav
  mockUseSession.mockReturnValue(signedIn)
})

it('shows the skeleton on the first load, then cards with number, date, status, item count and total', async () => {
  let resolve: (rows: unknown) => void = () => {}
  api.fetchAllOrders.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<OrdersScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve([order('a'), order('b', { status: 'DELIVERED', paymentStatus: 'PAID', total: 3000 })]))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('SHF-a')).toBeTruthy()
  expect(screen.getAllByText('Nov 14, 2026')).toHaveLength(2)
  expect(screen.getByText('Awaiting payment')).toBeTruthy()
  expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0)
  expect(screen.getByText('₱3,000.00')).toBeTruthy()
  expect(screen.getAllByText('Total (2 items):')).toHaveLength(2)
  expect(screen.getByText('(Your Orders)')).toBeTruthy()
  expect(api.fetchAllOrders).toHaveBeenCalledWith(expect.any(AbortSignal))
})

it('never shows the prompt while the session loads', async () => {
  mockUseSession.mockReturnValue({ ...signedOut, loading: true })
  await render(<OrdersScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('orders-sign-in')).toBeNull()
  expect(api.fetchAllOrders).not.toHaveBeenCalled()
})

it('prompts sign-in when signed out and pushes /sign-in once', async () => {
  mockUseSession.mockReturnValue(signedOut)
  await render(<OrdersScreen />)
  expect(screen.getByText('Sign in to see your orders')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-sign-in'))
  await fireEvent.press(screen.getByTestId('orders-sign-in'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchAllOrders).not.toHaveBeenCalled()
})

it('opens an order once on a double tap', async () => {
  api.fetchAllOrders.mockResolvedValue([order('a')])
  await render(<OrdersScreen />)
  await fireEvent.press(await screen.findByTestId('order-row-a'))
  await fireEvent.press(screen.getByTestId('order-row-a'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'a' } })
})

it('refetches on refocus without the skeleton, and a new status shows', async () => {
  api.fetchAllOrders.mockResolvedValueOnce([order('a')]).mockResolvedValueOnce([order('a', { status: 'CANCELLED' })])
  await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  await act(async () => void mockFocus.current())
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect((await screen.findAllByText('Cancelled')).length).toBeGreaterThan(0)
  expect(api.fetchAllOrders).toHaveBeenCalledTimes(2)
})

it('pull-to-refresh reloads and clears the spinner; a failure keeps the rows with a toast', async () => {
  api.fetchAllOrders.mockResolvedValueOnce([order('a')]).mockRejectedValueOnce(new ApiError('network'))
  await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  await act(async () => screen.getByTestId('orders-list').props.onRefresh())
  expect(mockToast).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.")
  expect(screen.getByTestId('order-row-a')).toBeTruthy()
  expect(screen.getByTestId('orders-list').props.refreshing).toBe(false)
})

describe('tabs', () => {
  const mixed = () => [
    order('a'),
    order('b', { status: 'PAYMENT_FAILED' }),
    order('c', { status: 'DELIVERED', paymentStatus: 'PAID' }),
    order('d', { status: 'DISPATCHED', paymentStatus: 'PAID' }),
  ]

  it('shows counts, filters by tab and keeps the tab across a refocus', async () => {
    api.fetchAllOrders.mockResolvedValue(mixed())
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    expect(screen.getByText('All (4)')).toBeTruthy()
    expect(screen.getByText('To pay (2)')).toBeTruthy()
    expect(screen.getByText('Cancelled (0)')).toBeTruthy()
    expect(screen.getByTestId('orders-tab-to-pay').props.accessibilityLabel).toBe('To pay, 2 orders')
    await fireEvent.press(screen.getByTestId('orders-tab-to-pay'))
    expect(screen.getByTestId('orders-tab-to-pay').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(2)
    await act(async () => void mockFocus.current())
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(2)
  })

  it('shows the loading skeleton with the tabs but no counts', async () => {
    api.fetchAllOrders.mockReturnValue(new Promise(() => {}))
    await render(<OrdersScreen />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.getByText('To pay')).toBeTruthy()
  })

  it('shows an empty-tab state with Show All Orders', async () => {
    api.fetchAllOrders.mockResolvedValue(mixed())
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await fireEvent.press(screen.getByTestId('orders-tab-cancelled'))
    expect(screen.getByText('No cancelled orders')).toBeTruthy()
    expect(screen.queryAllByTestId(/^order-row-/)).toHaveLength(0)
    await fireEvent.press(screen.getByTestId('orders-tab-empty-action'))
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(4)
  })

  it('preselects the tab from the route param and ignores an unknown one', async () => {
    mockParams.tab = 'completed'
    api.fetchAllOrders.mockResolvedValue(mixed())
    const view = await render(<OrdersScreen />)
    await screen.findByTestId('order-row-c')
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(1)
    mockParams.tab = 'nonsense'
    await view.rerender(<OrdersScreen />)
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(1)
    mockParams.tab = 'to-pay'
    await view.rerender(<OrdersScreen />)
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(2)
  })

  it('a shortcut with the same tab and a new nav re-selects it after a manual change', async () => {
    mockParams.tab = 'to-pay'
    mockParams.nav = '1'
    api.fetchAllOrders.mockResolvedValue(mixed())
    const view = await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(2)
    await fireEvent.press(screen.getByTestId('orders-tab-all'))
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(4)
    await view.rerender(<OrdersScreen />) // same params: nothing changed
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(4)
    mockParams.nav = '2'
    await view.rerender(<OrdersScreen />)
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(2)
  })

  it('View all (tab all, new nav) re-selects All', async () => {
    mockParams.tab = 'all'
    mockParams.nav = '1'
    api.fetchAllOrders.mockResolvedValue(mixed())
    const view = await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await fireEvent.press(screen.getByTestId('orders-tab-completed'))
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(1)
    mockParams.nav = '2'
    await view.rerender(<OrdersScreen />)
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(4)
  })

  it('goes back to All when a different user signs in', async () => {
    api.fetchAllOrders.mockResolvedValue(mixed())
    const view = await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await fireEvent.press(screen.getByTestId('orders-tab-completed'))
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(1)
    mockUseSession.mockReturnValue(as('u2'))
    await view.rerender(<OrdersScreen />)
    await waitFor(() => expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(4))
  })
})

describe('card actions', () => {
  const shipped = { status: 'DISPATCHED', paymentStatus: 'PAID', shipment: { status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl: 'https://track.test/1' } }

  it('offers Review & Pay only for an unpaid order, and it opens the detail instead of paying', async () => {
    api.fetchAllOrders.mockResolvedValue([order('a'), order('b', { status: 'PAID', paymentStatus: 'PAID' })])
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    expect(screen.queryByTestId('order-pay-b')).toBeNull()
    expect(screen.getByText('Review & Pay')).toBeTruthy()
    expect(screen.getByLabelText('Open order SHF-a to pay')).toBe(screen.getByTestId('order-pay-a'))
    await fireEvent.press(screen.getByTestId('order-pay-a'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'a' } })
  })

  it('offers Track only with a web link, and opens it in the browser', async () => {
    api.fetchAllOrders.mockResolvedValue([
      order('a', shipped),
      order('b', { ...shipped, shipment: { ...shipped.shipment, trackingUrl: null } }),
      order('c', { ...shipped, shipment: { ...shipped.shipment, trackingUrl: 'javascript:alert(1)' } }),
      order('d', { ...shipped, status: 'DELIVERED' }),
    ])
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    expect(screen.getAllByTestId(/^order-track-/)).toHaveLength(1)
    await fireEvent.press(screen.getByTestId('order-track-a'))
    expect(mockBrowser).toHaveBeenCalledWith('https://track.test/1')
  })

  it('shows two item lines and a "+N more items" line', async () => {
    const items = [1, 2, 3, 4].map((n) => ({ id: `i${n}`, name: `Tee ${n}`, size: null, color: null, quantity: 1, unitPrice: 100, lineTotal: 100, imageUrl: null }))
    api.fetchAllOrders.mockResolvedValue([order('a', { items })])
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    expect(screen.getByText('Tee 2')).toBeTruthy()
    expect(screen.queryByText('Tee 3')).toBeNull()
    expect(screen.getByText('+2 more items')).toBeTruthy()
  })
})

it('shows the empty state with a way to the Shop', async () => {
  api.fetchAllOrders.mockResolvedValue([])
  await render(<OrdersScreen />)
  expect(await screen.findByText('No orders yet')).toBeTruthy()
  expect(screen.getByText('Orders you place show up here.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('shows the first-load error and Retry refetches', async () => {
  api.fetchAllOrders.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce([order('a')])
  await render(<OrdersScreen />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-retry'))
  expect(await screen.findByTestId('order-row-a')).toBeTruthy()
  expect(api.fetchAllOrders).toHaveBeenCalledTimes(2)
})

it('signs out once and toasts on a 401', async () => {
  api.fetchAllOrders.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<OrdersScreen />)
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  expect(screen.queryByTestId('orders-sign-in')).toBeNull()
})

it('treats a 403 as an ordinary error with Retry', async () => {
  api.fetchAllOrders.mockRejectedValue(new ApiError('forbidden', undefined, 403))
  await render(<OrdersScreen />)
  expect(await screen.findByTestId('orders-retry')).toBeTruthy()
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('never shows the previous account orders, even while the tab is unfocused or the new fetch fails', async () => {
  api.fetchAllOrders.mockResolvedValue([order('a')])
  const view = await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  mockFocused.on = false
  mockUseSession.mockReturnValue(signedOut)
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByText('Sign in to see your orders')).toBeTruthy()
  api.fetchAllOrders.mockRejectedValue(new ApiError('network'))
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(api.fetchAllOrders).toHaveBeenCalledTimes(1) // the unfocused tab did not refetch
  mockFocused.on = true
  await act(async () => void mockFocus.current())
  expect(await screen.findByTestId('orders-retry')).toBeTruthy()
  expect(screen.queryByTestId('order-row-a')).toBeNull()
})

it('switching straight from account A to B never shows A rows, not even for one render', async () => {
  api.fetchAllOrders.mockResolvedValue([order('a')])
  const view = await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  mockFocused.on = false
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
})
