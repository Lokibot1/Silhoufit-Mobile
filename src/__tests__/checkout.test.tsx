import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'

import { ApiError } from '@/lib/api'
import CheckoutScreen from '../app/checkout'

jest.mock('@/api/cart', () => ({ fetchCart: jest.fn(), removeCartItem: jest.fn() }))
jest.mock('@/api/addresses', () => ({ fetchAddresses: jest.fn() }))
jest.mock('@/api/orders', () => ({ deliveryProblem: jest.requireActual('@/api/orders').deliveryProblem, quoteShipping: jest.fn(), createOrder: jest.fn(), fetchOrdersPage: jest.fn() }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
let mockParams: { items?: string } = {}
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual('react').useEffect(effect, [effect]),
}))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('@/ui/useReduceMotion', () => ({ useReduceMotion: () => true }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }))
const cartApi = jest.requireMock('@/api/cart')
const addressApi = jest.requireMock('@/api/addresses')
const ordersApi = jest.requireMock('@/api/orders')
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate, replace: mockReplace } = jest.requireMock('expo-router').router

const signedIn = { session: { user: { id: 'u1' } }, loading: false, signOut: jest.fn() }
const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  quantity: 2,
  lineTotal: 2500,
  variant: { id: `v-${id}`, size: 'M', color: 'Red', price: 1250, stock: 5, imageUrl: null },
  product: { id: `p-${id}`, name: `Tee ${id}`, image: null, active: true },
  ...over,
})
const cartOf = (items: ReturnType<typeof line>[]) => ({ items, totalItems: items.length, subtotal: items.reduce((n, i) => n + i.lineTotal, 0) })
const address = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  label: null,
  recipientName: `Ana ${id}`,
  phone: '09171234567',
  region: 'NCR',
  province: 'Metro Manila',
  cityMunicipality: 'Makati',
  barangay: 'Poblacion',
  streetAddress: `${id} Main St`,
  addressLine2: null,
  postalCode: '1210',
  latitude: 14.5,
  longitude: 121,
  isDefault: false,
  ...over,
})
const quoteOf = (fee: number, courier = 'Lalamove', expiresAt = '2099-01-01T00:00:00Z') => ({ quotationId: `q-${fee}`, courier, shippingFee: fee, expiresAt })
const alertSpy = jest.spyOn(Alert, 'alert')

beforeEach(() => {
  jest.resetAllMocks()
  mockParams = {}
  mockUseSession.mockReturnValue(signedIn)
  cartApi.fetchCart.mockResolvedValue(cartOf([line('a')]))
  addressApi.fetchAddresses.mockResolvedValue([address('home', { isDefault: true })])
  ordersApi.quoteShipping.mockResolvedValue(quoteOf(150))
  ordersApi.createOrder.mockResolvedValue({ id: 'o1', total: 2650 })
  cartApi.removeCartItem.mockResolvedValue(undefined)
  alertSpy.mockImplementation(() => {})
})

it('shows a skeleton for every section while loading', async () => {
  cartApi.fetchCart.mockReturnValue(new Promise(() => {}))
  addressApi.fetchAddresses.mockReturnValue(new Promise(() => {}))
  await render(<CheckoutScreen />)
  expect(screen.getAllByRole('progressbar')).toHaveLength(3) // address, items, shipping
  expect(screen.getByTestId('checkout-place-order')).toBeTruthy()
})

