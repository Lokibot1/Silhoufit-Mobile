import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import { ProductReviews } from '../ProductReviews'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/reviews', () => ({ fetchProductReviews: jest.fn() }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
const mockFetch: jest.Mock = jest.requireMock('@/api/reviews').fetchProductReviews

const summary = { averageRating: 4.5, totalReviews: 12, distribution: { 1: 0, 2: 1, 3: 1, 4: 4, 5: 6 } }
const review = (id: string, over = {}) => ({ id, rating: 4, comment: `Comment ${id}`, name: 'Ana C.', avatarUrl: null, photos: [], purchased: 'M, Navy', adminReply: null, createdAt: '2026-11-14T05:00:00.000Z', ...over })
const page = (over = {}) => ({ reviews: [review('r1'), review('r2', { photos: ['https://x.test/1.jpg', 'https://x.test/2.jpg'], adminReply: 'Thank you!' })], page: 1, totalPages: 2, total: 12, summary, ...over })

beforeEach(() => jest.clearAllMocks())

it('shows the loading state, then the summary, distribution, reviews and the count', async () => {
  mockFetch.mockReturnValue(new Promise(() => {}))
  await render(<ProductReviews productId="p1" />)
  expect(screen.getByLabelText('Loading reviews')).toBeTruthy()
  await screen.unmount()
  mockFetch.mockResolvedValue(page())
  await render(<ProductReviews productId="p1" />)
  expect(await screen.findByTestId('reviews-average')).toHaveTextContent('4.5')
  expect(screen.getByLabelText('4.5 out of 5 stars')).toBeTruthy()
  expect(screen.getByLabelText('5 stars, 6 reviews')).toBeTruthy()
  expect(screen.getByLabelText('1 star, 0 reviews')).toBeTruthy()
  expect(screen.getByText('Comment r1')).toBeTruthy()
  expect(screen.getAllByText('Nov 14, 2026')).toHaveLength(2)
  expect(screen.getAllByLabelText('4 out of 5 stars')).toHaveLength(2)
  expect(screen.getByText('Thank you!')).toBeTruthy()
  expect(screen.getByTestId('reviews-count')).toHaveTextContent('Showing 2 of 12')
  expect(mockFetch).toHaveBeenCalledWith('p1', { page: 1, rating: undefined, hasImages: false, sortBy: 'newest' }, expect.any(AbortSignal))
})

it('shows No reviews yet when the product has none', async () => {
  mockFetch.mockResolvedValue(page({ reviews: [], total: 0, summary: { ...summary, totalReviews: 0, averageRating: 0 } }))
  await render(<ProductReviews productId="p1" />)
  expect(await screen.findByText('No reviews yet')).toBeTruthy()
  expect(screen.queryByTestId('reviews-filter-all')).toBeNull()
})

it('shows an error with Retry that does not need the rest of the page, and recovers', async () => {
  mockFetch.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(page())
  await render(<ProductReviews productId="p1" />)
  expect(await screen.findByText(/Can't reach the server/)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('reviews-retry'))
  expect(await screen.findByTestId('reviews-average')).toBeTruthy()
})

it('filters by star rating, photos and sort, each starting again at page 1', async () => {
  mockFetch.mockResolvedValue(page())
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  await fireEvent.press(screen.getByTestId('reviews-filter-5'))
  await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('p1', { page: 1, rating: 5, hasImages: false, sortBy: 'newest' }, expect.any(AbortSignal)))
  expect(screen.getByTestId('reviews-filter-5').props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.getByTestId('reviews-filter-all').props.accessibilityState).toMatchObject({ selected: false })
  await fireEvent.press(screen.getByTestId('reviews-filter-photos'))
  await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('p1', { page: 1, rating: 5, hasImages: true, sortBy: 'newest' }, expect.any(AbortSignal)))
  await fireEvent.press(screen.getByTestId('reviews-sort'))
  await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('p1', { page: 1, rating: 5, hasImages: true, sortBy: 'oldest' }, expect.any(AbortSignal)))
  await fireEvent.press(screen.getByTestId('reviews-filter-all'))
  await waitFor(() => expect(mockFetch).toHaveBeenLastCalledWith('p1', { page: 1, rating: undefined, hasImages: false, sortBy: 'oldest' }, expect.any(AbortSignal)))
})

