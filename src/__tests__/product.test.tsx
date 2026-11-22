import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import ProductScreen from '../app/product/[id]'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/products', () => ({ fetchProduct: jest.fn() }))
jest.mock('@/api/cart', () => ({ addCartItem: jest.fn() }))
jest.mock('@/api/wishlist', () => ({ fetchWishlistIds: jest.fn(() => Promise.resolve([])), addWishlistItem: jest.fn(), removeWishlistItem: jest.fn() }))
jest.mock('@/api/reviews', () => ({ ...jest.requireActual('@/api/reviews'), fetchProductReviews: jest.fn(() => new Promise(() => {})) }))
jest.mock('@/api/sizeMeasurements', () => ({ ...jest.requireActual('@/api/sizeMeasurements'), fetchCategoryMeasurements: jest.fn(() => Promise.resolve([])) }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/useCartCount', () => ({ useCartCount: () => ({ count: mockCount, refresh: mockRefresh }) }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: ({ options }: { options: { headerLeft?: () => unknown } }) => options.headerLeft?.() ?? null },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(() => ({ id: 'p1' })),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockRefresh = jest.fn()
let mockCount = 0
const mockFetch: jest.Mock = jest.requireMock('@/api/products').fetchProduct
const mockAdd: jest.Mock = jest.requireMock('@/api/cart').addCartItem
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router, useLocalSearchParams } = jest.requireMock('expo-router')

const v = (id: string, color: string, size: string, stock: number, price = 1250) => ({ id, color, size, colorHex: '#123456', price, stock, imageUrl: null, measurements: null })
const product = (over = {}) => ({
  id: 'p1',
  name: 'Linen Shirt',
  brand: 'KRAL',
  category: 'Shirt',
  description: 'Soft linen.',
  images: [{ url: 'https://x.test/1.jpg', altText: null }, { url: 'https://x.test/2.jpg', altText: null }],
  variants: [v('v1', 'Navy', 'M', 10), v('v2', 'Navy', 'L', 0), v('v3', 'Red', 'M', 3, 1300)],
  rating: 4.5,
  reviewCount: 12,
  soldCount: 12,
  ...over,
})
const measured = (chestWidthCm: number) => ({ ...jest.requireActual('@/api/sizeMeasurements').toMeasurements({}), chestWidthCm })
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockCount = 0
  useLocalSearchParams.mockReturnValue({ id: 'p1' })
  router.canGoBack.mockReturnValue(true)
  mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } } })
})

async function pickNavyM() {
  await fireEvent.press(await screen.findByTestId('product-swatch-Navy'))
  await fireEvent.press(screen.getByTestId('product-size-M'))
}

it('shows the skeleton while loading', async () => {
  mockFetch.mockReturnValue(never())
  await render(<ProductScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('product-name')).toBeNull()
})

it('renders the name, label and a From price until a variant is chosen, then the variant price', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  expect(await screen.findByText('Linen Shirt')).toBeTruthy()
  expect(screen.getByText('(Shirt)')).toBeTruthy()
  expect(screen.queryByText(/KRAL/)).toBeNull()
  expect(screen.getByText('From ₱1,250.00')).toBeTruthy()
  expect(screen.getByText('1 / 2', { includeHiddenElements: true })).toBeTruthy()
  await pickNavyM()
  expect(screen.getByText('₱1,250.00')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('product-swatch-Red'))
  expect(screen.getByText('₱1,300.00')).toBeTruthy()
  expect(screen.getByText('Only 3 left')).toBeTruthy()
})

