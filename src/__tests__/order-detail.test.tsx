import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, AppState, StyleSheet } from 'react-native'

import { ApiError } from '@/lib/api'
import OrderScreen from '../app/orders/[id]'

jest.mock('@/api/orders', () => ({ ...jest.requireActual('@/api/orders'), fetchOrder: jest.fn(), createCheckoutSession: jest.fn(), cancelOrder: jest.fn() }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('react-native-webview', () => {
  const { useEffect } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return { WebView: (props: object) => { useEffect(() => { mockMapMounts() }, []); return <View testID="tracking-map" {...props} /> } }
})
const mockMapMounts = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: ({ options }: { options: { headerLeft?: () => unknown } }) => options.headerLeft?.() ?? null },
  useLocalSearchParams: jest.fn(() => ({ id: 'o1' })),
  useIsFocused: () => true,
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
  shipmentEvents: [],
  ...over,
})
const paid = (over: Record<string, unknown> = {}) => order({ status: 'PAID', paymentStatus: 'PAID', paidAt: '2026-11-14T06:00:00.000Z', ...over })
const pressAlert = async (text: string) => {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? []
  await act(async () => buttons.find((b) => b.text === text)?.onPress?.())
}
const MOVED_ON = "This order's status changed or is still updating. If you already paid, it can take a moment to show."
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
  expect(screen.getByText('Size M / Red')).toBeTruthy()
  expect(screen.getByText('Qty 2')).toBeTruthy()
  expect(screen.getAllByText('₱1,100.00')).toHaveLength(2) // line total and subtotal
  expect(screen.getByText('₱150.00')).toBeTruthy()
  expect(screen.getByTestId('order-total').props.children).toBe('₱1,250.00')
  expect(screen.getByText('Ana Cruz')).toBeTruthy()
  expect(screen.getByText('Makati, Metro Manila, 1200')).toBeTruthy()
})

