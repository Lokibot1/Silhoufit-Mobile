import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import Wishlist from '../app/(tabs)/wishlist'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/wishlist', () => ({ fetchWishlist: jest.fn(), addWishlistItem: jest.fn(), removeWishlistItem: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
// Like the real hook, runs on mount; `refocus()` runs the latest callback again, as returning to the screen does.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback
    jest.requireActual('react').useEffect(callback, [])
  },
}))
let mockFocus: () => void = () => {}
const refocus = () => act(async () => mockFocus())
const mockToast = jest.fn()
const wishlist = jest.requireMock('@/api/wishlist')
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')

const card = (id: string, name: string) => ({ productId: id, savedAt: '2026-11-01T00:00:00.000Z', product: { id, name, minPrice: 1250, maxPrice: 1250, totalStock: 10, imageUrl: null, rating: null, reviewCount: 0 } })
const items = () => [card('p1', 'Linen Shirt'), card('p2', 'Wool Hoodie'), card('p3', 'Denim Shorts')]
const names = () => screen.queryAllByTestId(/^shop-card-p\d$/).map((node) => String(node.props.accessibilityLabel).split(',')[0])
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  wishlist.fetchWishlist.mockResolvedValue(items())
})

it('shows the skeleton while loading, and while the session restores', async () => {
  wishlist.fetchWishlist.mockReturnValue(never())
  await render(<Wishlist />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await screen.unmount()
  mockUseSession.mockReturnValue({ session: null, loading: true })
  await render(<Wishlist />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('wishlist-sign-in')).toBeNull()
  expect(wishlist.fetchWishlist).toHaveBeenCalledTimes(1)
})

it('prompts sign-in when signed out, once on a double tap, without fetching', async () => {
  mockUseSession.mockReturnValue({ session: null, loading: false })
  await render(<Wishlist />)
  expect(screen.getByText('Sign in to see your wishlist')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('wishlist-sign-in'))
  await fireEvent.press(screen.getByTestId('wishlist-sign-in'))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith('/sign-in')
  expect(wishlist.fetchWishlist).not.toHaveBeenCalled()
})

it('lists the saved pieces with prices and opens one', async () => {
  await render(<Wishlist />)
  expect(await screen.findByTestId('shop-card-p1')).toBeTruthy()
  expect(screen.getAllByText('₱1,250.00')).toHaveLength(3)
  await fireEvent.press(screen.getByTestId('shop-card-p2'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'p2' } })
})

it('shows the empty state with a Browse the Shop action', async () => {
  wishlist.fetchWishlist.mockResolvedValue([])
  await render(<Wishlist />)
  expect(await screen.findByText('Your wishlist is empty')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('wishlist-empty-action'))
  expect(router.navigate).toHaveBeenCalledWith('/')
})

it('shows the error with a Retry that loads again', async () => {
  wishlist.fetchWishlist.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(items())
  await render(<Wishlist />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('wishlist-retry'))
  expect(await screen.findByTestId('shop-card-p1')).toBeTruthy()
  expect(wishlist.fetchWishlist).toHaveBeenCalledTimes(2)
})

it('removes at once with an Undo toast, no confirm, and Undo puts it back in the same place', async () => {
  wishlist.removeWishlistItem.mockResolvedValue(undefined)
  wishlist.addWishlistItem.mockResolvedValue(undefined)
  await render(<Wishlist />)
  await screen.findByTestId('shop-card-p2')
  expect(screen.getByLabelText('Remove Wool Hoodie from wishlist')).toBe(screen.getByTestId('wishlist-remove-p2'))
  await fireEvent.press(screen.getByTestId('wishlist-remove-p2'))
  expect(names()).toEqual(['Linen Shirt', 'Denim Shorts'])
  expect(wishlist.removeWishlistItem).toHaveBeenCalledWith('p2')
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Removed from wishlist', { action: { label: 'Undo', onPress: expect.any(Function) } }))
  await act(async () => mockToast.mock.calls[0][1].action.onPress())
  expect(wishlist.addWishlistItem).toHaveBeenCalledWith('p2')
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
})

it('removes once on a double tap', async () => {
  let finish: () => void = () => {}
  wishlist.removeWishlistItem.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
  await render(<Wishlist />)
  const button = await screen.findByTestId('wishlist-remove-p1')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(wishlist.removeWishlistItem).toHaveBeenCalledTimes(1)
  await act(async () => finish())
})

