import { ApiError, isHttps, isNum, isRecord, num, request, str } from '@/lib/api'

export const REVIEWS_PER_PAGE = 10
export type ReviewSort = 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'

export type Review = {
  id: string
  /** 1 to 5. */
  rating: number
  comment: string | null
  name: string
  avatarUrl: string | null
  photos: string[]
  /** What the reviewer bought, e.g. "M, Navy". */
  purchased: string | null
  adminReply: string | null
  createdAt: string
}
export type ReviewSummary = { averageRating: number; totalReviews: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> }
export type ReviewsPage = { reviews: Review[]; page: number; totalPages: number; total: number; summary: ReviewSummary }

// Privacy: first name and last initial only ("Ana C."), never the full name.
function publicName(full: string | null): string {
  const parts = (full ?? '').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'KRAL customer'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${Array.from(parts[parts.length - 1])[0]}.`
}

// Only https images are rendered; anything else falls back (no photo, or initials).
const httpsUrl = (value: unknown) => {
  const url = str(value)
  return url && isHttps(url) ? url : null
}

function toReview(value: unknown): Review {
  if (!isRecord(value) || !isRecord(value.user)) throw new ApiError('server')
  const { id, rating, createdAt, user } = value
  if (!str(id) || !str(createdAt) || !isNum(rating) || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError('server')
  const names = [str(user.firstName), str(user.lastName)].filter(Boolean).join(' ')
  const variants = (Array.isArray(value.purchasedVariants) ? value.purchasedVariants : []).filter(isRecord).map((v) => [str(v.size), str(v.color)].filter(Boolean).join(', ')).filter(Boolean)
  return {
    id: id as string,
    rating,
    comment: str(value.comment),
    name: publicName(str(user.fullName) ?? (names || null)),
    avatarUrl: httpsUrl(user.avatarUrl),
    photos: (Array.isArray(value.images) ? value.images : []).filter(isRecord).flatMap((image) => httpsUrl(image.url) ?? []),
    purchased: [...new Set(variants)].join(' / ') || null,
    adminReply: str(value.adminReply),
    createdAt: createdAt as string,
  }
}

function toSummary(value: unknown): ReviewSummary {
  if (!isRecord(value) || !isNum(value.averageRating) || !isNum(value.totalReviews) || !isRecord(value.ratingDistribution)) throw new ApiError('server')
  const d = value.ratingDistribution
  const count = (n: number) => num(d[n]) ?? 0
  return { averageRating: value.averageRating, totalReviews: value.totalReviews, distribution: { 1: count(1), 2: count(2), 3: count(3), 4: count(4), 5: count(5) } }
}

/** A page from a GET /products/:id/reviews body (the rating summary rides along); throws ApiError('server') on a wrong shape. */
export function toReviewsPage(body: unknown, requestedPage = 1): ReviewsPage {
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || !isNum(meta.total)) throw new ApiError('server')
  return {
    reviews: body.data.map(toReview),
    page: Number(meta.page) || requestedPage,
    totalPages: Number(meta.totalPages) || 1,
    total: meta.total,
    summary: toSummary(body.summary),
  }
}

export type ReviewsQuery = { page: number; rating?: number; hasImages?: boolean; sortBy: ReviewSort }

/** GET /products/:id/reviews (public: no sign-in needed). An abort rejects with the AbortError itself. */
export async function fetchProductReviews(productId: string, { page, rating, hasImages, sortBy }: ReviewsQuery, signal?: AbortSignal): Promise<ReviewsPage> {
  const query = [`page=${page}`, `limit=${REVIEWS_PER_PAGE}`, `sortBy=${sortBy}`]
  if (rating) query.push(`rating=${rating}`)
  if (hasImages) query.push('hasImages=true')
  return toReviewsPage(await request('GET', `/products/${encodeURIComponent(productId)}/reviews?${query.join('&')}`, undefined, signal, { auth: false }), page)
}

// Tells the open product page and order screen that a review was saved, so each refetches quietly.
const listeners = new Set<() => void>()
export const onReviewsChanged = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
export const notifyReviewsChanged = () => listeners.forEach((listener) => listener())

/** A delivered product of one order that still awaits the customer's review. `variations` are the order lines that hold it. */
export type PendingReview = { orderId: string; productId: string; name: string; image: string | null; variations: { orderItemId: string; size: string | null; color: string | null }[] }
/** A review the signed-in customer wrote; `skus` are the variants of it they bought, which ties it to an order line. */
export type MyReview = { id: string; orderId: string; productId: string; rating: number; comment: string | null; photos: string[]; skus: string[]; createdAt: string }
export type OrderReviews = { pending: PendingReview[]; mine: MyReview[] }

function toPending(value: unknown): PendingReview | null {
  if (!isRecord(value) || !isRecord(value.product) || !str(value.orderId) || !str(value.product.id) || !str(value.product.name)) return null
  return {
    orderId: value.orderId as string,
    productId: value.product.id as string,
    name: value.product.name as string,
    image: httpsUrl(value.product.primaryImage),
    variations: (Array.isArray(value.variations) ? value.variations : []).filter(isRecord).flatMap((v) => (str(v.orderItemId) ? [{ orderItemId: v.orderItemId as string, size: str(v.size), color: str(v.color) }] : [])),
  }
}

function toMine(value: unknown): MyReview | null {
  if (!isRecord(value) || !str(value.id) || !str(value.orderId) || !str(value.productId) || !isNum(value.rating) || !Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5 || !str(value.createdAt)) return null
  return {
    id: value.id as string,
    orderId: value.orderId as string,
    productId: value.productId as string,
    rating: value.rating,
    comment: str(value.comment),
    photos: (Array.isArray(value.images) ? value.images : []).filter(isRecord).flatMap((image) => httpsUrl(image.url) ?? []),
    skus: (Array.isArray(value.purchasedVariants) ? value.purchasedVariants : []).filter(isRecord).flatMap((v) => str(v.sku) ?? []),
    createdAt: value.createdAt as string,
  }
}

const MAX_PAGES = 20

/** One order's reviews: its products still to review (GET /reviews/pending) and the ones already reviewed (GET /reviews/me, every page). */
export async function fetchOrderReviews(orderId: string, signal?: AbortSignal): Promise<OrderReviews> {
  const get = async (path: string) => request('GET', path, undefined, signal)
  const [pending, first] = await Promise.all([get('/reviews/pending'), get('/reviews/me?page=1&limit=50')])
  if (!Array.isArray(pending) || !isRecord(first) || !Array.isArray(first.data)) throw new ApiError('server')
  const rows = [...first.data]
  const totalPages = isRecord(first.meta) ? Number(first.meta.totalPages) || 1 : 1
  for (let page = 2; page <= Math.min(totalPages, MAX_PAGES); page += 1) {
    const next = await get(`/reviews/me?page=${page}&limit=50`)
    if (!isRecord(next) || !Array.isArray(next.data)) throw new ApiError('server')
    rows.push(...next.data)
  }
  const ofOrder = <T extends { orderId: string }>(item: T | null): item is T => item !== null && item.orderId === orderId
  return { pending: pending.map(toPending).filter(ofOrder), mine: rows.map(toMine).filter(ofOrder) }
}

export type ReviewBody = { rating: number; comment: string; imageUrls?: string[]; orderItemId?: string }

/** POST /orders/:orderId/products/:productId/reviews. A 409 means this product is already reviewed on the order. Returns the saved review, whose comment may have profanity masked. */
export async function createReview(orderId: string, productId: string, body: ReviewBody, signal?: AbortSignal): Promise<MyReview | null> {
  return toMine(await request('POST', `/orders/${encodeURIComponent(orderId)}/products/${encodeURIComponent(productId)}/reviews`, body, signal))
}

/** PATCH /reviews/:id. `imageUrls` replaces every photo the review has. Returns the saved review. */
export async function updateReview(id: string, body: Omit<ReviewBody, 'orderItemId'>, signal?: AbortSignal): Promise<MyReview | null> {
  return toMine(await request('PATCH', `/reviews/${encodeURIComponent(id)}`, body, signal))
}
