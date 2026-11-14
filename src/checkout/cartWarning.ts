import type { CartItem } from '@/api/cart'

/** What is wrong with a cart line right now (the server may have lowered the stock or pulled the product since it was added). Shared by Cart and Checkout. */
export function cartWarning({ quantity, variant, product }: CartItem): string | null {
  if (!product.active) return 'No longer available. Remove it from your cart.'
  if (variant.stock !== null && variant.stock <= 0) return 'Out of stock. Remove it from your cart.'
  if (variant.stock !== null && variant.stock < quantity) return `Only ${variant.stock} left. Lower the quantity.`
  return null
}
