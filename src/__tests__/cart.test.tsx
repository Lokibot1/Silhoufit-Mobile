import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ApiError } from '@/lib/api'
import CartScreen from '../app/(tabs)/cart'

jest.mock('@/api/cart', () => ({ fetchCart: jest.fn(), setCartItemQuantity: jest.fn(), removeCartItem: jest.fn(), clearCart: jest.fn() }))
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
const lifted = (message: string) => [message, { bottom: expect.any(Number) }] as const
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

it('shows the skeleton on the first load, then the rows with name, variant, total and subtotal', async () => {
  let resolve: (cart: unknown) => void = () => {}
  api.fetchCart.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<CartScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })])))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Tee a')).toBeTruthy()
  expect(screen.getAllByText('M / Red')).toHaveLength(2)
  expect(screen.getAllByText('₱1,250.00')).toHaveLength(2) // unit price of both rows
  expect(screen.getByLabelText('Line total ₱2,500.00')).toBeTruthy() // only a quantity above 1 shows a line total
  expect(screen.queryByLabelText('Line total ₱1,250.00')).toBeNull()
  expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱3,750.00')
  expect(screen.getByTestId('cart-count').props.children).toBe('3 Items')
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
    expect(mockToast).toHaveBeenCalledWith(...lifted('Item removed'))
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

  it('labels the stepper and remove for screen readers', () => {
    expect(screen.getByLabelText('Increase quantity of Tee a')).toBeTruthy()
    expect(screen.getByLabelText('Decrease quantity of Tee a')).toBeTruthy()
    expect(screen.getByLabelText('Quantity 2')).toBeTruthy()
    expect(screen.getByLabelText('Remove Tee a')).toBeTruthy()
  })

  it('shows the sticky bar with the count, the subtotal and a disabled Checkout that says why', () => {
    expect(screen.getByTestId('cart-bar')).toBeTruthy()
    expect(screen.getByTestId('cart-count').props.children).toBe('3 Items')
    expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱3,750.00')
    expect(screen.getByTestId('cart-checkout')).toBeDisabled()
    expect(screen.getByTestId('cart-checkout-note')).toHaveTextContent('Checkout is coming soon')
    fireEvent.press(screen.getByTestId('cart-checkout'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('lifts toasts above the bar by its measured top edge', async () => {
    const bar = screen.getByTestId('cart-bar')
    // window 1334 high, bar top at 500, safe-area bottom 20: 1334 - 500 + 8 (gap) - 20 - 16 (toast base) = 806
    const view = jest.requireActual('react-native').View.prototype
    const original = view.measureInWindow
    view.measureInWindow = (done: (x: number, y: number) => void) => done(0, 500)
    try {
      await fireEvent(bar, 'layout', { nativeEvent: { layout: { x: 0, y: 500, width: 400, height: 140 } } })
      api.removeCartItem.mockResolvedValue(undefined)
      api.fetchCart.mockResolvedValue(cartOf([line('b', { quantity: 1, lineTotal: 1250 })]))
      await fireEvent.press(screen.getByTestId('cart-remove-a'))
      await pressAlert('Remove Item')
      expect(mockToast).toHaveBeenCalledWith('Item removed', { bottom: 806 })
    } finally {
      view.measureInWindow = original
    }
  })

  it('asks before clearing, then shows the empty state', async () => {
    await fireEvent.press(screen.getByTestId('cart-clear'))
    await pressAlert('Cancel')
    expect(api.clearCart).not.toHaveBeenCalled()

    api.clearCart.mockResolvedValue(undefined)
    api.fetchCart.mockResolvedValue(cartOf([]))
    await fireEvent.press(screen.getByTestId('cart-clear'))
    await pressAlert('Clear All Items')
    expect(api.clearCart).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('Cart cleared', undefined) // the bar is gone with the last item, so no lift
    expect(await screen.findByText('Your cart is empty')).toBeTruthy()
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
  expect(mockToast).toHaveBeenCalledWith(...lifted("Can't reach the server. Check your connection and try again."))
  expect(screen.getByTestId('cart-row-a')).toBeTruthy()
  expect(screen.queryByTestId('cart-retry')).toBeNull()
})

it('signs out once and toasts on a 401, without showing a sign-in form to a signed-in user', async () => {
  api.fetchCart.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<CartScreen />)
  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.', undefined) // signing out removes the bar, so no lift
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
      expect(screen.getByTestId(`cart-remove-${id}`)).toBeEnabled()
    }
  })
  it('steps down by one within the stock', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a', { quantity: 3 })]))
    api.setCartItemQuantity.mockResolvedValue(cartOf([line('a')]))
    await render(<CartScreen />)
    await fireEvent.press(await screen.findByTestId('cart-dec-a'))
    expect(api.setCartItemQuantity).toHaveBeenCalledWith('a', 2)
  })
})

