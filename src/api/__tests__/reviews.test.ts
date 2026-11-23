import { ApiError, request } from '@/lib/api'

import { createReview, fetchOrderReviews, fetchProductReviews, notifyReviewsChanged, onReviewsChanged, toReviewsPage, updateReview } from '../reviews'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const review = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  rating: 4,
  comment: 'Runs a little small.',
  user: { id: 'u1', firstName: 'Ana', lastName: 'Cruz', fullName: 'Ana Cruz', avatarUrl: null },
  images: [{ id: 'i1', url: 'https://x.test/1.jpg', displayOrder: 0 }],
  purchasedVariants: [{ size: 'M', color: 'Navy', sku: 'S1' }, { size: 'M', color: 'Navy', sku: 'S2' }],
  adminReply: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const summary = { averageRating: 4.5, totalReviews: 12, ratingDistribution: { 1: 0, 2: 1, 3: 1, 4: 4, 5: 6 } }
const body = (data: unknown[] = [review()]) => ({ data, meta: { total: 12, page: 2, limit: 10, totalPages: 2 }, summary })

beforeEach(() => jest.clearAllMocks())

describe('toReviewsPage', () => {
  it('maps a page and its summary', () => {
    expect(toReviewsPage(body())).toEqual({
      reviews: [{ id: 'r1', rating: 4, comment: 'Runs a little small.', name: 'Ana C.', avatarUrl: null, photos: ['https://x.test/1.jpg'], purchased: 'M, Navy', adminReply: null, createdAt: '2026-11-01T00:00:00.000Z' }],
      page: 2,
      totalPages: 2,
      total: 12,
      summary: { averageRating: 4.5, totalReviews: 12, distribution: { 1: 0, 2: 1, 3: 1, 4: 4, 5: 6 } },
    })
  })
  it('builds the name from the parts, then a generic one', () => {
    expect(toReviewsPage(body([review({ user: { firstName: 'Ana', lastName: 'Cruz' } })])).reviews[0].name).toBe('Ana C.')
    expect(toReviewsPage(body([review({ user: { fullName: 'Ana Maria de la Cruz' } })])).reviews[0].name).toBe('Ana C.')
    expect(toReviewsPage(body([review({ user: { firstName: 'Ana' } })])).reviews[0].name).toBe('Ana')
    expect(toReviewsPage(body([review({ user: {} })])).reviews[0].name).toBe('KRAL customer')
  })
  it('keeps only https photo and avatar URLs', () => {
    const http = { id: 'i2', url: 'http://x.test/2.jpg' }
    const r = toReviewsPage(body([review({ user: { fullName: 'Ana Cruz', avatarUrl: 'javascript:alert(1)' }, images: [{ url: 'https://x.test/1.jpg' }, http, { url: 'not a url' }] })])).reviews[0]
    expect(r.photos).toEqual(['https://x.test/1.jpg'])
    expect(r.avatarUrl).toBeNull()
    expect(toReviewsPage(body([review({ user: { fullName: 'Ana Cruz', avatarUrl: 'https://x.test/a.png' } })])).reviews[0].avatarUrl).toBe('https://x.test/a.png')
  })
  it('tolerates a missing comment, photos and variants', () => {
    expect(toReviewsPage(body([review({ comment: undefined, images: undefined, purchasedVariants: undefined })])).reviews[0]).toMatchObject({ comment: null, photos: [], purchased: null })
  })
  it('fills a missing distribution count with 0', () => {
    expect(toReviewsPage({ ...body(), summary: { ...summary, ratingDistribution: { 5: 2 } } }).summary.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 2 })
  })
  it('uses the requested page and 1 total page when meta omits them', () => {
    expect(toReviewsPage({ ...body(), meta: { total: 1 } }, 3)).toMatchObject({ page: 3, totalPages: 1 })
  })
  it.each([null, 'x', {}, { data: [], meta: {}, summary }, { data: [], meta: { total: 0 } }, { data: [], meta: { total: 0 }, summary: {} }, body([null]), body([review({ rating: 6 })]), body([review({ rating: 3.5 })]), body([review({ id: undefined })])])(
    'rejects the bad shape %#',
    (bad) => expect(() => toReviewsPage(bad)).toThrow(expect.objectContaining({ kind: 'server' })),
  )
})

describe('fetchProductReviews', () => {
  it('asks the public endpoint without a token, with the filters', async () => {
    mockRequest.mockResolvedValue(body())
    const signal = new AbortController().signal
    await fetchProductReviews('p 1', { page: 2, rating: 5, hasImages: true, sortBy: 'highest_rating' }, signal)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/products/p%201/reviews?page=2&limit=10&sortBy=highest_rating&rating=5&hasImages=true', undefined, signal, { auth: false })
  })
  it('sends no rating or photo filter when they are off', async () => {
    mockRequest.mockResolvedValue(body())
    await fetchProductReviews('p1', { page: 1, hasImages: false, sortBy: 'newest' })
    expect(mockRequest.mock.calls[0][1]).toBe('/products/p1/reviews?page=1&limit=10&sortBy=newest')
  })
  it('passes a failure through', async () => {
    mockRequest.mockRejectedValue(new ApiError('network'))
    await expect(fetchProductReviews('p1', { page: 1, sortBy: 'newest' })).rejects.toMatchObject({ kind: 'network' })
  })
})

