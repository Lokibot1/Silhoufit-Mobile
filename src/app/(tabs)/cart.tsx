import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Alert, FlatList, LayoutAnimation, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { clearCart, fetchCart, removeCartItem, setCartItemQuantity, type Cart, type CartItem } from '@/api/cart'
import { useSession } from '@/auth/session'
import { cartWarning } from '@/checkout/cartWarning'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, radius, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { useReduceMotion } from '@/ui/useReduceMotion'

const TARGET = 44
const IMG_W = 88
const IMG_H = 112
const LOW_STOCK = 5
const BLOCKED_NOTE = 'Fix the items marked above to check out'

const variantLine = ({ size, color: colour }: CartItem['variant']) => [size, colour].filter(Boolean).join(' / ')

function StepButton({ symbol, label, testID, disabled, onPress }: { symbol: string; label: string; testID: string; disabled: boolean; onPress: () => void }) {
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.step, disabled && styles.off]}>
      <Text maxFontSizeMultiplier={1.3} style={styles.stepText}>{symbol}</Text>
    </PressableScale>
  )
}

type RowProps = {
  item: CartItem
  locked: boolean
  pending: boolean
  error?: string
  onOpen: (item: CartItem) => void
  onQuantity: (item: CartItem, quantity: number) => void
  onRemove: (item: CartItem) => void
}