it('shows the empty cart with a way back', async () => {
  cartApi.fetchCart.mockResolvedValue(cartOf([]))
  await render(<CheckoutScreen />)
  expect(await screen.findByText('Nothing to check out')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('checkout-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/cart')
  expect(screen.queryByTestId('checkout-place-order')).toBeNull()
})

it('prompts sign-in when signed out and asks for nothing', async () => {
  mockUseSession.mockReturnValue({ session: null, loading: false, signOut: jest.fn() })
  await render(<CheckoutScreen />)
  expect(screen.getByText('Sign in to check out')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('checkout-sign-in'))
  await fireEvent.press(screen.getByTestId('checkout-sign-in'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(cartApi.fetchCart).not.toHaveBeenCalled()
})

it('with no address offers Add a delivery address (opens the form from checkout) and the bar hint, and asks for no quote', async () => {
  addressApi.fetchAddresses.mockResolvedValue([])
  await render(<CheckoutScreen />)
  expect(await screen.findByText('You have no saved delivery address yet.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('checkout-address-add'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/addresses/new', params: { from: 'checkout' } })
  expect(screen.getByTestId('checkout-bar-hint').props.children).toBe('Add an address first')
  expect(ordersApi.quoteShipping).not.toHaveBeenCalled()
  expect(screen.getByTestId('checkout-shipping-idle')).toBeTruthy()
})

it('keeps the page when the address list fails and retries only that section', async () => {
  addressApi.fetchAddresses.mockRejectedValueOnce(new ApiError('network'))
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-address-retry')
  expect(screen.getByText('Tee a')).toBeTruthy() // the items still show
  expect(screen.getByTestId('checkout-place-order')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('checkout-address-retry'))
  expect(await screen.findByTestId('checkout-address')).toBeTruthy()
  expect(cartApi.fetchCart).toHaveBeenCalledTimes(1)
})

it('retries a failed shipping quote and maps the copy by error kind', async () => {
  ordersApi.quoteShipping.mockRejectedValueOnce(new ApiError('rate-limit')).mockResolvedValueOnce(quoteOf(150))
  await render(<CheckoutScreen />)
  expect(await screen.findByText('Too many shipping requests. Wait a moment and tap Retry.')).toBeTruthy()
  expect(screen.getByText('Tee a')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('checkout-shipping-retry'))
  expect(await screen.findByTestId('checkout-shipping-fee')).toBeTruthy()
  expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(2)
})

it('explains a missing map pin when the quote is refused for coordinates', async () => {
  ordersApi.quoteShipping.mockRejectedValue(new ApiError('validation', 'Address has no coordinates', 400))
  await render(<CheckoutScreen />)
  expect(await screen.findByText("This address has no map pin, so we can't price delivery. Choose another address.")).toBeTruthy()
})

it('selects the default address, skips one without a pin, and disables it in the sheet', async () => {
  addressApi.fetchAddresses.mockResolvedValue([
    address('nopin', { isDefault: true, latitude: null, longitude: null }),
    address('office'),
  ])
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-address')
  expect(screen.getByText('Ana office | 09171234567')).toBeTruthy() // the default has no pin, so the next one is chosen
  expect(ordersApi.quoteShipping).toHaveBeenCalledWith('office', expect.anything())
  await fireEvent.press(screen.getByTestId('checkout-address-change'))
  const pinless = screen.getByTestId('address-option-nopin')
  expect(pinless.props.accessibilityState).toEqual({ checked: false, disabled: true })
  expect(within(pinless).getByText('Needs a map pin: edit it in Delivery Addresses')).toBeTruthy()
  expect(screen.getByTestId('address-option-office').props.accessibilityState).toEqual({ checked: true, disabled: false })
  expect(screen.getByText('Add New Address')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('address-add'))
  expect(screen.queryByTestId('address-sheet')).toBeNull() // the sheet closes as the form opens
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/addresses/new', params: { from: 'checkout' } })
})

it('auto-selects the default address and quotes it', async () => {
  addressApi.fetchAddresses.mockResolvedValue([address('home', { isDefault: true }), address('office')])
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-address')
  expect(screen.getByText('Ana home | 09171234567')).toBeTruthy()
  expect(screen.getByText('home Main St')).toBeTruthy()
  expect(screen.getByText('Poblacion, Makati, Metro Manila, 1210')).toBeTruthy()
  expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(1)
  expect(ordersApi.quoteShipping).toHaveBeenCalledWith('home', expect.anything())
})

it('changing the address asks for a new quote and updates the fee and total', async () => {
  addressApi.fetchAddresses.mockResolvedValue([address('home', { isDefault: true }), address('office')])
  ordersApi.quoteShipping.mockImplementation(async (id: string) => (id === 'home' ? quoteOf(150) : quoteOf(300, 'Grab')))
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-shipping-fee')
  await fireEvent.press(screen.getByTestId('checkout-address-change'))
  await fireEvent.press(screen.getByTestId('address-option-office'))
  expect(await screen.findByText('Grab')).toBeTruthy()
  expect(ordersApi.quoteShipping).toHaveBeenLastCalledWith('office', expect.anything())
  expect(screen.getByTestId('checkout-shipping-fee').props.children).toBe('₱300.00')
  expect(screen.getByText('Ana office | 09171234567')).toBeTruthy()
  expect(screen.getByTestId('checkout-total').props.children).toBe('₱2,800.00')
})

it('adds the merchandise and shipping into the total, in the summary and the bar', async () => {
  cartApi.fetchCart.mockResolvedValue(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })]))
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-shipping-fee')
  expect(screen.getByTestId('checkout-subtotal').props.children).toBe('₱3,750.00')
  expect(screen.getByTestId('checkout-shipping-amount').props.children).toBe('₱150.00')
  expect(screen.getByTestId('checkout-total').props.children).toBe('₱3,900.00')
  expect(screen.getByTestId('checkout-bar-total').props.children).toBe('₱3,900.00')
  expect(screen.getByLabelText('2 times ₱1,250.00')).toBeTruthy()
})

