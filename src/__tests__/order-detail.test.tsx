import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, AppState } from 'react-native'

import { ApiError } from '@/lib/api'
import OrderScreen from '../app/orders/[id]'

jest.mock('@/api/orders', () => ({ ...jest.requireActual('@/api/orders'), fetchOrder: jest.fn(), createCheckoutSession: jest.fn(), cancelOrder: jest.fn() }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: ({ options }: { options: { headerLeft?: () => unknown } }) => options.headerLeft?.() ?? null },
  useLocalSearchParams: jest.fn(() => ({ id: 'o1' })),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockRequest: jest.Mock = jest.requireMock('@/lib/api').request
const api = jest.requireMock('@/api/orders')
const mockOpen: jest.Mock = jest.requireMock('expo-web-browser').openBrowserAsync
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router, useLocalSearchParams } = jest.requireMock('expo-router')
const alertSpy = jest.spyOn(Alert, 'alert')
const appState = jest.spyOn(AppState, 'addEventListener')

const mockSignOut = jest.fn()
const signedIn = { session: { user: { id: 'u1' } }, loading: false, signOut: mockSignOut }
const order = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  orderNumber: 'SHF-20261114-ABC123',
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
  address: { recipient: 'Ana Cruz', phone: '09171234567', line: '1 Main St, Brgy 1', city: 'Makati, Metro Manila, 1200' },
  items: [{ id: 'i1', name: 'Linen Tee', size: 'M', color: 'Red', quantity: 2, unitPrice: 550, lineTotal: 1100, imageUrl: null }],
  shipment: null,
  ...over,
})
const paid = (over: Record<string, unknown> = {}) => order({ status: 'PAID', paymentStatus: 'PAID', paidAt: '2026-11-14T06:00:00.000Z', ...over })
const pressAlert = async (text: string) => {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? []
  await act(async () => buttons.find((b) => b.text === text)?.onPress?.())
}
const MOVED_ON = 'This order has already moved on. It may be paid or cancelled, so the details below were refreshed.'
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.resetAllMocks()
  useLocalSearchParams.mockReturnValue({ id: 'o1' })
  router.canGoBack.mockReturnValue(true)
  mockUseSession.mockReturnValue(signedIn)
  alertSpy.mockImplementation(() => {})
  appState.mockReturnValue({ remove: jest.fn() } as never)
})

it('shows the skeleton while loading', async () => {
  api.fetchOrder.mockReturnValue(never())
  await render(<OrderScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('order-detail')).toBeNull()
})

it('renders the order: number, status and payment labels, placed time, items, amounts and address', async () => {
  api.fetchOrder.mockResolvedValue(order())
  await render(<OrderScreen />)
  expect(await screen.findByTestId('order-detail')).toBeTruthy()
  expect(api.fetchOrder).toHaveBeenCalledWith('o1', expect.any(AbortSignal))
  expect(screen.getByText('SHF-20261114-ABC123')).toBeTruthy()
  expect(screen.getByTestId('order-status')).toHaveTextContent('Awaiting payment')
  expect(screen.getByTestId('order-payment-status')).toHaveTextContent('Unpaid')
  expect(screen.getByText('Placed Nov 14, 2026, 1:49 PM')).toBeTruthy()
  expect(screen.getByText('Linen Tee')).toBeTruthy()
  expect(screen.getByText('Size M // Red')).toBeTruthy()
  expect(screen.getByText('Qty 2')).toBeTruthy()
  expect(screen.getAllByText('₱1,100.00')).toHaveLength(2) // line total and subtotal
  expect(screen.getByText('₱150.00')).toBeTruthy()
  expect(screen.getByTestId('order-total').props.children).toBe('₱1,250.00')
  expect(screen.getByText('Ana Cruz')).toBeTruthy()
  expect(screen.getByText('Makati, Metro Manila, 1200')).toBeTruthy()
})

it('builds the timeline only from fields the API sent', async () => {
  api.fetchOrder.mockResolvedValue(order())
  await render(<OrderScreen />)
  await screen.findByTestId('order-detail')
  expect(screen.getByText('Placed')).toBeTruthy()
  for (const label of ['Paid', 'Handed to courier', 'Delivered', 'Cancelled']) expect(screen.queryByText(label)).toBeNull()
})

it('shows the cancellation step and its reason when the API sent them', async () => {
  api.fetchOrder.mockResolvedValue(order({ status: 'CANCELLED', cancelledAt: '2026-11-14T07:00:00.000Z', cancellationReason: 'Cancelled by customer' }))
  await render(<OrderScreen />)
  expect(await screen.findByText('Cancelled by customer')).toBeTruthy()
  expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0)
  expect(screen.queryByText('Paid')).toBeNull()
})

