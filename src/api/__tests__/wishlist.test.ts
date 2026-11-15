import { ApiError, request } from '@/lib/api'

import { addWishlistItem, fetchWishlist, fetchWishlistIds, removeWishlistItem, toWishlist, toWishlistIds } from '../wishlist'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const product = { id: 'p1', name: 'Linen Shirt', minPrice: 1250, maxPrice: 1250, totalStock: 12, primaryImage: { url: 'https://x.test/a.jpg', altText: null }, ratingSummary: { averageRating: 4.5, reviewCount: 8 } }
const entry = (over: Record<string, unknown> = {}) => ({ id: 'w1', productId: 'p1', createdAt: '2026-11-01T00:00:00.000Z', product, ...over })

beforeEach(() => jest.clearAllMocks())

describe('toWishlist', () => {
  it('maps the saved pieces', () => {
    expect(toWishlist({ items: [entry()], totalCount: 1 })).toEqual([
      { productId: 'p1', savedAt: '2026-11-01T00:00:00.000Z', product: { id: 'p1', name: 'Linen Shirt', minPrice: 1250, maxPrice: 1250, totalStock: 12, imageUrl: 'https://x.test/a.jpg', rating: 4.5, reviewCount: 8, soldCount: null, avgDeliveryMinutes: null } },
    ])
  })
  it('accepts an empty list', () => expect(toWishlist({ items: [] })).toEqual([]))
  it('drops an entry with a bad product or no product id, keeps the rest', () => {
    const list = toWishlist({ items: [entry({ productId: undefined }), entry({ product: { id: 'p9' } }), null, entry({ productId: 'p2', product: { ...product, id: 'p2' } })] })
    expect(list.map((item) => item.productId)).toEqual(['p2'])
  })
  it.each([null, 'x', {}, { items: {} }])('rejects the bad shape %p', (bad) => expect(() => toWishlist(bad)).toThrow(expect.objectContaining({ kind: 'server' })))
})

describe('toWishlistIds', () => {
  it('keeps only string ids', () => expect(toWishlistIds({ productIds: ['a', 3, 'b', null] })).toEqual(['a', 'b']))
  it.each([null, {}, { productIds: 'a' }])('rejects the bad shape %p', (bad) => expect(() => toWishlistIds(bad)).toThrow(expect.objectContaining({ kind: 'server' })))
})

describe('requests', () => {
  it('reads the list and the ids with the session token (auth on)', async () => {
    mockRequest.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ productIds: ['p1'] })
    const signal = new AbortController().signal
    expect(await fetchWishlist(signal)).toEqual([])
    expect(await fetchWishlistIds(signal)).toEqual(['p1'])
    expect(mockRequest).toHaveBeenNthCalledWith(1, 'GET', '/wishlist', undefined, signal)
    expect(mockRequest).toHaveBeenNthCalledWith(2, 'GET', '/wishlist/ids', undefined, signal)
  })
  it('saves with POST and the product id', async () => {
    mockRequest.mockResolvedValue({})
    await addWishlistItem('p1')
    expect(mockRequest).toHaveBeenCalledWith('POST', '/wishlist', { productId: 'p1' })
  })
  it('removes with DELETE and encodes the id', async () => {
    mockRequest.mockResolvedValue({ success: true })
    await removeWishlistItem('a/b')
    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/wishlist/a%2Fb')
  })
  it('counts a 404 on remove as done, but not other failures', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError('not-found', undefined, 404))
    await expect(removeWishlistItem('p1')).resolves.toBeUndefined()
    mockRequest.mockRejectedValueOnce(new ApiError('network'))
    await expect(removeWishlistItem('p1')).rejects.toMatchObject({ kind: 'network' })
  })
  it('passes a failed read through', async () => {
    mockRequest.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await expect(fetchWishlist()).rejects.toMatchObject({ kind: 'forbidden' })
  })
})
