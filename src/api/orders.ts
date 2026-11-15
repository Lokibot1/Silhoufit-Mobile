import { ApiError, isHttps, isRecord, num, request, str } from '@/lib/api'

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
  updatedAt: string
  paidAt: string | null
  cancelledAt: string | null
  cancellationReason: string | null
  /** The address as it was when the order was placed; null when the API sent none. */
  address: { recipient: string | null; phone: string | null; line: string; city: string } | null
  items: OrderItem[]
  shipment: { status: string; pickupTime: string | null; deliveredAt: string | null; trackingUrl: string | null } | null
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
    updatedAt: str(raw.updatedAt) ?? createdAt,
    paidAt: str(raw.paidAt),
    cancelledAt: str(raw.cancelledAt),
    cancellationReason: str(raw.cancellationReason),
    address: a && { recipient: str(a.recipientName), phone: str(a.phone), line: join([a.streetAddress, a.addressLine2, a.barangay]), city: join([a.cityMunicipality, a.province, a.postalCode]) },
    items,
    shipment: s && str(s.status) ? { status: s.status as string, pickupTime: str(s.pickupTime), deliveredAt: str(s.deliveredAt), trackingUrl: str(s.trackingUrl) } : null,
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

const ALL_LIMIT = 100
const ALL_PAGES = 5

