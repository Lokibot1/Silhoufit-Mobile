import { fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import ReviewsScreen from '../app/product/reviews/[id]'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/products', () => ({ fetchProduct: jest.fn() }))
jest.mock('@/api/reviews', () => ({ ...jest.requireActual('@/api/reviews'), fetchProductReviews: jest.fn() }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: jest.fn(() => ({ id: 'p1' })) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
const mockProduct: jest.Mock = jest.requireMock('@/api/products').fetchProduct
const mockReviews: jest.Mock = jest.requireMock('@/api/reviews').fetchProductReviews
const { router } = jest.requireMock('expo-router')

const product = { id: 'p1', name: 'Linen Shirt', images: [{ url: 'https://x.test/1.jpg', altText: null }], variants: [{ price: 2000 }], soldCount: 12 }
const summary = { averageRating: 5, totalReviews: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } }
const review = { id: 'r1', rating: 5, comment: 'Great fit', name: 'Ana C.', avatarUrl: null, photos: [], purchased: null, adminReply: null, createdAt: '2026-11-14T05:00:00.000Z' }
const page = (over = {}) => ({ reviews: [review], page: 1, totalPages: 1, total: 1, summary, ...over })
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockProduct.mockResolvedValue(product)
  mockReviews.mockResolvedValue(page())
})

it('shows skeletons for the product and the reviews while loading', async () => {
  mockProduct.mockReturnValue(never())
  mockReviews.mockReturnValue(never())
  await render(<ReviewsScreen />)
  expect(screen.getByLabelText('Loading product')).toBeTruthy()
  expect(screen.getByLabelText('Loading reviews')).toBeTruthy()
  expect(screen.getByTestId('reviews-back')).toBeTruthy()
})

it('shows the product error with Retry, keeps the reviews, and recovers', async () => {
  mockProduct.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(product)
  await render(<ReviewsScreen />)
  expect(await screen.findByText(/Can't reach the server/)).toBeTruthy()
  expect(await screen.findByTestId('reviews-average')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('reviews-product-retry'))
  expect(await screen.findByText('Linen Shirt')).toBeTruthy()
})

it('shows the mini card, the reviews and a Back to Product button that goes back', async () => {
  await render(<ReviewsScreen />)
  expect(await screen.findByText('Linen Shirt')).toBeTruthy()
  expect(screen.getByText('₱2,000.00')).toBeTruthy()
  expect(screen.getByText('12 sold')).toBeTruthy()
  expect(await screen.findByText('Great fit')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Product' }))
  expect(router.back).toHaveBeenCalled()
})

it("shows \"You've seen all reviews\" only on the last page", async () => {
  mockReviews.mockResolvedValue(page({ totalPages: 2, total: 2 }))
  await render(<ReviewsScreen />)
  await screen.findByText('Great fit')
  expect(screen.queryByText("You've seen all reviews")).toBeNull()
  await screen.unmount()
  mockReviews.mockResolvedValue(page())
  await render(<ReviewsScreen />)
  expect(await screen.findByText("You've seen all reviews")).toBeTruthy()
})

it('shows No reviews yet and no closing line when there are none', async () => {
  mockReviews.mockResolvedValue(page({ reviews: [], total: 0, summary: { ...summary, totalReviews: 0, averageRating: 0 } }))
  await render(<ReviewsScreen />)
  expect(await screen.findByText('No reviews yet')).toBeTruthy()
  expect(screen.queryByText("You've seen all reviews")).toBeNull()
  expect(screen.getByTestId('reviews-back')).toBeTruthy()
})
