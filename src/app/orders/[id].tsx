import { Image } from 'expo-image'
import { openBrowserAsync } from 'expo-web-browser'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { awaitsPayment, cancelOrder, createCheckoutSession, fetchOrder, isClosed, orderSignature, orderTimeline, paymentLabel, shipmentLabel, statusLabel, type Order, type OrderItem } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { dateTime, peso } from '@/lib/format'
import { useLivePoll } from '@/lib/useLivePoll'
import { useRequest } from '@/lib/useRequest'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { CHIP_HEIGHT, StatusChip } from '@/ui/StatusChip'
import { color, font, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const TARGET = 44
const IMG_W = 56
const IMG_H = 72

const variantLine = ({ size, color: colour }: OrderItem) => [size && `Size ${size}`, colour].filter(Boolean).join(' // ')
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401

function ItemRow({ item }: { item: OrderItem }) {
  const [failed, setFailed] = useState(false)
  return (
    <View style={styles.item}>
      <View style={styles.tile}>
        {item.imageUrl && !failed && <Image source={{ uri: item.imageUrl }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
        {variantLine(item) !== '' && <Text style={styles.variant}>{variantLine(item)}</Text>}
        <Text style={styles.variant}>{`Qty ${item.quantity}`}</Text>
        <Text accessibilityLabel={`Line total ${peso(item.lineTotal)}`} style={styles.lineTotal}>{peso(item.lineTotal)}</Text>
      </View>
    </View>
  )
}

function AmountRow({ label, value, testID, strong }: { label: string; value: string; testID?: string; strong?: boolean }) {
  return (
    <View style={styles.amount}>
      <Text style={[type.label, styles.grow]}>{label}</Text>
      <Text testID={testID} style={strong ? styles.total : styles.value}>{value}</Text>
    </View>
  )
}

type Props = { order: Order; action: 'pay' | 'cancel' | null; failure: string | null; onPay: () => void; onCancel: () => void }

function OrderDetail({ order, action, failure, onPay, onCancel }: Props) {
  const { address, shipment } = order
  const unpaid = awaitsPayment(order)
  return (
    <View testID="order-detail" style={styles.content}>
      <Text style={type.label}>(Order)</Text>
      <Text accessibilityRole="header" style={[type.h1, type.numeric, styles.wrap]}>{order.orderNumber}</Text>
      <Text style={styles.body}>{`Placed ${dateTime(order.createdAt)}`}</Text>
      <View style={styles.chips}>
        <View style={styles.chipGroup}>
          <Text style={type.label}>(Status)</Text>
          <StatusChip testID="order-status" label={statusLabel(order.status)} attention={unpaid} />
        </View>
        <View style={styles.chipGroup}>
          <Text style={type.label}>(Payment)</Text>
          <StatusChip testID="order-payment-status" label={paymentLabel(order.paymentStatus)} attention={unpaid} />
        </View>
      </View>
      {shipment && <Text style={styles.body}>{`Delivery: ${shipmentLabel(shipment.status)}`}</Text>}

      <View style={styles.section}>
        <Text style={type.label}>(Items)</Text>
        {order.items.map((item) => <ItemRow key={item.id} item={item} />)}
      </View>

      <View style={styles.section}>
        <AmountRow label="(Subtotal)" value={peso(order.subtotal)} />
        <AmountRow label="(Shipping)" value={peso(order.shipping)} />
        {order.discount > 0 && <AmountRow label="(Discount)" value={`-${peso(order.discount)}`} />}
        <AmountRow label="(Total)" value={peso(order.total)} testID="order-total" strong />
      </View>

      {failure && (
        <View testID="order-inline-error" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{failure}</Text>
        </View>
      )}
      {unpaid && <Button testID="order-pay-now" label="Pay Now" pending={action === 'pay'} disabled={action !== null} onPress={onPay} />}
      {unpaid && <Button testID="order-cancel" variant="secondary" label="Cancel Order" pending={action === 'cancel'} disabled={action !== null} onPress={onCancel} />}

      {address && (
        <View style={styles.section}>
          <Text style={type.label}>(Delivery Address)</Text>
          {address.recipient && <Text style={styles.recipient}>{address.recipient}</Text>}
          {address.line !== '' && <Text style={styles.body}>{address.line}</Text>}
          {address.city !== '' && <Text style={styles.body}>{address.city}</Text>}
          {address.phone && <Text style={[styles.body, type.numeric]}>{address.phone}</Text>}
        </View>
      )}

      <View style={styles.section}>
        <Text style={type.label}>(Timeline)</Text>
        {orderTimeline(order).map((step) => (
          <View key={step.label} style={styles.step}>
            <View style={styles.marker} />
            <View style={styles.info}>
              <Text style={styles.recipient}>{step.label}</Text>
              <Text style={[styles.variant, type.numeric]}>{dateTime(step.at)}</Text>
              {step.note && <Text style={styles.variant}>{step.note}</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

// Same blocks as OrderDetail (heading, chips, two item rows, amounts, buttons) so the swap does not shift.
function DetailSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
      <Skeleton width={80} height={20} />
      <Skeleton width="80%" height={28} />
      <Skeleton width="50%" height={24} />
      <View style={styles.chips}>
        <Skeleton width={140} height={CHIP_HEIGHT + 24} />
        <Skeleton width={140} height={CHIP_HEIGHT + 24} />
      </View>
      {[0, 1].map((key) => (
        <View key={key} style={styles.item}>
          <Skeleton width={IMG_W} height={IMG_H} />
          <View style={styles.info}>
            <Skeleton height={40} />
            <Skeleton width="50%" height={20} />
            <Skeleton width="30%" height={20} />
            <Skeleton width="40%" height={24} />
          </View>
        </View>
      ))}
      <Skeleton height={96} />
      <Skeleton height={48} />
    </View>
  )
}

const STUCK_MS = 15_000 // a pay-return flag this old is stale
const RELOAD_DEDUPE_MS = 3000

// Needs a session. An order of another account answers 404, which reads as "not found".
export default function OrderScreen() {
  const { id: raw, pay: autoPay } = useLocalSearchParams<{ id: string | string[]; pay?: string }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const { status, data, error, retry } = useRequest(`${userId}:${id}`, (signal) => {
    if (!id) return Promise.reject(new ApiError('not-found'))
    return userId ? fetchOrder(id, signal) : new Promise<Order>(() => {}) // no session yet (or none): nothing to ask
  })
  // A poll's newer copy of `data`; it is dropped as soon as a reload (retry) puts a new `data` on screen.
  const [fresh, setFresh] = useState<{ base: Order; order: Order } | null>(null)
  const shown = fresh && fresh.base === data ? fresh.order : data
  const pollKey = `${userId}:${id}`
  const [stopped, setStopped] = useState<string | null>(null) // the key whose poll got a 404/403
  const [action, setAction] = useState<'pay' | 'cancel' | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const latest = useRef({ toast, signOut, retry })
  const busy = useRef(false)
  const asking = useRef(false)
  const opening = useRef(false)
  const returning = useRef(0) // when Pay Now opened the browser; 0 = not away
  const reloadedAt = useRef(0) // when the return reload started
  const expired = useRef(false)
  useEffect(() => {
    latest.current = { toast, signOut, retry }
  })
  useEffect(() => {
    expired.current = false
  }, [userId])

  // The backend can reject a token Supabase still holds: sign out once so the prompt is truthful.
  const expire = useCallback(() => {
    if (expired.current) return
    expired.current = true
    latest.current.toast('Your session has expired. Sign in again.')
    void latest.current.signOut()
  }, [])
  const lapsed = isExpired(error)
  useEffect(() => {
    if (lapsed) expire()
  }, [lapsed, expire])

  // Keeps the order current while it is open: paused during pay/cancel (so it cannot clobber the result), stopped once closed.
  // A failed poll keeps what is on screen; the hook backs off. A poll skips while the shopper is in the payment browser (a short while:
  // a `returning` flag older than STUCK_MS is dropped, so it cannot silence polling forever) and just after the return reload, whichever
  // listener runs first. A 404/403 means polling can never succeed: it stops.
  useLivePoll(
    async (signal) => {
      const now = Date.now()
      if (returning.current && now - returning.current > STUCK_MS) returning.current = 0
      if (returning.current || now - reloadedAt.current < RELOAD_DEDUPE_MS || !data) return
      try {
        const next = await fetchOrder(id, signal)
        if (!signal.aborted && orderSignature(next) !== orderSignature(shown ?? data)) setFresh({ base: data, order: next })
      } catch (reason) {
        if (isExpired(reason)) expire()
        if (reason instanceof ApiError && (reason.kind === 'not-found' || reason.kind === 'forbidden')) setStopped(pollKey)
        throw reason
      }
    },
    { enabled: userId !== null && data !== undefined && action === null, done: stopped === pollKey || (shown !== undefined && isClosed(shown)), resetKey: pollKey },
  )

  // The Android browser answers "opened" at once, so the way back is the app becoming active again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !returning.current) return
      returning.current = 0
      reloadedAt.current = Date.now()
      latest.current.retry()
    })
    return () => subscription.remove()
  }, [])

  // A 400/409 means the order's status changed or is still updating (a payment can take a moment to land): the server text names internal statuses, so fixed copy is shown, then reload so the buttons match.
  function fail(reason: unknown, serverCopy: string) {
    if (isExpired(reason)) return expire()
    if (reason instanceof ApiError && reason.kind === 'not-found') return latest.current.retry()
    if (reason instanceof ApiError && (reason.kind === 'validation' || reason.kind === 'conflict')) {
      setFailure("This order's status changed or is still updating. If you already paid, it can take a moment to show.")
      return latest.current.retry()
    }
    if (reason instanceof ApiError && reason.kind === 'forbidden') return setFailure("This order couldn't be updated. Try again.") // a 403 is not a lapsed session
    setFailure(reason instanceof ApiError && reason.kind === 'server' ? serverCopy : errorMessage(reason))
  }

  // One action at a time; the lock also covers the wait for the payment link.
  async function run(kind: 'pay' | 'cancel', work: () => Promise<void>, serverCopy: string) {
    if (busy.current) return
    busy.current = true
    setAction(kind)
    setFailure(null)
    try {
      await work()
    } catch (reason) {
      fail(reason, serverCopy)
    } finally {
      busy.current = false
      setAction(null)
    }
  }
  const pay = () =>
    run(
      'pay',
      async () => {
        const result = await openBrowserAsync(await createCheckoutSession(id))
        if (result.type === 'opened') returning.current = Date.now()
        else retry() // iOS answers when the browser closes
      },
      "We couldn't get a payment link for this order. Tap Pay Now to try again.",
    )
  // Checkout opens this screen with pay=1 to go straight to payment: once, and only while the order is still unpaid.
  const autoPaid = useRef(false)
  useEffect(() => {
    if (autoPay !== '1' || !data || autoPaid.current) return
    autoPaid.current = true
    router.setParams({ pay: undefined })
    if (awaitsPayment(data)) void pay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPay, data])
  const cancel = () => {
    if (asking.current || busy.current) return
    asking.current = true
    const release = () => {
      asking.current = false
    }
    Alert.alert(
      'Are you sure?',
      "This order will be cancelled and its pieces released. You can't undo this.",
      [
        { text: 'Keep Order', style: 'cancel', onPress: release },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: () =>
            void run(
              'cancel',
              async () => {
                await cancelOrder(id)
                toast('Order cancelled')
                retry()
              },
              "We couldn't cancel this order. Try again.",
            ).finally(release),
        },
      ],
      { cancelable: true, onDismiss: release },
    )
  }
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  const gone = error instanceof ApiError && error.kind === 'not-found'
  let body
  if (loading || lapsed || (userId && status === 'loading')) body = <DetailSkeleton />
  else if (!userId) {
    body = (
      <View style={styles.message}>
        <StateMessage title="Sign in to see this order" message="Your orders are saved to your account once you sign in." actionLabel="Sign In" onAction={signIn} testID="order-sign-in" />
      </View>
    )
  } else if (status === 'error') {
    body = (
      <View style={styles.message}>
        {gone ? (
          <StateMessage title="We couldn't find this order" message="It may have been removed, or it belongs to a different account." actionLabel="Back to Orders" onAction={() => router.navigate('/orders')} testID="order-error-back" />
        ) : (
          <StateMessage
            alert
            title="Couldn't load this order"
            message={error instanceof ApiError && error.kind === 'forbidden' ? "This order couldn't be loaded. Try again." : errorMessage(error)}
            actionLabel="Retry"
            onAction={retry}
            testID="order-retry"
          />
        )}
      </View>
    )
  } else if (shown) body = <OrderDetail order={shown} action={action} failure={failure} onPay={pay} onCancel={cancel} />

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
      {/* A deep link has no screen to go back to. The native back button takes no testID, so only this case gets a custom header-left. */}
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <Pressable testID="order-header-back" accessibilityRole="button" accessibilityLabel="Orders" onPress={() => router.navigate('/orders')} style={styles.headerBack}>
                  <Text style={[type.label, { color: color.obsidian }]}>Orders</Text>
                </Pressable>
              ),
        }}
      />
      {body}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { padding: space.lg },
  content: { padding: space.lg, gap: space.md },
  grow: { flex: 1 },
  wrap: { flexShrink: 1 },
  body: { ...type.body, color: color.graphite },
  recipient: { ...type.body, fontFamily: font.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  chipGroup: { gap: space.xs, flexShrink: 1, maxWidth: '100%' },
  section: { gap: space.sm },
  item: { flexDirection: 'row', gap: space.md },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain },
  fill: { width: '100%', height: '100%' },
  info: { flex: 1, gap: space.xs },
  name: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  variant: { ...type.small, color: color.graphite },
  lineTotal: { ...type.body, ...type.numeric, textAlign: 'right' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  value: { ...type.body, ...type.numeric, textAlign: 'right' },
  total: { ...type.h2, ...type.numeric, textAlign: 'right' },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
  step: { flexDirection: 'row', gap: space.md },
  marker: { width: 8, height: 8, marginTop: space.sm, backgroundColor: color.obsidian },
  headerBack: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center' },
})