const pending = (over: Record<string, unknown> = {}) => ({ orderId: 'o1', orderNumber: 'SHF-1', product: { id: 'p1', name: 'Linen Tee', slug: 'linen-tee', primaryImage: 'https://x.test/p1.jpg' }, variations: [{ orderItemId: 'i1', variantId: 'v1', size: 'M', color: null, quantity: 1 }], ...over })
const mine = (over: Record<string, unknown> = {}) => ({ id: 'r1', orderId: 'o1', productId: 'p2', rating: 4, comment: 'Soft.', images: [{ id: 'a', url: 'https://x.test/a.jpg' }, { id: 'b', url: 'http://x.test/insecure.jpg' }], purchasedVariants: [{ sku: 'S1' }], createdAt: '2026-11-01T00:00:00.000Z', ...over })
const page = (data: unknown[], totalPages = 1) => ({ data, meta: { total: data.length, page: 1, limit: 50, totalPages } })

describe('fetchOrderReviews', () => {
  it('keeps only this order: its pending products and the reviews already written', async () => {
    mockRequest.mockImplementation(async (_m: string, path: string) => (path === '/reviews/pending' ? [pending(), pending({ orderId: 'o2' })] : page([mine(), mine({ id: 'r2', orderId: 'o2' })])))
    const signal = new AbortController().signal
    const result = await fetchOrderReviews('o1', signal)
    expect(result.pending).toEqual([{ orderId: 'o1', productId: 'p1', name: 'Linen Tee', image: 'https://x.test/p1.jpg', variations: [{ orderItemId: 'i1', size: 'M', color: null }] }])
    expect(result.mine).toEqual([{ id: 'r1', orderId: 'o1', productId: 'p2', rating: 4, comment: 'Soft.', photos: ['https://x.test/a.jpg'], skus: ['S1'], createdAt: '2026-11-01T00:00:00.000Z' }])
    expect(mockRequest).toHaveBeenCalledWith('GET', '/reviews/pending', undefined, signal)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/reviews/me?page=1&limit=50', undefined, signal)
  })
  it('reads every page of my reviews', async () => {
    mockRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/reviews/pending') return []
      return path.includes('page=2') ? page([mine({ id: 'r2', productId: 'p3' })]) : page([mine()], 2)
    })
    expect((await fetchOrderReviews('o1')).mine.map((r) => r.id)).toEqual(['r1', 'r2'])
  })
  it('skips a malformed row but rejects a wrong shape', async () => {
    mockRequest.mockImplementation(async (_m: string, path: string) => (path === '/reviews/pending' ? [pending({ product: null })] : page([mine({ rating: 9 }), mine()])))
    const result = await fetchOrderReviews('o1')
    expect(result.pending).toEqual([])
    expect(result.mine).toHaveLength(1)
    mockRequest.mockResolvedValue({})
    await expect(fetchOrderReviews('o1')).rejects.toMatchObject({ kind: 'server' })
  })
  it('passes a failure through', async () => {
    mockRequest.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await expect(fetchOrderReviews('o1')).rejects.toMatchObject({ status: 401 })
  })
})

describe('createReview and updateReview', () => {
  it('posts to the order and product, and patches by review id', async () => {
    mockRequest.mockResolvedValue({})
    const signal = new AbortController().signal
    await createReview('o 1', 'p1', { rating: 5, comment: 'Lovely fit.', imageUrls: ['https://x/a.jpg'] }, signal)
    expect(mockRequest).toHaveBeenCalledWith('POST', '/orders/o%201/products/p1/reviews', { rating: 5, comment: 'Lovely fit.', imageUrls: ['https://x/a.jpg'] }, signal)
    await updateReview('r1', { rating: 3, comment: 'Changed my mind.', imageUrls: [] })
    expect(mockRequest).toHaveBeenLastCalledWith('PATCH', '/reviews/r1', { rating: 3, comment: 'Changed my mind.', imageUrls: [] }, undefined)
  })
  it('returns the saved review, with its comment as the server stored it', async () => {
    mockRequest.mockResolvedValue(review({ orderId: 'o1', productId: 'p1', comment: 'This is **** good.' }))
    expect(await createReview('o1', 'p1', { rating: 4, comment: 'This is darn good.' })).toMatchObject({ id: 'r1', orderId: 'o1', comment: 'This is **** good.' })
    expect(await updateReview('r1', { rating: 4, comment: 'This is darn good.' })).toMatchObject({ id: 'r1', comment: 'This is **** good.' })
    mockRequest.mockResolvedValue({})
    expect(await createReview('o1', 'p1', { rating: 4, comment: 'Fine.' })).toBeNull()
  })
  it('passes a 409 through', async () => {
    mockRequest.mockRejectedValue(new ApiError('conflict', 'already reviewed', 409))
    await expect(createReview('o1', 'p1', { rating: 5, comment: 'Lovely fit.' })).rejects.toMatchObject({ kind: 'conflict' })
  })
})

describe('onReviewsChanged', () => {
  it('tells every listener, and a removed one no more', () => {
    const a = jest.fn()
    const b = jest.fn()
    const offA = onReviewsChanged(a)
    onReviewsChanged(b)
    notifyReviewsChanged()
    offA()
    notifyReviewsChanged()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })
})
