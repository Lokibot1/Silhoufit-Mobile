import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, LayoutAnimation, StyleSheet, Text, View } from 'react-native'

import { fetchCart, removeCartItem, removeCartItems, setCartItemQuantity, type Cart, type CartItem } from '@/api/cart'
import { useSession } from '@/auth/session'
import { cartWarning } from '@/checkout/cartWarning'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { useReduceMotion } from '@/ui/useReduceMotion'

const TARGET = 44
const IMG_W = 80
const IMG_H = 100
const LOW_STOCK = 5
const BULK = 'bulk' // busyId of Remove (n): not a row id
const BLOCKED_NOTE = 'Fix the items marked above to check out'

const variantLine = ({ size, color: colour }: CartItem['variant']) => [size, colour].filter(Boolean).join(' / ')

function StepButton({ symbol, label, testID, disabled, onPress }: { symbol: string; label: string; testID: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles()
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
  checked: boolean
  editing: boolean
  error?: string
  onToggle: (id: string) => void
  onOpen: (item: CartItem) => void
  onQuantity: (item: CartItem, quantity: number) => void
  onRemove: (item: CartItem) => void
}

function CartRow({ item, locked, pending, checked, editing, error, onToggle, onOpen, onQuantity, onRemove }: RowProps) {
  const styles = useStyles()
  const { color } = useTheme()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const { id, quantity, variant, product } = item
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
    <View testID={`cart-row-${id}`} accessibilityState={{ busy: pending }} style={styles.row}>
      <View style={styles.rowMain}>
        <PressableScale
          testID={`cart-check-${id}`}
          accessibilityRole="checkbox"
          accessibilityLabel={`Select ${product.name}`}
          accessibilityState={{ checked, disabled: locked }}
          disabled={locked}
          onPress={() => onToggle(id)}
          style={[styles.check, locked && styles.off]}>
          <View style={[styles.box, checked && styles.boxOn]}>{checked && <Ionicons name="checkmark" size={16} color={color.paper} />}</View>
        </PressableScale>
        <PressableScale testID={`cart-open-${id}`} accessibilityRole="button" accessibilityLabel={openLabel} disabled={!product.id} onPress={() => onOpen(item)} style={styles.open}>
          <View style={[styles.tile, unavailable && styles.dim]}>
            {showImage ? (
              <Image source={{ uri: product.image ?? undefined }} accessible={false} contentFit="cover" transition={200} onError={() => setFailedUrl(product.image)} style={styles.fill} />
            ) : (
              <Text importantForAccessibility="no-hide-descendants" numberOfLines={4} maxFontSizeMultiplier={1.2} style={styles.fallback}>{product.name}</Text>
            )}
          </View>
          <View style={styles.info}>
            <Text numberOfLines={1} style={styles.name}>{product.name}</Text>
            {variantLine(variant) !== '' && <Text numberOfLines={1} style={styles.variant}>{variantLine(variant)}</Text>}
            <Text accessibilityLabel={`${peso(variant.price)} each`} style={styles.unit}>{peso(variant.price)}</Text>
            {warn && <Text style={styles.warn}>{warn}</Text>}
            {lowStock && <Text style={styles.warn}>{`Only ${stock} left`}</Text>}
          </View>
        </PressableScale>
        {/* Siblings of the open button, never inside it: a screen reader would hide them. */}
        {editing ? (
          <PressableScale
            testID={`cart-remove-${id}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${product.name}`}
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => onRemove(item)}
            style={[styles.trash, locked && styles.off]}>
            {pending ? <ActivityIndicator color={color.obsidian} /> : <Ionicons name="trash-outline" size={24} color={color.graphite} />}
          </PressableScale>
        ) : (
          <View style={styles.stepper}>
            <StepButton symbol="−" label={decLabel} testID={`cart-dec-${id}`} disabled={locked || quantity <= 1 || cannotLower} onPress={() => onQuantity(item, lowered)} />
            {pending ? (
              <View style={styles.qtyCell}><ActivityIndicator color={color.obsidian} /></View>
            ) : (
              <Text testID={`cart-qty-${id}`} accessibilityLabel={`Quantity ${quantity}`} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.qty}>{quantity}</Text>
            )}
            <StepButton symbol="+" label={`Increase quantity of ${product.name}`} testID={`cart-inc-${id}`} disabled={locked || atMax} onPress={() => onQuantity(item, quantity + 1)} />
          </View>
        )}
      </View>
      {error && <Text testID={`cart-row-error-${id}`} accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  )
}

