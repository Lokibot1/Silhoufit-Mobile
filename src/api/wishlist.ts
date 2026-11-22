import { ApiError, isRecord, request, str } from '@/lib/api'
import { toListItem, type ProductListItem } from './products'

export type WishlistItem = { productId: string; savedAt: string; product: ProductListItem }

/** The saved pieces from a GET /wishlist body; an entry with a wrong shape is dropped, a wrong body throws ApiError('server'). */
export function toWishlist(body: unknown): WishlistItem[] {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new ApiError('server')
  return body.items.flatMap((entry) => {
    const productId = isRecord(entry) ? str(entry.productId) : null
    if (!isRecord(entry) || !productId) return []
    try {
      return [{ productId, savedAt: str(entry.createdAt) ?? '', product: toListItem(entry.product) }]
    } catch {
      return []
    }
  })
}

/** The saved product ids from a GET /wishlist/ids body. */
export function toWishlistIds(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.productIds)) throw new ApiError('server')
  return body.productIds.filter((id): id is string => typeof id === 'string')
}

/** GET /wishlist (signed in): every saved piece, newest first. An abort rejects with the AbortError itself. */
export async function fetchWishlist(signal?: AbortSignal): Promise<WishlistItem[]> {
  return toWishlist(await request('GET', '/wishlist', undefined, signal))
}

/** GET /wishlist/ids (signed in): just the ids, for a heart's state. */
export async function fetchWishlistIds(signal?: AbortSignal): Promise<string[]> {
  return toWishlistIds(await request('GET', '/wishlist/ids', undefined, signal))
}

/** POST /wishlist. Saving a piece that is already saved is fine (the API is idempotent). */
export async function addWishlistItem(productId: string): Promise<void> {
  await request('POST', '/wishlist', { productId })
}

/** DELETE /wishlist. Empties the whole list, including pieces hidden because they were archived. */
export async function clearWishlist(): Promise<void> {
  await request('DELETE', '/wishlist')
}

/** DELETE /wishlist/:productId. A piece that is not saved (404) is already the state wanted, so it counts as done. */
export async function removeWishlistItem(productId: string): Promise<void> {
  try {
    await request('DELETE', `/wishlist/${encodeURIComponent(productId)}`)
  } catch (error) {
    if (!(error instanceof ApiError && error.kind === 'not-found')) throw error
  }
}
