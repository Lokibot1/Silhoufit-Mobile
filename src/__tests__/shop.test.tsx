import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import Shop from '../app/(tabs)/index'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/products', () => ({ fetchProducts: jest.fn() }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockFetch: jest.Mock = jest.requireMock('@/api/products').fetchProducts
const mockPush: jest.Mock = jest.requireMock('expo-router').router.push

const item = (id: string) => ({ id, name: `Piece ${id}`, minPrice: 1250, maxPrice: 1250, totalStock: 10, imageUrl: null, rating: null, reviewCount: 0 })
const page = (ids: string[], hasNextPage = false, total = ids.length) => ({ items: ids.map(item), total, page: 1, hasNextPage })
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useRealTimers()
})

it('shows the skeleton while loading', async () => {
  mockFetch.mockReturnValue(never())
  await render(<Shop />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('shop-list')).toBeNull()
})

it('lists products for a signed-out visitor with no sign-in UI', async () => {
  mockFetch.mockResolvedValue(page(['a', 'b'], false, 2))
  await render(<Shop />)
  expect(await screen.findByTestId('shop-card-a')).toBeTruthy()
  expect(screen.getByTestId('shop-list')).toBeTruthy()
  expect(screen.getByText('2 pieces')).toBeTruthy()
  expect(screen.queryByText(/sign in/i)).toBeNull()
})

it('pushes the product route once on a double tap', async () => {
  mockFetch.mockResolvedValue(page(['a']))
  await render(<Shop />)
  const card = await screen.findByTestId('shop-card-a')
  await fireEvent.press(card)
  await fireEvent.press(card)
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'a' } })
})

it('shows the first-page error with a Retry that refetches', async () => {
  mockFetch.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(page(['a']))
  await render(<Shop />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('shop-retry'))
  expect(await screen.findByTestId('shop-card-a')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

it('shows the empty state without a search', async () => {
  mockFetch.mockResolvedValue(page([]))
  await render(<Shop />)
  expect(await screen.findByText('No pieces yet')).toBeTruthy()
  expect(screen.getByTestId('shop-empty')).toBeTruthy()
})

it('shows the query when a search finds nothing and Clear Search resets', async () => {
  jest.useFakeTimers()
  mockFetch.mockResolvedValueOnce(page(['a'])).mockResolvedValueOnce(page([])).mockResolvedValueOnce(page(['a']))
  await render(<Shop />)
  await screen.findByTestId('shop-card-a')
  await fireEvent.changeText(screen.getByTestId('shop-search'), 'zzz')
  await act(async () => {
    jest.advanceTimersByTime(300)
  })
  expect(await screen.findByText('No pieces match "zzz"')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('shop-empty-action'))
  expect(await screen.findByTestId('shop-card-a')).toBeTruthy()
  expect(screen.getByTestId('shop-search').props.value).toBe('')
  expect(mockFetch).toHaveBeenLastCalledWith({ search: '', page: 1, limit: 12 }, expect.any(AbortSignal))
})

it('appends a second page, and a failed page keeps the items with an inline retry', async () => {
  mockFetch
    .mockResolvedValueOnce(page(['a', 'b'], true, 4))
    .mockRejectedValueOnce(new ApiError('network'))
    .mockResolvedValueOnce({ ...page(['c', 'a'], false, 4), page: 2 })
  await render(<Shop />)
  await screen.findByTestId('shop-card-a')
  await fireEvent(screen.getByTestId('shop-list'), 'endReached')
  expect(await screen.findByTestId('shop-load-more-retry')).toBeTruthy()
  expect(screen.getByTestId('shop-card-a')).toBeTruthy()
  expect(screen.getByTestId('shop-card-b')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('shop-load-more-retry'))
  expect(await screen.findByTestId('shop-card-c')).toBeTruthy()
  expect(screen.getAllByTestId('shop-card-a')).toHaveLength(1)
  expect(mockFetch).toHaveBeenNthCalledWith(3, { search: '', page: 2, limit: 12 }, expect.any(AbortSignal))
})

it('does not request the next page twice while one is in flight', async () => {
  mockFetch.mockResolvedValueOnce(page(['a'], true, 2)).mockReturnValueOnce(never())
  await render(<Shop />)
  await screen.findByTestId('shop-card-a')
  await fireEvent(screen.getByTestId('shop-list'), 'endReached')
  await fireEvent(screen.getByTestId('shop-list'), 'endReached')
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

it('keeps the items and drops the spinner when a refresh fails during load-more', async () => {
  mockFetch.mockResolvedValueOnce(page(['a'], true, 2)).mockReturnValueOnce(never()).mockRejectedValueOnce(new ApiError('network'))
  await render(<Shop />)
  await screen.findByTestId('shop-card-a')
  await fireEvent(screen.getByTestId('shop-list'), 'endReached')
  expect(screen.getByLabelText('Loading more')).toBeTruthy()
  await act(async () => {
    screen.getByTestId('shop-list').props.onRefresh()
  })
  await waitFor(() => expect(mockToast).toHaveBeenCalled())
  expect(screen.queryByLabelText('Loading more')).toBeNull()
  expect(screen.getByTestId('shop-card-a')).toBeTruthy()
})

it('ignores an old search that resolves after a newer one was issued', async () => {
  jest.useFakeTimers()
  let resolveOld: (value: unknown) => void = () => {}
  mockFetch
    .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
    .mockResolvedValueOnce(page(['new']))
  await render(<Shop />)
  await fireEvent.changeText(screen.getByTestId('shop-search'), 'new')
  await act(async () => {
    jest.advanceTimersByTime(300)
  })
  expect(await screen.findByTestId('shop-card-new')).toBeTruthy()
  await act(async () => {
    resolveOld(page(['old']))
  })
  expect(screen.queryByTestId('shop-card-old')).toBeNull()
  expect(screen.getByTestId('shop-card-new')).toBeTruthy()
})

it('shows neutral copy, not session-expired, on a forbidden response', async () => {
  mockFetch.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<Shop />)
  expect(await screen.findByText("The shop couldn't be loaded. Try again.")).toBeTruthy()
  expect(screen.queryByText(/session/i)).toBeNull()
})

it('debounces the search and aborts the previous request', async () => {
  jest.useFakeTimers()
  const signals: AbortSignal[] = []
  mockFetch.mockImplementation((_params, signal: AbortSignal) => {
    signals.push(signal)
    return never()
  })
  await render(<Shop />)
  expect(mockFetch).toHaveBeenCalledTimes(1)
  await fireEvent.changeText(screen.getByTestId('shop-search'), 'sh')
  await fireEvent.changeText(screen.getByTestId('shop-search'), 'shirt')
  await act(async () => {
    jest.advanceTimersByTime(299)
  })
  expect(mockFetch).toHaveBeenCalledTimes(1)
  await act(async () => {
    jest.advanceTimersByTime(1)
  })
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
  expect(mockFetch).toHaveBeenLastCalledWith({ search: 'shirt', page: 1, limit: 12 }, expect.any(AbortSignal))
  expect(signals[0].aborted).toBe(true)
  expect(signals[1].aborted).toBe(false)
})
