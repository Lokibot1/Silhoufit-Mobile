import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { clearCart, fetchCart, removeCartItem, setCartItemQuantity, type Cart, type CartItem } from '@/api/cart'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const TARGET = 44
const IMG_W = 72
const IMG_H = 96

const variantLine = ({ size, color: colour }: CartItem['variant']) => [size && `Size ${size}`, colour].filter(Boolean).join(' // ')

// What is wrong with the line right now (the server may have lowered the stock or pulled the product since it was added).
function warning({ quantity, variant, product }: CartItem): string | null {
  if (!product.active) return 'No longer available. Remove it to continue.'
  if (variant.stock !== null && variant.stock <= 0) return 'Out of stock. Remove it to continue.'
  if (variant.stock !== null && variant.stock < quantity) return `Only ${variant.stock} left. Lower the quantity.`
  return null
}

function StepButton({ symbol, label, testID, disabled, onPress }: { symbol: string; label: string; testID: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.step, disabled && styles.off]}>
      <Text style={styles.stepText}>{symbol}</Text>
    </Pressable>
  )
}

type RowProps = { item: CartItem; locked: boolean; pending: boolean; error?: string; onQuantity: (item: CartItem, quantity: number) => void; onRemove: (item: CartItem) => void }

function CartRow({ item, locked, pending, error, onQuantity, onRemove }: RowProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { id, quantity, lineTotal, variant, product } = item
  const warn = warning(item)
  const { stock } = variant
  const atMax = !product.active || (stock !== null && quantity >= stock)
  // Past the stock, "-" lands on the stock (a quantity the server accepts). With none left, Remove is the way out.
  const cannotLower = !product.active || (stock !== null && stock <= 0)
  const lowered = stock !== null && quantity > stock ? Math.min(quantity - 1, stock) : quantity - 1
  const decLabel = cannotLower ? `Decrease quantity of ${product.name} unavailable. Remove it instead.` : `Decrease quantity of ${product.name}`
  return (
    <View testID={`cart-row-${id}`} accessibilityState={{ busy: pending }} style={styles.row}>
      <View style={styles.tile}>
        {product.image && failedUrl !== product.image && (
          <Image source={{ uri: product.image }} accessible={false} contentFit="cover" onError={() => setFailedUrl(product.image)} style={styles.fill} />
        )}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
        {variantLine(variant) !== '' && <Text style={styles.variant}>{variantLine(variant)}</Text>}
        <Text style={styles.unit}>{`${peso(variant.price)} each`}</Text>
        <Text accessibilityLabel={`Line total ${peso(lineTotal)}`} style={styles.total}>{peso(lineTotal)}</Text>
        {warn && <Text style={styles.warn}>{warn}</Text>}
        {error && <Text testID={`cart-row-error-${id}`} accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={styles.controls}>
          <View style={styles.stepper}>
            <StepButton symbol="−" label={decLabel} testID={`cart-dec-${id}`} disabled={locked || quantity <= 1 || cannotLower} onPress={() => onQuantity(item, lowered)} />
            <Text testID={`cart-qty-${id}`} accessibilityLabel={`Quantity ${quantity}`} accessibilityLiveRegion="polite" style={styles.qty}>{quantity}</Text>
            <StepButton symbol="+" label={`Increase quantity of ${product.name}`} testID={`cart-inc-${id}`} disabled={locked || atMax} onPress={() => onQuantity(item, quantity + 1)} />
          </View>
          <View style={styles.spinner}>{pending && <ActivityIndicator color={color.obsidian} />}</View>
          <Pressable
            testID={`cart-remove-${id}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${product.name} from cart`}
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => onRemove(item)}
            style={[styles.remove, locked && styles.off]}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

// Same row chrome and line heights as CartRow (name 2 lines, variant, unit, total, 44px controls) so the swap does not shift.
function CartSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.row}>
          <Skeleton width={IMG_W} height={IMG_H} />
          <View style={styles.info}>
            <Skeleton height={40} />
            <Skeleton width="60%" height={20} />
            <Skeleton width="40%" height={20} />
            <Skeleton width="30%" height={24} />
            <Skeleton width={132} height={TARGET} />
          </View>
        </View>
      ))}
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
  const notify = useRef(toast)
  const out = useRef(signOut)
  const userRef = useRef(userId)
  const cartRef = useRef<Cart | null>(null)
  const busy = useRef(false)
  const opening = useRef(false)
  const asking = useRef(false)
  const seq = useRef(0) // the newest write wins: a load or mutation that started earlier is dropped when it lands
  const expired = useRef(false)
  useEffect(() => {
    notify.current = toast
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
      return fetchCart(signal).then(
        (next) => {
          if (current()) write(uid, { cart: next, error: null })
        },
        (failure: unknown) => {
          if (!current()) return
          if (isExpired(failure)) expire()
          else if (cartRef.current) notify.current(errorMessage(failure))
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
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

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
        notify.current('That item is no longer in your cart.')
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
        apply(uid, (cur) => ({ cart: cur.cart && without(cur.cart, item.id) }))
        notify.current('Item removed')
        return true
      }),
    )
  const clear = () =>
    confirm('Everything in your cart will be removed.', 'Clear All Items', () =>
      mutate('', async (uid) => {
        await clearCart()
        apply(uid, { cart: { items: [], totalItems: 0, subtotal: 0 } })
        notify.current('Cart cleared')
        return true
      }),
    )

  const count = cart?.totalItems ?? 0

  const header = (
    <View style={styles.header}>
      <Text style={type.label}>(Your Bag)</Text>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[type.h1, styles.grow]}>Cart</Text>
        {count > 0 && <Text testID="cart-count" style={styles.count}>{`${count} ${count === 1 ? 'Item' : 'Items'}`}</Text>}
      </View>
    </View>
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
    <FlatList
      testID="cart-list"
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      data={cart.items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <CartRow item={item} locked={busyId !== null} pending={busyId === item.id} error={rowError?.id === item.id ? rowError.message : undefined} onQuantity={changeQuantity} onRemove={remove} />
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <View style={styles.subtotalRow}>
            <Text style={[type.label, styles.grow]}>(Subtotal)</Text>
            <Text testID="cart-subtotal" style={styles.subtotal}>{peso(cart.subtotal)}</Text>
          </View>
          <Button testID="cart-clear" variant="secondary" label="Clear Cart" accessibilityLabel="Clear cart" pending={busyId === ''} disabled={busyId !== null} onPress={clear} />
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space.xxl },
  message: { padding: space.lg },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  grow: { flex: 1 },
  count: { ...type.label, ...type.numeric, textAlign: 'right' },
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.lg, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain },
  fill: { width: '100%', height: '100%' },
  info: { flex: 1, gap: space.xs },
  name: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  variant: { ...type.small, color: color.graphite },
  unit: { ...type.small, ...type.numeric, color: color.graphite, textAlign: 'right' },
  total: { ...type.h2, ...type.numeric, textAlign: 'right' },
  warn: { ...type.small, color: color.red },
  error: { ...type.small, color: color.red, borderLeftWidth: 4, borderLeftColor: color.red, paddingLeft: space.sm },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  step: { width: TARGET, height: TARGET, borderWidth: 1, borderColor: color.obsidian, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...type.h2 },
  qty: { ...type.body, ...type.numeric, minWidth: TARGET, textAlign: 'center' },
  spinner: { width: space.xl, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  remove: { minHeight: TARGET, minWidth: TARGET, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
  removeText: { ...type.label, color: color.obsidian, textDecorationLine: 'underline' },
  off: { opacity: 0.4 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  subtotalRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  subtotal: { ...type.h2, ...type.numeric, textAlign: 'right' },
})
