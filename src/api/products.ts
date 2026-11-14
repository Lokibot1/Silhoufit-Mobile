import { ApiError, isNum, isRecord, request, str } from '@/lib/api'

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
}
export type ProductPage = { items: ProductListItem[]; total: number; page: number; hasNextPage: boolean }

function toListItem(value: unknown): ProductListItem {
  if (!isRecord(value)) throw new ApiError('server')
  const { id, name, minPrice, maxPrice, totalStock, primaryImage, ratingSummary } = value
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
  }
}

/** The page from a GET /products body; throws ApiError('server') when the shape is wrong. */
export function toProductPage(body: unknown, requestedPage = 1): ProductPage {
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isNum(meta.total)) throw new ApiError('server')
  return { items: body.data.map(toListItem), total: meta.total || body.data.length, page: Number(meta.page) || requestedPage, hasNextPage: meta.hasNextPage === true }
}

/** GET /products (public: no sign-in needed). An abort rejects with the AbortError itself. */
export async function fetchProducts({ search, page, limit }: { search?: string; page: number; limit: number }, signal?: AbortSignal): Promise<ProductPage> {
  const query = [`page=${page}`, `limit=${limit}`]
  if (search?.trim()) query.push(`search=${encodeURIComponent(search.trim())}`)
  return toProductPage(await request('GET', `/products?${query.join('&')}`, undefined, signal, { auth: false }), page)
}