function CartRow({ item, locked, pending, error, onOpen, onQuantity, onRemove }: RowProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { id, quantity, lineTotal, variant, product } = item
  const warn = cartWarning(item)
  const { stock } = variant
  const unavailable = !product.active || (stock !== null && stock <= 0)
  const atMax = !product.active || (stock !== null && quantity >= stock)
  // Past the stock, "-" lands on the stock (a quantity the server accepts). With none left, Remove is the way out.
  const cannotLower = unavailable
  const lowered = stock !== null && quantity > stock ? Math.min(quantity - 1, stock) : quantity - 1
  const decLabel = cannotLower ? `Decrease quantity of ${product.name} unavailable. Remove it instead.` : `Decrease quantity of ${product.name}`
  const lowStock = !warn && stock !== null && stock <= LOW_STOCK
  const showImage = product.image && failedUrl !== product.image
  // The button's label replaces its children for a screen reader, so it carries the details and warnings too.
  const openLabel = [`Open ${product.name}`, variantLine(variant), `${peso(variant.price)} each`, warn, lowStock ? `Only ${stock} left` : null].filter(Boolean).join(', ')
  return (
    <View testID={`cart-row-${id}`} accessibilityState={{ busy: pending }} style={styles.card}>
      <PressableScale testID={`cart-open-${id}`} accessibilityRole="button" accessibilityLabel={openLabel} disabled={!product.id} onPress={() => onOpen(item)} style={styles.top}>
        <View style={[styles.tile, unavailable && styles.dim]}>
          {showImage ? (
            <Image source={{ uri: product.image ?? undefined }} accessible={false} contentFit="cover" transition={200} onError={() => setFailedUrl(product.image)} style={styles.fill} />
          ) : (
            <Text importantForAccessibility="no-hide-descendants" numberOfLines={4} maxFontSizeMultiplier={1.2} style={styles.fallback}>{product.name}</Text>
          )}
        </View>
        <View style={styles.info}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          {variantLine(variant) !== '' && <Text style={styles.variant}>{variantLine(variant)}</Text>}
          <Text accessibilityLabel={`${peso(variant.price)} each`} style={styles.unit}>{peso(variant.price)}</Text>
          {warn && <Text style={styles.warn}>{warn}</Text>}
          {lowStock && <Text style={styles.warn}>{`Only ${stock} left`}</Text>}
        </View>
      </PressableScale>
      <PressableScale
        testID={`cart-remove-${id}`}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${product.name}`}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={() => onRemove(item)}
        style={[styles.remove, locked && styles.off]}>
        <Ionicons name="trash-outline" size={24} color={color.graphite} />
      </PressableScale>
      {error && <Text testID={`cart-row-error-${id}`} accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={styles.controls}>
        <View style={styles.stepper}>
          <StepButton symbol="−" label={decLabel} testID={`cart-dec-${id}`} disabled={locked || quantity <= 1 || cannotLower} onPress={() => onQuantity(item, lowered)} />
          <Text testID={`cart-qty-${id}`} accessibilityLabel={`Quantity ${quantity}`} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.qty}>{quantity}</Text>
          <StepButton symbol="+" label={`Increase quantity of ${product.name}`} testID={`cart-inc-${id}`} disabled={locked || atMax} onPress={() => onQuantity(item, quantity + 1)} />
        </View>
        <View style={styles.lineTotal}>
          {pending ? <ActivityIndicator color={color.obsidian} /> : quantity > 1 && <Text accessibilityLabel={`Line total ${peso(lineTotal)}`} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={styles.total}>{peso(lineTotal)}</Text>}
        </View>
      </View>
    </View>
  )
}

// Same card chrome and heights as CartRow (image, name 2 lines, variant, price, 46px stepper) and the same bar, so the swap does not shift.
function CartSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeleton}>
      <View style={styles.skeletonList}>
        {[0, 1, 2].map((key) => (
          <View key={key} style={styles.card}>
            <View style={styles.top}>
              <Skeleton width={IMG_W} height={IMG_H} radius={radius.soft} />
              <View style={[styles.info, styles.skeletonInfo]}>
                <Skeleton height={40} />
                <Skeleton width="60%" height={20} />
                <Skeleton width="40%" height={24} />
              </View>
            </View>
            <View style={styles.controls}>
              <Skeleton width={134} height={TARGET + 2} radius={radius.soft} />
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.bar, { paddingBottom: space.sm }]}>
        <View style={styles.subtotalRow}>
          <Skeleton width="40%" height={40} />
          <Skeleton width="30%" height={28} />
        </View>
        <Skeleton width="50%" height={20} />
        <Skeleton height={48} />
      </View>
    </View>
  )
}

type Store = { owner: string | null; cart: Cart | null; error: unknown; rowError: { id: string; message: string } | null }
const EMPTY: Store = { owner: null, cart: null, error: null, rowError: null }
// Everything fetched is tagged with its account, so another account never sees it (not even for one render).
const own = (s: Store, uid: string, change: Partial<Store> | ((cur: Store) => Partial<Store>)): Store => {
  const cur = s.owner === uid ? s : { ...EMPTY, owner: uid }
  return { ...cur, ...(typeof change === 'function' ? change(cur) : change) }
}
const without = (cart: Cart, id: string): Cart => {
  const gone = cart.items.find((item) => item.id === id)
  if (!gone) return cart
  return { items: cart.items.filter((item) => item.id !== id), totalItems: cart.totalItems - gone.quantity, subtotal: Math.round((cart.subtotal - gone.lineTotal) * 100) / 100 }
}
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401
const isGone = (failure: unknown) => failure instanceof ApiError && failure.kind === 'not-found'

// Needs a session; the Shop and Product pages stay public. Rows reload on every focus, silently after the first load.
export default function CartScreen() {
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const signedIn = userId !== null
  const toast = useToast()
  const [store, setStore] = useState<Store>(EMPTY)
  const mine = store.owner === userId ? store : EMPTY
  const { cart, error, rowError } = mine
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const reduceMotion = useReduceMotion()
  const barRef = useRef<ComponentRef<typeof View>>(null)
  const lift = useRef(0) // how far the toast must rise to clear the summary bar
  const smooth = useRef(false)
  const notify = useRef<(message: string, above?: boolean) => void>(() => {})
  const toastRef = useRef(toast)
  const out = useRef(signOut)
  const userRef = useRef(userId)
  const cartRef = useRef<Cart | null>(null)
  const busy = useRef(false)
  const opening = useRef(false)
  const asking = useRef(false)
  const seq = useRef(0) // the newest write wins: a load or mutation that started earlier is dropped when it lands
  const expired = useRef(false)
  useEffect(() => {
    toastRef.current = toast
    notify.current = (message, above = true) => toastRef.current(message, above ? { bottom: lift.current } : undefined)
    smooth.current = !reduceMotion
    out.current = signOut
    cartRef.current = cart
  })
  useEffect(() => {
    userRef.current = userId
    seq.current++
    expired.current = false
  }, [userId])

  const write = useCallback((uid: string, change: Partial<Store> | ((cur: Store) => Partial<Store>)) => {
    if (userRef.current === uid) setStore((s) => own(s, uid, change))
  }, [])
  // An answer applied here supersedes any load that started before it.
  const apply = (uid: string, change: Partial<Store> | ((cur: Store) => Partial<Store>)) => {
    seq.current++
    write(uid, change)
  }

  // The backend can reject a token Supabase still holds: sign out once so the prompt is truthful.
  const expire = useCallback(() => {
    if (expired.current) return
    expired.current = true
    notify.current('Your session has expired. Sign in again.', false) // signing out removes the bar
    void out.current()
  }, [])

  // The first failure fills the error state; a failed refresh keeps the rows and toasts.
  const load = useCallback(
    (signal: AbortSignal) => {
      const uid = userId
      if (!uid) return Promise.resolve()
      const started = ++seq.current
      const current = () => !signal.aborted && started === seq.current
      return fetchCart(signal).then(
        (next) => {
          if (current()) write(uid, { cart: next, error: null })
        },
        (failure: unknown) => {
          if (!current()) return
          if (isExpired(failure)) expire()
          else if (cartRef.current) notify.current(errorMessage(failure), cartRef.current.items.length > 0)
          else write(uid, { error: failure })
        },
      )
    },
    [userId, write, expire],
  )

  useFocusEffect(
    useCallback(() => {
      opening.current = false // a fast double tap must not stack two sign-in screens
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
  const open = ({ product }: CartItem) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/product/[id]', params: { id: product.id } })
  }
  const animate = () => {
    if (smooth.current) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  }
  // The bar's top edge in the window decides how high a toast must sit (the toast host sits at the window bottom, over the tab bar,
  // so window coordinates are needed). Safe: measureInWindow and useWindowDimensions both include the system bars, and the bar's
  // onLayout re-fires whenever the window resizes (its y moves), so this is re-measured then. The bar is gone once the bag is empty.
  const measureBar = () =>
    barRef.current?.measureInWindow((_x, y) => {
      lift.current = Math.max(0, windowHeight - y + space.sm - insets.bottom - space.lg)
    })

  // One mutation at a time for the whole bag: every answer is the whole cart, so two in flight could land out of order.
  // `run` returns true when the bag should be reloaded afterwards; that reload fails softly, outside the catch.
  async function mutate(id: string, run: (uid: string) => Promise<boolean | void>) {
    const uid = userId
    if (!uid || busy.current) return
    busy.current = true
    seq.current++
    setBusyId(id)
    write(uid, { rowError: null })
    let reload = false
    try {
      reload = !!(await run(uid))
    } catch (failure) {
      if (isExpired(failure)) expire()
      else {
        const message = failure instanceof ApiError && failure.kind === 'validation' && failure.detail ? failure.detail : errorMessage(failure)
        // The server refused because the stock or the line changed: refresh the row so the stepper and warning match, keeping the error shown.
        reload = failure instanceof ApiError && (failure.kind === 'validation' || failure.kind === 'conflict')
        // Clear Cart has no row to carry the message, so it toasts.
        if (id === '') notify.current(message)
        else write(uid, { rowError: { id, message } })
      }
    } finally {
      busy.current = false
      setBusyId(null)
    }
    if (reload) void load(new AbortController().signal)
  }
  const changeQuantity = (item: CartItem, quantity: number) =>
    mutate(item.id, async (uid) => {
      try {
        apply(uid, { cart: await setCartItemQuantity(item.id, quantity) })
      } catch (failure) {
        if (!isGone(failure)) throw failure
        apply(uid, (cur) => ({ cart: cur.cart && without(cur.cart, item.id) }))
        notify.current('That item is no longer in your cart.', (cartRef.current?.items.length ?? 0) > 1)
        return true
      }
    })
  // One Alert at a time; the lock opens again when it is dismissed or the action ends.
  function confirm(message: string, label: string, action: () => Promise<void>) {
    if (asking.current) return
    asking.current = true
    const release = () => {
      asking.current = false
    }
    Alert.alert(
      'Are you sure?',
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: label, style: 'destructive', onPress: () => void action().finally(release) },
      ],
      { cancelable: true, onDismiss: release },
    )
  }
  const remove = (item: CartItem) =>
    confirm(`Remove ${item.product.name} from your cart?`, 'Remove Item', () =>
      mutate(item.id, async (uid) => {
        try {
          await removeCartItem(item.id)
        } catch (failure) {
          if (!isGone(failure)) throw failure // already gone counts as removed
        }
        const last = (cartRef.current?.items.length ?? 0) <= 1
        animate()
        apply(uid, (cur) => ({ cart: cur.cart && without(cur.cart, item.id) }))
        notify.current('Item removed', !last)
        return true
      }),
    )
  const clear = () =>
    confirm('Everything in your cart will be removed.', 'Clear All Items', () =>
      mutate('', async (uid) => {
        await clearCart()
        animate()
        apply(uid, { cart: { items: [], totalItems: 0, subtotal: 0 } })
        notify.current('Cart cleared', false)
        return true
      }),
    )

  const count = cart?.totalItems ?? 0
  const blocked = !!cart?.items.some((item) => cartWarning(item) !== null)
  const checkout = () => {
    if (opening.current) return
    opening.current = true
    router.push('/checkout')
  }

  const header = (
    <View style={styles.header} />
  )

  if (loading || (signedIn && !cart && !error)) {
    return (
      <View style={styles.screen}>
        {header}
        <CartSkeleton />
      </View>
    )
  }
  if (!signedIn) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Sign in to see your cart" message="Your bag is saved to your account once you sign in." actionLabel="Sign In" onAction={signIn} testID="cart-sign-in" />
        </View>
      </View>
    )
  }
  if (!cart) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage alert title="Couldn't load your cart" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="cart-retry" />
        </View>
      </View>
    )
  }
  if (cart.items.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.message}>
          <StateMessage title="Your cart is empty" message="Pieces you add show up here." actionLabel="Browse the Shop" onAction={() => router.navigate('/')} testID="cart-empty-action" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="cart-list"
            style={styles.grow}
            contentContainerStyle={styles.listContent}
            data={cart.items}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={header}
            renderItem={({ item }) => (
              <CartRow item={item} locked={busyId !== null} pending={busyId === item.id} error={rowError?.id === item.id ? rowError.message : undefined} onOpen={open} onQuantity={changeQuantity} onRemove={remove} />
            )}
            ListFooterComponent={
              <PressableScale testID="cart-clear" accessibilityRole="button" accessibilityLabel="Clear cart" accessibilityState={{ disabled: busyId !== null, busy: busyId === '' }} disabled={busyId !== null} onPress={clear} style={[styles.clear, busyId !== null && styles.off]}>
                {busyId === '' ? <ActivityIndicator color={color.graphite} /> : <Text style={styles.clearText}>Clear Cart</Text>}
              </PressableScale>
            }
          />
        )}
      </PullToRefresh>
      <View testID="cart-bar" ref={barRef} onLayout={measureBar} style={[styles.bar, { paddingBottom: space.sm }]}>
        <View style={styles.subtotalRow}>
          <View style={styles.grow}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text testID="cart-count" style={styles.count}>{`${count} ${count === 1 ? 'Item' : 'Items'}`}</Text>
          </View>
          <Text testID="cart-subtotal" maxFontSizeMultiplier={1.3} style={styles.subtotal}>{peso(cart.subtotal)}</Text>
        </View>
        {blocked && <Text testID="cart-checkout-note" accessibilityLiveRegion="polite" style={styles.note}>{BLOCKED_NOTE}</Text>}
        <Button testID="cart-checkout" label="Checkout" disabled={blocked || busyId !== null} accessibilityHint={blocked ? BLOCKED_NOTE : undefined} onPress={checkout} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space.lg },
  message: { padding: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  grow: { flex: 1 },
  card: { marginHorizontal: space.lg, marginBottom: space.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: color.porcelain, borderRadius: radius.soft, backgroundColor: color.paper },
  top: { flexDirection: 'row', gap: space.md },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: space.xs },
  dim: { opacity: 0.5 },
  fill: { position: 'absolute', width: '100%', height: '100%' },
  fallback: { ...type.small, color: color.graphite, textAlign: 'center' },
  info: { flex: 1, gap: space.xs, paddingRight: TARGET - space.sm },
  skeletonInfo: { paddingRight: 0 },
  name: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  variant: { ...type.small, color: color.graphite },
  unit: { fontFamily: font.bold, fontSize: 16, lineHeight: 24, color: color.red, ...type.numeric },
  warn: { ...type.small, fontFamily: font.medium, color: color.red },
  error: { ...type.small, color: color.red, borderLeftWidth: 4, borderLeftColor: color.red, paddingLeft: space.sm },
  remove: { position: 'absolute', top: space.xs, right: space.xs, width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: color.stonewash, borderRadius: radius.soft, overflow: 'hidden' },
  step: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...type.h2 },
  qty: { ...type.body, ...type.numeric, minWidth: TARGET, textAlign: 'center' },
  lineTotal: { flex: 1, minWidth: 0, minHeight: TARGET, alignItems: 'flex-end', justifyContent: 'center' },
  total: { ...type.h2, ...type.numeric, textAlign: 'right', flexShrink: 1 },
  off: { opacity: 0.4 },
  clear: { minHeight: TARGET, alignSelf: 'flex-start', marginHorizontal: space.lg, justifyContent: 'center' },
  clearText: { ...type.small, color: color.graphite, textDecorationLine: 'underline' },
  skeleton: { flex: 1 },
  skeletonList: { flex: 1 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  subtotalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  subtotalLabel: { ...type.label },
  count: { ...type.small, ...type.numeric, color: color.graphite },
  subtotal: { ...type.h1, ...type.numeric, textAlign: 'right' },
  note: { ...type.small, color: color.graphite },
})
