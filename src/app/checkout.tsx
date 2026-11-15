import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchAddresses } from '@/api/addresses'
import { fetchCart, removeCartItem } from '@/api/cart'
import { createOrder, fetchOrdersPage, quoteShipping, type Order, type ShippingQuote } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { useRequest } from '@/lib/useRequest'
import { AddressSheet, hasPin } from '@/checkout/AddressSheet'
import { cartWarning } from '@/checkout/cartWarning'
import { takeCreated } from '@/checkout/newAddress'
import { AddressSection, ItemsSection, PaymentSection, ShippingSection, SummarySection, totals } from '@/checkout/Sections'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const TARGET = 44
// Waits for a session (or an address) before asking: the request stays "loading" until the key changes.
const idle = () => new Promise<never>(() => {})
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401
const SOON_MS = 30_000
const STOCK = /stock|unavailable|no longer available|invalid quantity/i
// Anchored to the server's own phrasing, so a product called "Quote" in a stock message never reads as a quotation error.
const NO_PIN = /^(delivery |shipping )?address\b.*coordinates/i
const QUOTE = /^(shipping )?quot(ation|e)\b/i
const TIMEOUT_MS = 30_000
const SKEW_MS = 120_000 // the phone's clock and the server's can differ
const NOTICE_MAX = 144 // keeps a long notice at 200% text from eating the screen above Place Order

type OrderBody = { addressId: string; cartItemIds: string[]; quotationId: string }
// What a createOrder attempt sent. Kept after a failure that leaves the outcome unknown, until a definite answer is known.
type Attempt = { body: OrderBody; shown: number | null; since: number; line: string }
type Notice = { message: string; actions?: { label: string; run: () => void }[] }

// Runs a request under a 30 second limit; the timer is always cleared, so nothing outlives the call.
async function timed<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

// The unpaid order an unanswered attempt probably created, from the newest few.
async function findPlaced(attempt: Attempt, signal: AbortSignal): Promise<Order | null> {
  const { items } = await fetchOrdersPage({ page: 1, limit: 5 }, signal)
  return (
    items.find(
      (order) =>
        order.status === 'PENDING_PAYMENT' &&
        Date.parse(order.createdAt) >= attempt.since - SKEW_MS &&
        order.items.length === attempt.body.cartItemIds.length &&
        attempt.shown !== null &&
        Math.abs(order.total - attempt.shown) <= 0.005 &&
        (!order.address || order.address.line === attempt.line),
    ) ?? null
  )
}