it('does nothing when All is pressed with no filter: the list stays and nothing reloads', async () => {
  mockFetch.mockResolvedValue(page())
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  await fireEvent.press(screen.getByTestId('reviews-filter-all'))
  expect(screen.queryByTestId('reviews-list-loading')).toBeNull()
  expect(screen.getByText('Comment r1')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledTimes(1)
})

it('shows a filtered empty state with Clear Filters, keeping the summary', async () => {
  mockFetch.mockResolvedValueOnce(page()).mockResolvedValueOnce(page({ reviews: [], total: 0 }))
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  await fireEvent.press(screen.getByTestId('reviews-filter-2'))
  expect(await screen.findByText('No 2-star reviews')).toBeTruthy()
  expect(screen.getByTestId('reviews-average')).toBeTruthy()
  mockFetch.mockResolvedValueOnce(page())
  await fireEvent.press(screen.getByTestId('reviews-clear-filters'))
  expect(await screen.findByText('Comment r1')).toBeTruthy()
})

it('loads the next page once on a double tap and appends without duplicates, hiding the button at the end', async () => {
  mockFetch.mockResolvedValueOnce(page())
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  let finish: (value: unknown) => void = () => {}
  mockFetch.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const button = screen.getByTestId('reviews-load-more')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(mockFetch).toHaveBeenCalledTimes(2)
  expect(mockFetch).toHaveBeenLastCalledWith('p1', { page: 2, rating: undefined, hasImages: false, sortBy: 'newest' }, expect.any(AbortSignal))
  await act(async () => finish(page({ reviews: [review('r2'), review('r3')], page: 2, totalPages: 2 })))
  expect(await screen.findByText('Comment r3')).toBeTruthy()
  expect(screen.getAllByText('Comment r2')).toHaveLength(1)
  expect(screen.getByTestId('reviews-count')).toHaveTextContent('Showing 3 of 12')
  expect(screen.queryByTestId('reviews-load-more')).toBeNull()
})

it('keeps the loaded reviews when Load more fails and offers Try Again', async () => {
  mockFetch.mockResolvedValueOnce(page()).mockRejectedValueOnce(new ApiError('server')).mockResolvedValueOnce(page({ reviews: [review('r3')], page: 2 }))
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  await fireEvent.press(screen.getByTestId('reviews-load-more'))
  expect(await screen.findByTestId('reviews-more-error')).toBeTruthy()
  expect(screen.getByText('Comment r1')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Try Again' }))
  expect(await screen.findByText('Comment r3')).toBeTruthy()
})

it('opens a review photo full screen and closes it with the close button and Android back', async () => {
  mockFetch.mockResolvedValue(page())
  await render(<ProductReviews productId="p1" />)
  await screen.findByTestId('reviews-average')
  expect(screen.queryByTestId('photo-viewer')).toBeNull()
  await fireEvent.press(screen.getByTestId('review-photo-r2-1'))
  const viewer = await screen.findByTestId('photo-viewer')
  expect(within(viewer).getByLabelText('Photo 2 of 2 from Ana C.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('photo-viewer-close'))
  expect(screen.queryByTestId('photo-viewer')).toBeNull()
  await fireEvent.press(screen.getByTestId('review-photo-r2-0'))
  await screen.findByTestId('photo-viewer')
  let modal = screen.getByTestId('photo-viewer').parent
  while (modal && !modal.props.onRequestClose) modal = modal.parent
  await act(async () => modal?.props.onRequestClose())
  expect(screen.queryByTestId('photo-viewer')).toBeNull()
})
