import { ApiError, request } from '@/lib/api'

import { fetchProduct, fetchProducts, toCategories, toProduct, toProductPage } from '../products'
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

const variant = { id: 'v1', size: 'M', color: 'Navy', colorHex: '#001f3f', price: 1250, stock: 3, imageUrl: 'https://x.test/v.jpg' }
const detail = {
  id: 'p1',
  name: 'Linen Shirt',
  brand: 'KRAL',
  category: 'Shirt',
  description: 'Soft linen.',
  images: [
    { url: 'https://x.test/2.jpg', altText: null, displayOrder: 1, isPrimary: false },
    { url: 'https://x.test/1.jpg', altText: 'Front', displayOrder: 0, isPrimary: true },
  ],
  variants: [variant],
  ratingSummary: { averageRating: 4.5, reviewCount: 12 },
}

describe('toProduct', () => {
  it('maps a valid body, primary image first', () => {
    expect(toProduct(detail)).toEqual({
      id: 'p1',
      name: 'Linen Shirt',
      brand: 'KRAL',
      category: 'Shirt',
      description: 'Soft linen.',
      images: [{ url: 'https://x.test/1.jpg', altText: 'Front' }, { url: 'https://x.test/2.jpg', altText: null }],
      variants: [variant],
      rating: 4.5,
      reviewCount: 12,
    })
  })
  it('has no rating without a summary', () => expect(toProduct({ ...detail, ratingSummary: undefined })).toMatchObject({ rating: null, reviewCount: 0 }))
  it('tolerates missing optional fields on the product and a variant', () => {
    const product = toProduct({ id: 'p1', name: 'X', variants: [{ id: 'v1', price: 100 }] })
    expect(product).toMatchObject({ brand: null, category: null, description: null, images: [], rating: null, reviewCount: 0 })
    expect(product.variants).toEqual([{ id: 'v1', size: null, color: null, colorHex: null, price: 100, stock: 0, imageUrl: null }])
  })
  it('drops a variant with no id or price', () => {
    expect(toProduct({ ...detail, variants: [{ ...variant, id: undefined }, { ...variant, price: 'x' }, null, variant] }).variants).toEqual([variant])
  })
  it('accepts a product with no variants', () => {
    expect(toProduct({ ...detail, variants: [] }).variants).toEqual([])
    expect(toProduct({ ...detail, variants: undefined }).variants).toEqual([])
  })
  it('accepts a product with no images and skips an image without a url', () => {
    expect(toProduct({ ...detail, images: [] }).images).toEqual([])
    expect(toProduct({ ...detail, images: [{ altText: 'x' }] }).images).toEqual([])
  })
  it('treats an archived product as not found', () => expect(() => toProduct({ ...detail, isActive: false })).toThrow(expect.objectContaining({ kind: 'not-found' })))
  it.each([null, 'x', 42, {}, { id: 'p1' }, { name: 'X' }])('rejects the bad shape %p', (bad) => {
    expect(() => toProduct(bad)).toThrow(expect.objectContaining({ kind: 'server' }))
  })
})

describe('fetchProduct', () => {
  it('requests the encoded id without a token', async () => {
    mockRequest.mockResolvedValue(detail)
    const signal = new AbortController().signal
    expect((await fetchProduct('a/b', signal)).id).toBe('p1')
    expect(mockRequest).toHaveBeenLastCalledWith('GET', '/products/a%2Fb', undefined, signal, { auth: false })
  })
  it('treats a 400 from a malformed id as not found', async () => {
    mockRequest.mockRejectedValue(new ApiError('validation', 'Validation failed (uuid is expected)', 400))
    await expect(fetchProduct('nope')).rejects.toMatchObject({ kind: 'not-found' })
  })
  it('keeps other failures as they are', async () => {
    mockRequest.mockRejectedValue(new ApiError('server', undefined, 500))
    await expect(fetchProduct('x')).rejects.toMatchObject({ kind: 'server' })
  })
  it('passes a 404 through', async () => {
    mockRequest.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await expect(fetchProduct('x')).rejects.toMatchObject({ kind: 'not-found' })
  })
})

it('sends category and price sort to the API', async () => {
  mockRequest.mockResolvedValue({ data: [], meta: { total: 0 } })
  await fetchProducts({ category: 'Hoodie', sortBy: 'price', sortOrder: 'desc', page: 1, limit: 12 })
  expect(mockRequest.mock.calls.at(-1)?.[1]).toBe('/products?page=1&limit=12&category=Hoodie&sortBy=price&sortOrder=desc')
})

it('keeps only categories that have products', () => {
  expect(toCategories({ categories: [{ name: 'Hoodie', count: 2 }, { name: 'Pants', count: 0 }] })).toEqual(['Hoodie'])
  expect(() => toCategories({})).toThrow(ApiError)
})

it('toCategories drops names that are blank or counted 0, and rejects a bad body', () => {
  expect(toCategories({ categories: [{ name: '', count: 3 }, { name: 'Pants', count: 0 }, { name: 'Shirt', count: '2' }] })).toEqual([])
  expect(() => toCategories(null)).toThrow(ApiError)
  expect(() => toCategories({ categories: 'x' })).toThrow(ApiError)
})