describe('timeline', () => {
  const steps = () => ['placed', 'paid', 'preparing', 'shipped', 'out', 'delivered', 'cancelled', 'refunded'].filter((k) => screen.queryByTestId(`timeline-${k}`))
  const label = (key: string) => screen.getByTestId(`timeline-${key}`).props.accessibilityLabel
  const shipment = (over: Record<string, unknown> = {}) => ({ status: 'ASSIGNING_DRIVER', pickupTime: null, deliveredAt: null, trackingUrl: null, ...over })

  it('shows the full flow with the current step, times only where the API has them', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'PROCESSING' }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(steps()).toEqual(['placed', 'paid', 'preparing', 'shipped', 'out', 'delivered'])
    expect(screen.getByTestId('order-timeline').props.accessibilityRole).toBe('list')
    expect(label('placed')).toBe('Placed, done, Nov 14, 2026, 1:49 PM')
    expect(label('paid')).toBe('Paid, done, Nov 14, 2026, 2:00 PM')
    expect(label('preparing')).toBe('Preparing, current')
    expect(label('shipped')).toBe('Shipped, upcoming')
    expect(label('delivered')).toBe('Delivered, upcoming')
  })

  it('lists the newest stage first and fades each older stage a little more, the latest at full strength', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'PROCESSING' }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    const rows = screen.getAllByTestId(/^timeline-/)
    expect(rows.map((row) => row.props.testID)).toEqual(['timeline-delivered', 'timeline-out', 'timeline-shipped', 'timeline-preparing', 'timeline-paid', 'timeline-placed'])
    const opacity = (key: string) => StyleSheet.flatten(screen.getByTestId(`timeline-${key}`).props.style).opacity
    expect(opacity('preparing')).toBe(1) // the latest stage the order has reached
    expect(opacity('paid')).toBeCloseTo(0.82)
    expect(opacity('placed')).toBeCloseTo(0.64)
    expect(opacity('shipped')).toBe(1) // stages still to come are not faded
  })

  it('an unpaid order is waiting on Paid', async () => {
    api.fetchOrder.mockResolvedValue(order())
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('paid')).toBe('Paid, current')
  })

  it('a delivered order is done end to end', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'DELIVERED', shipment: shipment({ status: 'COMPLETED', pickupTime: '2026-11-15T01:00:00.000Z', deliveredAt: '2026-11-15T03:00:00.000Z' }) }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('shipped')).toBe('Shipped, done, Nov 15, 2026, 9:00 AM')
    expect(label('out')).toBe('Out for delivery, done')
    expect(label('delivered')).toBe('Delivered, done, Nov 15, 2026, 11:00 AM')
  })

  it('shows the cancellation step and its reason', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'CANCELLED', cancelledAt: '2026-11-14T07:00:00.000Z', cancellationReason: 'Cancelled by customer' }))
    await render(<OrderScreen />)
    expect(await screen.findByText('Cancelled by customer')).toBeTruthy()
    expect(steps()).toEqual(['placed', 'cancelled'])
    expect(label('cancelled')).toBe('Cancelled, Nov 14, 2026, 3:00 PM, Cancelled by customer')
  })

  it('a refunded order ends on Refunded without a time', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'REFUNDED' }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(steps()).toEqual(['placed', 'paid', 'refunded'])
    expect(label('refunded')).toBe('Refunded, current')
    expect(screen.getByTestId('order-status')).toHaveTextContent('Refunded')
  })

  it('a refunded delivered order shows every stage it reached, then Refunded', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'REFUNDED', paymentStatus: 'REFUNDED', shipment: shipment({ status: 'COMPLETED', pickupTime: '2026-11-15T01:00:00.000Z', deliveredAt: '2026-11-15T03:00:00.000Z' }) }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(steps()).toEqual(['placed', 'paid', 'preparing', 'shipped', 'out', 'delivered', 'refunded'])
    expect(label('delivered')).toBe('Delivered, done, Nov 15, 2026, 11:00 AM')
    expect(label('refunded')).toBe('Refunded, current')
  })

  it('a failed payment is labelled Payment failed on the Paid step', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'PAYMENT_FAILED', paymentStatus: 'FAILED' }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('paid')).toBe('Payment failed, current')
    expect(screen.getByTestId('order-status')).toHaveTextContent('Payment failed')
  })

  it('an out-for-delivery order has Out for delivery current and the stages before it done', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'OUT_FOR_DELIVERY', shipment: shipment({ status: 'ON_GOING', pickupTime: '2026-11-15T01:00:00.000Z', trackingUrl: 'https://share.lalamove.test/1' }) }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('shipped')).toBe('Shipped, done, Nov 15, 2026, 9:00 AM')
    expect(label('out')).toBe('Out for delivery, current')
    expect(label('delivered')).toBe('Delivered, upcoming')
    expect(screen.getByTestId('order-track-delivery')).toBeTruthy()
  })

  it('a cancelled order with no recorded time or reason shows the step bare', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'CANCELLED' }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('cancelled')).toBe('Cancelled')
    expect(label('placed')).toBe('Placed, done, Nov 14, 2026, 1:49 PM')
  })

  it('shipment times are not shown while the status is behind them', async () => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'PROCESSING', shipment: shipment({ pickupTime: '2026-11-15T01:00:00.000Z', deliveredAt: '2026-11-15T03:00:00.000Z' }) }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(label('shipped')).toBe('Shipped, upcoming')
    expect(label('delivered')).toBe('Delivered, upcoming')
  })

  it('stage rows set no accessibilityRole: Android throws on roles it does not know, such as listitem', async () => {
    api.fetchOrder.mockResolvedValue(order())
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.getByTestId('timeline-placed').props.accessibilityRole).toBeUndefined()
  })
})