it('puts the piece back and says why when removing fails', async () => {
  wishlist.removeWishlistItem.mockRejectedValue(new ApiError('server'))
  await render(<Wishlist />)
  await fireEvent.press(await screen.findByTestId('wishlist-remove-p1'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't remove it from your wishlist. The server had a problem. Please try again."))
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
})

it('shows the empty state after removing the last piece', async () => {
  wishlist.fetchWishlist.mockResolvedValue([card('p1', 'Linen Shirt')])
  wishlist.removeWishlistItem.mockResolvedValue(undefined)
  await render(<Wishlist />)
  await fireEvent.press(await screen.findByTestId('wishlist-remove-p1'))
  expect(await screen.findByText('Your wishlist is empty')).toBeTruthy()
})

it('refreshes on pull and keeps the list when the refresh fails, toasting instead', async () => {
  await render(<Wishlist />)
  await screen.findByTestId('shop-card-p1')
  wishlist.fetchWishlist.mockRejectedValue(new ApiError('network'))
  await act(async () => screen.getByTestId('wishlist-list').props.refreshControl.props.onRefresh())
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't refresh your wishlist. Can't reach the server. Check your connection and try again."))
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
  expect(screen.queryByTestId('wishlist-retry')).toBeNull()
})

it('reloads quietly on regaining focus: the list stays, no skeleton, and un-hearting elsewhere shows up', async () => {
  await render(<Wishlist />)
  await screen.findByTestId('shop-card-p1')
  expect(wishlist.fetchWishlist).toHaveBeenCalledTimes(1)
  let finish: (list: unknown) => void = () => {}
  wishlist.fetchWishlist.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  await refocus()
  expect(wishlist.fetchWishlist).toHaveBeenCalledTimes(2)
  expect(screen.queryByTestId('wishlist-loading')).toBeNull()
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
  await act(async () => finish([card('p1', 'Linen Shirt'), card('p3', 'Denim Shorts')]))
  expect(names()).toEqual(['Linen Shirt', 'Denim Shorts'])
})

it('keeps the list and toasts when the focus reload fails', async () => {
  await render(<Wishlist />)
  await screen.findByTestId('shop-card-p1')
  wishlist.fetchWishlist.mockRejectedValue(new ApiError('server'))
  await refocus()
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't refresh your wishlist. The server had a problem. Please try again."))
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
  expect(screen.queryByTestId('wishlist-retry')).toBeNull()
})

it('does not bring back a card removed while a refresh was in flight', async () => {
  await render(<Wishlist />)
  await screen.findByTestId('shop-card-p1')
  let finish: (list: unknown) => void = () => {}
  wishlist.fetchWishlist.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  wishlist.removeWishlistItem.mockResolvedValue(undefined)
  await act(async () => screen.getByTestId('wishlist-list').props.refreshControl.props.onRefresh())
  await fireEvent.press(screen.getByTestId('wishlist-remove-p2'))
  await act(async () => finish(items()))
  expect(names()).toEqual(['Linen Shirt', 'Denim Shorts'])
  expect(screen.getByTestId('wishlist-list').props.refreshControl.props.refreshing).toBe(false)
})

it('opens Sign In, not an error toast, when the session is rejected while removing', async () => {
  wishlist.removeWishlistItem.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<Wishlist />)
  await fireEvent.press(await screen.findByTestId('wishlist-remove-p1'))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sign-in'))
  expect(mockToast).not.toHaveBeenCalled()
  expect(names()).toEqual(['Linen Shirt', 'Wool Hoodie', 'Denim Shorts'])
})

it('opens Sign In once when the session is rejected on load, keeping the Retry screen', async () => {
  wishlist.fetchWishlist.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<Wishlist />)
  expect(await screen.findByText('Your session has expired. Sign in again.')).toBeTruthy()
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith('/sign-in')
})

it('starts clean when the account changes', async () => {
  const { rerender } = await render(<Wishlist />)
  await screen.findByTestId('shop-card-p1')
  wishlist.fetchWishlist.mockReturnValue(never())
  mockUseSession.mockReturnValue({ session: { user: { id: 'u2' } }, loading: false })
  await rerender(<Wishlist />)
  expect(screen.queryByTestId('shop-card-p1')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
})
