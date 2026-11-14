import { ApiError, isRecord, num, request, str } from '@/lib/api'

// Status values stay plain strings: one the API adds later reads as a neutral label and offers no actions.
export type OrderItem = { id: string; name: string; size: string | null; color: string | null; quantity: number; unitPrice: number; lineTotal: number; imageUrl: string | null }
export type Order = {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  subtotal: number
  shipping: number
  discount: number
  total: number
  createdAt: string
  paidAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  /** The address as it was when the order was placed; null when the API sent none. */
  address: { recipient: string | null; phone: string | null; line: string; city: string } | null
  items: OrderItem[]
  shipment: { status: string; pickupTime: string | null; deliveredAt: string | null } | null
}
export type OrdersPage = { items: Order[]; total: number; page: number; hasNextPage: boolean }

const join = (parts: unknown[]) => parts.map(str).filter(Boolean).join(', ')
const money = (value: number) => Math.round(value * 100) / 100

function toItem(raw: unknown): OrderItem {
  if (!isRecord(raw)) throw new ApiError('server')
  const id = str(raw.id)
  const name = str(raw.productName)
  const quantity = num(raw.quantity)
  const unitPrice = num(raw.unitPrice)
  if (!id || !name || quantity === null || unitPrice === null) throw new ApiError('server')
  return {
    id,
    name,
    size: str(raw.variantSize),
    color: str(raw.variantColor),
    quantity,
    unitPrice,
    lineTotal: num(raw.totalPrice) ?? money(unitPrice * quantity),
    imageUrl: str(raw.imageUrl),
  }
}

/** One order from a GET /orders or /orders/:id body; throws ApiError('server') on a wrong shape. */
export function toOrder(raw: unknown): Order {
  if (!isRecord(raw) || !Array.isArray(raw.items)) throw new ApiError('server')
  const id = str(raw.id)
  const orderNumber = str(raw.orderNumber)
  const status = str(raw.status)
  const createdAt = str(raw.createdAt)
  const total = num(raw.totalAmount)
  if (!id || !orderNumber || !status || !createdAt || total === null) throw new ApiError('server')
  const items = raw.items.map(toItem)
  const a = isRecord(raw.shippingAddressSnapshot) ? raw.shippingAddressSnapshot : null
  const s = isRecord(raw.shipment) ? raw.shipment : null
  return {
    id,
    orderNumber,
    status,
    paymentStatus: str(raw.paymentStatus) ?? '',
    subtotal: num(raw.subtotalAmount) ?? money(items.reduce((sum, item) => sum + item.lineTotal, 0)),
    shipping: num(raw.shippingAmount) ?? 0,
    discount: num(raw.discountAmount) ?? 0,
    total,
    createdAt,
    paidAt: str(raw.paidAt),
    cancelledAt: str(raw.cancelledAt),
    cancellationReason: str(raw.cancellationReason),
    address: a && { recipient: str(a.recipientName), phone: str(a.phone), line: join([a.streetAddress, a.addressLine2, a.barangay]), city: join([a.cityMunicipality, a.province, a.postalCode]) },
    items,
    shipment: s && str(s.status) ? { status: s.status as string, pickupTime: str(s.pickupTime), deliveredAt: str(s.deliveredAt) } : null,
  }
}

/** The page from a GET /orders body; throws ApiError('server') when the shape is wrong. */
export function toOrdersPage(body: unknown, requestedPage = 1): OrdersPage {
  const meta = isRecord(body) ? body.meta : null
  if (!isRecord(body) || !Array.isArray(body.data) || !isRecord(meta) || num(meta.total) === null) throw new ApiError('server')
  return { items: body.data.map(toOrder), total: num(meta.total) as number, page: Number(meta.page) || requestedPage, hasNextPage: meta.hasNextPage === true }
}

