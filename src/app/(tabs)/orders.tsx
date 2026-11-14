import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { fetchOrdersPage, awaitsPayment, statusLabel, type Order } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { dateOnly, peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { CHIP_HEIGHT, StatusChip } from '@/ui/StatusChip'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const LIMIT = 10
const MAX_REFETCH = 5
const itemCount = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0)
const itemsLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const count = itemsLabel(itemCount(order))
  const status = statusLabel(order.status)
  return (
    <Pressable
      testID={`order-row-${order.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderNumber}, ${status}, ${count}, ${peso(order.total)}, placed ${dateOnly(order.createdAt)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.line}>
        <Text numberOfLines={1} style={[type.label, type.numeric, styles.grow]}>{order.orderNumber}</Text>
        <Text style={styles.total}>{peso(order.total)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[type.small, type.numeric, styles.grow, { color: color.graphite }]}>{dateOnly(order.createdAt)}</Text>
        <Text style={[type.small, type.numeric, { color: color.graphite }]}>{count}</Text>
      </View>
      <StatusChip label={status} attention={awaitsPayment(order)} />
    </Pressable>
  )
}

// Same row chrome and line heights as OrderRow (number + total, date + count, chip) so the swap does not shift.
function OrdersSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.row}>
          <Skeleton height={24} />
          <Skeleton width="60%" height={20} />
          <Skeleton width={120} height={CHIP_HEIGHT} />
        </View>
      ))}
    </View>
  )
}

type Store = { owner: string | null; items: Order[] | null; page: number; hasNext: boolean; error: unknown; more: 'idle' | 'loading' | 'error' }
const EMPTY: Store = { owner: null, items: null, page: 1, hasNext: false, error: null, more: 'idle' }
// Everything fetched is tagged with its account, so another account never sees it (not even for one render).
const own = (s: Store, uid: string, change: Partial<Store> | ((cur: Store) => Partial<Store>)): Store => {
  const cur = s.owner === uid ? s : { ...EMPTY, owner: uid }
  return { ...cur, ...(typeof change === 'function' ? change(cur) : change) }
}
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401

// Needs a session; the Shop and Product pages stay public. Reloads on every focus, silently after the first load.
export default function OrdersScreen() {
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const signedIn = userId !== null
  const toast = useToast()
  const [store, setStore] = useState<Store>(EMPTY)
  const mine = store.owner === userId ? store : EMPTY
  const { items, page, hasNext, error, more } = mine
  const [refreshing, setRefreshing] = useState(false)
  const notify = useRef(toast)
  const out = useRef(signOut)
  const userRef = useRef(userId)
  const itemsRef = useRef<Order[] | null>(null)
  const pageRef = useRef(1)
  const opening = useRef(false)
  const moreBusy = useRef(false)
  const seq = useRef(0) // the newest first-page load wins: an earlier one is dropped when it lands
  const expired = useRef(false)
  useEffect(() => {
    notify.current = toast
    out.current = signOut
    itemsRef.current = items
    pageRef.current = items ? page : 1
  })
  useEffect(() => {
    userRef.current = userId
    seq.current++
    expired.current = false
  }, [userId])

  const write = useCallback((uid: string, change: Partial<Store> | ((cur: Store) => Partial<Store>)) => {
    if (userRef.current === uid) setStore((s) => own(s, uid, change))
  }, [])

  // The backend can reject a token Supabase still holds: sign out once so the prompt is truthful.
  const expire = useCallback(() => {
    if (expired.current) return
    expired.current = true
    notify.current('Your session has expired. Sign in again.')
    void out.current()
  }, [])

  // Every page already loaded is fetched again (at most MAX_REFETCH, in parallel), so a row from page 2+ never keeps a stale status and the
  // scroll position survives. The fresh answers replace the rows and set page/hasNext. A first failure fills the error state; a failed refresh keeps the rows and toasts.
  const load = useCallback(
    (signal: AbortSignal) => {
      const uid = userId
      if (!uid) return Promise.resolve()
      const started = ++seq.current
      const current = () => !signal.aborted && started === seq.current
      const pages = Math.min(Math.max(pageRef.current, 1), MAX_REFETCH)
      return Promise.all(Array.from({ length: pages }, (_, i) => fetchOrdersPage({ page: i + 1, limit: LIMIT }, signal))).then(
        (fresh) => {
          if (!current()) return
          const last = fresh[fresh.length - 1]
          const rows = fresh.flatMap((p) => p.items)
          write(uid, {
            items: rows.filter((row, i) => rows.findIndex((r) => r.id === row.id) === i), // a page that moved between loads must not show a row twice
            page: last.page,
            hasNext: last.hasNextPage,
            error: null,
          })
        },
        (failure: unknown) => {
          if (!current()) return
          if (isExpired(failure)) expire()
          else if (itemsRef.current) notify.current(errorMessage(failure))
          else write(uid, { error: failure })
        },
      )
    },
    [userId, write, expire],
  )

  useFocusEffect(
    useCallback(() => {
      opening.current = false // a fast double tap must not stack two screens
      if (!signedIn) return
      const controller = new AbortController()
      void load(controller.signal)
      return () => controller.abort()
    }, [signedIn, load]),
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

  // One page request at a time; a page that moved between loads must not show a row twice.
  function loadMore() {
    const uid = userId
    if (!uid || !items || !hasNext || moreBusy.current) return
    moreBusy.current = true
    write(uid, { more: 'loading' })
    fetchOrdersPage({ page: page + 1, limit: LIMIT })
      .then(
        (next) =>
          write(uid, (cur) => {
            const known = cur.items ?? []
            return { items: [...known, ...next.items.filter((order) => !known.some((old) => old.id === order.id))], page: next.page, hasNext: next.hasNextPage, more: 'idle' }
          }),
        (failure: unknown) => {
          if (isExpired(failure)) expire()
          else write(uid, { more: 'error' })
        },
      )
      .finally(() => {
        moreBusy.current = false
      })
  }

  const retryMore = () => {
    if (userId) write(userId, { more: 'idle' })
    loadMore()
  }

  const header = (
    <View style={styles.header}>
      <Text style={type.label}>(Your Orders)</Text>
      <Text accessibilityRole="header" style={type.h1}>Orders</Text>
    </View>
  )

  if (loading || (signedIn && !items && !error)) {
    return (
      <View style={styles.screen}>
        {header}
        <OrdersSkeleton />
      </View>
    )
  }
  if (!signedIn) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Sign in to see your orders" message="Your orders are saved to your account once you sign in." actionLabel="Sign In" onAction={signIn} testID="orders-sign-in" />
        </View>
      </View>
    )
  }
  if (!items) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage alert title="Couldn't load your orders" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="orders-retry" />
        </View>
      </View>
    )
  }
  if (items.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="No orders yet" message="Orders you place show up here." actionLabel="Browse the Shop" onAction={() => router.navigate('/')} testID="orders-empty-action" />
        </View>
      </View>
    )
  }

  return (
    <FlatList
      testID="orders-list"
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(order) => order.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <OrderRow order={item} onPress={() => open(item.id)} />}
      onEndReached={() => more !== 'error' && loadMore()}
      onEndReachedThreshold={0.5}
      refreshing={refreshing}
      onRefresh={refresh}
      ListFooterComponent={
        more === 'loading' ? (
          <View style={styles.footer}><ActivityIndicator accessibilityLabel="Loading more" color={color.obsidian} /></View>
        ) : more === 'error' ? (
          <View accessibilityRole="alert" style={styles.footer}>
            <Text style={styles.footerText}>{"Couldn't load more orders. Check your connection."}</Text>
            <Button testID="orders-load-more-retry" variant="secondary" label="Retry" onPress={retryMore} />
          </View>
        ) : undefined
      }
    />
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
  total: { ...type.h2, ...type.numeric, textAlign: 'right' },
  footer: { paddingVertical: space.lg, paddingHorizontal: space.lg, gap: space.md },
  footerText: { ...type.body, color: color.graphite },
})