it('never shows a half sum while the shipping fee is unknown', async () => {
  ordersApi.quoteShipping.mockRejectedValue(new ApiError('server'))
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-shipping-retry')
  expect(screen.getByTestId('checkout-subtotal').props.children).toBe('₱2,500.00')
  expect(screen.getByTestId('checkout-total').props.children).toBe('—')
  expect(screen.getByTestId('checkout-bar-total').props.children).toBe('—')
})

it('an undeliverable address shows Pick another address and no Retry', async () => {
  ordersApi.quoteShipping.mockRejectedValue(new ApiError('validation', 'We do not deliver to this area yet.', 400, 'OUT_OF_SERVICE_AREA', undefined, false))
  await render(<CheckoutScreen />)
  expect(await screen.findByText('We do not deliver to this area yet. Choose another delivery address.')).toBeTruthy()
  expect(screen.queryByTestId('checkout-shipping-retry')).toBeNull()
  await fireEvent.press(screen.getByTestId('checkout-shipping-pick'))
  expect(screen.getByTestId('address-option-home')).toBeTruthy() // the sheet is open
})

const placeButton = () => screen.getByTestId('checkout-place-order')
const ready = async () => {
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-shipping-fee')
}
const place = async () => {
  await fireEvent.press(placeButton())
}
const BODY = { addressId: 'home', cartItemIds: ['a'], quotationId: 'q-150' }
const detail = (message: string) => new ApiError('validation', message, 400)

describe('Place Order is enabled only when everything is ready', () => {
  it('is enabled with a pinned address, a clean cart and a quote', async () => {
    await ready()
    expect(placeButton().props.accessibilityState.disabled).toBe(false)
    expect(screen.queryByTestId('checkout-bar-hint')).toBeNull()
  })
  it('is disabled with no address', async () => {
    addressApi.fetchAddresses.mockResolvedValue([])
    await render(<CheckoutScreen />)
    await screen.findByText('You have no saved delivery address yet.')
    expect(placeButton().props.accessibilityState.disabled).toBe(true)
    expect(placeButton().props.accessibilityHint).toBe('Add an address first')
  })
  it('is disabled when only pinless addresses exist', async () => {
    addressApi.fetchAddresses.mockResolvedValue([address('nopin', { latitude: null, longitude: null })])
    await render(<CheckoutScreen />)
    await screen.findByTestId('checkout-address-none')
    expect(placeButton().props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('checkout-bar-hint').props.children).toBe('Choose an address with a map pin')
  })
  it('is disabled and says why while a line has a warning', async () => {
    cartApi.fetchCart.mockResolvedValue(cartOf([line('a', { quantity: 9 })]))
    await render(<CheckoutScreen />)
    await screen.findByTestId('checkout-shipping-fee')
    expect(placeButton().props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('checkout-bar-hint').props.children).toBe('Fix the items marked above to place your order')
    await act(async () => fireEvent.press(placeButton()))
    expect(ordersApi.createOrder).not.toHaveBeenCalled()
  })
  it('is disabled while there is no quote', async () => {
    ordersApi.quoteShipping.mockReturnValue(new Promise(() => {}))
    await render(<CheckoutScreen />)
    await screen.findByTestId('checkout-address')
    expect(placeButton().props.accessibilityState.disabled).toBe(true)
  })
})