/** GET /orders, newest first (needs a session). */
export async function fetchOrdersPage({ page, limit }: { page: number; limit: number }, signal?: AbortSignal): Promise<OrdersPage> {
  return toOrdersPage(await request('GET', `/orders?page=${page}&limit=${limit}`, undefined, signal), page)
}

/** GET /orders/:id. The API answers 404 for another account's order too, so that is "not found". */
export async function fetchOrder(id: string, signal?: AbortSignal): Promise<Order> {
  try {
    return toOrder(await request('GET', `/orders/${encodeURIComponent(id)}`, undefined, signal))
  } catch (error) {
    // The id must be a UUID, so a malformed one answers 400: nothing exists at that address.
    if (error instanceof ApiError && error.status === 400) throw new ApiError('not-found', undefined, 400)
    throw error
  }
}

// Expo's global URL is spec-compliant (throws on "https://" or a relative address), so a parse plus a scheme check is enough.
function isHttps(url: string) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * POST /orders/:id/checkout-session. Resolves to the payment page address. No redirect URLs are sent (the API only accepts its allowed
 * origins), so the provider's default return page applies. Only a secure address is ever returned.
 */
export async function createCheckoutSession(orderId: string, signal?: AbortSignal): Promise<string> {
  const body = await request('POST', `/orders/${encodeURIComponent(orderId)}/checkout-session`, undefined, signal)
  const url = isRecord(body) ? str(body.checkoutUrl) : null
  if (!url || !isHttps(url)) throw new ApiError('server')
  return url
}

/** POST /orders/:id/cancel. A 400 means the order is no longer unpaid (the server's detail says why). The answer is ignored: the caller reloads. */
export async function cancelOrder(orderId: string, signal?: AbortSignal): Promise<void> {
  await request('POST', `/orders/${encodeURIComponent(orderId)}/cancel`, {}, signal)
}

const humanize = (value: string) => (value ? value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Unknown')

const STATUS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  PAID: 'Paid',
  PROCESSING: 'Preparing',
  DISPATCHED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}
const PAYMENT: Record<string, string> = { UNPAID: 'Unpaid', PENDING: 'Payment pending', PAID: 'Paid', FAILED: 'Payment failed', REFUNDED: 'Refunded' }
const SHIPMENT: Record<string, string> = {
  QUOTED: 'Not booked yet',
  PENDING_DISPATCH: 'Ready to book',
  DISPATCHING: 'Booking a rider',
  ASSIGNING_DRIVER: 'Finding a driver',
  ON_GOING: 'Driver on the way',
  PICKED_UP: 'Picked up',
  COMPLETED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Delivery failed',
}
export const statusLabel = (status: string) => STATUS[status] ?? humanize(status)
export const paymentLabel = (status: string) => PAYMENT[status] ?? humanize(status)
export const shipmentLabel = (status: string) => SHIPMENT[status] ?? humanize(status)

/** The API takes a payment, or a cancellation, only for an order still unpaid (waiting, or its last payment failed). Never for a paid one. */
export const awaitsPayment = ({ status, paymentStatus }: Pick<Order, 'status' | 'paymentStatus'>) =>
  (status === 'PENDING_PAYMENT' || status === 'PAYMENT_FAILED') && paymentStatus !== 'PAID'

/** The steps the API has a time for, in order: nothing is invented for stages with no timestamp. */
export function orderTimeline(order: Order): { label: string; at: string; note?: string }[] {
  const { shipment } = order
  const steps: { label: string; at: string | null; note?: string }[] = [
    { label: 'Placed', at: order.createdAt },
    { label: 'Paid', at: order.paidAt },
    { label: 'Handed to courier', at: shipment?.pickupTime ?? null },
    { label: 'Delivered', at: shipment?.deliveredAt ?? null },
    { label: 'Cancelled', at: order.cancelledAt, note: order.cancellationReason ?? undefined },
  ]
  return steps.filter((step): step is { label: string; at: string; note?: string } => step.at !== null)
}