it('fetches without needing a session', async () => {
  mockUseSession.mockReturnValue({ session: null })
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  expect(await screen.findByTestId('product-name')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledWith('p1', expect.any(AbortSignal))
})

it('sends a signed-out visitor to sign in without calling the cart', async () => {
  mockUseSession.mockReturnValue({ session: null })
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  await pickNavyM()
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  expect(router.push).toHaveBeenCalledWith('/sign-in')
  expect(mockAdd).not.toHaveBeenCalled()
})

it('adds the selected variant once and toasts', async () => {
  mockFetch.mockResolvedValue(product())
  mockAdd.mockResolvedValue({})
  await render(<ProductScreen />)
  await pickNavyM()
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Added to cart'))
  expect(mockAdd).toHaveBeenCalledTimes(1)
  expect(mockAdd).toHaveBeenCalledWith('v1', 1)
  expect(mockRefresh).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Add to Cart', busy: false })).toBeTruthy()
})

it('adds once on a double tap', async () => {
  mockFetch.mockResolvedValue(product())
  let finish: () => void = () => {}
  mockAdd.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
  await render(<ProductScreen />)
  await pickNavyM()
  const button = screen.getByTestId('product-add-to-cart')
  // Both taps land before React re-renders, so only the in-flight guard can stop the second.
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  await act(async () => finish())
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Added to cart'))
  expect(mockAdd).toHaveBeenCalledTimes(1)
})

it('shows the server detail inline on a 400 and no toast', async () => {
  mockFetch.mockResolvedValue(product())
  mockAdd.mockRejectedValue(new ApiError('validation', 'Only 10 in stock.', 400))
  await render(<ProductScreen />)
  await pickNavyM()
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  expect(await screen.findByText('Only 10 in stock. Check your cart or choose another size.')).toBeTruthy()
  expect(screen.getByTestId('product-inline-error')).toBeTruthy()
  expect(mockToast).not.toHaveBeenCalled()
})

it('shows the unavailable state with Back to Shop on a 404', async () => {
  mockFetch.mockRejectedValue(new ApiError('not-found', undefined, 404))
  await render(<ProductScreen />)
  expect(await screen.findByText('This piece is no longer available')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('product-error-back'))
  expect(router.navigate).toHaveBeenCalledWith('/')
})

it('treats an array id as not found without fetching', async () => {
  useLocalSearchParams.mockReturnValue({ id: ['a', 'b'] })
  await render(<ProductScreen />)
  expect(await screen.findByText('This piece is no longer available')).toBeTruthy()
  expect(mockFetch).not.toHaveBeenCalled()
})

it('shows the network error with a Retry that refetches', async () => {
  mockFetch.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(product())
  await render(<ProductScreen />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('product-retry'))
  expect(await screen.findByTestId('product-name')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

it('disables a size with no stock for the chosen colour', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  await fireEvent.press(await screen.findByTestId('product-swatch-Navy'))
  expect(screen.getByRole('button', { name: 'Size L, unavailable', disabled: true })).toBeTruthy()
  await fireEvent.press(screen.getByTestId('product-size-L'))
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  expect(mockAdd).not.toHaveBeenCalled()
})

it('keeps Add to Cart disabled until a variant is chosen', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  await screen.findByTestId('product-name')
  expect(screen.getByText('Choose a colour and a size.')).toBeTruthy()
  expect(screen.getByTestId('product-add-to-cart').props.accessibilityHint).toBe('Choose a colour and a size first')
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  expect(mockAdd).not.toHaveBeenCalled()
  expect(router.push).not.toHaveBeenCalled()
})

it('preselects a single colour and size', async () => {
  mockFetch.mockResolvedValue(product({ variants: [v('v1', 'Navy', 'M', 10)] }))
  mockAdd.mockResolvedValue({})
  await render(<ProductScreen />)
  await screen.findByTestId('product-name')
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('v1', 1))
})

it('shows the product but disables the button when it has no variants', async () => {
  mockFetch.mockResolvedValue(product({ variants: [], images: [] }))
  await render(<ProductScreen />)
  expect(await screen.findByText('Not available to buy yet')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('product-add-to-cart'))
  expect(mockAdd).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Add to Cart', disabled: true })).toBeTruthy()
})

describe('sold out', () => {
  it('shows Sold out, a disabled button and no hint when every variant is out, with nothing selected', async () => {
    mockFetch.mockResolvedValue(product({ variants: [v('v1', 'Navy', 'M', 0), v('v2', 'Red', 'L', 0)] }))
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-stock')).toHaveTextContent('Sold out')
    expect(screen.queryByText('Choose a colour and a size.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sold out', disabled: true })).toBeTruthy()
  })
})

describe('session errors on add', () => {
  it.each([401, 403])('routes a %i to sign-in once, with no dead-end message', async (status) => {
    mockFetch.mockResolvedValue(product())
    mockAdd.mockRejectedValue(new ApiError('forbidden', undefined, status))
    await render(<ProductScreen />)
    await pickNavyM()
    await fireEvent.press(screen.getByTestId('product-add-to-cart'))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sign-in'))
    await fireEvent.press(screen.getByTestId('product-add-to-cart'))
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2))
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/session has expired/)).toBeNull()
    expect(screen.queryByTestId('product-inline-error')).toBeNull()
  })

  it('pushes sign-in once on a signed-out double tap', async () => {
    mockUseSession.mockReturnValue({ session: null })
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    await pickNavyM()
    const button = screen.getByTestId('product-add-to-cart')
    await act(async () => {
      button.props.onClick({})
      button.props.onClick({})
    })
    expect(router.push).toHaveBeenCalledTimes(1)
  })
})

