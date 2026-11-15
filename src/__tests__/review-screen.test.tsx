import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import ReviewScreen from '../app/orders/review'
import { OrderReviews } from '../review/OrderReviews'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/reviews', () => ({ ...jest.requireActual('@/api/reviews'), fetchOrderReviews: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/review/ReviewForm', () => ({ ReviewForm: (props: object) => mockForm(props) }))
const mockForm = jest.fn((_props: { onConflict?: () => void }) => null)
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({ orderId: 'o1', productId: 'p1', name: 'Linen Tee' })),
  useIsFocused: () => true,
}))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockFetch: jest.Mock = jest.requireMock('@/api/reviews').fetchOrderReviews
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')

const pending = { orderId: 'o1', productId: 'p1', name: 'Linen Tee', image: null, variations: [{ orderItemId: 'i1', size: 'M', color: null }] }
const mine = { id: 'r1', orderId: 'o1', productId: 'p1', rating: 4, comment: 'Soft and true to size.', photos: ['https://x/a.jpg'], skus: ['S1'], createdAt: new Date().toISOString() }
const signedIn = { session: { user: { id: 'u1' } }, loading: false, signOut: mockSignOut }

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSession.mockReturnValue(signedIn)
})

describe('review screen', () => {
  it('shows a skeleton while it loads', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    await render(<ReviewScreen />)
    expect(screen.getByTestId('review-loading')).toBeTruthy()
  })

  it('opens the form to write when the product is pending, naming it', async () => {
    mockFetch.mockResolvedValue({ pending: [pending], mine: [] })
    await render(<ReviewScreen />)
    expect(mockForm).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', orderId: 'o1', productId: 'p1', productName: 'Linen Tee', review: undefined }))
  })

  it('opens the form to edit when a review exists', async () => {
    mockFetch.mockResolvedValue({ pending: [], mine: [mine] })
    await render(<ReviewScreen />)
    expect(mockForm).toHaveBeenCalledWith(expect.objectContaining({ review: mine, productName: 'Linen Tee' }))
  })

  it('says there is nothing to review when the product is neither pending nor reviewed', async () => {
    mockFetch.mockResolvedValue({ pending: [], mine: [] })
    await render(<ReviewScreen />)
    expect(screen.getByText('Nothing to review here')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('review-empty-back'))
    expect(router.back).toHaveBeenCalled()
  })

  it('offers Retry when loading fails, and reloads', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError('network')).mockResolvedValue({ pending: [pending], mine: [] })
    await render(<ReviewScreen />)
    expect(screen.getByText("Couldn't load your review")).toBeTruthy()
    expect(screen.getByText(/Can't reach the server/)).toBeTruthy()
    await fireEvent.press(screen.getByTestId('review-retry'))
    expect(mockForm).toHaveBeenCalled()
  })

  it('prompts to sign in when there is no session', async () => {
    mockUseSession.mockReturnValue({ ...signedIn, session: null })
    await render(<ReviewScreen />)
    expect(mockFetch).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('review-sign-in'))
    expect(router.push).toHaveBeenCalledWith('/sign-in')
  })

  it('signs out once on a 401', async () => {
    mockFetch.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<ReviewScreen />)
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('fetches the existing review quietly on a conflict and keeps the same form mounted, now in edit mode', async () => {
    mockFetch.mockResolvedValueOnce({ pending: [pending], mine: [] }).mockResolvedValue({ pending: [], mine: [mine] })
    await render(<ReviewScreen />)
    await act(async () => mockForm.mock.calls.at(-1)?.[0].onConflict?.())
    expect(mockForm).toHaveBeenLastCalledWith(expect.objectContaining({ review: mine }))
    expect(screen.queryByTestId('review-loading')).toBeNull()
  })

  it('says so when the existing review cannot be fetched after a conflict', async () => {
    mockFetch.mockResolvedValueOnce({ pending: [pending], mine: [] }).mockRejectedValue(new ApiError('network'))
    await render(<ReviewScreen />)
    await act(async () => mockForm.mock.calls.at(-1)?.[0].onConflict?.())
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't load your existing review/))
  })
})

describe('reviews on a delivered order', () => {
  const order = { id: 'o1', items: [{ id: 'i1', name: 'Linen Tee', sku: 'S1', imageUrl: null }, { id: 'i2', name: 'Wool Cap', sku: 'S2', imageUrl: null }] }
  const show = () => render(<OrderReviews order={order as never} />)

  it('shows a loading block first', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    await show()
    expect(screen.getByTestId('order-reviews-loading')).toBeTruthy()
  })

  it('offers Write a review for a pending product and Edit your review for a written one', async () => {
    mockFetch.mockResolvedValue({ pending: [{ ...pending, productId: 'p2', name: 'Wool Cap' }], mine: [mine] })
    await show()
    expect(screen.getByTestId('order-review-write-p2').props.accessibilityLabel).toBe('Write a review of Wool Cap')
    expect(screen.getByTestId('order-review-edit-p1').props.accessibilityLabel).toBe('Edit your review of Linen Tee')
    expect(screen.getByText('Soft and true to size.')).toBeTruthy()
    expect(screen.getByLabelText('4 out of 5 stars')).toBeTruthy()
    expect(screen.getByText('1 photo')).toBeTruthy()
  })

  it('opens the review screen for the product', async () => {
    mockFetch.mockResolvedValue({ pending: [pending], mine: [] })
    await show()
    await fireEvent.press(screen.getByTestId('order-review-write-p1'))
    await fireEvent.press(screen.getByTestId('order-review-write-p1'))
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith({ pathname: '/orders/review', params: { orderId: 'o1', productId: 'p1', name: 'Linen Tee' } })
  })

  it('does not offer an edit once the 30 days are over', async () => {
    mockFetch.mockResolvedValue({ pending: [], mine: [{ ...mine, createdAt: '2026-01-01T00:00:00.000Z' }] })
    await show()
    expect(screen.queryByTestId('order-review-edit-p1')).toBeNull()
    expect(screen.getByText(/edited for 30 days after posting/)).toBeTruthy()
  })

  it('says so when there is nothing to review', async () => {
    mockFetch.mockResolvedValue({ pending: [], mine: [] })
    await show()
    expect(screen.getByTestId('order-reviews-empty')).toBeTruthy()
  })

  it('fails alone, with a Retry, and the order is unaffected', async () => {
    mockFetch.mockRejectedValueOnce(new ApiError('server')).mockResolvedValue({ pending: [pending], mine: [] })
    await show()
    expect(screen.getByTestId('order-reviews-error')).toHaveTextContent(/Your order is not affected/)
    await fireEvent.press(screen.getByTestId('order-reviews-retry'))
    expect(screen.getByTestId('order-review-write-p1')).toBeTruthy()
  })

  it('refreshes quietly when a review is saved elsewhere', async () => {
    mockFetch.mockResolvedValueOnce({ pending: [pending], mine: [] }).mockResolvedValue({ pending: [], mine: [mine] })
    await show()
    expect(screen.getByTestId('order-review-write-p1')).toBeTruthy()
    await act(async () => jest.requireActual('@/api/reviews').notifyReviewsChanged())
    expect(screen.getByTestId('order-review-edit-p1')).toBeTruthy()
    expect(screen.queryByTestId('order-reviews-loading')).toBeNull()
  })
})
