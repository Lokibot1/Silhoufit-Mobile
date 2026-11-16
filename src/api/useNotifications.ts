import { useCallback, useEffect, useRef, useState } from 'react'

import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { useLivePoll } from '@/lib/useLivePoll'
import { useToast } from '@/ui/toast'

import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, onNotificationsChanged, type NotificationItem } from './notifications'

type Page = { items: NotificationItem[]; hasNextPage: boolean; page: number }
const EMPTY: Page = { items: [], hasNextPage: false, page: 1 }

/**
 * The signed-in customer's notifications from the server. The unread count is polled alone; the list is read only while `list` is on
 * (the screen) and again whenever the count changes. Marking read is optimistic and rolls back on failure. Always empty signed out.
 */
export function useNotifications({ list = true }: { list?: boolean } = {}) {
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const toast = useToast()
  const [count, setCount] = useState<number | null>(null)
  const [unreadOnly, setUnreadOnlyState] = useState(false)
  const [shown, setShown] = useState<Page>(EMPTY)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<ApiError | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const loaded = useRef(false) // something is on screen: a later failure toasts instead of replacing it
  // What the stable callbacks below read.
  const live = useRef({ count, shown, unreadOnly, list })
  useEffect(() => {
    live.current = { count, shown, unreadOnly, list }
  })

  // A different account must not inherit the previous one's notifications: reset while rendering, before the fetch effects run.
  const [owner, setOwner] = useState(userId)
  if (owner !== userId) {
    setOwner(userId)
    setCount(null)
    setUnreadOnlyState(false)
    setShown(EMPTY)
    setStatus('loading')
    setError(null)
  }

  // A failed read toasts when the list is already on screen; `quiet` (a background refresh) says nothing.
  const load = useCallback((page: number, only: boolean, quiet = false) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    return fetchNotifications({ page, unreadOnly: only }, abort.signal).then(
      (next) => {
        if (abort.signal.aborted) return
        setShown((prev) => ({ items: page > 1 ? [...prev.items, ...next.items.filter((n) => !prev.items.some((p) => p.id === n.id))] : next.items, hasNextPage: next.hasNextPage, page }))
        loaded.current = true
        setError(null)
        setStatus('ready')
      },
      (failure: unknown) => {
        if (abort.signal.aborted) return
        if (loaded.current) {
          if (!quiet) toast(errorMessage(failure))
          return
        }
        setError(failure instanceof ApiError ? failure : new ApiError('server'))
        setStatus('error')
      },
    )
  }, [toast])

  /** Reads the count, and the first page again when the count moved (a new notification, or one read elsewhere). */
  const readCount = useCallback(
    async (signal?: AbortSignal) => {
      const next = await fetchUnreadCount(signal)
      const { count: known, unreadOnly: only, list: listing } = live.current
      live.current.count = next
      setCount(next)
      if (listing && known !== null && known !== next) void load(1, only, true)
    },
    [load],
  )

  const active = userId !== null
  useEffect(() => {
    if (!active) return
    // The count read sets state once the answer lands, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    readCount().catch(() => {})
    return onNotificationsChanged(() => {
      readCount().catch(() => {})
      if (live.current.list) void load(1, live.current.unreadOnly, true)
    })
  }, [active, userId, readCount, load])
  useLivePoll(readCount, { enabled: active, resetKey: userId })

  useEffect(() => {
    if (!active || !list) return
    loaded.current = false
    void load(1, unreadOnly)
    return () => controller.current?.abort()
  }, [active, userId, list, unreadOnly, load])

  const setUnreadOnly = useCallback((only: boolean) => {
    if (only === live.current.unreadOnly) return
    setShown(EMPTY)
    setStatus('loading')
    setUnreadOnlyState(only)
  }, [])

  const markRead = useCallback(
    async (id: string) => {
      const before = { ...live.current }
      if (!before.shown.items.some((n) => n.id === id && !n.readAt)) return
      const readAt = new Date().toISOString()
      setCount((n) => (n === null ? n : Math.max(0, n - 1)))
      setShown((prev) => ({ ...prev, items: prev.items.map((n) => (n.id === id ? { ...n, readAt } : n)) }))
      try {
        await markNotificationRead(id)
      } catch {
        setCount(before.count)
        setShown(before.shown)
        toast("We couldn't mark that notification as read. Check your connection, then open it again.")
      }
    },
    [toast],
  )

  const markAllRead = useCallback(async () => {
    const before = { ...live.current }
    if (!before.count) return
    const readAt = new Date().toISOString()
    live.current.count = 0
    setCount(0)
    // An unread-only list has nothing left to show once everything is read.
    setShown((prev) => (before.unreadOnly ? EMPTY : { ...prev, items: prev.items.map((n) => (n.readAt ? n : { ...n, readAt })) }))
    try {
      await markAllNotificationsRead()
      toast('All notifications marked as read.')
    } catch {
      live.current.count = before.count
      setCount(before.count)
      setShown(before.shown)
      toast("We couldn't mark your notifications as read. Check your connection, then try again.")
    }
  }, [toast])

  const loadMore = useCallback(() => {
    setLoadingMore(true)
    void load(live.current.shown.page + 1, live.current.unreadOnly).finally(() => setLoadingMore(false))
  }, [load])

  /** Reads the count and the first page again without the skeleton. */
  const refresh = useCallback(() => Promise.all([readCount().catch(() => {}), load(1, live.current.unreadOnly)]), [readCount, load])

  const retry = useCallback(() => {
    setStatus('loading')
    void load(1, live.current.unreadOnly)
  }, [load])

  return { count: active ? count : null, items: shown.items, hasNextPage: shown.hasNextPage, status, error, loadingMore, unreadOnly, setUnreadOnly, markRead, markAllRead, loadMore, refresh, retry }
}
