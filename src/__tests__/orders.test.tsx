import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import OrdersScreen from '../app/(tabs)/orders'

jest.mock('@/api/orders', () => ({ ...jest.requireActual('@/api/orders'), fetchOrdersPage: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus.current = effect
    // Like the real hook: re-runs only while the screen is focused, never for an unfocused tab.
    jest.requireActual('react').useEffect(() => (mockFocused.on ? effect() : undefined), [effect])
  },
}))
const mockFocus: { current: () => void | (() => void) } = { current: () => {} }
const mockFocused = { on: true }
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('@/api/orders')
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
const pageOf = (items: ReturnType<typeof order>[], page = 1, hasNextPage = false) => ({ items, total: items.length, page, hasNextPage })
const endReached = () => act(async () => void screen.getByTestId('orders-list').props.onEndReached())

beforeEach(() => {
  jest.resetAllMocks()
  mockFocused.on = true
  mockUseSession.mockReturnValue(signedIn)
})

it('shows the skeleton on the first load, then rows with number, date, status, item count and total', async () => {
  let resolve: (page: unknown) => void = () => {}
  api.fetchOrdersPage.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<OrdersScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve(pageOf([order('a'), order('b', { status: 'DELIVERED', paymentStatus: 'PAID', total: 3000 })])))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('SHF-a')).toBeTruthy()
  expect(screen.getAllByText('Nov 14, 2026')).toHaveLength(2)
  expect(screen.getByText('Awaiting payment')).toBeTruthy()
  expect(screen.getByText('Delivered')).toBeTruthy()
  expect(screen.getByText('₱3,000.00')).toBeTruthy()
  expect(screen.getAllByText('2 items')).toHaveLength(2)
  expect(screen.getByText('(Your Orders)')).toBeTruthy()
  expect(api.fetchOrdersPage).toHaveBeenCalledWith({ page: 1, limit: 10 }, expect.any(AbortSignal))
})

it('never shows the prompt while the session loads', async () => {
  mockUseSession.mockReturnValue({ ...signedOut, loading: true })
  await render(<OrdersScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('orders-sign-in')).toBeNull()
  expect(api.fetchOrdersPage).not.toHaveBeenCalled()
})

it('prompts sign-in when signed out and pushes /sign-in once', async () => {
  mockUseSession.mockReturnValue(signedOut)
  await render(<OrdersScreen />)
  expect(screen.getByText('Sign in to see your orders')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-sign-in'))
  await fireEvent.press(screen.getByTestId('orders-sign-in'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchOrdersPage).not.toHaveBeenCalled()
})

it('opens an order once on a double tap', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a')]))
  await render(<OrdersScreen />)
  await fireEvent.press(await screen.findByTestId('order-row-a'))
  await fireEvent.press(screen.getByTestId('order-row-a'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'a' } })
})

