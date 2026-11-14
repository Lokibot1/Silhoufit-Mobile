import { ApiError, request } from '@/lib/api'

import { fetchProducts, toProductPage } from '../products'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const item = {
  id: 'p1',
  name: 'Linen Shirt',
  minPrice: 1250,
  maxPrice: 1250,
  totalStock: 12,
  primaryImage: { url: 'https://x.test/a.jpg', altText: null },
  ratingSummary: { averageRating: 4.5, reviewCount: 8 },
}
const body = (data: unknown[] = [item]) => ({ data, meta: { total: 24, page: 2, limit: 12, totalPages: 2, hasNextPage: false } })

describe('toProductPage', () => {
  it('maps a valid body', () => {
    expect(toProductPage(body())).toEqual({
      items: [{ id: 'p1', name: 'Linen Shirt', minPrice: 1250, maxPrice: 1250, totalStock: 12, imageUrl: 'https://x.test/a.jpg', rating: 4.5, reviewCount: 8 }],
      total: 24,
      page: 2,
      hasNextPage: false,
    })
  })
  it('keeps a price range', () => expect(toProductPage(body([{ ...item, minPrice: 900, maxPrice: 1500 }])).items[0]).toMatchObject({ minPrice: 900, maxPrice: 1500 }))
  it('nulls a missing price', () => expect(toProductPage(body([{ ...item, minPrice: undefined, maxPrice: null }])).items[0]).toMatchObject({ minPrice: null, maxPrice: null }))
  it('has no rating without a summary', () => expect(toProductPage(body([{ ...item, ratingSummary: undefined }])).items[0]).toMatchObject({ rating: null, reviewCount: 0 }))
  it('has no image or stock when missing', () => expect(toProductPage(body([{ ...item, primaryImage: null, totalStock: undefined }])).items[0]).toMatchObject({ imageUrl: null, totalStock: null }))
  it('reads hasNextPage', () => expect(toProductPage({ ...body(), meta: { total: 30, page: 1, hasNextPage: true } }).hasNextPage).toBe(true))
  it('accepts an empty list', () => expect(toProductPage(body([])).items).toEqual([]))
  it.each(['id', 'name'])('rejects an item without %s', (key) => expect(() => toProductPage(body([{ ...item, [key]: undefined }]))).toThrow(ApiError))
  it.each([null, 'x', 42, {}, { data: [] }, { data: {}, meta: { total: 1 } }, { data: [], meta: {} }, body([null])])('rejects the bad shape %p', (bad) => {
    expect(() => toProductPage(bad)).toThrow(expect.objectContaining({ kind: 'server' }))
  })
})

describe('toProductPage fallbacks', () => {
  it('uses the requested page when meta.page is missing', () => expect(toProductPage({ data: [], meta: { total: 0 } }, 2).page).toBe(2))
  it('counts the data when meta.total is 0 but data exists', () => expect(toProductPage({ data: [item], meta: { total: 0 } }).total).toBe(1))
})

describe('fetchProducts', () => {
  it('builds the URL with an encoded search and sends no token', async () => {
    mockRequest.mockResolvedValue(body())
    const signal = new AbortController().signal
    await fetchProducts({ search: ' red & blue ', page: 2, limit: 12 }, signal)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/products?page=2&limit=12&search=red%20%26%20blue', undefined, signal, { auth: false })
  })
  it('omits an empty search', async () => {
    mockRequest.mockResolvedValue(body())
    await fetchProducts({ search: '  ', page: 1, limit: 12 })
    expect(mockRequest.mock.calls.at(-1)?.[1]).toBe('/products?page=1&limit=12')
  })
})