it('shows the unavailable state, not server text, for a malformed id', async () => {
  mockFetch.mockRejectedValue(new ApiError('not-found', undefined, 400))
  await render(<ProductScreen />)
  expect(await screen.findByText('This piece is no longer available')).toBeTruthy()
  expect(screen.queryByText(/Validation failed/)).toBeNull()
  expect(screen.queryByTestId('product-retry')).toBeNull()
})

describe('variant options', () => {
  it('prefers the in-stock variant among duplicate size and colour pairs', async () => {
    mockFetch.mockResolvedValue(product({ variants: [v('dup-out', 'Navy', 'M', 0), v('dup-in', 'Navy', 'M', 4), v('v3', 'Red', 'M', 3)] }))
    mockAdd.mockResolvedValue({})
    await render(<ProductScreen />)
    await pickNavyM()
    await fireEvent.press(screen.getByTestId('product-add-to-cart'))
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('dup-in', 1))
  })

  it('lets a variant with no colour be chosen as One colour', async () => {
    mockFetch.mockResolvedValue(product({ variants: [{ ...v('plain', 'x', 'M', 5), color: null, colorHex: null }, v('v2', 'Navy', 'M', 5)] }))
    mockAdd.mockResolvedValue({})
    await render(<ProductScreen />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Colour One colour' }))
    await fireEvent.press(screen.getByTestId('product-size-M'))
    expect(screen.getByTestId('product-colour-label')).toHaveTextContent('(Colour) One colour')
    await fireEvent.press(screen.getByTestId('product-add-to-cart'))
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('plain', 1))
  })

  it.each([null, 'navy', '#12'])('renders a text chip with the colour name for colorHex %p', async (colorHex) => {
    mockFetch.mockResolvedValue(product({ variants: [{ ...v('v1', 'Navy', 'M', 5), colorHex }, v('v2', 'Red', 'M', 5)] }))
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-swatch-Navy')).toHaveTextContent('Navy')
  })

  it('uses the first valid hex of a colour and keeps a swatch (no text) for it', async () => {
    mockFetch.mockResolvedValue(product({ variants: [{ ...v('v1', 'Navy', 'M', 5), colorHex: 'bad' }, v('v2', 'Navy', 'L', 5), v('v3', 'Red', 'M', 5)] }))
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-swatch-Navy')).not.toHaveTextContent('Navy')
  })

  it('disables a colour that has no stock in the chosen size, so no invalid pair can be picked', async () => {
    mockFetch.mockResolvedValue(product({ variants: [v('v1', 'Navy', 'M', 5), v('v2', 'Navy', 'L', 5), v('v3', 'Red', 'M', 5)] }))
    await render(<ProductScreen />)
    await fireEvent.press(await screen.findByTestId('product-swatch-Navy'))
    await fireEvent.press(screen.getByTestId('product-size-L'))
    expect(screen.getByRole('button', { name: 'Colour Red, unavailable', disabled: true })).toBeTruthy()
    await fireEvent.press(screen.getByTestId('product-swatch-Red'))
    expect(screen.getByTestId('product-swatch-Navy').props.accessibilityState.selected).toBe(true)
  })

  it('orders sizes and merges sizes that differ only by case', async () => {
    const sizes = ['XL', '10', 'Free', 'm', 'S', 'M', '2', 'XXS']
    mockFetch.mockResolvedValue(product({ variants: sizes.map((size, i) => v(`v${i}`, 'Navy', size, 5)) }))
    await render(<ProductScreen />)
    await screen.findByTestId('product-name')
    expect(screen.getAllByTestId(/^product-size-/).map((n) => n.props.testID)).toEqual(['XXS', 'S', 'm', 'XL', '2', '10', 'Free'].map((s) => `product-size-${s}`))
  })
})