// Same row geometry as CartRow (44px check slot, 80x100 image, name, chip, price, the stepper's reserved line) and the same bar, so the swap does not shift.
function CartSkeleton() {
  const styles = useStyles()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeleton}>
      <View style={styles.skeletonList}>
        {[0, 1, 2].map((key) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowMain}>
              <View style={styles.check} />
              <View style={styles.open}>
                <Skeleton width={IMG_W} height={IMG_H} radius={radius.soft} />
                <View style={styles.info}>
                  <Skeleton height={20} />
                  <Skeleton width="60%" height={28} />
                  <Skeleton width="40%" height={24} />
                </View>
              </View>
              <View style={styles.stepper}>
                <Skeleton width={TARGET * 3} height={TARGET} radius={radius.soft} />
              </View>
            </View>
          </View>
        ))}
      </View>
      <View style={[styles.bar, { paddingBottom: space.sm }]}>
        <View style={styles.barRow}>
          <View style={styles.selectAll}>
            <Skeleton width={24} height={24} radius={radius.pill} />
          </View>
          <View style={styles.skeletonSubtotal}>
            <Skeleton width="30%" height={24} />
          </View>
          <Skeleton width={140} height={48} radius={radius.soft} />
        </View>
      </View>
    </View>
  )
}

type Store = { owner: string | null; cart: Cart | null; error: unknown; rowError: { id: string; message: string } | null; selected: string[] }
const EMPTY: Store = { owner: null, cart: null, error: null, rowError: null, selected: [] }
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
  const styles = useStyles()
  const { color, type } = useTheme()
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const signedIn = userId !== null
  const toast = useToast()
  const [store, setStore] = useState<Store>(EMPTY)
  const mine = store.owner === userId ? store : EMPTY
  const { cart, error, rowError, selected } = mine
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const reduceMotion = useReduceMotion()
  const smooth = useRef(false)
  const notify = useRef<(message: string) => void>(() => {})
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
    notify.current = (message) => toastRef.current(message)
    smooth.current = !reduceMotion
    out.current = signOut
    cartRef.current = cart
  })
  useEffect(() => {
    userRef.current = userId
    seq.current++
    expired.current = false
  }, [userId])

  // Edit mode ends with the last row, so a refilled cart (or another account's) never reopens in it.
  const rowCount = cart?.items.length ?? 0
  if (rowCount === 0 && editing) setEditing(false)

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
        // Remove (n) has no single row to carry the message, so it toasts.
        if (id === BULK) notify.current(message)
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
        animate()
        apply(uid, (cur) => ({ cart: cur.cart && without(cur.cart, item.id) }))
        notify.current('Item removed')
        return true
      }),
    )

  // Only ticked lines count; a tick for a line that has vanished drops out here.
  const chosen = cart?.items.filter((item) => selected.includes(item.id)) ?? []
  const count = chosen.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = Math.round(chosen.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100
  const all = !!cart && cart.items.length > 0 && chosen.length === cart.items.length
  const blocked = chosen.some((item) => cartWarning(item) !== null)
  const toggle = (id: string) => {
    if (userId) write(userId, (cur) => ({ selected: cur.selected.includes(id) ? cur.selected.filter((x) => x !== id) : [...cur.selected, id] }))
  }
  const toggleAll = () => {
    if (userId) write(userId, { selected: all ? [] : (cart?.items ?? []).map((item) => item.id) })
  }
  const removeSelected = () => {
    const ids = chosen.map((item) => item.id)
    const single = ids.length === 1 ? chosen[0].product.name : null
    confirm(single ? `Remove ${single} from your cart?` : `Remove ${ids.length} items from your cart?`, single ? 'Remove Item' : `Remove ${ids.length} Items`, () =>
      mutate(BULK, async (uid) => {
        let next: Cart
        try {
          next = await removeCartItems(ids)
        } catch (failure) {
          if (!isGone(failure)) throw failure
          // Nothing was removed: keep the ids still in the bag and send them again.
          const fresh = await fetchCart()
          const left = ids.filter((id) => fresh.items.some((item) => item.id === id))
          next = left.length ? await removeCartItems(left) : fresh
        }
        animate()
        apply(uid, { cart: next, selected: [] })
        notify.current(single ? `Removed ${single} from cart` : `Removed ${ids.length} items from cart`)
      }),
    )
  }
  const checkout = () => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/checkout', params: { items: chosen.map((item) => item.id).join(',') } })
  }

  const header = (
    <Stack.Screen
      options={{
        headerTitle: () => <Text accessibilityRole="header" style={type.h2}>{cart ? `Shopping cart (${cart.totalItems})` : 'Shopping cart'}</Text>,
        headerRight: cart?.items.length
          ? () => (
              <PressableScale testID="cart-edit" accessibilityRole="button" accessibilityLabel={editing ? 'Done editing' : 'Edit cart'} onPress={() => setEditing(!editing)} style={styles.edit}>
                <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
              </PressableScale>
            )
          : undefined,
      }}
    />
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
      {header}
      <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="cart-list"
            style={styles.grow}
            contentContainerStyle={styles.listContent}
            data={cart.items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CartRow item={item} locked={busyId !== null} pending={busyId === item.id} checked={selected.includes(item.id)} editing={editing} error={rowError?.id === item.id ? rowError.message : undefined} onToggle={toggle} onOpen={open} onQuantity={changeQuantity} onRemove={remove} />
            )}
          />
        )}
      </PullToRefresh>
      <View testID="cart-bar" style={[styles.bar, { paddingBottom: space.sm }]}>
        {blocked && !editing && <Text testID="cart-checkout-note" accessibilityLiveRegion="polite" style={styles.note}>{BLOCKED_NOTE}</Text>}
        <View style={styles.barRow}>
          <PressableScale
            testID="cart-select-all"
            accessibilityRole="checkbox"
            accessibilityLabel="Select all"
            accessibilityState={{ checked: all ? true : chosen.length > 0 ? 'mixed' : false, disabled: busyId !== null }}
            disabled={busyId !== null}
            onPress={toggleAll}
            style={[styles.selectAll, busyId !== null && styles.off]}>
            <View style={[styles.box, chosen.length > 0 && styles.boxOn]}>{chosen.length > 0 && <Ionicons name={all ? 'checkmark' : 'remove'} size={16} color={color.paper} />}</View>
            <Text style={styles.selectText}>All</Text>
          </PressableScale>
          {editing ? (
            <>
              <View style={styles.grow} />
              <Button
                testID="cart-remove-selected"
                variant="secondary"
                label={`Remove (${chosen.length})`}
                accessibilityLabel={`Remove ${chosen.length} selected items`}
                disabled={chosen.length === 0 || busyId !== null}
                onPress={removeSelected}
              />
            </>
          ) : (
            <>
              <Text testID="cart-subtotal" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={styles.subtotal}>{peso(subtotal)}</Text>
              <Button testID="cart-checkout" label={`Check out (${count})`} disabled={chosen.length === 0 || blocked || busyId !== null} accessibilityHint={blocked ? BLOCKED_NOTE : undefined} onPress={checkout} />
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const useStyles = themed(({ color, type, hairline }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space.lg },
  message: { padding: space.lg },
  grow: { flex: 1 },
  edit: { minWidth: TARGET, minHeight: TARGET, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  editText: { ...type.body, fontFamily: font.medium },
  row: { borderBottomWidth: 1, borderBottomColor: color.porcelain },
  rowMain: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingLeft: space.xs, paddingRight: space.lg },
  open: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  check: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  box: { ...hairline, borderColor: color.obsidian, borderRadius: radius.pill, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.obsidian },
  selectAll: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  selectText: { ...type.small, fontFamily: font.medium, color: color.obsidian },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: space.xs },
  dim: { opacity: 0.5 },
  fill: { position: 'absolute', width: '100%', height: '100%' },
  fallback: { ...type.small, color: color.graphite, textAlign: 'center' },
  info: { flex: 1, minWidth: 0, gap: space.xs, paddingBottom: TARGET + space.xs }, // the bottom reserve is the stepper's line
  name: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  variant: { ...type.small, alignSelf: 'flex-start', maxWidth: '100%', color: color.graphite, backgroundColor: color.porcelain, borderRadius: radius.soft, paddingHorizontal: space.sm, paddingVertical: space.xs },
  unit: { fontFamily: font.bold, fontSize: 16, lineHeight: 24, color: color.redInk, ...type.numeric },
  warn: { ...type.small, fontFamily: font.medium, color: color.redInk },
  error: { ...type.small, color: color.redInk, borderLeftWidth: 4, borderLeftColor: color.red, paddingLeft: space.sm, marginHorizontal: space.lg, marginBottom: space.md },
  trash: { position: 'absolute', right: space.lg, bottom: space.md, width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  stepper: { position: 'absolute', right: space.lg, bottom: space.md, flexDirection: 'row', alignItems: 'center', backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden' },
  step: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  stepText: { ...type.h2 },
  qty: { ...type.body, ...type.numeric, minWidth: TARGET, textAlign: 'center' },
  qtyCell: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  skeleton: { flex: 1 },
  skeletonList: { flex: 1 },
  skeletonSubtotal: { flex: 1, alignItems: 'flex-end' },
  bar: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  subtotal: { ...type.h2, ...type.numeric, flex: 1, minWidth: 0, textAlign: 'right' },
  note: { ...type.small, color: color.graphite },
}))
