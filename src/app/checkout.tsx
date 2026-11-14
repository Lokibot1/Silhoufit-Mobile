import { router, Stack, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchAddresses } from '@/api/addresses'
import { fetchCart } from '@/api/cart'
import { quoteShipping } from '@/api/orders'
import { useSession } from '@/auth/session'
import { ApiError } from '@/lib/api'
import { peso } from '@/lib/format'
import { useRequest } from '@/lib/useRequest'
import { AddressSheet, hasPin } from '@/checkout/AddressSheet'
import { AddressSection, ItemsSection, PaymentSection, ShippingSection, SummarySection, totals } from '@/checkout/Sections'
import { Button } from '@/ui/Button'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'

const TARGET = 44
// Waits for a session (or an address) before asking: the request stays "loading" until the key changes.
const idle = () => new Promise<never>(() => {})
const isExpired = (failure: unknown) => failure instanceof ApiError && failure.status === 401

// Step 3 of checkout: review only. Placing the order is not built yet. Each section owns its data, so one failing never blanks the page.
export default function CheckoutScreen() {
  const { session, loading, signOut } = useSession()
  const userId = session?.user.id ?? null
  const insets = useSafeAreaInsets()
  const cart = useRequest(`${userId}:cart`, (signal) => (userId ? fetchCart(signal) : idle()))
  const addresses = useRequest(`${userId}:addresses`, (signal) => (userId ? fetchAddresses(signal) : idle()))
  const [chosen, setChosen] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const opening = useRef(false)

  const list = addresses.data ?? []
  // The address picked, else the default one (the list is default first) that has a map pin.
  const selected = list.find((a) => a.id === chosen && hasPin(a)) ?? list.find(hasPin) ?? null
  // The quote carries its `expiresAt`; the order step must re-quote once it passes.
  const quote = useRequest(`${userId}:${selected?.id}`, (signal) => (selected ? quoteShipping(selected.id, signal) : idle()))

  // The backend can reject a token Supabase still holds: sign out so the prompt is truthful.
  const lapsed = [cart.error, addresses.error, quote.error].some(isExpired)
  useEffect(() => {
    if (lapsed) void signOut()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapsed])

  // A fast double tap must not stack two sign-in screens; allow it again when this screen regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
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
              <Pressable testID="checkout-header-back" accessibilityRole="button" accessibilityLabel="Cart" onPress={() => router.navigate('/cart')} style={styles.headerBack}>
                <Text style={[type.label, { color: color.obsidian }]}>Cart</Text>
              </Pressable>
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
  const amounts = totals(cart.data?.subtotal ?? null, quote.data?.shippingFee ?? null)
  const hint = addresses.status !== 'ready' || selected ? null : list.length === 0 ? 'Add an address first' : 'Choose an address with a map pin'

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView testID="checkout-scroll" contentContainerStyle={styles.content}>
        <View style={styles.title}>
          <Text style={type.label}>(Review)</Text>
          <Text accessibilityRole="header" style={type.h1}>Checkout</Text>
        </View>
        <AddressSection req={addresses} selected={selected} onChange={() => setPicking(true)} />
        <ItemsSection req={cart} />
        <ShippingSection idle={idleShipping} req={quote} />
        <PaymentSection />
        <SummarySection {...amounts} />
      </ScrollView>
      <View testID="checkout-bar" style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.totalRow}>
          <Text style={[type.label, styles.grow]}>Total</Text>
          <Text testID="checkout-bar-total" maxFontSizeMultiplier={1.3} style={styles.total}>{amounts.total === null ? '—' : peso(amounts.total)}</Text>
        </View>
        {hint && <Text testID="checkout-bar-hint" style={styles.note}>{hint}</Text>}
        <Text testID="checkout-place-note" style={styles.note}>Placing orders is coming next</Text>
        <Button testID="checkout-place-order" label="Place Order" disabled accessibilityHint="Placing orders is coming next" onPress={() => {}} />
      </View>
      <AddressSheet
        visible={picking}
        addresses={list}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          setChosen(id)
          setPicking(false)
        }}
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
  note: { ...type.small, color: color.graphite },
})