/** Every order of the account, newest first: follows hasNextPage and drops a row a moving page repeated. */
// shortcut: max 500 orders, add a counts endpoint if customers exceed it
export async function fetchAllOrders(signal?: AbortSignal): Promise<Order[]> {
  const byId = new Map<string, Order>()
  for (let page = 1; page <= ALL_PAGES; page++) {
    const result = await fetchOrdersPage({ page, limit: ALL_LIMIT }, signal)
    for (const order of result.items) if (!byId.has(order.id)) byId.set(order.id, order)
    if (!result.hasNextPage) break
  }
  return [...byId.values()]
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

export type OrderTab = 'all' | 'to-pay' | 'to-ship' | 'to-receive' | 'completed' | 'cancelled' | 'returns'

/** The status tabs, grouped as on the web. A tab with `statuses: null` shows everything; a status the API adds later shows under All only. */
export const ORDER_TABS: { id: OrderTab; label: string; statuses: string[] | null }[] = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'to-pay', label: 'To pay', statuses: ['PENDING_PAYMENT', 'PAYMENT_FAILED'] },
  { id: 'to-ship', label: 'To ship', statuses: ['PAID', 'PROCESSING'] },
  { id: 'to-receive', label: 'To receive', statuses: ['DISPATCHED', 'OUT_FOR_DELIVERY'] },
  { id: 'completed', label: 'Completed', statuses: ['DELIVERED'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
  { id: 'returns', label: 'Returns/Refund', statuses: ['REFUNDED'] },
]

export function matchesTab(order: Pick<Order, 'status'>, tab: OrderTab) {
  const statuses = ORDER_TABS.find((t) => t.id === tab)?.statuses
  return !statuses || statuses.includes(order.status)
}

export const tabCounts = (orders: Pick<Order, 'status'>[]) =>
  Object.fromEntries(ORDER_TABS.map((tab) => [tab.id, orders.filter((order) => matchesTab(order, tab.id)).length])) as Record<OrderTab, number>

/** The courier's tracking page for an order on its way; only a secure (https) address is ever linked. */
export function trackingLink({ status, shipment }: Pick<Order, 'status' | 'shipment'>): string | null {
  const url = shipment?.trackingUrl
  return (status === 'DISPATCHED' || status === 'OUT_FOR_DELIVERY') && url && /^https:\/\//i.test(url) ? url : null
}

export type StepState = 'done' | 'current' | 'upcoming' | 'cancelled'
export type TimelineStep = { key: string; label: string; at: string | null; state: StepState; note?: string }

// Same stages as the web. A stage reached by status but with no timestamp stays timeless: nothing is invented.
const FLOW = [
  { key: 'placed', label: 'Placed' },
  { key: 'paid', label: 'Paid' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'out', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
]
// The stage each live status is working on; stages before it are done. DELIVERED has none left.
const CURRENT_STEP = new Map([['PENDING_PAYMENT', 1], ['PAYMENT_FAILED', 1], ['PAID', 2], ['PROCESSING', 2], ['DISPATCHED', 3], ['OUT_FOR_DELIVERY', 4]])

/** The order's journey: done / current / upcoming stages. Cancelled stops at Cancelled; Refunded shows what happened, then Refunded. */
export function buildTimeline(order: Order): TimelineStep[] {
  const stamps = [order.createdAt, order.paidAt, null, order.shipment?.pickupTime ?? null, null, order.shipment?.deliveredAt ?? null]
  const placed: TimelineStep = { key: 'placed', label: 'Placed', at: order.createdAt, state: 'done' }
  if (order.status === 'CANCELLED') {
    return [placed, { key: 'cancelled', label: 'Cancelled', at: order.cancelledAt, state: 'cancelled', note: order.cancellationReason ?? undefined }]
  }
  if (order.status === 'REFUNDED') {
    const reached = order.shipment?.deliveredAt ? 6 : order.shipment?.pickupTime ? 4 : order.paidAt ? 2 : 1
    const done = FLOW.slice(0, reached).map((step, i): TimelineStep => ({ ...step, at: stamps[i], state: 'done' }))
    return [...done, { key: 'refunded', label: 'Refunded', at: null, state: 'current' }]
  }
  const current = order.status === 'DELIVERED' ? FLOW.length : CURRENT_STEP.get(order.status)
  if (current === undefined) return [placed] // a status the API adds later: claim nothing beyond the placement
  return FLOW.map((step, i): TimelineStep => {
    const state: StepState = i < current ? 'done' : i === current ? 'current' : 'upcoming'
    const failed = step.key === 'paid' && order.status === 'PAYMENT_FAILED'
    return { ...step, label: failed ? 'Payment failed' : step.label, at: state === 'upcoming' ? null : stamps[i], state }
  })
}

const CLOSED = ['DELIVERED', 'CANCELLED', 'REFUNDED']
/** No further status change can come: live polling of the order stops. */
export const isClosed = ({ status }: Pick<Order, 'status'>) => CLOSED.includes(status)

/** What a customer can see change on an order; two reads with the same signature need no re-render. */
export const orderSignature = (o: Order) =>
  [o.id, o.status, o.paymentStatus, o.total, o.updatedAt, o.paidAt, o.cancelledAt, o.cancellationReason, o.shipment?.status, o.shipment?.pickupTime, o.shipment?.deliveredAt, o.shipment?.trackingUrl].join('|')
export const ordersSignature = (orders: Order[]) => orders.map(orderSignature).join('\n')

export type NotificationEvent = { id: string; orderId: string; orderNumber: string; kind: string; label: string; at: string; note?: string }
/** Stages the API keeps no time for: their event is dated with the order's last update instead. */
export const STAGE_KINDS = ['PROCESSING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'PAYMENT_FAILED', 'REFUNDED']

/** Order updates built on the device from real timestamps, newest first; an order with none yields nothing.
 *  An event dated in the future (a scheduled courier pickup) or with an unparseable time is left out until it is real. */
export function orderUpdates(orders: Order[]): NotificationEvent[] {
  return orders
    .flatMap((order) => {
      const times: { kind: string; label: string; at: string | null; note?: string }[] = [
        { kind: 'paid', label: 'Payment received', at: order.paidAt },
        { kind: 'courier', label: 'Handed to courier', at: order.shipment?.pickupTime ?? null },
        { kind: 'delivered', label: 'Delivered', at: order.shipment?.deliveredAt ?? null },
        { kind: 'cancelled', label: 'Cancelled', at: order.cancelledAt, note: order.cancellationReason ?? undefined },
      ]
      if (STAGE_KINDS.includes(order.status)) times.push({ kind: order.status, label: statusLabel(order.status), at: order.updatedAt })
      const now = Date.now()
      return times
        .filter((t): t is typeof t & { at: string } => t.at !== null && Date.parse(t.at) <= now)
        .map(({ kind, label, at, note }) => ({ id: `${order.id}-${kind}`, orderId: order.id, orderNumber: order.orderNumber, kind, label, at, ...(note ? { note } : {}) }))
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export type ShippingQuote = { quotationId: string; courier: string; shippingFee: number; expiresAt: string }

/** POST /orders/quote-shipping. Throws ApiError('server') when the answer lacks an id, a fee or a valid expiry. */
export async function quoteShipping(addressId: string, signal?: AbortSignal): Promise<ShippingQuote> {
  const body = await request('POST', '/orders/quote-shipping', { addressId }, signal)
  if (!isRecord(body)) throw new ApiError('server')
  const quotationId = str(body.quotationId)
  const shippingFee = num(body.shippingFee)
  const expiresAt = str(body.expiresAt)
  if (!quotationId || shippingFee === null || !expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new ApiError('server')
  return { quotationId, courier: str(body.courier) ?? 'Courier', shippingFee, expiresAt }
}

/** POST /orders. The API rejects unknown keys, so the body holds only these (quotationId only when given). */
export async function createOrder(input: { addressId: string; cartItemIds: string[]; quotationId?: string }, signal?: AbortSignal): Promise<Order> {
  const { addressId, cartItemIds, quotationId } = input
  return toOrder(await request('POST', '/orders', { addressId, cartItemIds, ...(quotationId !== undefined && { quotationId }) }, signal))
}