describe('400 message', () => {
  it('clears on a variant change and does not return with the same variant', async () => {
    mockFetch.mockResolvedValue(product())
    mockAdd.mockRejectedValue(new ApiError('validation', 'Only 10 in stock.', 400))
    await render(<ProductScreen />)
    await pickNavyM()
    await fireEvent.press(screen.getByTestId('product-add-to-cart'))
    expect(await screen.findByTestId('product-inline-error')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('product-swatch-Red'))
    expect(screen.queryByTestId('product-inline-error')).toBeNull()
    await fireEvent.press(screen.getByTestId('product-swatch-Navy'))
    expect(screen.queryByTestId('product-inline-error')).toBeNull()
  })
})

describe('header', () => {
  it('shows a Shop button that goes home when there is no history', async () => {
    router.canGoBack.mockReturnValue(false)
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    await fireEvent.press(await screen.findByTestId('product-header-back'))
    expect(router.navigate).toHaveBeenCalledWith('/')
  })

  it('leaves the normal back button when there is history', async () => {
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    await screen.findByTestId('product-name')
    expect(screen.queryByTestId('product-header-back')).toBeNull()
  })
})

it('exposes the E2E test ids', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  expect(await screen.findByTestId('product-gallery-counter', { includeHiddenElements: true })).toHaveTextContent('1 / 2')
  expect(screen.getByTestId('product-description')).toHaveTextContent('Soft linen.')
  expect(screen.getByTestId('product-colour-label')).toHaveTextContent('(Colour)')
  await pickNavyM()
  await fireEvent.press(screen.getByTestId('product-swatch-Red'))
  expect(screen.getByTestId('product-stock')).toHaveTextContent('Only 3 left')
})

describe('rating', () => {
  it('shows the average, review count and sold count', async () => {
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-rating')).toHaveTextContent('★ 4.5 (12 reviews) | 12 sold')
    expect(screen.getByLabelText('Rated 4.5 out of 5 from 12 reviews, 12 sold')).toBeTruthy()
  })

  it('says "1 review" for a single review', async () => {
    mockFetch.mockResolvedValue(product({ reviewCount: 1 }))
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-rating')).toHaveTextContent('★ 4.5 (1 review) | 12 sold')
  })

  it('shows only the sold count when there are no reviews', async () => {
    mockFetch.mockResolvedValue(product({ rating: null, reviewCount: 0 }))
    await render(<ProductScreen />)
    const line = await screen.findByTestId('product-rating')
    expect(line).toHaveTextContent(/^12 sold$/)
    expect(screen.getByLabelText('12 sold')).toBeTruthy()
  })

  it('shows only the rating when nothing has sold', async () => {
    mockFetch.mockResolvedValue(product({ soldCount: 0 }))
    await render(<ProductScreen />)
    expect(await screen.findByTestId('product-rating')).toHaveTextContent(/^★ 4\.5 \(12 reviews\)$/)
  })

  it.each([{ rating: null, reviewCount: 0, soldCount: 0 }, { rating: 4.5, reviewCount: 0, soldCount: 0 }])('is hidden for %p', async (over) => {
    mockFetch.mockResolvedValue(product(over))
    await render(<ProductScreen />)
    await screen.findByTestId('product-name')
    expect(screen.queryByTestId('product-rating')).toBeNull()
  })
})

describe('bottom bar', () => {
  it('shows the Add to Cart button next to a cart shortcut with no badge when the cart is empty', async () => {
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    await screen.findByTestId('product-name')
    expect(screen.getByRole('button', { name: 'Cart' })).toBeTruthy()
    expect(screen.queryByTestId('product-cart-badge')).toBeNull()
  })

  it('badges the shortcut with the cart count and opens the cart tab', async () => {
    mockCount = 3
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    expect(await screen.findByLabelText('Cart, 3 items')).toBeTruthy()
    expect(screen.getByTestId('product-cart-badge')).toHaveTextContent('3')
    await fireEvent.press(screen.getByTestId('product-cart'))
    expect(router.navigate).toHaveBeenCalledWith('/cart')
  })

  it('keeps the bar out of the loading and error states', async () => {
    mockFetch.mockRejectedValue(new ApiError('network'))
    await render(<ProductScreen />)
    await screen.findByTestId('product-retry')
    expect(screen.queryByTestId('product-cart')).toBeNull()
    expect(screen.queryByTestId('product-add-to-cart')).toBeNull()
  })
})

