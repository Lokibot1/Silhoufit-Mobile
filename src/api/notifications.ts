import { ApiError, isRecord, request, str } from '@/lib/api'
import { supabase } from '@/lib/supabase'

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

type Listener = { onNotification: (notification: NotificationItem) => void; onStatus: (status: string) => void }
type Shared = { listeners: Set<Listener>; status?: string; stop: () => void }

// One live channel for the signed-in user: supabase-js hands back the same channel for a topic and it cannot take listeners once joined, so the
// tab bar and the Notifications screen share one that closes when the last of them leaves.
let open: Shared | undefined
// removeChannel answers asynchronously and the old channel stays registered under its topic until it does; a listener that comes back
// meanwhile would be handed that dying channel and never hear a notification.
let closing: Promise<unknown> = Promise.resolve()

function connect(shared: Shared) {
  let stopped = false
  let stop = () => {}
  const emit = (status: string) => {
    shared.status = status
    shared.listeners.forEach((listener) => listener.onStatus(status))
  }
  void (async () => {
    try {
      await closing
      if (stopped) return
      const { data } = await supabase.auth.getSession()
      if (stopped) return
      if (!data.session) return emit('CHANNEL_ERROR')
      await supabase.realtime.setAuth(data.session.access_token) // the private channel must join with this user's token, not the anon key
      if (stopped) return
      const channel = supabase
        .channel(`notifications:user:${data.session.user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'notification.created' }, ({ payload }) => {
          const notification = toNotification(payload)
          if (notification) shared.listeners.forEach((listener) => listener.onNotification(notification))
        })
        .subscribe((status) => !stopped && emit(status))
      stop = () => {
        closing = supabase.removeChannel(channel).catch(() => {})
      }
    } catch {
      if (!stopped) emit('CHANNEL_ERROR')
    }
  })()
  return () => {
    stopped = true
    stop()
  }
}

/**
 * Listens for the `notification.created` broadcasts the API sends on the signed-in user's private topic `notifications:user:{id}`. `onStatus` gets the
 * channel status (SUBSCRIBED on every join and rejoin, CHANNEL_ERROR, TIMED_OUT, CLOSED); with no session it gets CHANNEL_ERROR. supabase-js gives
 * the session token to Realtime by itself. Returns the unsubscribe.
 */
export function subscribeToNotifications(onNotification: Listener['onNotification'], onStatus: Listener['onStatus']) {
  const listener: Listener = { onNotification, onStatus }
  if (!open) {
    open = { listeners: new Set(), stop: () => {} }
    open.stop = connect(open)
  }
  const entry = open
  entry.listeners.add(listener)
  if (entry.status) onStatus(entry.status)
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      if (open === entry) open = undefined
      entry.stop()
    }
  }
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