describe('removing and clearing', () => {
  const soft = "Can't reach the server. Check your connection and try again."
  beforeEach(async () => {
    api.fetchCart.mockResolvedValueOnce(cartOf([line('a'), line('b', { quantity: 1, lineTotal: 1250 })]))
    await render(<CartScreen />)
    await screen.findByTestId('cart-list')
  })

  it('drops the row locally when the DELETE worked but the refetch fails, with a soft toast', async () => {
    api.removeCartItem.mockResolvedValue(undefined)
    api.fetchCart.mockRejectedValue(new ApiError('network'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await pressAlert('Remove Item')
    expect(screen.queryByTestId('cart-row-a')).toBeNull()
    expect(screen.getByTestId('cart-row-b')).toBeTruthy()
    expect(screen.getByTestId('cart-subtotal').props.children).toBe('₱1,250.00')
    expect(screen.queryByTestId('cart-row-error-b')).toBeNull()
    expect(mockToast).toHaveBeenCalledWith(...lifted('Item removed'))
    expect(mockToast).toHaveBeenCalledWith(...lifted(soft))
  })

  it('treats a 404 on remove as gone', async () => {
    api.removeCartItem.mockRejectedValue(new ApiError('not-found', undefined, 404))
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
    expect(mockToast).toHaveBeenCalledWith(...lifted('That item is no longer in your cart.'))
  })

  it('clears locally when the refetch fails after Clear Cart', async () => {
    api.clearCart.mockResolvedValue(undefined)
    api.fetchCart.mockRejectedValue(new ApiError('network'))
    await fireEvent.press(screen.getByTestId('cart-clear'))
    await pressAlert('Clear All Items')
    expect(await screen.findByText('Your cart is empty')).toBeTruthy()
    expect(mockToast).toHaveBeenCalledWith('Cart cleared', undefined) // the bar is gone with the last item, so no lift
    expect(mockToast).toHaveBeenCalledWith(soft, undefined)
  })

  it('opens one Alert on a double tap; the lock is released after Cancel and after a failed action', async () => {
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await fireEvent.press(screen.getByTestId('cart-remove-b'))
    expect(alertSpy).toHaveBeenCalledTimes(1)
    await pressAlert('Cancel')
    api.removeCartItem.mockRejectedValue(new ApiError('server'))
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    expect(alertSpy).toHaveBeenCalledTimes(2)
    await pressAlert('Remove Item')
    expect(await screen.findByTestId('cart-row-error-a')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('cart-clear'))
    expect(alertSpy).toHaveBeenCalledTimes(3)
  })

  it('releases the lock when the Alert is dismissed outside', async () => {
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    await act(async () => alertSpy.mock.calls.at(-1)?.[3]?.onDismiss?.())
    await fireEvent.press(screen.getByTestId('cart-remove-a'))
    expect(alertSpy).toHaveBeenCalledTimes(2)
  })

  it('signs out and toasts once on a 401 from a mutation', async () => {
    api.setCartItemQuantity.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.', undefined)
    expect(screen.queryByTestId('cart-row-error-a')).toBeNull()
  })

  it('does not lift the toast when a 404 removes the last item', async () => {
    api.fetchCart.mockResolvedValue(cartOf([line('a')]))
    await act(async () => void mockFocus.current())
    await screen.findByTestId('cart-row-a')
    api.setCartItemQuantity.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await fireEvent.press(screen.getByTestId('cart-inc-a'))
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('That item is no longer in your cart.', undefined))
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