describe('placing the order', () => {
  it('sends exactly one request on a double tap, with only the three allowed keys', async () => {
    await ready()
    await act(async () => {
      placeButton().props.onClick({})
      placeButton().props.onClick({})
    })
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
    expect(ordersApi.createOrder).toHaveBeenCalledWith(BODY, expect.anything())
  })

  it('omits blank notes and sends trimmed ones', async () => {
    await ready()
    await fireEvent.changeText(screen.getByTestId('checkout-courier-note'), '   ')
    await fireEvent.changeText(screen.getByTestId('checkout-seller-note'), '  Gift wrap  please  ')
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledWith({ ...BODY, sellerNotes: 'Gift wrap please' }, expect.anything()))
  })

  it('shows a counter and caps each note at 200', async () => {
    await ready()
    expect(screen.getByTestId('checkout-seller-note-count')).toHaveTextContent('0/200')
    await fireEvent.changeText(screen.getByTestId('checkout-seller-note'), 'x'.repeat(250))
    expect(screen.getByTestId('checkout-seller-note-count')).toHaveTextContent('200/200')
  })

  it('keeps the notes after a failure and resends them on Try Again', async () => {
    ordersApi.createOrder.mockRejectedValueOnce(new ApiError('network'))
    ordersApi.fetchOrdersPage.mockResolvedValue({ items: [], total: 0, page: 1, hasNextPage: false })
    await ready()
    await fireEvent.changeText(screen.getByTestId('checkout-courier-note'), 'Gate 1234')
    await place()
    await screen.findByTestId('checkout-notice')
    expect(screen.getByTestId('checkout-courier-note').props.value).toBe('Gate 1234')
    await fireEvent.press(screen.getByTestId('checkout-notice-action'))
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
    expect(ordersApi.createOrder.mock.calls[1][0]).toEqual({ ...BODY, courierNotes: 'Gate 1234' })
  })

  it('removes each ordered line (a 404 on one is ignored), then opens the order to pay with a toast', async () => {
    cartApi.fetchCart.mockResolvedValue(cartOf([line('a'), line('b')]))
    cartApi.removeCartItem.mockImplementation(async (id: string) => {
      if (id === 'b') throw new ApiError('not-found', undefined, 404)
    })
    ordersApi.createOrder.mockResolvedValue({ id: 'o1', total: 5150 })
    await ready()
    await place()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o1', pay: '1' } }))
    expect(ordersApi.createOrder).toHaveBeenCalledWith({ addressId: 'home', cartItemIds: ['a', 'b'], quotationId: 'q-150' }, expect.anything())
    expect(cartApi.removeCartItem.mock.calls.map((c: string[]) => c[0])).toEqual(['a', 'b'])
    expect(mockToast).toHaveBeenCalledWith('Order placed')
  })

  it('still opens the order when removing the cart lines fails', async () => {
    cartApi.removeCartItem.mockRejectedValue(new ApiError('network'))
    await ready()
    await place()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o1', pay: '1' } }))
    expect(screen.queryByTestId('checkout-notice')).toBeNull()
  })

  it('asks for a new quote when the current one expires within 30 seconds, and goes on when the fee is unchanged', async () => {
    ordersApi.quoteShipping.mockResolvedValueOnce(quoteOf(150, 'Lalamove', new Date(Date.now() + 10_000).toISOString())).mockResolvedValueOnce({ ...quoteOf(150), quotationId: 'q-new' })
    await ready()
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledWith({ ...BODY, quotationId: 'q-new' }, expect.anything()))
    expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(2)
  })

  it('stops with a notice and no order when the new quote has another fee', async () => {
    ordersApi.quoteShipping.mockResolvedValueOnce(quoteOf(150, 'Lalamove', new Date(Date.now() + 10_000).toISOString())).mockResolvedValueOnce(quoteOf(200))
    await ready()
    await place()
    expect(await screen.findByText('Delivery is now ₱200.00. Check your total, then place your order again.')).toBeTruthy()
    expect(screen.getByTestId('checkout-notice').props.accessibilityRole).toBe('alert')
    expect(ordersApi.createOrder).not.toHaveBeenCalled()
    expect(screen.getByTestId('checkout-shipping-fee').props.children).toBe('₱200.00')
    expect(screen.getByTestId('checkout-bar-total').props.children).toBe('₱2,700.00')
    // Placing again uses the new, fresh quote.
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledWith({ ...BODY, quotationId: 'q-200' }, expect.anything()))
  })

  it.each([
    ['Pay ₱2,700.00', '1'],
    ['Not Now', undefined],
  ])('when the total changed, the alert button "%s" opens the order', async (button, pay) => {
    ordersApi.createOrder.mockResolvedValue({ id: 'o1', total: 2700 })
    await ready()
    await place()
    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    expect(alertSpy.mock.calls[0][1]).toBe('Your total changed from ₱2,650.00 to ₱2,700.00.')
    expect(mockReplace).not.toHaveBeenCalled()
    const buttons = alertSpy.mock.calls[0][2] ?? []
    await act(async () => buttons.find((b) => b.text === button)?.onPress?.())
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: pay ? { id: 'o1', pay } : { id: 'o1' } })
  })
})

