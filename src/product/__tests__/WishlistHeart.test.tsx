import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import { WishlistHeart } from '../WishlistHeart'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/wishlist', () => ({ fetchWishlistIds: jest.fn(), addWishlistItem: jest.fn(), removeWishlistItem: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
const wishlist = jest.requireMock('@/api/wishlist')
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')
const notify = jest.fn()

const heart = () => screen.getByTestId('product-wishlist')

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } } })
  wishlist.fetchWishlistIds.mockResolvedValue([])
})

it('reads as Add to wishlist, not selected, when the piece is not saved', async () => {
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  expect(screen.getByRole('button', { name: 'Add to wishlist', selected: false })).toBeTruthy()
})

it('is disabled while the saved ids load', async () => {
  wishlist.fetchWishlistIds.mockReturnValue(new Promise(() => {}))
  await render(<WishlistHeart productId="p1" notify={notify} />)
  expect(heart().props.accessibilityState).toMatchObject({ disabled: true })
})

it('reads as Remove from wishlist, selected, when the piece is saved', async () => {
  wishlist.fetchWishlistIds.mockResolvedValue(['p1'])
  await render(<WishlistHeart productId="p1" notify={notify} />)
  expect(await screen.findByRole('button', { name: 'Remove from wishlist', selected: true })).toBeTruthy()
})

it('saves at once, then confirms', async () => {
  wishlist.addWishlistItem.mockResolvedValue(undefined)
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  await fireEvent.press(heart())
  expect(wishlist.addWishlistItem).toHaveBeenCalledWith('p1')
  expect(screen.getByRole('button', { name: 'Remove from wishlist', selected: true })).toBeTruthy()
  await waitFor(() => expect(notify).toHaveBeenCalledWith('Saved to wishlist'))
})

it('removes a saved piece and confirms', async () => {
  wishlist.fetchWishlistIds.mockResolvedValue(['p1'])
  wishlist.removeWishlistItem.mockResolvedValue(undefined)
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove from wishlist' }))
  expect(wishlist.removeWishlistItem).toHaveBeenCalledWith('p1')
  await waitFor(() => expect(notify).toHaveBeenCalledWith('Removed from wishlist'))
  expect(screen.getByRole('button', { name: 'Add to wishlist', selected: false })).toBeTruthy()
})

it('sends the request once on a double tap', async () => {
  let finish: () => void = () => {}
  wishlist.addWishlistItem.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  await act(async () => {
    heart().props.onClick({})
    heart().props.onClick({})
  })
  expect(wishlist.addWishlistItem).toHaveBeenCalledTimes(1)
  await act(async () => finish())
})

it('rolls back and tells the shopper why when the request fails', async () => {
  wishlist.addWishlistItem.mockRejectedValue(new ApiError('network'))
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  await fireEvent.press(heart())
  await waitFor(() => expect(notify).toHaveBeenCalledWith("Couldn't save to your wishlist. Can't reach the server. Check your connection and try again."))
  expect(screen.getByRole('button', { name: 'Add to wishlist', selected: false })).toBeTruthy()
})

it('opens Sign In on a rejected session, once', async () => {
  wishlist.addWishlistItem.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  await fireEvent.press(heart())
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sign-in'))
  expect(notify).not.toHaveBeenCalled()
})

it('sends a signed-out tap to Sign In without any request', async () => {
  mockUseSession.mockReturnValue({ session: null })
  await render(<WishlistHeart productId="p1" notify={notify} />)
  expect(wishlist.fetchWishlistIds).not.toHaveBeenCalled()
  expect(heart().props.accessibilityState).toMatchObject({ disabled: false })
  await fireEvent.press(heart())
  await fireEvent.press(heart())
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith('/sign-in')
  expect(wishlist.addWishlistItem).not.toHaveBeenCalled()
})

it('does not pretend the piece is unsaved when the ids fail to load: it says so and a tap retries', async () => {
  wishlist.fetchWishlistIds.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(['p1'])
  await render(<WishlistHeart productId="p1" notify={notify} />)
  const retryHeart = await screen.findByRole('button', { name: "Couldn't load your wishlist. Tap to retry." })
  expect(notify).toHaveBeenCalledWith("Couldn't load your wishlist. Tap to retry.")
  await fireEvent.press(retryHeart)
  expect(wishlist.addWishlistItem).not.toHaveBeenCalled()
  expect(await screen.findByRole('button', { name: 'Remove from wishlist', selected: true })).toBeTruthy()
  expect(wishlist.fetchWishlistIds).toHaveBeenCalledTimes(2)
})

it('drops a pick when the account changes', async () => {
  wishlist.addWishlistItem.mockResolvedValue(undefined)
  const { rerender } = await render(<WishlistHeart productId="p1" notify={notify} />)
  await waitFor(() => expect(heart().props.accessibilityState).toMatchObject({ disabled: false }))
  await fireEvent.press(heart())
  expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeTruthy()
  mockUseSession.mockReturnValue({ session: { user: { id: 'u2' } } })
  await rerender(<WishlistHeart productId="p1" notify={notify} />)
  expect(await screen.findByRole('button', { name: 'Add to wishlist', selected: false })).toBeTruthy()
})
