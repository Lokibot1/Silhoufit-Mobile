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
