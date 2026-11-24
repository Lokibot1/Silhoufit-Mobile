import { ApiError, isRecord, request, str } from '@/lib/api'

const PAGE_SIZE = 20

export type NotificationItem = {
  id: string
  type: string
  /** Display-ready English from the server. */
  title: string
  body: string | null
  data: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}
export type NotificationsPage = { items: NotificationItem[]; total: number; page: number; hasNextPage: boolean }

/** The trust boundary: an entry without an id, title and time is dropped; the rest is coerced. */
export function toNotification(value: unknown): NotificationItem | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const title = str(value.title)
  const createdAt = str(value.createdAt)
  if (!id || !title || !createdAt) return null
  return { id, type: str(value.type) ?? '', title, body: str(value.body), data: isRecord(value.data) && !Array.isArray(value.data) ? value.data : null, readAt: str(value.readAt), createdAt }
}

const listeners = new Set<() => void>()

/** Calls `run` after a notification was marked read, so the tab badge and the screen read again. Returns the unsubscribe. */
export function onNotificationsChanged(run: () => void): () => void {
  listeners.add(run)
  return () => {
    listeners.delete(run)
  }
}
const changed = () => listeners.forEach((run) => run())

/** GET /notifications, newest first. An entry with a wrong shape is dropped; a body with the wrong shape throws ApiError('server'). */
export async function fetchNotifications({ page, unreadOnly }: { page: number; unreadOnly: boolean }, signal?: AbortSignal): Promise<NotificationsPage> {
  const body = await request('GET', `/notifications?page=${page}&limit=${PAGE_SIZE}${unreadOnly ? '&unreadOnly=true' : ''}`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ApiError('server')
  const items = body.data.flatMap((entry) => toNotification(entry) ?? [])
  const meta = isRecord(body.meta) ? body.meta : {}
  return { items, total: typeof meta.total === 'number' ? meta.total : items.length, page, hasNextPage: meta.hasNextPage === true }
}

/** GET /notifications/unread-count. */
export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const body = await request('GET', '/notifications/unread-count', undefined, signal)
  if (!isRecord(body) || typeof body.count !== 'number' || !Number.isFinite(body.count)) throw new ApiError('server')
  return body.count
}

/** POST /notifications/:id/read (idempotent). */
export async function markNotificationRead(id: string): Promise<void> {
  await request('POST', `/notifications/${encodeURIComponent(id)}/read`)
  changed()
}

/** POST /notifications/read-all. */
export async function markAllNotificationsRead(): Promise<void> {
  await request('POST', '/notifications/read-all')
  changed()
}

/** The order a notification is about, when it names one. */
export const notificationOrderId = (n: NotificationItem) => (typeof n.data?.orderId === 'string' && n.data.orderId ? n.data.orderId : null)

/** A messaging block or unblock leads to Messages, where the notice and its reason already show. */
export const notificationOpensMessages = (n: NotificationItem) => n.type === 'MESSAGING_BLOCKED' || n.type === 'MESSAGING_UNBLOCKED'

export type Tone = 'success' | 'info' | 'warning' | 'danger'

const TONES: Record<string, Tone> = {
  ORDER_PAID: 'success',
  REFUND_SUCCEEDED: 'success',
  MESSAGING_UNBLOCKED: 'success',
  PRODUCT_LOW_STOCK: 'warning',
  REFUND_ACTION_REQUIRED: 'warning',
  PAYMENT_FAILED: 'danger',
  ORDER_CANCELLED: 'danger',
  PRODUCT_SOLD_OUT: 'danger',
  MESSAGING_BLOCKED: 'danger',
}

/** The accent a notification's toast takes; anything not listed is plain info. */
export const notificationTone = (type: string): Tone => TONES[type] ?? 'info'