// Review, then place the order. Each section owns its data, so one failing never blanks the page.
export default function CheckoutScreen() {
  const { session, loading, signOut } = useSession()
  const toast = useToast()
  const userId = session?.user.id ?? null
  const insets = useSafeAreaInsets()
  const cart = useRequest(`${userId}:cart`, (signal) => (userId ? fetchCart(signal) : idle()))
  const addresses = useRequest(`${userId}:addresses`, (signal) => (userId ? fetchAddresses(signal) : idle()))
  const [chosen, setChosen] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const opening = useRef(false)
  const busy = useRef(false) // one request at a time; it stays set after success so the order cannot be placed twice
  const unknown = useRef<Attempt | null>(null) // set after a network, timeout or server failure: the order may exist, so look before placing again
  const expired = useRef(false)
  const focused = useRef(false)
  const mounted = useRef(false)
  const reload = useRef(cart.retry)
  const reloadAddresses = useRef(addresses.retry)
  const owner = useRef(userId)
  const [placing, setPlacing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [fresh, setFresh] = useState<{ addressId: string; quote: ShippingQuote } | null>(null) // a re-quote taken at Place Order
  useEffect(() => {
    reload.current = cart.retry
    reloadAddresses.current = addresses.retry
    owner.current = userId
  })

  const list = addresses.data ?? []
  // The address picked, else the default one (the list is default first) that has a map pin.
  const selected = list.find((a) => a.id === chosen && hasPin(a)) ?? list.find(hasPin) ?? null
  // The quote carries its `expiresAt`; the order step must re-quote once it passes.
  const requested = useRequest(`${userId}:${selected?.id}`, (signal) => (selected ? quoteShipping(selected.id, signal) : idle()))

  const quote = fresh && fresh.addressId === selected?.id ? fresh.quote : requested.data
  // The backend can reject a token Supabase still holds: sign out so the prompt is truthful.
  const lapsed = [cart.error, addresses.error, requested.error].some(isExpired)
  useEffect(() => {
    expired.current = false
  }, [userId])
  const expire = () => {
    if (expired.current) return
    expired.current = true
    return signOut()
  }
  useEffect(() => {
    if (lapsed) void expire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapsed])

  // A fast double tap must not stack two sign-in screens; allow it again when this screen regains focus.
  // The bag may have changed meanwhile (stock, removed lines): reload it whenever the screen regains focus after the first.
  useFocusEffect(
    useCallback(() => {
      opening.current = false
      focused.current = true
      if (mounted.current) {
        reload.current()
        // Back from Add New Address: load the list again and select the address just saved.
        const created = takeCreated(owner.current ?? undefined)
        if (created) {
          reloadAddresses.current()
          setChosen(created)
        }
      }
      mounted.current = true
      return () => {
        focused.current = false
      }
    }, []),
  )
  const addAddress = () => {
    if (opening.current || placing) return
    opening.current = true
    setPicking(false)
    router.push({ pathname: '/addresses/new', params: { from: 'checkout' } })
  }
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  const header = (
    <Stack.Screen
      options={{
        // A deep link has no screen to go back to, so the header offers the Cart instead.
        headerLeft: router.canGoBack()
          ? undefined
          : () => (
              <PressableScale testID="checkout-header-back" accessibilityRole="button" accessibilityLabel="Cart" onPress={() => router.navigate('/cart')} style={styles.headerBack}>
                <Text style={[type.label, { color: color.obsidian }]}>Cart</Text>
              </PressableScale>
            ),
      }}
    />
  )

  if (!loading && !userId) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Sign in to check out" message="Your bag is saved to your account once you sign in." actionLabel="Sign In" onAction={signIn} testID="checkout-sign-in" />
        </View>
      </View>
    )
  }
  if (cart.status === 'ready' && cart.data?.items.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Nothing to check out" message="Add pieces to your cart first." actionLabel="Back to Cart" onAction={() => router.navigate('/cart')} testID="checkout-empty-action" />
        </View>
      </View>
    )
  }

  const idleShipping = addresses.status === 'loading' ? 'loading' : selected ? null : 'none'
  const items = cart.data?.items ?? []
  const shipping = fresh && fresh.addressId === selected?.id ? { ...requested, status: 'ready' as const, data: quote } : requested
  const amounts = totals(cart.data?.subtotal ?? null, quote?.shippingFee ?? null)
  const blocked = items.some((item) => cartWarning(item) !== null)
  const addressHint = addresses.status !== 'ready' || selected ? null : list.length === 0 ? 'Add an address first' : 'Choose an address with a map pin'
  const hint = addressHint ?? (blocked ? 'Fix the items marked above to place your order' : selected && !quote && requested.status === 'error' ? 'Retry the shipping fee above to place your order' : null)
  const canPlace = items.length > 0 && !blocked && !!selected && !!quote && !placing

  const fail = async (failure: unknown, sent: Attempt | null) => {
    const back = { label: 'Back to Cart', run: () => router.navigate('/cart') }
    const pick = { label: 'Pick another address', run: () => setPicking(true) }
    const status = failure instanceof ApiError ? failure.status : undefined
    // Only a request that went out and got no clear answer can have created the order; every other failure is a definite "not placed".
    const unsure = !!sent && (!(failure instanceof ApiError) || failure.kind === 'network' || failure.kind === 'server')
    unknown.current = unsure ? sent : null
    if (isExpired(failure)) {
      toast('Your session has expired. Sign in again.')
      return expire()
    }
    if (status === 403) return setNotice({ message: "You don't have permission to place this order." })
    if (status === 409) {
      cart.retry()
      return setNotice({ message: 'Your cart changed while you were checking out. Review it and try again.', actions: [back] })
    }
    if (failure instanceof ApiError && failure.kind === 'not-found') {
      return setNotice({ message: "We couldn't find that delivery address, so the order was not placed. Pick another address.", actions: [pick] })
    }
    if (failure instanceof ApiError && status === 400) {
      const detail = failure.detail ?? ''
      if (NO_PIN.test(detail)) return setNotice({ message: "This address has no map pin, so delivery can't be priced and the order was not placed. Pick another address.", actions: [pick] })
      if (QUOTE.test(detail)) return requote(selected?.id)
      cart.retry()
      if (STOCK.test(detail)) return setNotice({ message: 'An item in your cart is out of stock or no longer available. Update your cart, then check out again.', actions: [back] })
      return setNotice({ message: "We couldn't place this order because your cart changed. Go back to your cart, check it, then check out again.", actions: [back] })
    }
    const message = failure instanceof ApiError ? errorMessage(failure) : 'The server took too long to answer. Your order may or may not have gone through; Try Again checks first.'
    setNotice({ message, actions: [{ label: 'Try Again', run: () => void place(true) }] })
  }

  // The delivery quote expired: ask for a new one and have the customer confirm the fee before ordering.
  async function requote(addressId?: string) {
    if (!addressId) return
    try {
      const next = await quoteShipping(addressId)
      setFresh({ addressId, quote: next })
      setNotice({ message: `Your delivery quote expired. Delivery is now ${peso(next.shippingFee)}. Check your total, then place your order again.` })
    } catch (failure) {
      await fail(failure, null)
    }
  }

  // `check` only looks for an order an unanswered attempt may have created, and never places a new one.
  async function place(retry = false, check = false) {
    if (busy.current || !selected || !cart.data) return
    busy.current = true
    setPlacing(true)
    setNotice(null)
    const prior = unknown.current
    let sent: Attempt | null = retry ? prior : null
    let created = false
    try {
      if (prior) {
        let found: Order | null
        try {
          found = await timed((signal) => findPlaced(prior, signal))
        } catch {
          return setNotice({
            message: "We couldn't confirm whether your order went through. Check Orders before trying again.",
            actions: [
              { label: 'Open Orders', run: () => router.navigate('/orders') },
              { label: 'Check Again', run: () => void place(true, true) },
            ],
          })
        }
        if (found) {
          created = true
          unknown.current = null
          return await finish(found, prior, 'Your order was already placed')
        }
        unknown.current = null
        if (check) return setNotice({ message: 'No matching order was found, so nothing was placed. You can place your order now.' })
      }
      if (!sent) {
        let current = quote
        if (!current || Date.parse(current.expiresAt) - Date.now() < SOON_MS) {
          const next = await quoteShipping(selected.id)
          setFresh({ addressId: selected.id, quote: next })
          if (next.shippingFee !== current?.shippingFee) {
            setNotice({ message: `Delivery is now ${peso(next.shippingFee)}. Check your total, then place your order again.` })
            return
          }
          current = next
        }
        sent = {
          body: { addressId: selected.id, cartItemIds: items.map((item) => item.id), quotationId: current.quotationId },
          shown: totals(cart.data.subtotal, current.shippingFee).total,
          since: Date.now(),
          line: [selected.streetAddress, selected.addressLine2, selected.barangay].filter(Boolean).join(', '),
        }
      }
      const attempt = sent
      let order: Order
      try {
        order = await timed((signal) => createOrder(attempt.body, signal))
      } catch (failure) {
        return await fail(failure, attempt)
      }
      created = true
      await finish(order, attempt, 'Order placed')
    } catch (failure) {
      await fail(failure, null)
    } finally {
      // After success the lock stays, so a second tap cannot place the order again before the screen is replaced.
      if (!created) {
        busy.current = false
        setPlacing(false)
      }
    }
  }

  // The order exists. The server removes paid lines only on payment, so the ordered lines go now; a failure here never blocks.
  async function finish(order: Order, sent: Attempt, message: string) {
    await Promise.allSettled(sent.body.cartItemIds.map((id) => removeCartItem(id)))
    // Never navigate or alert from a screen the customer has already left.
    const go = (pay: boolean) => {
      if (!focused.current) return toast('Order placed. Find it in Orders.')
      toast(message)
      router.replace({ pathname: '/orders/[id]', params: pay ? { id: order.id, pay: '1' } : { id: order.id } })
    }
    if (focused.current && sent.shown !== null && Math.abs(order.total - sent.shown) > 0.005) {
      const was = peso(sent.shown)
      const now = peso(order.total)
      Alert.alert(
        'Price changed',
        `Your total changed from ${was} to ${now}.`,
        [
          { text: `Pay ${now}`, onPress: () => go(true) },
          { text: 'Not Now', style: 'cancel', onPress: () => go(false) },
        ],
        { cancelable: false },
      )
    } else go(true)
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView testID="checkout-scroll" contentContainerStyle={styles.content}>
        <View style={styles.title}>
          <Text accessibilityRole="header" style={type.h1}>Checkout</Text>
        </View>
        <AddressSection req={addresses} selected={selected} disabled={placing} onChange={() => setPicking(true)} onAdd={addAddress} />
        <ItemsSection req={cart} />
        <ShippingSection idle={idleShipping} req={shipping} />
        <PaymentSection />
        <SummarySection {...amounts} />
      </ScrollView>
      <View testID="checkout-bar" style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.totalRow}>
          <Text style={[type.label, styles.grow]}>Total</Text>
          <Text testID="checkout-bar-total" maxFontSizeMultiplier={1.3} style={styles.total}>{amounts.total === null ? '—' : peso(amounts.total)}</Text>
        </View>
        {hint && <Text testID="checkout-bar-hint" accessibilityLiveRegion="polite" style={styles.note}>{hint}</Text>}
        {notice && (
          <ScrollView testID="checkout-notice-scroll" style={styles.noticeScroll} nestedScrollEnabled>
            <View testID="checkout-notice" accessibilityRole="alert" style={styles.banner}>
              <Text style={type.body}>{notice.message}</Text>
              {notice.actions?.map((action, i) => (
                <Button key={action.label} testID={i === 0 ? 'checkout-notice-action' : `checkout-notice-action-${i + 1}`} variant="secondary" label={action.label} disabled={placing} onPress={action.run} />
              ))}
            </View>
          </ScrollView>
        )}
        <Button testID="checkout-place-order" label="Place Order" pending={placing} disabled={!canPlace} accessibilityHint={hint ?? undefined} onPress={() => void place()} />
      </View>
      <AddressSheet
        visible={picking}
        addresses={list}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          if (placing) return
          setChosen(id)
          setNotice(null)
          setPicking(false)
        }}
        onAdd={addAddress}
        onClose={() => setPicking(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { padding: space.lg },
  content: { paddingVertical: space.lg, gap: space.md },
  title: { paddingHorizontal: space.lg, gap: space.md },
  grow: { flex: 1 },
  headerBack: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center' },
  bar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  total: { ...type.h1, ...type.numeric, textAlign: 'right' },
  banner: { gap: space.sm, borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
  noticeScroll: { flexGrow: 0, maxHeight: NOTICE_MAX },
  note: { ...type.small, color: color.graphite },
})
