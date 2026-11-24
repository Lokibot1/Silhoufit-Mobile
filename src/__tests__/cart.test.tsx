import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ApiError } from '@/lib/api'
import CartScreen from '../app/cart'

jest.mock('@/api/cart', () => ({ fetchCart: jest.fn(), setCartItemQuantity: jest.fn(), removeCartItem: jest.fn(), removeCartItems: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: ({ options }: { options: { headerTitle?: () => unknown; headerRight?: () => unknown } }) => jest.requireActual('react').createElement(jest.requireActual('react').Fragment, null, options.headerTitle?.(), options.headerRight?.()) },
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocus.current = effect
    // Like the real hook: re-runs only while the screen is focused, never for an unfocused tab.
    jest.requireActual('react').useEffect(() => (mockFocused.on ? effect() : undefined), [effect])
  },
}))
const mockFocus: { current: () => void | (() => void) } = { current: () => {} }
const mockFocused = { on: true }
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('@/ui/useReduceMotion', () => ({ useReduceMotion: () => false }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 20 }) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('@/api/cart')
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router
const alertSpy = jest.spyOn(Alert, 'alert')

const mockSignOut = jest.fn()
const as = (id: string) => ({ session: { user: { id } }, loading: false, signOut: mockSignOut })
const signedIn = as('u1')
const signedOut = { session: null, loading: false, signOut: mockSignOut }
const line = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  quantity: 2,
  lineTotal: 2500,
  variant: { id: `v-${id}`, size: 'M', color: 'Red', price: 1250, stock: 5, imageUrl: null },
  product: { id: `p-${id}`, name: `Tee ${id}`, image: null, active: true },
  ...over,
})
const cartOf = (items: ReturnType<typeof line>[]) => ({ items, totalItems: items.reduce((n, i) => n + i.quantity, 0), subtotal: items.reduce((n, i) => n + i.lineTotal, 0) })
const pressAlert = async (text: string) => {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? []
  await act(async () => buttons.find((b) => b.text === text)?.onPress?.())
}

beforeEach(() => {
  jest.resetAllMocks()
  mockFocused.on = true
  mockUseSession.mockReturnValue(signedIn)
  alertSpy.mockImplementation(() => {})
})

it('shows the skeleton on the first load, then the rows with name, variant and subtotal', async () => {
  let resolve: (cart: unknown) => void = () => {}
  api.fetchCart.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<CartScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })])))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Tee a')).toBeTruthy()
  expect(screen.getAllByText('M / Red')).toHaveLength(2)
  expect(screen.getAllByText('₱1,250.00')).toHaveLength(2) // unit price of both rows
  expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱0.00') // nothing is ticked yet
  expect(screen.getByText('Check out (0)')).toBeTruthy()
  expect(screen.getByTestId('cart-list')).toBeTruthy()
})

it('never shows the prompt while the session loads', async () => {
  mockUseSession.mockReturnValue({ ...signedOut, loading: true })
  await render(<CartScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('cart-sign-in')).toBeNull()
  expect(api.fetchCart).not.toHaveBeenCalled()
})