describe('a refused order is explained inline', () => {
  it('no map pin: offers another address and creates nothing', async () => {
    ordersApi.createOrder.mockRejectedValue(detail('Address has no coordinates'))
    await ready()
    await place()
    expect(await screen.findByText(/has no map pin/)).toBeTruthy()
    expect(within(screen.getByTestId('checkout-notice-action')).getByText('Pick another address')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('checkout-notice-action'))
    expect(screen.getByTestId('address-option-home')).toBeTruthy() // the sheet is open
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('an invalid phone: Pick another address, no Try Again', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('validation', 'Invalid phone', 400, 'INVALID_PHONE_NUMBER', undefined, false))
    await ready()
    await place()
    expect(await screen.findByText(/Philippine mobile number/)).toBeTruthy()
    expect(within(screen.getByTestId('checkout-notice-action')).getByText('Pick another address')).toBeTruthy()
    expect(screen.queryByText('Try Again')).toBeNull()
  })

  it('a coded 5xx with retryable false is "not placed": no lookup, no Try Again', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('server', 'x', 503, 'COURIER_AUTH_ERROR', undefined, false))
    await ready()
    await place()
    expect(await screen.findByText(/problem on our side/)).toBeTruthy()
    expect(screen.queryByText('Try Again')).toBeNull()
    expect(screen.queryByTestId('checkout-notice-action')).toBeNull()
    expect(ordersApi.fetchOrdersPage).not.toHaveBeenCalled()
  })

  it('a 404 address: offers another address', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await ready()
    await place()
    expect(await screen.findByText(/couldn't find that delivery address/)).toBeTruthy()
    expect(within(screen.getByTestId('checkout-notice-action')).getByText('Pick another address')).toBeTruthy()
  })

  it('expired quotation: re-quotes silently and asks to place again with the new fee', async () => {
    ordersApi.createOrder.mockRejectedValueOnce(detail('Shipping quotation has expired'))
    await ready()
    ordersApi.quoteShipping.mockResolvedValue(quoteOf(175))
    await place()
    expect(await screen.findByText(/Delivery is now ₱175.00. Check your total, then place your order again./)).toBeTruthy()
    expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('checkout-shipping-fee').props.children).toBe('₱175.00')
  })

  it.each([
    ['QUOTATION_ORIGIN_MISMATCH', 'Quotation origin does not match the configured pickup hub coordinates'],
    ['QUOTATION_DESTINATION_MISMATCH', 'Quotation destination does not match the selected delivery address coordinates'],
    ['QUOTATION_ORIGIN_MISMATCH', 'Address coordinates do not match'], // wording that would hit NO_PIN: the code wins
  ])('%s (%s): re-quotes instead of the no-pin path', async (code, message) => {
    ordersApi.createOrder.mockRejectedValueOnce(new ApiError('validation', message, 400, code, undefined, true))
    await ready()
    ordersApi.quoteShipping.mockResolvedValue(quoteOf(175))
    await place()
    expect(await screen.findByText(/Delivery is now ₱175.00. Check your total, then place your order again./)).toBeTruthy()
    expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('checkout-shipping-fee').props.children).toBe('₱175.00')
    expect(screen.queryByText(/no map pin/)).toBeNull()
  })

  it.each(['Insufficient stock for SKU-9F1C-0042 (M). Available: 1.', 'Insufficient stock for Quote coordinates Tee (M). Available: 1.'])(
    'stock: generic copy (never the server detail), a way back to the cart, and a cart reload: %s',
    async (message) => {
      ordersApi.createOrder.mockRejectedValue(detail(message))
      await ready()
      await place()
      expect(await screen.findByText('An item in your cart is out of stock or no longer available. Update your cart, then check out again.')).toBeTruthy()
      expect(screen.queryByText(/SKU-9F1C|Insufficient/)).toBeNull()
      expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(1) // not mistaken for a quotation error
      await fireEvent.press(screen.getByTestId('checkout-notice-action'))
      expect(mockNavigate).toHaveBeenCalledWith('/cart')
      expect(cartApi.fetchCart).toHaveBeenCalledTimes(2)
    },
  )

  it('a quotation message is read only from a 400', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('server', 'Shipping quotation has expired', 500))
    await ready()
    await place()
    expect(await screen.findByText('The server had a problem. Please try again.')).toBeTruthy()
    expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(1)
  })

  it('403: its own copy, not the session copy, and no sign-out', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('forbidden', undefined, 403))
    await ready()
    await place()
    expect(await screen.findByText("You don't have permission to place this order.")).toBeTruthy()
    expect(screen.queryByText(/session/i)).toBeNull()
    expect(signedIn.signOut).not.toHaveBeenCalled()
  })

  it('409: the cart changed copy with Back to Cart, and no sign-out', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('conflict', 'raw conflict text', 409))
    await ready()
    await place()
    expect(await screen.findByText('Your cart changed while you were checking out. Review it and try again.')).toBeTruthy()
    expect(screen.queryByText(/raw conflict|session/i)).toBeNull()
    expect(within(screen.getByTestId('checkout-notice-action')).getByText('Back to Cart')).toBeTruthy()
    expect(signedIn.signOut).not.toHaveBeenCalled()
  })

  it('a second place works after a definite failure released the lock', async () => {
    ordersApi.createOrder.mockRejectedValueOnce(new ApiError('forbidden', undefined, 403))
    await ready()
    await place()
    await screen.findByTestId('checkout-notice')
    expect(placeButton().props.accessibilityState.disabled).toBe(false)
    await place()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o1', pay: '1' } }))
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(2)
    expect(ordersApi.fetchOrdersPage).not.toHaveBeenCalled() // a definite answer needs no lookup
  })

  it('cart empty or items not found: fixed copy (never the server text), back to cart, reload', async () => {
    ordersApi.createOrder.mockRejectedValue(detail('Cart items not found: 9f1c'))
    await ready()
    await place()
    expect(await screen.findByText(/because your cart changed/)).toBeTruthy()
    expect(screen.queryByText(/9f1c/)).toBeNull()
    expect(within(screen.getByTestId('checkout-notice-action')).getByText('Back to Cart')).toBeTruthy()
    expect(cartApi.fetchCart).toHaveBeenCalledTimes(2)
  })

  it.each([new ApiError('network'), new ApiError('server', undefined, 500)])('%#: Try Again sends the same request again', async (failure) => {
    ordersApi.createOrder.mockRejectedValueOnce(failure)
    ordersApi.fetchOrdersPage.mockResolvedValue({ items: [], total: 0, page: 1, hasNextPage: false }) // the check before sending again finds nothing
    await ready()
    await place()
    await screen.findByTestId('checkout-notice')
    ordersApi.quoteShipping.mockClear()
    await fireEvent.press(screen.getByTestId('checkout-notice-action'))
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
    expect(ordersApi.createOrder.mock.calls[1][0]).toEqual(ordersApi.createOrder.mock.calls[0][0])
    expect(ordersApi.quoteShipping).not.toHaveBeenCalled()
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('a rejected token signs out, once, however often it is rejected', async () => {
    ordersApi.createOrder.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await ready()
    await place()
    await waitFor(() => expect(signedIn.signOut).toHaveBeenCalled())
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
    expect(signedIn.signOut).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('a rejected token on the page loads signs out once too', async () => {
    cartApi.fetchCart.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    addressApi.fetchAddresses.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<CheckoutScreen />)
    await waitFor(() => expect(signedIn.signOut).toHaveBeenCalled())
    expect(signedIn.signOut).toHaveBeenCalledTimes(1)
  })
})

// The outcome of createOrder is unknown after a lost response: look for the order before anything is sent again.
describe('an unanswered order', () => {
  const placed = (over: Record<string, unknown> = {}) => ({ id: 'o9', status: 'PENDING_PAYMENT', createdAt: new Date().toISOString(), total: 2650, items: [{ id: 'i1' }], address: null, ...over })
  const lookup = (...orders: unknown[]) => ordersApi.fetchOrdersPage.mockResolvedValue({ items: orders, total: orders.length, page: 1, hasNextPage: false })
  const tryAgain = () => fireEvent.press(screen.getByTestId('checkout-notice-action'))
  const lost = async () => {
    ordersApi.createOrder.mockRejectedValueOnce(new ApiError('network'))
    await ready()
    await place()
    await screen.findByText("Can't reach the server. Check your connection and try again.")
  }

  it('Try Again finds the order the lost response created and sends no second one', async () => {
    lookup(placed())
    await lost()
    await tryAgain()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o9', pay: '1' } }))
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
    expect(ordersApi.fetchOrdersPage).toHaveBeenCalledWith({ page: 1, limit: 5 }, expect.anything())
    expect(cartApi.removeCartItem).toHaveBeenCalledWith('a')
    expect(mockToast).toHaveBeenCalledWith('Your order was already placed')
  })

  it('the Place Order button also looks first, and matches the order address when it has one', async () => {
    lookup(placed({ address: { recipient: null, phone: null, line: 'home Main St, Poblacion', city: '' } }))
    await lost()
    await place()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o9', pay: '1' } }))
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an old order', { createdAt: new Date(Date.now() - 600_000).toISOString() }],
    ['another total', { total: 999 }],
    ['another item count', { items: [{ id: 'i1' }, { id: 'i2' }] }],
    ['another status', { status: 'CANCELLED' }],
    ['another address', { address: { recipient: null, phone: null, line: 'elsewhere', city: '' } }],
  ])('%s is not the order: the same request is sent again', async (_name, over) => {
    lookup(placed(over))
    await lost()
    await tryAgain()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
    expect(ordersApi.createOrder.mock.calls[1][0]).toEqual(ordersApi.createOrder.mock.calls[0][0])
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o1', pay: '1' } }))
  })

  it('tolerates a clock a minute behind', async () => {
    lookup(placed({ createdAt: new Date(Date.now() - 60_000).toISOString() }))
    await lost()
    await tryAgain()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'o9', pay: '1' } }))
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
  })

  it('a failed lookup blocks placing again, with Orders and a way to check again', async () => {
    ordersApi.fetchOrdersPage.mockRejectedValue(new ApiError('network'))
    await lost()
    await tryAgain()
    expect(await screen.findByText("We couldn't confirm whether your order went through. Check Orders before trying again.")).toBeTruthy()
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
    const scroll = StyleSheet.flatten(screen.getByTestId('checkout-notice-scroll').props.style)
    expect(scroll.maxHeight).toBeGreaterThan(0)
    await place() // the main button is blocked the same way
    await screen.findByText(/couldn't confirm/)
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByTestId('checkout-notice-action'))
    expect(mockNavigate).toHaveBeenCalledWith('/orders')
    // Checking again only looks: nothing is found, so nothing is placed, and the marker is cleared.
    lookup()
    await fireEvent.press(screen.getByTestId('checkout-notice-action-2'))
    expect(await screen.findByText(/No matching order was found/)).toBeTruthy()
    expect(ordersApi.createOrder).toHaveBeenCalledTimes(1)
    const lookups = ordersApi.fetchOrdersPage.mock.calls.length
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
    expect(ordersApi.fetchOrdersPage).toHaveBeenCalledTimes(lookups)
  })

  it('a definite 400 clears the marker: the next place does no lookup', async () => {
    lookup()
    ordersApi.createOrder.mockRejectedValueOnce(new ApiError('network')).mockRejectedValueOnce(detail('Insufficient stock for Tee a'))
    await ready()
    await place()
    await screen.findByTestId('checkout-notice')
    await tryAgain() // looks (nothing found), sends, and is refused
    await screen.findByText(/out of stock/)
    expect(ordersApi.fetchOrdersPage).toHaveBeenCalledTimes(1)
    await place()
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(3))
    expect(ordersApi.fetchOrdersPage).toHaveBeenCalledTimes(1)
  })

  it('a request that hangs is aborted after 30 seconds, releases the lock and counts as unknown', async () => {
    jest.useFakeTimers()
    try {
      lookup()
      ordersApi.createOrder.mockImplementationOnce((_body: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))))
      await ready()
      await place()
      expect(placeButton().props.accessibilityState.busy).toBe(true)
      await act(async () => {
        jest.advanceTimersByTime(30_000)
      })
      expect(await screen.findByText(/took too long/)).toBeTruthy()
      expect(ordersApi.createOrder.mock.calls[0][1].aborted).toBe(true)
      expect(placeButton().props.accessibilityState.busy).toBe(false)
      expect(placeButton().props.accessibilityState.disabled).toBe(false)
      await tryAgain() // unknown outcome: it looks before sending again
      await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalledTimes(2))
      expect(ordersApi.fetchOrdersPage).toHaveBeenCalledTimes(1)
      expect(ordersApi.createOrder.mock.calls[1][1].aborted).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('a quick answer clears its timer: the signal is never aborted later', async () => {
    jest.useFakeTimers()
    try {
      await ready()
      await place()
      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      await act(async () => {
        jest.advanceTimersByTime(60_000)
      })
      expect(ordersApi.createOrder.mock.calls[0][1].aborted).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('while the order is in flight', () => {
  it('a screen already left gets no navigation or alert, only the toast, and the cart lines still go', async () => {
    let finish: (order: unknown) => void = () => {}
    ordersApi.createOrder.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await ready()
    await place()
    await screen.unmount()
    await act(async () => finish({ id: 'o1', total: 2700 })) // a changed total would have raised the alert
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Order placed. Find it in Orders.'))
    expect(cartApi.removeCartItem).toHaveBeenCalledWith('a')
    expect(mockReplace).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('Change is disabled, and a pick is ignored, while the order is being placed', async () => {
    addressApi.fetchAddresses.mockResolvedValue([address('home', { isDefault: true }), address('office')])
    let finish: (order: unknown) => void = () => {}
    ordersApi.createOrder.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await ready()
    await fireEvent.press(screen.getByTestId('checkout-address-change'))
    await place()
    expect(screen.getByTestId('checkout-address-change').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(screen.getByTestId('address-option-office'))
    expect(screen.getByTestId('address-option-home').props.accessibilityState.checked).toBe(true)
    expect(ordersApi.quoteShipping).toHaveBeenCalledTimes(1)
    await act(async () => finish({ id: 'o1', total: 2650 })) // settles the request so its timer is cleared
  })
})

describe('with an items param from the Cart screen', () => {
  const three = () => [line('a'), line('b', { quantity: 1, lineTotal: 1250 }), line('c', { quantity: 1, lineTotal: 1250 })]
  beforeEach(() => cartApi.fetchCart.mockResolvedValue(cartOf(three())))

  it('lists only those lines, totals only them, and orders only their ids', async () => {
    mockParams = { items: 'a,c' }
    await render(<CheckoutScreen />)
    expect(await screen.findByText('Tee a')).toBeTruthy()
    expect(screen.getByText('Tee c')).toBeTruthy()
    expect(screen.queryByText('Tee b')).toBeNull()
    await screen.findByTestId('checkout-shipping-fee')
    expect(screen.getByTestId('checkout-bar-total').props.children).toBe('₱3,900.00') // 2,500 + 1,250 + 150 delivery
    await fireEvent.press(screen.getByTestId('checkout-place-order'))
    await waitFor(() => expect(ordersApi.createOrder).toHaveBeenCalled())
    expect(ordersApi.createOrder.mock.calls[0][0].cartItemIds).toEqual(['a', 'c'])
    await waitFor(() => expect(cartApi.removeCartItem).toHaveBeenCalledTimes(2))
    expect(cartApi.removeCartItem).not.toHaveBeenCalledWith('b')
  })

  it('shows Nothing to check out when every selected line is gone', async () => {
    mockParams = { items: 'x,y' }
    await render(<CheckoutScreen />)
    expect(await screen.findByText('Nothing to check out')).toBeTruthy()
    expect(screen.queryByTestId('checkout-place-order')).toBeNull()
  })
})
