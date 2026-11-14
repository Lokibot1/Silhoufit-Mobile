import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { openBrowserAsync } from 'expo-web-browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native'

import { awaitsPayment, fetchAllOrders, matchesTab, ORDER_TABS, statusLabel, tabCounts, trackingLink, type Order, type OrderItem, type OrderTab } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { dateOnly, peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { CHIP_HEIGHT, StatusChip } from '@/ui/StatusChip'
import { color, font, radius, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const THUMB_W = 56
const THUMB_H = 72
const SHOWN_ITEMS = 2
const itemCount = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0)
const itemsLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`
const variantLine = ({ size, color: colour }: OrderItem) => [size, colour].filter(Boolean).join(' / ')
const tabFor = (value: string | undefined): OrderTab => ORDER_TABS.find((t) => t.id === value)?.id ?? 'all'
const EMPTY_TAB: Record<OrderTab, string> = {
  all: 'No orders yet',
  'to-pay': 'No orders to pay',
  'to-ship': 'No orders to ship',
  'to-receive': 'No orders to receive',
  completed: 'No completed orders',
  cancelled: 'No cancelled orders',
  returns: 'No returns or refunds',
}

function Thumb({ item }: { item: OrderItem }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <View style={styles.thumb}>
      {item.imageUrl && failedUrl !== item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} accessible={false} contentFit="cover" transition={200} onError={() => setFailedUrl(item.imageUrl)} style={styles.fill} />
      ) : (
        <Text importantForAccessibility="no-hide-descendants" numberOfLines={4} maxFontSizeMultiplier={1.2} style={styles.fallback}>{item.name}</Text>
      )}
    </View>
  )
}

type CardProps = { order: Order; onOpen: () => void; onTrack: (url: string) => void }

// The whole card opens the order; the action button is its sibling, never nested in the pressable.
function OrderCard({ order, onOpen, onTrack }: CardProps) {
  const count = itemsLabel(itemCount(order))
  const status = statusLabel(order.status)
  const track = trackingLink(order)
  const more = order.items.length - SHOWN_ITEMS
  return (
    <View style={styles.card}>
      <PressableScale
        testID={`order-row-${order.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Order ${order.orderNumber}, ${status}, ${count}, total ${peso(order.total)}, placed ${dateOnly(order.createdAt)}`}
        onPress={onOpen}
        style={styles.open}>
        <View style={styles.line}>
          <Text numberOfLines={1} style={[type.label, type.numeric, styles.grow]}>{order.orderNumber}</Text>
          <StatusChip label={status} attention={awaitsPayment(order)} />
        </View>
        <Text style={[type.small, type.numeric]}>{dateOnly(order.createdAt)}</Text>
        {order.items.slice(0, SHOWN_ITEMS).map((item) => (
          <View key={item.id} style={styles.item}>
            <Thumb item={item} />
            <View style={styles.info}>
              <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
              {variantLine(item) !== '' && <Text numberOfLines={1} style={styles.variant}>{variantLine(item)}</Text>}
            </View>
            <View style={styles.price}>
              <Text maxFontSizeMultiplier={1.3} style={styles.unit}>{peso(item.unitPrice)}</Text>
              <Text style={[type.small, type.numeric]}>{`×${item.quantity}`}</Text>
            </View>
          </View>
        ))}
        {more > 0 && <Text style={type.small}>{`+${more} more ${more === 1 ? 'item' : 'items'}`}</Text>}
        <View style={styles.rule} />
        <View style={styles.totalLine}>
          <Text style={[type.small, type.numeric]}>{`Total (${count}):`}</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.total}>{peso(order.total)}</Text>
        </View>
      </PressableScale>
      {awaitsPayment(order) ? (
        <Button testID={`order-pay-${order.id}`} label="Review & Pay" accessibilityLabel={`Open order ${order.orderNumber} to pay`} onPress={onOpen} />
      ) : track ? (
        <Button testID={`order-track-${order.id}`} variant="secondary" label="Track" accessibilityLabel={`Track order ${order.orderNumber}`} onPress={() => onTrack(track)} />
      ) : null}
    </View>
  )
}

// Same card chrome and line heights as OrderCard (number + chip, date, one item, total) so the swap does not shift.
function OrdersSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.card}>
          <View style={styles.open}>
            <View style={styles.line}>
              <Skeleton width="50%" height={20} />
              <Skeleton width={96} height={CHIP_HEIGHT} radius={radius.pill} />
            </View>
            <Skeleton width="30%" height={20} />
            <View style={styles.item}>
              <Skeleton width={THUMB_W} height={THUMB_H} radius={radius.soft} />
              <View style={styles.info}>
                <Skeleton height={40} />
                <Skeleton width="50%" height={20} />
              </View>
            </View>
            <View style={styles.rule} />
            <View style={styles.totalLine}>
              <Skeleton width="50%" height={24} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

type Store = { owner: string | null; items: Order[] | null; error: unknown }
const EMPTY: Store = { owner: null, items: null, error: null }
// Everything fetched is tagged with its account, so another account never sees it (not even for one render).
const own = (s: Store, uid: string, change: Partial<Store>): Store => ({ ...(s.owner === uid ? s : { ...EMPTY, owner: uid }), ...change })
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401

// Needs a session; the Shop and Product pages stay public. Reloads on every focus, silently after the first load.
export default function OrdersScreen() {
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const signedIn = userId !== null
  const toast = useToast()
  const { tab: tabParam, nav } = useLocalSearchParams<{ tab?: string; nav?: string }>()
  const [tab, setTab] = useState<OrderTab>(tabFor(tabParam))
  const [seenParam, setSeenParam] = useState(tabParam)
  const [seenNav, setSeenNav] = useState(nav)
  const [seenUser, setSeenUser] = useState(userId)
  // A new `tab` or `nav` route param (the Profile shortcuts send a fresh `nav` every tap) re-selects the tab; an unknown value is ignored.
  // A different signed-in user starts on All.
  if (seenParam !== tabParam || seenNav !== nav) {
    setSeenParam(tabParam)
    setSeenNav(nav)
    if (ORDER_TABS.some((t) => t.id === tabParam)) setTab(tabFor(tabParam))
  }
  if (seenUser !== userId) {
    setSeenUser(userId)
    setTab('all')
  }
  const [store, setStore] = useState<Store>(EMPTY)
  const mine = store.owner === userId ? store : EMPTY
  const { items, error } = mine
  const [refreshing, setRefreshing] = useState(false)
  const notify = useRef(toast)
  const out = useRef(signOut)
  const userRef = useRef(userId)
  const itemsRef = useRef<Order[] | null>(null)
  const opening = useRef(false)
  const seq = useRef(0) // the newest load wins: an earlier one is dropped when it lands
  const expired = useRef(false)
  useEffect(() => {
    notify.current = toast
    out.current = signOut
    itemsRef.current = items
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

  // The first failure fills the error state; a failed refresh keeps the rows and toasts.
  const load = useCallback(
    (signal: AbortSignal) => {
      const uid = userId
      if (!uid) return Promise.resolve()
      const started = ++seq.current
      const current = () => !signal.aborted && started === seq.current
      return fetchAllOrders(signal).then(
        (rows) => {
          if (current()) write(uid, { items: rows, error: null })
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
  async function track(url: string) {
    try {
      await openBrowserAsync(url)
    } catch {
      notify.current("Couldn't open the tracking page. Try again.")
    }
  }

  const header = (
    <View style={styles.header}>
      <Text style={type.label}>(Your Orders)</Text>
      <Text accessibilityRole="header" style={type.h1}>Orders</Text>
    </View>
  )
  const counts = items ? tabCounts(items) : null
  const tabs = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.tabScroll} contentContainerStyle={styles.tabs}>
      {ORDER_TABS.map(({ id, label }) => (
        <Chip
          key={id}
          testID={`orders-tab-${id}`}
          label={counts ? `${label} (${counts[id]})` : label}
          accessibilityLabel={counts ? `${label}, ${counts[id]} ${counts[id] === 1 ? 'order' : 'orders'}` : label}
          selected={tab === id}
          onPress={() => setTab(id)}
        />
      ))}
    </ScrollView>
  )

  if (loading || (signedIn && !items && !error)) {
    return (
      <View style={styles.screen}>
        {header}
        {signedIn && tabs}
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
    <View style={styles.screen}>
      {header}
      {tabs}
      <FlatList
        testID="orders-list"
        contentContainerStyle={styles.listContent}
        data={items.filter((order) => matchesTab(order, tab))}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderCard order={item} onOpen={() => open(item.id)} onTrack={(url) => void track(url)} />}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={
          <View style={styles.message}>
            <StateMessage title={EMPTY_TAB[tab]} message="Orders with this status show up here." actionLabel="Show All Orders" onAction={() => setTab('all')} testID="orders-tab-empty-action" />
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingTop: space.sm, paddingBottom: space.xxl },
  message: { padding: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  tabScroll: { flexGrow: 0 },
  tabs: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  grow: { flex: 1 },
  card: { marginHorizontal: space.lg, marginBottom: space.md, padding: space.md, gap: space.md, borderWidth: 1, borderColor: color.porcelain, borderRadius: radius.soft, backgroundColor: color.paper },
  open: { gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  item: { flexDirection: 'row', gap: space.md },
  thumb: { width: THUMB_W, height: THUMB_H, backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: space.xs },
  fill: { position: 'absolute', width: '100%', height: '100%' },
  fallback: { ...type.small, color: color.graphite, textAlign: 'center' },
  info: { flex: 1, gap: space.xs },
  name: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  variant: { ...type.small, color: color.graphite },
  price: { alignItems: 'flex-end', gap: space.xs },
  unit: { ...type.body, ...type.numeric, textAlign: 'right' },
  rule: { height: 1, backgroundColor: color.porcelain },
  totalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.sm },
  total: { ...type.h2, ...type.numeric, textAlign: 'right' },
})