describe('delivery tracking', () => {
  const shipment = (trackingUrl: string | null) => ({ status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl })
  const onTheWay = (url: string | null, status = 'DISPATCHED') => paid({ status, shipment: shipment(url) })

  it.each(['DISPATCHED', 'OUT_FOR_DELIVERY'])('%s with a link: status line, Track Delivery and the honest copy, above the timeline', async (status) => {
    api.fetchOrder.mockResolvedValue(onTheWay('https://share.lalamove.test/1', status))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.getByTestId('order-tracking')).toHaveTextContent(/Driver on the way/)
    expect(screen.getByTestId('order-track-delivery')).toBeTruthy()
    expect(screen.getByText('Map not showing? Open it in your browser')).toBeTruthy()
    expect(screen.getByTestId('tracking-map').props.source).toEqual({ uri: 'https://share.lalamove.test/1' })
    expect(screen.queryByTestId('order-tracking-pending')).toBeNull()
    const tree = JSON.stringify(screen.toJSON())
    expect(tree.indexOf('"order-tracking"')).toBeLessThan(tree.indexOf('"order-timeline"'))
  })

  it('dispatched without a link says it is not available yet and offers no button', async () => {
    api.fetchOrder.mockResolvedValue(onTheWay(null))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.getByTestId('order-tracking-pending')).toHaveTextContent("Tracking link isn't available yet. It appears once the courier assigns a driver.")
    expect(screen.queryByTestId('order-track-delivery')).toBeNull()
    expect(screen.queryByTestId('tracking-map')).toBeNull()
  })

  it.each(['javascript:alert(1)', 'http://share.lalamove.test/1'])('%s counts as no link: only https is offered', async (url) => {
    api.fetchOrder.mockResolvedValue(onTheWay(url))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.queryByTestId('order-track-delivery')).toBeNull()
    expect(screen.getByTestId('order-tracking-pending')).toBeTruthy()
  })

  it('opens the browser once on a double tap', async () => {
    api.fetchOrder.mockResolvedValue(onTheWay('https://share.lalamove.test/1'))
    let done: (value: unknown) => void = () => {}
    mockOpen.mockReturnValue(new Promise((r) => (done = r)))
    await render(<OrderScreen />)
    const button = await screen.findByTestId('order-track-delivery')
    await act(async () => {
      button.props.onClick({})
      button.props.onClick({})
    })
    expect(mockOpen).toHaveBeenCalledTimes(1)
    await act(async () => done({ type: 'dismiss' }))
    await act(async () => button.props.onClick({}))
    expect(mockOpen).toHaveBeenCalledTimes(2)
  })

  it.each([paid({ status: 'PROCESSING' }), paid({ status: 'DELIVERED', shipment: shipment('https://share.lalamove.test/1') }), order()])('has no tracking section for %#', async (shown) => {
    api.fetchOrder.mockResolvedValue(shown)
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.queryByTestId('order-tracking')).toBeNull()
    expect(screen.queryByTestId('tracking-map')).toBeNull()
  })

  it('Track Delivery opens the courier page in the browser', async () => {
    api.fetchOrder.mockResolvedValue(onTheWay('https://share.lalamove.test/1'))
    mockOpen.mockResolvedValue({ type: 'opened' })
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-track-delivery'))
    expect(mockOpen).toHaveBeenCalledWith('https://share.lalamove.test/1')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('toasts when the browser cannot open', async () => {
    api.fetchOrder.mockResolvedValue(onTheWay('https://share.lalamove.test/1'))
    mockOpen.mockRejectedValue(new Error('no browser'))
    await render(<OrderScreen />)
    await fireEvent.press(await screen.findByTestId('order-track-delivery'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't open the tracking page. Try again."))
  })
})

describe('delivery updates', () => {
  const ev = (n: number) => ({ id: `e${n}`, status: 'ON_GOING', at: `2026-11-15T0${n}:30:00.000Z` })
  const shipment = (trackingUrl: string | null) => ({ status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl })
  const show = async (shipmentEvents: unknown[], url: string | null = 'https://share.lalamove.test/1') => {
    api.fetchOrder.mockResolvedValue(paid({ status: 'DISPATCHED', shipment: shipment(url), shipmentEvents }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
  }

  it('shows nothing without events', async () => {
    await show([])
    expect(screen.queryByTestId('delivery-updates')).toBeNull()
  })
  it('shows the latest 3 with 12-hour times, then View more expands and View less collapses', async () => {
    await show([ev(1), ev(2), ev(3), ev(4), ev(5)].reverse())
    expect(screen.queryByTestId('delivery-update-e5')).toBeTruthy()
    expect(screen.queryByTestId('delivery-update-e3')).toBeTruthy()
    expect(screen.queryByTestId('delivery-update-e2')).toBeNull()
    expect(screen.getByTestId('delivery-update-e5')).toHaveTextContent(/Nov 15, 2026, 1:30 PM/)
    const toggle = screen.getByTestId('delivery-updates-toggle')
    expect(toggle).toHaveTextContent('View more (2)')
    expect(toggle.props.accessibilityState).toEqual({ expanded: false })
    await fireEvent.press(toggle)
    expect(screen.queryByTestId('delivery-update-e1')).toBeTruthy()
    expect(screen.getByTestId('delivery-updates-toggle')).toHaveTextContent('View less')
    await fireEvent.press(screen.getByTestId('delivery-updates-toggle'))
    expect(screen.queryByTestId('delivery-update-e1')).toBeNull()
  })
  it('has no toggle for 3 or fewer, and shows in the pending-link variant too', async () => {
    await show([ev(1), ev(2)], null)
    expect(screen.getByTestId('order-tracking-pending')).toBeTruthy()
    expect(screen.getByTestId('delivery-update-e2')).toBeTruthy()
    expect(screen.queryByTestId('delivery-updates-toggle')).toBeNull()
  })
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
  expect(remove).toHaveBeenCalledTimes(2) // the screen's and the poll's
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

describe('pay=1 from checkout', () => {
  it('opens the payment page once for an unpaid order, clears the param, and does not repeat when the order reloads', async () => {
    useLocalSearchParams.mockReturnValue({ id: 'o1', pay: '1' })
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'dismiss' }) // iOS: the browser closing reloads the order
    await render(<OrderScreen />)
    await waitFor(() => expect(mockOpen).toHaveBeenCalledWith('https://pay.test/c/1'))
    await waitFor(() => expect(api.fetchOrder).toHaveBeenCalledTimes(2))
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1)
    expect(router.setParams).toHaveBeenCalledWith({ pay: undefined })
  })

  it('never pays a paid order, but still clears the param', async () => {
    useLocalSearchParams.mockReturnValue({ id: 'o1', pay: '1' })
    api.fetchOrder.mockResolvedValue(paid())
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(api.createCheckoutSession).not.toHaveBeenCalled()
    expect(router.setParams).toHaveBeenCalledWith({ pay: undefined })
  })

  it('does not pay without pay=1', async () => {
    api.fetchOrder.mockResolvedValue(order())
    await render(<OrderScreen />)
    await screen.findByTestId('order-pay-now')
    expect(api.createCheckoutSession).not.toHaveBeenCalled()
    expect(router.setParams).not.toHaveBeenCalled()
  })
})

describe('live polling', () => {
  const POLL = 20_000
  const MAX_POLL = 120_000
  const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)))
  const open = async () => {
    await render(<OrderScreen />)
    await act(async () => {})
  }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => {
    jest.useRealTimers()
    ;(Math.random as unknown as jest.SpyInstance).mockRestore() // a reset spy would return undefined to every later test (NaN timeouts)
  })

  it('shows a new status in place without the skeleton, and the actions follow it', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValue(paid())
    await open()
    expect(screen.getByTestId('order-pay-now')).toBeTruthy()
    await tick(POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(api.fetchOrder).toHaveBeenLastCalledWith('o1', expect.any(AbortSignal))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId('order-status')).toHaveTextContent('Paid')
    expect(screen.queryByTestId('order-pay-now')).toBeNull()
  })

  it('a status change from the poll advances the current timeline step in place', async () => {
    const shipment = { status: 'ASSIGNING_DRIVER', pickupTime: null, deliveredAt: null, trackingUrl: null }
    api.fetchOrder.mockResolvedValueOnce(paid({ status: 'PROCESSING' })).mockResolvedValue(paid({ status: 'DISPATCHED', updatedAt: '2026-11-14T08:00:00.000Z', shipment }))
    await open()
    expect(screen.getByTestId('timeline-preparing').props.accessibilityLabel).toBe('Preparing, current')
    expect(screen.getByTestId('timeline-shipped').props.accessibilityLabel).toBe('Shipped, upcoming')
    await tick(POLL)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId('timeline-preparing').props.accessibilityLabel).toBe('Preparing, done')
    expect(screen.getByTestId('timeline-shipped').props.accessibilityLabel).toBe('Shipped, current')
    expect(screen.getByTestId('order-tracking-pending')).toBeTruthy()
  })

  it('a poll that adds the tracking link adds the tracking section in place', async () => {
    const shipment = { status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl: 'https://share.lalamove.test/1' }
    api.fetchOrder.mockResolvedValueOnce(paid({ status: 'PROCESSING' })).mockResolvedValue(paid({ status: 'DISPATCHED', updatedAt: '2026-11-14T08:00:00.000Z', shipment }))
    await open()
    expect(screen.queryByTestId('order-tracking')).toBeNull()
    await tick(POLL)
    expect(screen.queryByLabelText('Loading')).toBeNull()
    expect(screen.getByTestId('order-track-delivery')).toBeTruthy()
  })

  it('a poll that changes the order but not the link keeps the same map; leaving the road unmounts it', async () => {
    const at = (status: string) => paid({ status, updatedAt: status, shipment: { status: 'ON_GOING', pickupTime: null, deliveredAt: null, trackingUrl: 'https://share.lalamove.test/1' } })
    mockMapMounts.mockClear()
    api.fetchOrder.mockResolvedValueOnce(at('DISPATCHED')).mockResolvedValueOnce(at('OUT_FOR_DELIVERY')).mockResolvedValue(at('DELIVERED'))
    await open()
    expect(mockMapMounts).toHaveBeenCalledTimes(1)
    await tick(POLL)
    expect(screen.getByTestId('order-status')).toHaveTextContent('Out for delivery')
    expect(mockMapMounts).toHaveBeenCalledTimes(1)
    await tick(POLL)
    expect(screen.queryByTestId('tracking-map')).toBeNull()
  })

  it('stops once the order is closed', async () => {
    api.fetchOrder.mockResolvedValueOnce(paid()).mockResolvedValue(paid({ status: 'DELIVERED' }))
    await open()
    await tick(POLL)
    expect(screen.getByTestId('order-status')).toHaveTextContent('Delivered')
    await tick(10 * POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })

  it('never polls an order that is already closed', async () => {
    api.fetchOrder.mockResolvedValue(order({ status: 'CANCELLED' }))
    await open()
    await tick(10 * POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
  })

  it('keeps the order on screen when a poll fails, backs off, and recovers', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockRejectedValueOnce(new ApiError('network')).mockResolvedValue(paid())
    await open()
    await tick(POLL)
    expect(screen.getByTestId('order-detail')).toBeTruthy()
    expect(screen.queryByTestId('order-retry')).toBeNull()
    expect(mockToast).not.toHaveBeenCalled()
    await tick(POLL) // the wait doubled to 40 s
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    await tick(POLL)
    expect(screen.getByTestId('order-status')).toHaveTextContent('Paid')
  })

  it('a 401 on a poll signs out once', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await open()
    await tick(POLL)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  })

  it('does not re-render for an identical copy', async () => {
    api.fetchOrder.mockImplementation(() => Promise.resolve(order()))
    await open()
    const before = screen.getByTestId('order-detail')
    await tick(POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('order-detail')).toBe(before)
  })

  it('is paused while Cancel Order is in flight, so a poll cannot clobber the result', async () => {
    let done: () => void = () => {}
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValue(order({ status: 'CANCELLED' }))
    api.cancelOrder.mockReturnValue(new Promise<void>((r) => (done = r)))
    await open()
    await fireEvent.press(screen.getByTestId('order-cancel'))
    await pressAlert('Cancel Order')
    await tick(5 * POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
    await act(async () => done())
    expect(screen.getByTestId('order-status')).toHaveTextContent('Cancelled')
  })

  it('is paused while the payment link is being fetched', async () => {
    api.fetchOrder.mockResolvedValue(order())
    api.createCheckoutSession.mockReturnValue(new Promise(() => {}))
    await open()
    await act(async () => void fireEvent.press(screen.getByTestId('order-pay-now')))
    await tick(5 * POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
  })

  it('on return from payment the reload is the only read, not the poll as well', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValue(paid())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'opened' })
    await open()
    await fireEvent.press(screen.getByTestId('order-pay-now'))
    await act(async () => {})
    const handlers = appState.mock.calls.map((call) => call[1] as (state: string) => void)
    await act(async () => handlers.forEach((onChange) => onChange('active')))
    await act(async () => {})
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })

  it('keeps the return reload the only read whichever listener runs first', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValue(paid())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'opened' })
    await open()
    await fireEvent.press(screen.getByTestId('order-pay-now'))
    await act(async () => {})
    const handlers = appState.mock.calls.map((call) => call[1] as (state: string) => void)
    await act(async () => [...handlers].reverse().forEach((onChange) => onChange('active')))
    await act(async () => {})
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })

  it('resumes polling when the payment browser never reports a return', async () => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockResolvedValue(paid())
    api.createCheckoutSession.mockResolvedValue('https://pay.test/c/1')
    mockOpen.mockResolvedValue({ type: 'opened' })
    await open()
    await fireEvent.press(screen.getByTestId('order-pay-now'))
    await act(async () => {})
    await tick(POLL) // the flag is 20 s old: stale, so this poll reads
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('order-status')).toHaveTextContent('Paid')
  })

  it.each([
    ['404', new ApiError('not-found', undefined, 404)],
    ['403', new ApiError('forbidden', undefined, 403)],
  ])('stops polling for good after a %s', async (_, failure) => {
    api.fetchOrder.mockResolvedValueOnce(order()).mockRejectedValue(failure)
    await open()
    await tick(POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    await tick(10 * MAX_POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('pauses in the background and reads once on return', async () => {
    api.fetchOrder.mockResolvedValue(order())
    await open()
    const handlers = appState.mock.calls.map((call) => call[1] as (state: string) => void)
    await act(async () => handlers.forEach((onChange) => onChange('background')))
    await tick(5 * POLL)
    expect(api.fetchOrder).toHaveBeenCalledTimes(1)
    await act(async () => handlers.forEach((onChange) => onChange('active')))
    expect(api.fetchOrder).toHaveBeenCalledTimes(2)
  })
})

describe('reviews section', () => {
  it.each(['DELIVERED', 'COMPLETED'])('is shown on a %s order', async (status) => {
    mockRequest.mockImplementation(async (_method: string, path: string) => (path === '/reviews/pending' ? [] : { data: [], meta: { total: 0, totalPages: 1 } }))
    api.fetchOrder.mockResolvedValue(paid({ status }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(await screen.findByTestId('order-reviews-empty')).toBeTruthy()
  })

  it.each(['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'DISPATCHED', 'CANCELLED'])('is not shown on a %s order', async (status) => {
    api.fetchOrder.mockResolvedValue(paid({ status }))
    await render(<OrderScreen />)
    await screen.findByTestId('order-detail')
    expect(screen.queryByTestId('order-reviews')).toBeNull()
  })
})
