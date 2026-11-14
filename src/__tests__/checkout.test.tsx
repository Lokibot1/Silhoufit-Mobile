import { act, fireEvent, render, screen, within } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import CheckoutScreen from '../app/checkout'

jest.mock('@/api/cart', () => ({ fetchCart: jest.fn() }))
jest.mock('@/api/addresses', () => ({ fetchAddresses: jest.fn() }))
jest.mock('@/api/orders', () => ({ quoteShipping: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
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
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router

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
const quoteOf = (fee: number, courier = 'Lalamove') => ({ quotationId: `q-${fee}`, courier, shippingFee: fee, expiresAt: '2099-01-01T00:00:00Z' })

beforeEach(() => {
  jest.resetAllMocks()
  mockUseSession.mockReturnValue(signedIn)
  cartApi.fetchCart.mockResolvedValue(cartOf([line('a')]))
  addressApi.fetchAddresses.mockResolvedValue([address('home', { isDefault: true })])
  ordersApi.quoteShipping.mockResolvedValue(quoteOf(150))
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

it('with no address shows the disabled call to action and the bar hint, and asks for no quote', async () => {
  addressApi.fetchAddresses.mockResolvedValue([])
  await render(<CheckoutScreen />)
  expect(await screen.findByText('You have no saved delivery address yet.')).toBeTruthy()
  expect(screen.getByTestId('checkout-address-add').props.accessibilityState.disabled).toBe(true)
  expect(screen.getByText('Coming soon')).toBeTruthy()
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
  expect(pinless.props.accessibilityState).toEqual({ selected: false, disabled: true })
  expect(within(pinless).getByText('Needs a map pin: add it on the web')).toBeTruthy()
  expect(screen.getByTestId('address-option-office').props.accessibilityState).toEqual({ selected: true, disabled: false })
  expect(screen.getByTestId('address-add').props.accessibilityState.disabled).toBe(true)
  expect(screen.getByText('Add New Address (coming soon)')).toBeTruthy()
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

it('keeps Place Order disabled with the visible note and never creates an order', async () => {
  await render(<CheckoutScreen />)
  await screen.findByTestId('checkout-shipping-fee')
  const button = screen.getByTestId('checkout-place-order')
  expect(button.props.accessibilityState.disabled).toBe(true)
  await act(async () => fireEvent.press(button))
  expect(screen.getByTestId('checkout-place-note').props.children).toBe('Placing orders is coming next')
  expect(screen.getByText('Pay online on a secure page')).toBeTruthy()
})