it('prompts sign-in when signed out and pushes /sign-in once', async () => {
  mockUseSession.mockReturnValue(signedOut)
  await render(<CartScreen />)
  expect(screen.getByText('Sign in to see your cart')).toBeTruthy()
  expect(screen.getByText('Your bag is saved to your account once you sign in.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('cart-sign-in'))
  await fireEvent.press(screen.getByTestId('cart-sign-in'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchCart).not.toHaveBeenCalled()
})

describe('with items', () => {
  beforeEach(async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })]))
    await render(<CartScreen />)
    await screen.findByTestId('cart-list')
  })

  it('increments once even on a double tap in one tick', async () => {
    let finish: (cart: unknown) => void = () => {}
    api.setCartItemQuantity.mockReturnValue(new Promise((r) => (finish = r)))
    const button = screen.getByTestId('cart-inc-a')
    await act(async () => {
      button.props.onClick({})
      button.props.onClick({})
    })
    expect(api.setCartItemQuantity).toHaveBeenCalledTimes(1)
    expect(api.setCartItemQuantity).toHaveBeenCalledWith('a', 3)
    await act(async () => finish(cartOf([line('a', { quantity: 3, lineTotal: 3750 }), line('b', { quantity: 1, lineTotal: 1250 })])))
    expect(screen.getByTestId('cart-qty-a').props.children).toBe(3)
  })

  it('disables increment at the stock and decrement at 1', async () => {
    expect(screen.getByTestId('cart-dec-b')).toBeDisabled()
    expect(screen.getByTestId('cart-inc-b')).toBeEnabled()
    api.setCartItemQuantity.mockResolvedValue(cartOf([line('a', { quantity: 5 }), line('b', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(screen.getByTestId('cart-inc-a')).toBeDisabled())
    expect(screen.getByTestId('cart-qty-a').props.children).toBe(5)
  })

  it('shows a 400 detail on that row only', async () => {
    api.setCartItemQuantity.mockRejectedValue(new ApiError('validation', 'Requested quantity exceeds available stock (2 available)', 400))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    expect(await screen.findByTestId('cart-row-error-a')).toHaveTextContent('Requested quantity exceeds available stock (2 available)')
    expect(screen.queryByTestId('cart-row-error-b')).toBeNull()
    expect(screen.getByTestId('cart-qty-a').props.children).toBe(2)
  })

  it('asks before removing: cancel does nothing, confirm removes once and toasts', async () => {
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    expect(alertSpy).toHaveBeenCalledWith('Are you sure?', expect.any(String), expect.any(Array), expect.anything())
    await pressAlert('Cancel')
    expect(api.removeCartItem).not.toHaveBeenCalled()

    api.removeCartItem.mockResolvedValue(undefined)
    api.fetchCart.mockResolvedValue(cartOf([line('b', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await pressAlert('Remove Item')
    expect(api.removeCartItem).toHaveBeenCalledTimes(1)
    expect(api.removeCartItem).toHaveBeenCalledWith('a')
    expect(mockToast).toHaveBeenCalledWith('Item removed')
    await waitFor(() => expect(screen.queryByTestId('cart-row-a')).toBeNull())
    expect(screen.getByTestId('cart-row-b')).toBeTruthy()
  })

  it('opens the product page from the item, once even on a double tap', async () => {
    await fireEvent.press(screen.getByTestId('cart-open-a'))
    await fireEvent.press(screen.getByTestId('cart-open-a'))
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'p-a' } })
    expect(screen.getByLabelText(/^Open Tee a/)).toBeTruthy()
  })

  it('announces the variant, unit price and warnings in the open label', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('w', { quantity: 4, variant: { id: 'v', size: 'M', color: 'Red', price: 1250, stock: 2, imageUrl: null } })]))
    await render(<CartScreen />)
    expect((await screen.findByTestId('cart-open-w')).props.accessibilityLabel).toBe('Open Tee w, M / Red, ₱1,250.00 each, Only 2 left. Lower the quantity.')
  })

  it('labels the stepper and remove for screen readers', async () => {
    expect(screen.getByLabelText('Increase quantity of Tee a')).toBeTruthy()
    expect(screen.getByLabelText('Decrease quantity of Tee a')).toBeTruthy()
    expect(screen.getByLabelText('Quantity 2')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-edit'))
    expect(screen.getByLabelText('Remove Tee a')).toBeTruthy()
  })

  it('shows the sticky bar with the ticked count and subtotal and a Checkout that opens checkout once with the ticked ids', async () => {
    expect(screen.getByTestId('cart-bar')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-check-b'))
    expect(screen.getByText('Check out (3)')).toBeTruthy()
    expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱3,750.00')
    expect(screen.getByTestId('cart-checkout')).toBeEnabled()
    expect(screen.queryByTestId('cart-checkout-note')).toBeNull()
    await fireEvent.press(screen.getByTestId('cart-checkout'))
    await fireEvent.press(screen.getByTestId('cart-checkout'))
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/checkout', params: { items: 'a,b' } })
  })

  it('disables Checkout while a row is being updated', async () => {
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    api.setCartItemQuantity.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      screen.getByTestId('cart-inc-a').props.onClick({})
    })
    expect(screen.getByTestId('cart-checkout')).toBeDisabled()
  })

  it('disables Checkout and says why while a ticked row has a warning', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a'), line('w', { quantity: 4, variant: { id: 'v', size: 'M', color: 'Red', price: 1250, stock: 2, imageUrl: null } })]))
    await render(<CartScreen />)
    await fireEvent.press(await screen.findByTestId('cart-check-w'))
    expect(await screen.findByTestId('cart-checkout-note')).toHaveTextContent('Fix the items marked above to check out')
    expect(screen.getAllByTestId('cart-checkout').at(-1)).toBeDisabled()
    mockPush.mockClear()
    await fireEvent.press(screen.getAllByTestId('cart-checkout').at(-1)!)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

it('warns on a row whose stock dropped below its quantity and on an inactive product', async () => {
  api.fetchCart.mockResolvedValue(
    cartOf([line('a', { quantity: 4, variant: { id: 'v', size: null, color: null, price: 1, stock: 2, imageUrl: null } }), line('b', { product: { id: 'p', name: 'Gone', image: null, active: false } })]),
  )
  await render(<CartScreen />)
  expect(await screen.findByText('Only 2 left. Lower the quantity.')).toBeTruthy()
  expect(screen.getByText('No longer available. Remove it from your cart.')).toBeTruthy()
  expect(screen.getByTestId('cart-inc-a')).toBeDisabled()
  expect(screen.getByTestId('cart-inc-b')).toBeDisabled()
})

it('shows the empty state with a way to the Shop', async () => {
  api.fetchCart.mockResolvedValue(cartOf([]))
  await render(<CartScreen />)
  expect(await screen.findByText('Pieces you add show up here.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('cart-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('shows the first-load error and Retry refetches', async () => {
  api.fetchCart.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(cartOf([line('a')]))
  await render(<CartScreen />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('cart-retry'))
  expect(await screen.findByTestId('cart-row-a')).toBeTruthy()
  expect(api.fetchCart).toHaveBeenCalledTimes(2)
})

it('refreshes silently on focus (no skeleton) and keeps the rows with a toast when it fails', async () => {
  api.fetchCart.mockResolvedValueOnce(cartOf([line('a')])).mockResolvedValueOnce(cartOf([line('a'), line('b')])).mockRejectedValueOnce(new ApiError('network'))
  await render(<CartScreen />)
  await screen.findByTestId('cart-row-a')
  await act(async () => void mockFocus.current())
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(await screen.findByTestId('cart-row-b')).toBeTruthy()
  await act(async () => void mockFocus.current())
  expect(mockToast).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.")
  expect(screen.getByTestId('cart-row-a')).toBeTruthy()
  expect(screen.queryByTestId('cart-retry')).toBeNull()
})

it('signs out once and toasts on a 401, without showing a sign-in form to a signed-in user', async () => {
  api.fetchCart.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<CartScreen />)
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  expect(screen.queryByTestId('cart-sign-in')).toBeNull()
})

it('treats a 403 as an ordinary error with Retry', async () => {
  api.fetchCart.mockRejectedValue(new ApiError('forbidden', undefined, 403))
  await render(<CartScreen />)
  expect(await screen.findByTestId('cart-retry')).toBeTruthy()
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('never shows the previous account cart, even while the tab is unfocused or the new fetch fails', async () => {
  api.fetchCart.mockResolvedValue(cartOf([line('a')]))
  const view = await render(<CartScreen />)
  await screen.findByTestId('cart-row-a')
  mockFocused.on = false // the tab is in the background while the account changes
  mockUseSession.mockReturnValue(signedOut)
  await view.rerender(<CartScreen />)
  expect(screen.queryByTestId('cart-row-a')).toBeNull()
  expect(screen.getByText('Sign in to see your cart')).toBeTruthy()
  api.fetchCart.mockRejectedValue(new ApiError('network'))
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<CartScreen />)
  expect(screen.queryByTestId('cart-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(api.fetchCart).toHaveBeenCalledTimes(1) // the unfocused tab did not refetch
  mockFocused.on = true
  await act(async () => void mockFocus.current())
  expect(await screen.findByTestId('cart-retry')).toBeTruthy()
  expect(screen.queryByTestId('cart-row-a')).toBeNull()
})

it('switching straight from account A to B never shows A rows, not even for one render', async () => {
  api.fetchCart.mockResolvedValue(cartOf([line('a')]))
  const view = await render(<CartScreen />)
  await screen.findByTestId('cart-row-a')
  mockFocused.on = false
  mockUseSession.mockReturnValue(as('u2'))
  await view.rerender(<CartScreen />)
  expect(screen.queryByTestId('cart-row-a')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
})

it('a stale focus refetch cannot revert a newer quantity change', async () => {
  let late: (cart: unknown) => void = () => {}
  api.fetchCart.mockResolvedValueOnce(cartOf([line('a')])).mockReturnValueOnce(new Promise((r) => (late = r)))
  await render(<CartScreen />)
  await screen.findByTestId('cart-row-a')
  await act(async () => void mockFocus.current()) // GET in flight
  api.setCartItemQuantity.mockResolvedValue(cartOf([line('a', { quantity: 3, lineTotal: 3750 })]))
  await fireEvent.press(screen.getByTestId('cart-inc-a'))
  await waitFor(() => expect(screen.getByTestId('cart-qty-a').props.children).toBe(3))
  await act(async () => late(cartOf([line('a')]))) // the older GET lands last
  expect(screen.getByTestId('cart-qty-a').props.children).toBe(3)
})

it('a Retry superseded by a newer request is dropped', async () => {
  let first: (cart: unknown) => void = () => {}
  api.fetchCart.mockRejectedValueOnce(new ApiError('network')).mockReturnValueOnce(new Promise((r) => (first = r))).mockResolvedValueOnce(cartOf([line('b')]))
  await render(<CartScreen />)
  await fireEvent.press(await screen.findByTestId('cart-retry'))
  await act(async () => void mockFocus.current()) // a newer load
  await screen.findByTestId('cart-row-b')
  await act(async () => first(cartOf([line('a')])))
  expect(screen.queryByTestId('cart-row-a')).toBeNull()
})

describe('stock warning', () => {
  const lowStock = (stock: number) => ({ id: 'v', size: null, color: null, price: 1, stock, imageUrl: null })
  it('steps down to the stock, never to a quantity the server rejects', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a', { quantity: 4, variant: lowStock(2) })]))
    api.setCartItemQuantity.mockResolvedValue(cartOf([line('a')]))
    await render(<CartScreen />)
    await fireEvent.press(await screen.findByTestId('cart-dec-a'))
    expect(api.setCartItemQuantity).toHaveBeenCalledWith('a', 2)
  })
  it('disables "-" with a reason when out of stock or inactive; Remove stays', async () => {
    api.fetchCart.mockResolvedValue(
      cartOf([line('a', { quantity: 4, variant: lowStock(0) }), line('b', { quantity: 3, product: { id: 'p', name: 'Gone', image: null, active: false } })]),
    )
    await render(<CartScreen />)
    for (const id of ['a', 'b']) {
      const dec = await screen.findByTestId(`cart-dec-${id}`)
      expect(dec).toBeDisabled()
      expect(dec.props.accessibilityLabel).toMatch(/Remove it instead/)
    }
    await fireEvent.press(screen.getByTestId('cart-edit'))
    for (const id of ['a', 'b']) expect(screen.getByTestId(`cart-remove-${id}`)).toBeEnabled()
  })
  it('steps down by one within the stock', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a', { quantity: 3 })]))
    api.setCartItemQuantity.mockResolvedValue(cartOf([line('a')]))
    await render(<CartScreen />)
    await fireEvent.press(await screen.findByTestId('cart-dec-a'))
    expect(api.setCartItemQuantity).toHaveBeenCalledWith('a', 2)
  })
})

describe('removing', () => {
  const soft = "Can't reach the server. Check your connection and try again."
  beforeEach(async () => {
    api.fetchCart.mockResolvedValueOnce(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })]))
    await render(<CartScreen />)
    await screen.findByTestId('cart-list')
  })

  it('drops the row locally when the DELETE worked but the refetch fails, with a soft toast', async () => {
    api.removeCartItem.mockResolvedValue(undefined)
    api.fetchCart.mockRejectedValue(new ApiError('network'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await pressAlert('Remove Item')
    expect(screen.queryByTestId('cart-row-a')).toBeNull()
    expect(screen.getByTestId('cart-row-b')).toBeTruthy()
    expect(screen.queryByTestId('cart-row-error-b')).toBeNull()
    expect(mockToast).toHaveBeenCalledWith('Item removed')
    expect(mockToast).toHaveBeenCalledWith(soft)
  })

  it('treats a 404 on remove as gone', async () => {
    api.removeCartItem.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    api.fetchCart.mockResolvedValue(cartOf([line('b', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await pressAlert('Remove Item')
    expect(screen.queryByTestId('cart-row-a')).toBeNull()
    expect(screen.queryByTestId('cart-row-error-a')).toBeNull()
  })

  it('treats a 404 on a quantity change as gone', async () => {
    api.setCartItemQuantity.mockRejectedValue(new ApiError('not-found', undefined, 404))
    api.fetchCart.mockResolvedValue(cartOf([line('b', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(screen.queryByTestId('cart-row-a')).toBeNull())
    expect(mockToast).toHaveBeenCalledWith('That item is no longer in your cart.')
  })

  it('opens one Alert on a double tap; the lock is released after Cancel and after a failed action', async () => {
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await fireEvent.press(screen.getByTestId('cart-remove-b'))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    await pressAlert('Cancel')
    api.removeCartItem.mockRejectedValue(new ApiError('server'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    expect(alertSpy).toHaveBeenCalledTimes(2)
    await pressAlert('Remove Item')
    expect(await screen.findByTestId('cart-row-error-a')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-remove-b'))
    expect(alertSpy).toHaveBeenCalledTimes(3)
  })

  it('releases the lock when the Alert is dismissed outside', async () => {
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await act(async () => alertSpy.mock.calls.at(-1)?.[3]?.onDismiss?.())
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    expect(alertSpy).toHaveBeenCalledTimes(2)
  })

  it('signs out and toasts once on a 401 from a mutation', async () => {
    api.setCartItemQuantity.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
    expect(screen.queryByTestId('cart-row-error-a')).toBeNull()
  })

  it('says so when a 404 removes the last item', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a')]))
    await act(async () => void mockFocus.current())
    await screen.findByTestId('cart-row-a')
    api.setCartItemQuantity.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('That item is no longer in your cart.'))
  })

  it('reloads the cart after a validation failure and keeps the row error', async () => {
    api.setCartItemQuantity.mockRejectedValue(new ApiError('validation', 'Only 1 left.', 422))
    api.fetchCart.mockClear()
    api.fetchCart.mockResolvedValue(cartOf([line('a', { variant: { id: 'v-a', size: 'M', color: 'Red', price: 1250, stock: 2, imageUrl: null } }), line('b', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(api.fetchCart).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('cart-row-error-a')).toBeTruthy()
    expect(screen.getByTestId('cart-inc-a')).toBeDisabled() // the refreshed stock puts the row at its maximum
  })
})

describe('selecting', () => {
  const warned = { id: 'v', size: 'M', color: 'Red', price: 1250, stock: 2, imageUrl: null }
  const three = () => [line('a'), line('b', { quantity: 1, lineTotal: 1250 }), line('c', { quantity: 1, lineTotal: 1250 })]
  beforeEach(async () => {
    api.fetchCart.mockResolvedValue(cartOf(three()))
    await render(<CartScreen />)
    await screen.findByTestId('cart-list')
  })

  it('ticks nothing by default: Check out and Remove (0) are disabled', async () => {
    expect(screen.getByText('Check out (0)')).toBeTruthy()
    expect(screen.getByTestId('cart-checkout')).toBeDisabled()
    await fireEvent.press(screen.getByTestId('cart-edit'))
    expect(screen.getByText('Remove (0)')).toBeTruthy()
    expect(screen.getByTestId('cart-remove-selected')).toBeDisabled()
    expect(screen.getByLabelText('Select Tee a').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('updates the count, the subtotal and the Checkout label as rows are ticked and unticked', async () => {
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-check-b'))
    expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱3,750.00')
    expect(screen.getByText('Check out (3)')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    expect(screen.getByText('Check out (1)')).toBeTruthy()
    expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱1,250.00')
  })

  it('Select all ticks every row, shows mixed when only some are ticked, and clears when all are ticked', async () => {
    const all = () => screen.getByTestId('cart-select-all').props.accessibilityState.checked
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    expect(all()).toBe('mixed')
    await fireEvent.press(screen.getByTestId('cart-select-all'))
    expect(all()).toBe(true)
    expect(screen.getByText('Check out (4)')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-select-all'))
    expect(all()).toBe(false)
    expect(screen.getByText('Check out (0)')).toBeTruthy()
  })

  it('a warning line blocks Checkout only while it is ticked', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a'), line('w', { quantity: 4, variant: warned })]))
    await act(async () => void mockFocus.current())
    await screen.findByTestId('cart-row-w')
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    expect(screen.getByTestId('cart-checkout')).toBeEnabled()
    expect(screen.queryByTestId('cart-checkout-note')).toBeNull()
    await fireEvent.press(screen.getByTestId('cart-check-w'))
    expect(screen.getByTestId('cart-checkout')).toBeDisabled()
    expect(screen.getByTestId('cart-checkout-note')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-check-w'))
    expect(screen.getByTestId('cart-checkout')).toBeEnabled()
  })

  it('Remove selected: Cancel sends nothing and keeps the ticks', async () => {
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    expect(alertSpy).toHaveBeenCalledWith('Are you sure?', 'Remove Tee a from your cart?', expect.any(Array), expect.anything())
    await pressAlert('Cancel')
    expect(api.removeCartItems).not.toHaveBeenCalled()
    expect(screen.getByText('Remove (1)')).toBeTruthy()
  })

  it('Remove selected: confirming sends one bulk call, drops the rows, clears the ticks and toasts', async () => {
    api.removeCartItems.mockResolvedValue(cartOf([line('c', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-check-b'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    await pressAlert('Remove 2 Items')
    expect(api.removeCartItems).toHaveBeenCalledTimes(1)
    expect(api.removeCartItems).toHaveBeenCalledWith(['a', 'b'])
    expect(api.removeCartItem).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Removed 2 items from cart')
    expect(screen.queryByTestId('cart-row-a')).toBeNull()
    expect(screen.getByTestId('cart-row-c')).toBeTruthy()
    expect(screen.getByText('Remove (0)')).toBeTruthy() // stays in Edit, ticks cleared
  })

  it('Remove selected names the item when one is ticked', async () => {
    api.removeCartItems.mockResolvedValue(cartOf([line('b'), line('c')]))
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    await pressAlert('Remove Item')
    expect(mockToast).toHaveBeenCalledWith('Removed Tee a from cart')
  })

  it('Remove selected: a 500 keeps the rows and ticks and toasts the error', async () => {
    api.removeCartItems.mockRejectedValue(new ApiError('server'))
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    await pressAlert('Remove Item')
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('cart-row-a')).toBeTruthy()
    expect(screen.getByText('Remove (1)')).toBeTruthy()
  })

  it('Remove selected: a 404 re-reads the cart and removes only the ids still there', async () => {
    api.removeCartItems.mockRejectedValueOnce(new ApiError('not-found', undefined, 404)).mockResolvedValueOnce(cartOf([line('c', { quantity: 1, lineTotal: 1250 })]))
    api.fetchCart.mockResolvedValue(cartOf([line('b', { quantity: 1, lineTotal: 1250 }), line('c', { quantity: 1, lineTotal: 1250 })]))
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    await fireEvent.press(screen.getByTestId('cart-check-b'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    await pressAlert('Remove 2 Items')
    expect(api.removeCartItems).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(api.removeCartItems).toHaveBeenNthCalledWith(2, ['b'])
    await waitFor(() => expect(screen.queryByTestId('cart-row-b')).toBeNull())
    expect(screen.getByTestId('cart-row-c')).toBeTruthy()
  })

  it('Remove selected: removing every row shows the empty state', async () => {
    api.removeCartItems.mockResolvedValue(cartOf([]))
    await fireEvent.press(screen.getByTestId('cart-select-all'))
    await fireEvent.press(screen.getByTestId('cart-edit'))
    await fireEvent.press(screen.getByTestId('cart-remove-selected'))
    await pressAlert('Remove 3 Items')
    expect(await screen.findByText('Your cart is empty')).toBeTruthy()
  })

  it('Remove (n) counts ticked rows, not their quantities, and is disabled at 0', async () => {
    await fireEvent.press(screen.getByTestId('cart-edit'))
    expect(screen.getByTestId('cart-remove-selected')).toBeDisabled()
    await fireEvent.press(screen.getByTestId('cart-check-a')) // quantity 2, still one row
    expect(screen.getByText('Remove (1)')).toBeTruthy()
    expect(screen.getByTestId('cart-remove-selected')).toBeEnabled()
    expect(screen.getByLabelText('Remove 1 selected items')).toBeTruthy()
  })
})

describe('Edit mode and header', () => {
  const edit = () => screen.getByTestId('cart-edit')
  beforeEach(async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })]))
    await render(<CartScreen />)
    await screen.findByTestId('cart-list')
  })

  it('shows "Shopping cart (3)" in the header', () => {
    expect(screen.getByText('Shopping cart (3)')).toBeTruthy()
  })

  it('toggles Edit and Done and keeps the ticks', async () => {
    await fireEvent.press(screen.getByTestId('cart-check-a'))
    expect(edit()).toHaveTextContent('Edit')
    await fireEvent.press(edit())
    expect(edit()).toHaveTextContent('Done')
    expect(screen.getByLabelText('Done editing')).toBeTruthy()
    expect(screen.getByLabelText('Select Tee a').props.accessibilityState).toMatchObject({ checked: true })
    await fireEvent.press(edit())
    expect(edit()).toHaveTextContent('Edit')
    expect(screen.getByLabelText('Select Tee a').props.accessibilityState).toMatchObject({ checked: true })
  })

  it('swaps Check out for Remove (n) and the steppers for trash buttons', async () => {
    expect(screen.getByTestId('cart-inc-a')).toBeTruthy()
    expect(screen.queryByTestId('cart-remove-a')).toBeNull()
    await fireEvent.press(edit())
    expect(screen.queryByTestId('cart-checkout')).toBeNull()
    expect(screen.queryByTestId('cart-subtotal')).toBeNull()
    expect(screen.getByText('Remove (0)')).toBeTruthy()
    expect(screen.queryByTestId('cart-inc-a')).toBeNull()
    expect(screen.queryByTestId('cart-dec-a')).toBeNull()
    expect(screen.getByTestId('cart-remove-a')).toBeTruthy()
  })
})

describe('no Edit without a cart', () => {
  it('is hidden for an empty cart', async () => {
    api.fetchCart.mockResolvedValue(cartOf([]))
    await render(<CartScreen />)
    await screen.findByText('Your cart is empty')
    expect(screen.queryByTestId('cart-edit')).toBeNull()
  })
  it('is hidden when signed out', async () => {
    mockUseSession.mockReturnValue(signedOut)
    await render(<CartScreen />)
    expect(screen.queryByTestId('cart-edit')).toBeNull()
  })
  it('is hidden when the load failed', async () => {
    api.fetchCart.mockRejectedValue(new ApiError('network'))
    await render(<CartScreen />)
    await screen.findByTestId('cart-retry')
    expect(screen.queryByTestId('cart-edit')).toBeNull()
  })
})
