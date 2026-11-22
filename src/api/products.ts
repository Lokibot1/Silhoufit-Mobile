import { ApiError, isNum, isRecord, request, str } from '@/lib/api'
import { toMeasurements, type Measurements } from './sizeMeasurements'

// The list payload carries no sizes or variants; stock is the API's `totalStock`.
export type ProductListItem = {
  id: string
  name: string
  minPrice: number | null
  maxPrice: number | null
  totalStock: number | null
  imageUrl: string | null
  rating: number | null
  reviewCount: number
  soldCount?: number | null // units sold, from the API's `soldCount`; null when absent
  avgDeliveryMinutes?: number | null // from the API's `avgDeliveryMinutes`; null when there is not enough data
}
export type ProductPage = { items: ProductListItem[]; total: number; page: number; hasNextPage: boolean }

/** One product card from a list payload (GET /products, GET /wishlist); throws ApiError('server') on a wrong shape. */
export function toListItem(value: unknown): ProductListItem {
  if (!isRecord(value)) throw new ApiError('server')
  const { id, name, minPrice, maxPrice, totalStock, primaryImage, ratingSummary, soldCount, avgDeliveryMinutes } = value
  if (!str(id) || !str(name)) throw new ApiError('server')
  const rated = isRecord(ratingSummary) && isNum(ratingSummary.averageRating) && isNum(ratingSummary.reviewCount)
  return {
    id: id as string,
    name: name as string,
    minPrice: isNum(minPrice) ? minPrice : null,
    maxPrice: isNum(maxPrice) ? maxPrice : null,
    totalStock: isNum(totalStock) ? totalStock : null,
    imageUrl: isRecord(primaryImage) ? str(primaryImage.url) : null,
    rating: rated ? (ratingSummary.averageRating as number) : null,
    reviewCount: rated ? (ratingSummary.reviewCount as number) : 0,
    soldCount: isNum(soldCount) && soldCount > 0 ? soldCount : null,
    avgDeliveryMinutes: isNum(avgDeliveryMinutes) && avgDeliveryMinutes > 0 ? avgDeliveryMinutes : null,
  }
}

/** The page from a GET /products body; throws ApiError('server') when the shape is wrong. */
export function toProductPage(body: unknown, requestedPage = 1): ProductPage {
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isNum(meta.total)) throw new ApiError('server')
  return { items: body.data.map(toListItem), total: meta.total || body.data.length, page: Number(meta.page) || requestedPage, hasNextPage: meta.hasNextPage === true }
}

export type ProductVariant = { id: string; size: string | null; color: string | null; colorHex: string | null; price: number; stock: number; imageUrl: string | null; measurements: Measurements | null }
export type Product = {
  id: string
  name: string
  brand: string | null
  category: string | null
  description: string | null
  images: { url: string; altText: string | null }[]
  variants: ProductVariant[]
  rating: number | null
  reviewCount: number
  soldCount: number // units sold, from the API's `soldCount`; 0 when absent
}

// A variant without an id or a price cannot be bought, so it is dropped; a missing stock counts as none.
function toVariant(value: unknown): ProductVariant | null {
  if (!isRecord(value) || !str(value.id) || !isNum(value.price)) return null
  return {
    id: value.id as string,
    size: str(value.size),
    color: str(value.color),
    colorHex: str(value.colorHex),
    price: value.price,
    stock: isNum(value.stock) ? value.stock : 0,
    imageUrl: str(value.imageUrl),
    measurements: toMeasurements(value.measurements),
  }
}

/** The product from a GET /products/:id body; throws ApiError('server') on a wrong shape and 'not-found' for an archived product. */
export function toProduct(body: unknown): Product {
  if (!isRecord(body) || !str(body.id) || !str(body.name)) throw new ApiError('server')
  if (body.isActive === false) throw new ApiError('not-found')
  const order = (image: Record<string, unknown>) => (isNum(image.displayOrder) ? image.displayOrder : 0)
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(isRecord)
    .filter((image) => str(image.url))
    .sort((a, b) => Number(b.isPrimary === true) - Number(a.isPrimary === true) || order(a) - order(b))
    .map((image) => ({ url: image.url as string, altText: str(image.altText) }))
  const { ratingSummary } = body
  const rated = isRecord(ratingSummary) && isNum(ratingSummary.averageRating) && isNum(ratingSummary.reviewCount)
  return {
    id: body.id as string,
    name: body.name as string,
    brand: str(body.brand),
    category: str(body.category),
    description: str(body.description),
    images,
    variants: (Array.isArray(body.variants) ? body.variants : []).map(toVariant).filter((variant) => variant !== null),
    rating: rated ? (ratingSummary.averageRating as number) : null,
    reviewCount: rated ? (ratingSummary.reviewCount as number) : 0,
    soldCount: isNum(body.soldCount) && body.soldCount > 0 ? body.soldCount : 0,
  }
}

/** GET /products/:id (public: no sign-in needed). An abort rejects with the AbortError itself. */
export async function fetchProduct(id: string, signal?: AbortSignal): Promise<Product> {
  try {
    return toProduct(await request('GET', `/products/${encodeURIComponent(id)}`, undefined, signal, { auth: false }))
  } catch (error) {
    // The API validates the id as a UUID, so a malformed one answers 400: nothing exists at that address.
    if (error instanceof ApiError && error.status === 400) throw new ApiError('not-found', undefined, 400)
    throw error
  }
}

export type ProductSort = { sortBy?: 'price'; sortOrder?: 'asc' | 'desc' }
type ProductQuery = ProductSort & { search?: string; category?: string; page: number; limit: number }

/** GET /products (public: no sign-in needed). An abort rejects with the AbortError itself. Without a sort the API answers newest first. */
export async function fetchProducts({ search, category, sortBy, sortOrder, page, limit }: ProductQuery, signal?: AbortSignal): Promise<ProductPage> {
  const query = [`page=${page}`, `limit=${limit}`]
  if (search?.trim()) query.push(`search=${encodeURIComponent(search.trim())}`)
  if (category) query.push(`category=${encodeURIComponent(category)}`)
  if (sortBy) query.push(`sortBy=${sortBy}`, `sortOrder=${sortOrder ?? 'asc'}`)
  return toProductPage(await request('GET', `/products?${query.join('&')}`, undefined, signal, { auth: false }), page)
}

/** The categories that have at least one product, from a GET /products/filters body. */
export function toCategories(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.categories)) throw new ApiError('server')
  return body.categories.filter(isRecord).filter((category) => str(category.name) && isNum(category.count) && category.count > 0).map((category) => category.name as string)
}

/** GET /products/filters (public: no sign-in needed). */
export async function fetchCategories(signal?: AbortSignal): Promise<string[]> {
  return toCategories(await request('GET', '/products/filters', undefined, signal, { auth: false }))
}