describe('actions are offered only when the order is unpaid', () => {
  it('shows Pay Now and Cancel Order while awaiting payment and after a failed payment', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'PAYMENT_FAILED', paymentStatus: 'FAILED' }))
    await render(<OrderScreen />)
    expect(await screen.findByTestId('order-pay-now')).toBeTruthy()
    expect(screen.getByTestId('order-cancel')).toBeTruthy()
  })
  it.each([paid(), order({ status: 'CANCELLED' }), order({ status: 'DELIVERED', paymentStatus: 'PAID' }), order({ status: 'MYSTERY' })])('shows neither for %#', async (shown) => {
    api.fetchOrder.mockResolvedValue(shown)
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.queryByTestId('order-pay-now')).toBeNull()
    expect(screen.queryByTestId('order-cancel')).toBeNull()
  })
  it('labels an unknown status neutrally', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'MYSTERY_STATE' }))
    await render(<OrderScreen />)
    expect(await screen.findByTestId('order-status')).toHaveTextContent('Mystery state')
  })
})

describe('Pay Now', () => {
  it('opens the payment page once on a double tap in the same tick, then reloads when the browser closes', async () => {
    let link: (url: string) => void = () => {}
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(paid())
    api.createCheckoutSession.mockReturnValue(new Promise((r) => (link = r)))
    mockOpen.mockResolvedValue({ type: 'dismiss' })
    await render(<OrderScreen />)
    const button = await screen.findByTestId('order-pay-now')
    await act(async () => {
      button.props.onClick({})
      button.props.onClick({})
    })
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1)
    expect(api.createCheckoutSession).toHaveBeenCalledWith('o1')
    await act(async () => link('https://pay.test/c/1'))
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledWith('https://pay.test/c/1')
    await waitFor(() => expect(screen.getByTestId('order-payment-status')).toHaveTextContent('Paid'))
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('order-pay-now')).toBeNull()
  })

  it('on Android ("opened" at once) reloads only when the app becomes active again', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(paid())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'opened' })
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1))
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
    const onChange = appState.mock.calls.at(-1)?.[1] as (state: string) => void
    await act(async () => onChange('background'))
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
    await act(async () => onChange('active'))
    await waitFor(() => expect(screen.getByTestId('order-payment-status')).toHaveTextContent('Paid'))
    await act(async () => onChange('active')) // a later activation does not reload again
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })

  it('explains a missing payment link inline and lets the shopper try again', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockRejectedValueOnce(new ApiError('server')).mockResolvedValueOnce('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'dismiss' })
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent("We couldn't get a payment link for this order. Tap Pay Now to try again.")
    expect(mockOpen).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('order-pay-now'))
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1))
  })

  it('uses fixed copy and reloads when the order can no longer be paid (400)', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(paid())
    api.createCheckoutSession.mockRejectedValue(new ApiError('validation', 'Order has already been paid', 400))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent(MOVED_ON)
    expect(screen.queryByText(/PENDING_PAYMENT|already been paid/)).toBeNull()
    expect(screen.getByTestId('order-payment-status')).toHaveTextContent('Paid')
    expect(screen.queryByTestId('order-pay-now')).toBeNull()
  })

  it('shows the rate-limit copy on a 429', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockRejectedValue(new ApiError('rate-limit', undefined, 429))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent('Too many requests. Wait a moment and try again.')
  })

  it('treats a 403 as an ordinary failure: no sign-out, no session-expired copy', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockRejectedValue(new ApiError('forbidden', undefined, 403))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent("This order couldn't be updated. Try again.")
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('signs out on a 401 from Pay', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  })

  it('handles the browser failing to open: message shown and Pay Now usable again', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockRejectedValueOnce(new Error('no browser')).mockResolvedValueOnce({ type: 'dismiss' })
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent('Something went wrong. Please try again.')
    await fireEvent.press(screen.getByTestId('order-pay-now'))
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(2))
  })

  it('never opens a non-https payment address and shows the missing-link copy', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockImplementation(jest.requireActual('@/api/orders').createCheckoutSession)
    mockRequest.mockResolvedValue({ checkoutUrl: 'http://pay.test/c/1' })
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent("We couldn't get a payment link for this order. Tap Pay Now to try again.")
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('shows a network failure inline', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockRejectedValue(new ApiError('network'))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-pay-now'))
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent("Can't reach the server. Check your connection and try again.")
  })
})