describe('paging', () => {
  it('appends the next page, drops a duplicate and stops when there is no next page', async () => {
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('a'), order('b')], 1, true)).mockResolvedValueOnce(pageOf([order('b'), order('c')], 2, false))
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await endReached()
    expect(api.fetchOrdersPage).toHaveBeenLastCalledWith({ page: 2, limit: 10 })
    expect(await screen.findByTestId('order-row-c')).toBeTruthy()
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(3)
    await endReached()
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(2)
  })

  it('sends one page request when the end is reached twice in the same tick', async () => {
    let finish: (page: unknown) => void = () => {}
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('a')], 1, true)).mockReturnValueOnce(new Promise((r) => (finish = r)))
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await act(async () => {
      screen.getByTestId('orders-list').props.onEndReached()
      screen.getByTestId('orders-list').props.onEndReached()
    })
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(2)
    await act(async () => finish(pageOf([order('b')], 2)))
    expect(screen.getByTestId('order-row-b')).toBeTruthy()
  })

  it('keeps the rows when page 2 fails and offers an inline Retry that loads it', async () => {
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('a')], 1, true)).mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(pageOf([order('b')], 2))
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await endReached()
    expect(await screen.findByTestId('orders-load-more-retry')).toBeTruthy()
    expect(screen.getByTestId('order-row-a')).toBeTruthy()
    expect(screen.queryByTestId('orders-retry')).toBeNull()
    await endReached() // no endless retry loop while the error shows
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(2)
    await fireEvent.press(screen.getByTestId('orders-load-more-retry'))
    expect(await screen.findByTestId('order-row-b')).toBeTruthy()
    expect(screen.queryByTestId('orders-load-more-retry')).toBeNull()
  })

  it('refetches every loaded page on refocus, so a page-2 row gets its new status and the scroll position is kept', async () => {
    api.fetchOrdersPage
      .mockResolvedValueOnce(pageOf([order('a'), order('b')], 1, true))
      .mockResolvedValueOnce(pageOf([order('c')], 2))
      .mockResolvedValueOnce(pageOf([order('a'), order('b')], 1, true))
      .mockResolvedValueOnce(pageOf([order('c', { status: 'CANCELLED' })], 2))
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await endReached()
    await screen.findByTestId('order-row-c')
    expect(screen.queryByText('Cancelled')).toBeNull()
    await act(async () => void mockFocus.current()) // focus refetch: silent, no skeleton
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(await screen.findByText('Cancelled')).toBeTruthy()
    expect(api.fetchOrdersPage).toHaveBeenCalledTimes(4)
    expect(api.fetchOrdersPage).toHaveBeenNthCalledWith(3, { page: 1, limit: 10 }, expect.any(AbortSignal))
    expect(api.fetchOrdersPage).toHaveBeenNthCalledWith(4, { page: 2, limit: 10 }, expect.any(AbortSignal))
    expect(screen.getAllByTestId(/^order-row-/)).toHaveLength(3)
  })

  it('keeps infinite scroll working when an account goes from no orders to more than one page', async () => {
    api.fetchOrdersPage
      .mockResolvedValueOnce(pageOf([]))
      .mockResolvedValueOnce(pageOf([order('a')], 1, true))
      .mockResolvedValueOnce(pageOf([order('b')], 2))
    await render(<OrdersScreen />)
    await screen.findByText('No orders yet')
    await act(async () => void mockFocus.current())
    await screen.findByTestId('order-row-a')
    await endReached()
    expect(api.fetchOrdersPage).toHaveBeenLastCalledWith({ page: 2, limit: 10 })
    expect(await screen.findByTestId('order-row-b')).toBeTruthy()
  })

  it('pull-to-refresh reloads the first page and clears the spinner; a failure keeps the rows with a toast', async () => {
    api.fetchOrdersPage.mockResolvedValueOnce(pageOf([order('a')])).mockRejectedValueOnce(new ApiError('network'))
    await render(<OrdersScreen />)
    await screen.findByTestId('order-row-a')
    await act(async () => screen.getByTestId('orders-list').props.onRefresh())
    expect(mockToast).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.")
    expect(screen.getByTestId('order-row-a')).toBeTruthy()
    expect(screen.getByTestId('orders-list').props.refreshing).toBe(false)
  })
})

it('shows the empty state with a way to the Shop', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([]))
  await render(<OrdersScreen />)
  expect(await screen.findByText('No orders yet')).toBeTruthy()
  expect(screen.getByText('Orders you place show up here.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('shows the first-load error and Retry refetches', async () => {
  api.fetchOrdersPage.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(pageOf([order('a')]))
  await render(<OrdersScreen />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('orders-retry'))
  expect(await screen.findByTestId('order-row-a')).toBeTruthy()
  expect(api.fetchOrdersPage).toHaveBeenCalledTimes(2)
})

it('signs out once and toasts on a 401', async () => {
  api.fetchOrdersPage.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<OrdersScreen />)
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  expect(screen.queryByTestId('orders-sign-in')).toBeNull()
})

it('treats a 403 as an ordinary error with Retry', async () => {
  api.fetchOrdersPage.mockRejectedValue(new ApiError('forbidden', undefined, 403))
  await render(<OrdersScreen />)
  expect(await screen.findByTestId('orders-retry')).toBeTruthy()
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('never shows the previous account orders, even while the tab is unfocused or the new fetch fails', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a')]))
  const view = await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  mockFocused.on = false
  mockUseSession.mockReturnValue(signedOut)
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByText('Sign in to see your orders')).toBeTruthy()
  api.fetchOrdersPage.mockRejectedValue(new ApiError('network'))
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(api.fetchOrdersPage).toHaveBeenCalledTimes(1) // the unfocused tab did not refetch
  mockFocused.on = true
  await act(async () => void mockFocus.current())
  expect(await screen.findByTestId('orders-retry')).toBeTruthy()
  expect(screen.queryByTestId('order-row-a')).toBeNull()
})

it('switching straight from account A to B never shows A rows, not even for one render', async () => {
  api.fetchOrdersPage.mockResolvedValue(pageOf([order('a')]))
  const view = await render(<OrdersScreen />)
  await screen.findByTestId('order-row-a')
  mockFocused.on = false
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<OrdersScreen />)
  expect(screen.queryByTestId('order-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
})
