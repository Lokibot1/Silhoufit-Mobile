import { ApiError, isRecord, num, request, str } from '@/lib/api'

export type CartItem = {
  id: string
  quantity: number
  /** Price of the whole line, as the API computed it. */
  lineTotal: number
  /** `stock` is null when the API did not send it: the screen then sets no ceiling. */
  variant: { id: string; size: string | null; color: string | null; price: number; stock: number | null; imageUrl: string | null }
  product: { id: string; name: string; image: string | null; active: boolean }
}
export type Cart = { items: CartItem[]; totalItems: number; subtotal: number }

function toItem(raw: unknown): CartItem {
  if (!isRecord(raw) || !isRecord(raw.variant) || !isRecord(raw.variant.product)) throw new ApiError('server')
  const variant = raw.variant
  const product = raw.variant.product
  const id = str(raw.id)
  const variantId = str(variant.id) ?? str(raw.variantId)
  const quantity = num(raw.quantity)
  const price = num(variant.price) ?? num(raw.unitPrice)
  const name = str(product.name)
  if (!id || !variantId || quantity === null || price === null || !name) throw new ApiError('server')
  return {
    id,
    quantity,
    lineTotal: num(raw.totalPrice) ?? Math.round(price * quantity * 100) / 100,
    variant: { id: variantId, size: str(variant.size), color: str(variant.color), price, stock: num(variant.stock), imageUrl: str(variant.imageUrl) },
    product: { id: str(product.id) ?? '', name, image: str(product.imageUrl) ?? str(variant.imageUrl), active: product.isActive !== false },
  }
}

/** Parses the whole-cart answer. Totals the API left out are summed from the items. */
export function toCart(body: unknown): Cart {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new ApiError('server')
  const items = body.items.map(toItem)
  return {
    items,
    totalItems: num(body.totalItems) ?? items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: num(body.subtotal) ?? Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100,
  }
}

/** GET /cart (needs a session). */
export async function fetchCart(signal?: AbortSignal): Promise<Cart> {
  return toCart(await request('GET', '/cart', undefined, signal))
}

/** POST /cart/items (needs a session). The answer is the whole cart; the Product page ignores it, so it only has to be an object. */
export async function addCartItem(variantId: string, quantity: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const cart = await request('POST', '/cart/items', { variantId, quantity }, signal)
  if (!isRecord(cart)) throw new ApiError('server')
  return cart
}

/** PATCH /cart/items/:id. Answers the whole cart; a 400 means the quantity is past the stock (the server's detail explains). */
export async function setCartItemQuantity(itemId: string, quantity: number, signal?: AbortSignal): Promise<Cart> {
  return toCart(await request('PATCH', `/cart/items/${encodeURIComponent(itemId)}`, { quantity }, signal))
}

/** DELETE /cart/items/:id. The API answers only `{ success: true }`, so the caller reloads the cart. */
export async function removeCartItem(itemId: string, signal?: AbortSignal): Promise<void> {
  await request('DELETE', `/cart/items/${encodeURIComponent(itemId)}`, undefined, signal)
}

/** DELETE /cart/items with `{ itemIds }`. All or nothing: a 404 means an id is gone and nothing was removed. Answers the whole cart. */
export async function removeCartItems(itemIds: string[], signal?: AbortSignal): Promise<Cart> {
  return toCart(await request('DELETE', '/cart/items', { itemIds }, signal))
}

/** DELETE /cart. Empties the cart; answers only `{ success: true }`. */
export async function clearCart(signal?: AbortSignal): Promise<void> {
  await request('DELETE', '/cart', undefined, signal)
}