describe('Cancel Order', () => {
  it('asks first: Keep Order does nothing, Cancel Order cancels once, toasts and reloads', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(order({ status: 'CANCELLED', cancelledAt: '2026-11-14T07:00:00.000Z', cancellationReason: 'Cancelled by customer' }))
    api.cancelOrder.mockResolvedValue(undefined)
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-cancel'))
    expect(alertSpy).toHaveBeenCalledWith('Are you sure?', expect.any(String), expect.any(Array), expect.anything())
    expect((alertSpy.mock.calls.at(-1)?.[2] ?? []).map((b) => [b.text, b.style])).toEqual([['Keep Order', 'cancel'], ['Cancel Order', 'destructive']])
    await pressAlert('Keep Order')
    expect(api.cancelOrder).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByTestId('order-cancel'))
    expect(alertSpy).toHaveBeenCalledTimes(2)
    await pressAlert('Cancel Order')
    expect(api.cancelOrder).toHaveBeenCalledTimes(1)
    expect(api.cancelOrder).toHaveBeenCalledWith('o1')
    expect(mockToast).toHaveBeenCalledWith('Order cancelled')
    await waitFor(() => expect(screen.getByTestId('order-status')).toHaveTextContent('Cancelled'))
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('order-cancel')).toBeNull()
  })

  it('opens one Alert on a double tap', async () => {
    api.fetchOrder.mockResolvedValue(order())
    await render(<OrderScreen />)
    const button = await screen.findByTestId('order-cancel')
    await act(async () => {
      button.props.onClick({})
      button.props.onClick({})
    })
    expect(alertSpy).toHaveBeenCalledTimes(1)
  })

  it('uses fixed copy inline and reloads when the order cannot be cancelled (400)', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(paid())
    api.cancelOrder.mockRejectedValue(new ApiError('validation', 'Only unpaid orders can be cancelled. Current status is PAID', 400))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-cancel'))
    await pressAlert('Cancel Order')
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent(MOVED_ON)
    expect(screen.queryByText(/PAID\./)).toBeNull()
    expect(mockToast).not.toHaveBeenCalled()
    expect(screen.queryByTestId('order-cancel')).toBeNull()
  })

  it('shows a 409 reason inline too', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.cancelOrder.mockRejectedValue(new ApiError('conflict', 'The order is being paid', 409))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-cancel'))
    await pressAlert('Cancel Order')
    expect(await screen.findByTestId('order-inline-error')).toHaveTextContent(MOVED_ON)
  })
})

it('removes the AppState subscription on unmount', async () => {
  const remove = jest.fn()
  appState.mockReturnValue({ remove } as never)
  api.fetchOrder.mockResolvedValue(order())
  const view = await render(<OrderScreen />)
  await screen.findByTestId('order-detail')
  expect(remove).not.toHaveBeenCalled()
  await view.unmount()
  expect(remove).toHaveBeenCalledTimes(1)
})

describe('other states', () => {
  it('shows "not found" for a 404 (also another account\'s order) with a way back to the Orders tab', async () => {
    api.fetchOrder.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await render(<OrderScreen />)
    expect(await screen.findByText("We couldn't find this order")).toBeTruthy()
    await fireEvent.press(screen.getByTestId('order-error-back'))
    expect(router.navigate).toHaveBeenCalledWith('/orders')
  })

  it.each([['an array', ['a', 'b']], ['blank', '  '], ['missing', undefined]])('treats %s id as not found without a request', async (_label, raw) => {
    useLocalSearchParams.mockReturnValue({ id: raw })
    await render(<OrderScreen />)
    expect(await screen.findByTestId('order-error-back')).toBeTruthy()
    expect(api.fetchOrder).not.toHaveBeenCalled()
  })

  it('shows a network error with Retry that reloads', async () => {
    api.fetchOrder.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(order())
    await render(<OrderScreen />)
    expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
    await fireEvent.press(screen.getByTestId('order-retry'))
    expect(await screen.findByTestId('order-detail')).toBeTruthy()
  })

  it('treats a 403 as an ordinary error', async () => {
    api.fetchOrder.mockRejectedValue(new ApiError('forbidden', undefined, 403))
    await render(<OrderScreen />)
    expect(await screen.findByTestId('order-retry')).toBeTruthy()
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('signs out once and toasts on a 401, showing no error screen', async () => {
    api.fetchOrder.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<OrderScreen />)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
    expect(screen.queryByTestId('order-retry')).toBeNull()
  })

  it('asks a signed-out visitor to sign in without any request, once', async () => {
    mockUseSession.mockReturnValue({ session: null, loading: false, signOut: mockSignOut })
    await render(<OrderScreen />)
    await fireEvent.press(screen.getByTestId('order-sign-in'))
    await fireEvent.press(screen.getByTestId('order-sign-in'))
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/sign-in')
    expect(api.fetchOrder).not.toHaveBeenCalled()
  })

  it('never shows the prompt while the session loads', async () => {
    mockUseSession.mockReturnValue({ session: null, loading: true, signOut: mockSignOut })
    await render(<OrderScreen />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.queryByTestId('order-sign-in')).toBeNull()
    expect(api.fetchOrder).not.toHaveBeenCalled()
  })

  it('gives a deep link its own back button to the Orders tab', async () => {
    router.canGoBack.mockReturnValue(false)
    api.fetchOrder.mockResolvedValue(order())
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-header-back'))
    expect(router.navigate).toHaveBeenCalledWith('/orders')
  })
})
