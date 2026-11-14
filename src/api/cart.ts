import { ApiError, isRecord, request } from '@/lib/api'

/** POST /cart/items (needs a session). The answer is the whole cart; the Cart screen will parse it fully, for now it only has to be an object. */
export async function addCartItem(variantId: string, quantity: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const cart = await request('POST', '/cart/items', { variantId, quantity }, signal)
  if (!isRecord(cart)) throw new ApiError('server')
  return cart
}
