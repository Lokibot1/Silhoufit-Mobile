import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { fetchOrdersPage, orderUpdates, STAGE_KINDS, type NotificationEvent } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { useLivePoll } from '@/lib/useLivePoll'
import { PressableScale } from '@/ui/PressableScale'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const seenKey = (uid: string) => `kral:notifications-seen:${uid}`
const eventsKey = (events: NotificationEvent[]) => events.map((e) => `${e.id}|${e.at}|${e.note ?? ''}`).join('\n')
const isNew = (event: NotificationEvent, seen: string | null) => seen !== null && Date.parse(event.at) > Date.parse(seen)

function UpdateRow({ event, fresh, onPress }: { event: NotificationEvent; fresh: boolean; onPress: () => void }) {
  const time = `${STAGE_KINDS.includes(event.kind) ? 'Updated ' : ''}${dateTime(event.at)}`
  return (
    <PressableScale
      testID={`notification-row-${event.orderId}-${event.kind}`}
      accessibilityRole="button"
      accessibilityLabel={`${event.label}, order ${event.orderNumber}, ${time}${fresh ? ', new' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.line}>
        <Text style={[type.h2, styles.grow]}>{event.label}</Text>
        {fresh && <Text testID="notification-new" style={[type.label, { color: color.red }]}>New</Text>}
      </View>
      <Text style={[type.small, type.numeric, { color: color.graphite }]}>{`Order ${event.orderNumber}`}</Text>
      <Text style={[type.small, type.numeric, { color: color.graphite }]}>{time}</Text>
      {event.note ? <Text style={[type.small, { color: color.graphite }]}>{event.note}</Text> : null}
    </PressableScale>
  )
}

// Same row chrome as UpdateRow (title, order, time); a row with a cancel note is taller, so that swap can shift a little.
function UpdatesSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.row}>
          <Skeleton height={24} />
          <Skeleton width="40%" height={20} />
          <Skeleton width="60%" height={20} />
        </View>
      ))}
    </View>
  )
}

type Store = { owner: string | null; events: NotificationEvent[] | null; seen: string | null; error: unknown }
const EMPTY: Store = { owner: null, events: null, seen: null, error: null }
// Everything fetched is tagged with its account, so another account never sees it (not even for one render).
const own = (s: Store, uid: string, change: Partial<Store>): Store => ({ ...(s.owner === uid ? s : { ...EMPTY, owner: uid }), ...change })
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401

// Order updates built on the device from the customer's orders; the API has no notifications feed yet.
export default function NotificationsScreen() {
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const signedIn = userId !== null
  const toast = useToast()
  const [store, setStore] = useState<Store>(EMPTY)
  const mine = store.owner === userId ? store : EMPTY
  const { events, seen, error } = mine
  const [refreshing, setRefreshing] = useState(false)
  const notify = useRef(toast)
  const out = useRef(signOut)
  const userRef = useRef(userId)
  const eventsRef = useRef<NotificationEvent[] | null>(null)
  const opening = useRef(false)
  const shown = useRef<{ uid: string; at: string } | null>(null) // newest event the list has been rendered with since focus
  const seq = useRef(0) // the newest load wins: an earlier one is dropped when it lands
  const expired = useRef(false)
  const flight = useRef<{ uid: string; signal: AbortSignal; promise: Promise<boolean>; quiet: boolean } | null>(null)
  useEffect(() => {
    notify.current = toast
    out.current = signOut
    eventsRef.current = events
  })
  useEffect(() => {
    userRef.current = userId
    seq.current++
    expired.current = false
  }, [userId])

  const write = useCallback((uid: string, change: Partial<Store>) => {
    if (userRef.current === uid) setStore((s) => own(s, uid, change))
  }, [])

  // The backend can reject a token Supabase still holds: sign out once so the prompt is truthful.
  const expire = useCallback(() => {
    if (expired.current) return
    expired.current = true
    notify.current('Your session has expired. Sign in again.')
    void out.current()
  }, [])

  // shortcut: only the 20 newest orders, page further if customers have more
  // Resolves false on a real failure (a poll, `quiet`, backs off instead of toasting). A read already in flight is shared, and an
  // unchanged list is not written, so nothing re-renders; the newest event still counts as shown.
  const load = useCallback(
    (signal: AbortSignal, quiet = false) => {
      const uid = userId
      if (!uid) return Promise.resolve(true)
      const joined = flight.current
      // Only a poll joins a read in flight; a user's own load replaces a poll's (its result is dropped by `seq`).
      if (joined && joined.uid === uid && !joined.signal.aborted && (quiet || !joined.quiet)) return joined.promise
      const started = ++seq.current
      const current = () => !signal.aborted && started === seq.current
      const promise: Promise<boolean> = fetchOrdersPage({ page: 1, limit: 20 }, signal)
        .then(
          (page) => {
            if (!current()) return true
            const list = orderUpdates(page.items)
            if (!eventsRef.current || eventsKey(eventsRef.current) !== eventsKey(list)) write(uid, { events: list, error: null })
            if (list[0]) shown.current = { uid, at: list[0].at }
            return true
          },
          (failure: unknown) => {
            if (!current()) return true
            if (isExpired(failure)) expire()
            else if (eventsRef.current) {
              if (!quiet) notify.current(errorMessage(failure))
            } else write(uid, { error: failure })
            return false
          },
        )
        .finally(() => {
          if (flight.current?.promise === promise) flight.current = null
        })
      flight.current = { uid, signal, promise, quiet }
      return promise
    },
    [userId, write, expire],
  )

  // "New" is judged against the last-seen time read at focus. It advances only when the user leaves a tab that showed the list
  // (blur, including opening an order), so a quick tab switch before the list renders keeps the markers.
  useFocusEffect(
    useCallback(() => {
      opening.current = false // a fast double tap must not stack two screens
      if (!userId) return
      const controller = new AbortController()
      void AsyncStorage.getItem(seenKey(userId))
        .catch(() => null)
        .then((stored) => {
          if (controller.signal.aborted) return
          write(userId, { seen: stored })
          return load(controller.signal)
        })
      return () => {
        controller.abort()
        const left = shown.current
        shown.current = null
        if (left?.uid !== userId) return
        write(userId, { seen: left.at })
        void AsyncStorage.setItem(seenKey(userId), left.at).catch(() => {})
      }
    }, [userId, load, write]),
  )

  // The focus effect above already reads when the tab is shown, so a poll only keeps it fresh while it stays open. It never touches
  // the last-seen time: that only advances on blur, from what the list showed.
  useLivePoll(
    async (signal) => {
      if (!(await load(signal, true))) throw new Error('poll failed')
    },
    { enabled: signedIn, readOnFocus: false, resetKey: userId },
  )

  const retry = () => {
    if (userId) write(userId, { error: null })
    void load(new AbortController().signal)
  }
  const refresh = () => {
    setRefreshing(true)
    void load(new AbortController().signal).finally(() => setRefreshing(false))
  }
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }
  const open = (id: string) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/orders/[id]', params: { id } })
  }

  const header = (
    <View style={styles.header} />
  )

  if (loading || (signedIn && !events && !error)) {
    return (
      <View style={styles.screen}>
        {header}
        <UpdatesSkeleton />
      </View>
    )
  }
  if (!signedIn) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Sign in to see your order updates" message="Payment, shipping and delivery updates for your orders show up here once you sign in." actionLabel="Sign In" onAction={signIn} testID="notifications-sign-in" />
        </View>
      </View>
    )
  }
  if (!events) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage alert title="Couldn't load your updates" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="notifications-retry" />
        </View>
      </View>
    )
  }
  if (events.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="No updates yet" message="Updates on your orders show up here once you place one." actionLabel="Browse the Shop" onAction={() => router.navigate('/')} testID="notifications-empty-action" />
        </View>
      </View>
    )
  }

  return (
    <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
      {(scroll) => (
        <FlatList
          {...scroll}
          testID="notifications-list"
          style={styles.screen}
          contentContainerStyle={styles.listContent}
          data={events}
          keyExtractor={(event) => event.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <UpdateRow event={item} fresh={isNew(item, seen)} onPress={() => open(item.orderId)} />}
        />
      )}
    </PullToRefresh>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space.xxl },
  message: { padding: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  grow: { flex: 1 },
  row: { gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  pressed: { backgroundColor: color.porcelain },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
})
