import { ApiError, request } from '@/lib/api'

import { fetchProductReviews, toReviewsPage } from '../reviews'
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