describe('gallery accessibility', () => {
  it('keeps the photo position with a backend alt text and hides the visual counter', async () => {
    mockFetch.mockResolvedValue(product({ images: [{ url: 'https://x.test/1.jpg', altText: 'Front view' }, { url: 'https://x.test/2.jpg', altText: null }] }))
    await render(<ProductScreen />)
    expect(await screen.findByLabelText('Front view, photo 1 of 2')).toBeTruthy()
    expect(screen.getByLabelText('Linen Shirt, photo 2 of 2')).toBeTruthy()
    expect(screen.queryByTestId('product-gallery-counter')).toBeNull()
    expect(screen.getByTestId('product-gallery-counter', { includeHiddenElements: true })).toBeTruthy()
  })

  it('reads the name before the price', async () => {
    mockFetch.mockResolvedValue(product())
    await render(<ProductScreen />)
    expect(await screen.findByLabelText(/^Linen Shirt, From /)).toBeTruthy()
  })
})

it('shows the heart, the size guide link and the reviews section, in order, without disturbing the rest', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  await screen.findByTestId('product-name')
  expect(screen.getByRole('button', { name: 'Add to wishlist' })).toBe(screen.getByTestId('product-wishlist'))
  expect(screen.getByRole('button', { name: 'Size guide' })).toBe(screen.getByTestId('size-guide-link'))
  expect(screen.getByTestId('product-reviews')).toBeTruthy()
  expect(screen.getByTestId('product-add-to-cart')).toBeTruthy()
})

it('opens the customer reviews screen from the summary row', async () => {
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  const row = await screen.findByTestId('product-reviews')
  expect(within(row).getByText('4.5')).toBeTruthy()
  expect(within(row).getByText('12 reviews')).toBeTruthy()
  expect(screen.getByLabelText('Rated 4.5 out of 5 from 12 reviews. Opens customer reviews.')).toBe(row)
  await fireEvent.press(row)
  expect(router.push).toHaveBeenCalledWith('/product/reviews/p1')
})

it('shows No reviews yet without navigating when there are no reviews', async () => {
  mockFetch.mockResolvedValue(product({ rating: null, reviewCount: 0 }))
  await render(<ProductScreen />)
  expect(await screen.findByText('No reviews yet')).toBeTruthy()
  expect(screen.queryByTestId('product-reviews')).toBeNull()
  expect(screen.queryByRole('button', { name: /Opens customer reviews/ })).toBeNull()
})

it('opens the size guide from the link with the picked size highlighted, and closes it', async () => {
  mockFetch.mockResolvedValue(product({ variants: [{ ...v('v1', 'Navy', 'M', 10), measurements: measured(54) }, { ...v('v2', 'Navy', 'L', 4), measurements: measured(58) }] }))
  await render(<ProductScreen />)
  await fireEvent.press(await screen.findByTestId('product-size-M'))
  expect(screen.queryByTestId('size-guide')).toBeNull()
  await fireEvent.press(screen.getByTestId('size-guide-link'))
  expect(await screen.findByTestId('size-guide-row-M')).toBeTruthy()
  expect(screen.getByTestId('size-guide-row-M').props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.getByTestId('size-guide-row-L').props.accessibilityState).toMatchObject({ selected: false })
  await fireEvent.press(screen.getByTestId('size-guide-close'))
  expect(screen.queryByTestId('size-guide')).toBeNull()
})

it('has no size guide link on a product without sizes', async () => {
  mockFetch.mockResolvedValue(product({ variants: [{ ...v('v1', 'Navy', 'M', 10), size: null }] }))
  await render(<ProductScreen />)
  await screen.findByTestId('product-name')
  expect(screen.queryByTestId('size-guide-link')).toBeNull()
})

it('sends a signed-out tap on the heart to sign in', async () => {
  mockUseSession.mockReturnValue({ session: null })
  mockFetch.mockResolvedValue(product())
  await render(<ProductScreen />)
  await fireEvent.press(await screen.findByTestId('product-wishlist'))
  expect(router.push).toHaveBeenCalledWith('/sign-in')
})

it('toasts a saved piece above the sticky bar', async () => {
  mockFetch.mockResolvedValue(product())
  jest.requireMock('@/api/wishlist').addWishlistItem.mockResolvedValue(undefined)
  await render(<ProductScreen />)
  await waitFor(() => expect(screen.getByTestId('product-wishlist').props.accessibilityState).toMatchObject({ disabled: false }))
  await fireEvent.press(screen.getByTestId('product-wishlist'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Saved to wishlist'))
})
