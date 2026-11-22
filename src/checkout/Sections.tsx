import { Image } from 'expo-image'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { Address } from '@/api/addresses'
import type { Cart, CartItem } from '@/api/cart'
import { deliveryProblem, type ShippingQuote } from '@/api/orders'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { Skeleton } from '@/ui/Skeleton'
import { font, radius, space, themed, useTheme } from '@/ui/theme'

import { addressLines } from './AddressLines'
import { cartWarning } from './cartWarning'

const IMG_W = 56
const IMG_H = 72

export type Req<T> = { status: 'loading' | 'ready' | 'error'; data?: T; error?: unknown; retry: () => void }

function Card({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const styles = useStyles()
  const { type } = useTheme()
  return (
    <View testID={testID} style={styles.card}>
      <Text accessibilityRole="header" style={type.label}>{title}</Text>
      {children}
    </View>
  )
}

function Loading({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles()
  return <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={styles.gap}>{children}</View>
}

function Failure({ message, label, testID, onRetry, onPick }: { message: string; label: string; testID: string; onRetry?: () => void; onPick?: () => void }) {
  const styles = useStyles()
  return (
    <View accessibilityRole="alert" style={styles.gap}>
      <Text style={styles.body}>{message}</Text>
      {onPick && <Button testID="checkout-shipping-pick" label="Pick another address" variant="secondary" onPress={onPick} />}
      {onRetry && <HeaderIcon testID={testID} name="refresh" label={label} onPress={onRetry} />}
    </View>
  )
}

export function AddressSection({ req, selected, onChange, onAdd, disabled = false }: { req: Req<Address[]>; selected: Address | null; onChange: () => void; onAdd: () => void; disabled?: boolean }) {
  const styles = useStyles()
  const list = req.data ?? []
  let body: ReactNode
  if (req.status === 'loading') {
    body = (
      <Loading label="Loading delivery address">
        <Skeleton width="60%" height={24} />
        <Skeleton height={24} />
        <Skeleton width="80%" height={24} />
      </Loading>
    )
  } else if (req.status === 'error') {
    body = <Failure message={errorMessage(req.error)} label="Retry loading delivery address" testID="checkout-address-retry" onRetry={req.retry} />
  } else if (list.length === 0) {
    body = (
      <View style={styles.gap}>
        <Text style={styles.body}>You have no saved delivery address yet.</Text>
        <Button testID="checkout-address-add" label="Add a delivery address" disabled={disabled} onPress={onAdd} />
      </View>
    )
  } else {
    const lines = selected && addressLines(selected)
    body = (
      <View style={styles.gap}>
        {selected && lines ? (
          <View testID="checkout-address" style={styles.gap}>
            <Text style={styles.name}>{`${selected.recipientName} | ${selected.phone}`}</Text>
            <Text style={styles.body}>{lines.street}</Text>
            <Text style={styles.body}>{lines.area}</Text>
          </View>
        ) : (
          <Text testID="checkout-address-none" style={styles.body}>None of your addresses has a map pin yet. Edit one in Delivery Addresses to add its pin, or add a new address.</Text>
        )}
        <HeaderIcon testID="checkout-address-change" name="create-outline" label="Change delivery address" disabled={disabled} onPress={onChange} />
      </View>
    )
  }
  return <Card title="(Delivery Address)">{body}</Card>
}

const variantLine = ({ size, color: colour }: CartItem['variant']) => [size && `Size ${size}`, colour].filter(Boolean).join(' / ')

function ItemRow({ item }: { item: CartItem }) {
  const styles = useStyles()
  const [failed, setFailed] = useState(false)
  const { quantity, lineTotal, variant, product } = item
  const warn = cartWarning(item)
  return (
    <View testID={`checkout-item-${item.id}`} style={styles.item}>
      <View style={styles.tile}>
        {product.image && !failed ? (
          <Image source={{ uri: product.image }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />
        ) : (
          <Text importantForAccessibility="no-hide-descendants" numberOfLines={4} maxFontSizeMultiplier={1.2} style={styles.fallback}>{product.name}</Text>
        )}
      </View>
      <View style={styles.grow}>
        <Text numberOfLines={2} style={styles.itemName}>{product.name}</Text>
        {variantLine(variant) !== '' && <Text style={styles.small}>{variantLine(variant)}</Text>}
        {warn && <Text style={styles.warn}>{warn}</Text>}
        <Text accessibilityLabel={`${quantity} times ${peso(variant.price)}`} maxFontSizeMultiplier={1.3} style={styles.qty}>{`${quantity} × ${peso(variant.price)}`}</Text>
        <Text accessibilityLabel={`Line total ${peso(lineTotal)}`} maxFontSizeMultiplier={1.3} style={styles.lineTotal}>{peso(lineTotal)}</Text>
      </View>
    </View>
  )
}

export function ItemsSection({ req }: { req: Req<Cart> }) {
  const styles = useStyles()
  let body: ReactNode
  if (req.status === 'loading') {
    body = (
      <Loading label="Loading items">
        {[0, 1].map((key) => (
          <View key={key} style={styles.item}>
            <Skeleton width={IMG_W} height={IMG_H} radius={radius.soft} />
            <View style={styles.grow}>
              <Skeleton height={20} />
              <Skeleton width="50%" height={20} />
              <Skeleton width="40%" height={20} />
              <Skeleton width="40%" height={24} />
            </View>
          </View>
        ))}
      </Loading>
    )
  } else if (req.status === 'error') {
    body = <Failure message={errorMessage(req.error)} label="Retry loading items" testID="checkout-items-retry" onRetry={req.retry} />
  } else body = req.data?.items.map((item) => <ItemRow key={item.id} item={item} />)
  return <Card title="(Items)" testID="checkout-items">{body}</Card>
}

// A 400 naming coordinates means the address has no map pin; the server's own text is not shown.
function shippingCopy(error: unknown): string {
  const problem = deliveryProblem(error)
  if (problem) return problem.message
  if (error instanceof ApiError && error.kind === 'validation' && /coordinates/i.test(error.detail ?? '')) return "This address has no map pin, so we can't price delivery. Choose another address."
  if (error instanceof ApiError && error.kind === 'rate-limit') return 'Too many shipping requests. Wait a moment and tap Retry.'
  if (error instanceof ApiError && error.kind === 'network') return "Can't reach the server to price delivery. Check your connection and tap Retry."
  return errorMessage(error)
}

// `idle`: the fee cannot be asked for yet because the address is still loading or missing.
export function ShippingSection({ idle, req, onPick }: { idle: 'loading' | 'none' | null; req: Req<ShippingQuote>; onPick: () => void }) {
  const styles = useStyles()
  let body: ReactNode
  if (idle === 'loading' || (!idle && req.status === 'loading')) {
    body = (
      <Loading label="Loading shipping fee">
        <Skeleton width="50%" height={24} />
      </Loading>
    )
  } else if (idle === 'none') body = <Text testID="checkout-shipping-idle" style={styles.body}>Choose a delivery address to see the shipping fee.</Text>
  else if (req.status === 'error') {
    const problem = deliveryProblem(req.error)
    body = <Failure message={shippingCopy(req.error)} label="Retry shipping fee" testID="checkout-shipping-retry" onRetry={problem?.retry === false ? undefined : req.retry} onPick={problem?.undeliverable ? onPick : undefined} />
  }
  else if (req.data) {
    body = (
      <View style={styles.row}>
        <Text testID="checkout-courier" style={[styles.body, styles.grow]}>{req.data.courier}</Text>
        <Text testID="checkout-shipping-fee" maxFontSizeMultiplier={1.3} style={styles.value}>{peso(req.data.shippingFee)}</Text>
      </View>
    )
  }
  return <Card title="(Shipping)" testID="checkout-shipping">{body}</Card>
}

const NOTE_MAX = 200
/** Emoji are fine in a note; only control characters go. */
export const filterNote = (input: string) => input.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, NOTE_MAX).replace(/[\uD800-\uDBFF]$/, '')
export const cleanNote = (input: string) => filterNote(input).replace(/\s+/g, ' ').trim()

export function NotesSection({ courier, seller, onCourier, onSeller, disabled }: { courier: string; seller: string; onCourier: (text: string) => void; onSeller: (text: string) => void; disabled: boolean }) {
  const styles = useStyles()
  return (
    <Card title="(Notes)">
      <View>
        <FloatingField testID="checkout-courier-note" label="Delivery notes" helper="Instructions for the rider, like a gate code or where to leave the parcel? (optional)" value={courier} onChangeText={(text) => onCourier(filterNote(text))} editable={!disabled} multiline />
        <Text testID="checkout-courier-note-count" style={styles.count}>{`${courier.length}/${NOTE_MAX}`}</Text>
      </View>
      <View>
        <FloatingField testID="checkout-seller-note" label="Note to seller" helper="Anything the seller should know? (optional)" value={seller} onChangeText={(text) => onSeller(filterNote(text))} editable={!disabled} multiline />
        <Text testID="checkout-seller-note-count" style={styles.count}>{`${seller.length}/${NOTE_MAX}`}</Text>
      </View>
    </Card>
  )
}

export function PaymentSection() {
  const styles = useStyles()
  return (
    <Card title="(Payment)">
      <Text style={styles.body}>Pay online on a secure page</Text>
    </Card>
  )
}

const money = (value: number) => Math.round(value * 100) / 100

/** The amounts, or null for what is not known yet. The total needs both, so it never shows a half sum. */
export const totals = (subtotal: number | null, shipping: number | null) => ({ subtotal, shipping, total: subtotal !== null && shipping !== null ? money(subtotal + shipping) : null })

function Amount({ label, value, testID, strong }: { label: string; value: number | null; testID: string; strong?: boolean }) {
  const styles = useStyles()
  const { type } = useTheme()
  return (
    <View style={styles.row}>
      <Text style={[type.label, styles.grow]}>{label}</Text>
      <Text testID={testID} maxFontSizeMultiplier={1.3} style={strong ? styles.total : styles.value}>{value === null ? '—' : peso(value)}</Text>
    </View>
  )
}

export function SummarySection({ subtotal, shipping, total }: ReturnType<typeof totals>) {
  return (
    <Card title="(Summary)">
      <Amount label="Merchandise Subtotal" value={subtotal} testID="checkout-subtotal" />
      <Amount label="Shipping" value={shipping} testID="checkout-shipping-amount" />
      <Amount label="Total" value={total} testID="checkout-total" strong />
    </Card>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  card: { marginHorizontal: space.lg, padding: space.md, gap: space.md, borderWidth: 1, borderColor: color.porcelain, borderRadius: radius.soft, backgroundColor: color.paper },
  gap: { gap: space.sm },
  grow: { flex: 1, minWidth: 0, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { ...type.body, color: color.graphite },
  count: { ...type.small, ...type.numeric, color: color.graphite, textAlign: 'right' },
  small: { ...type.small, color: color.graphite },
  name: { ...type.body, fontFamily: font.semibold },
  item: { flexDirection: 'row', gap: space.md },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: space.xs },
  fill: { position: 'absolute', width: '100%', height: '100%' },
  fallback: { ...type.small, color: color.graphite, textAlign: 'center' },
  itemName: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.obsidian, textTransform: 'uppercase' },
  warn: { ...type.small, fontFamily: font.medium, color: color.redInk },
  qty: { ...type.small, ...type.numeric, color: color.graphite, textAlign: 'right' },
  lineTotal: { ...type.body, ...type.numeric, textAlign: 'right' },
  value: { ...type.body, ...type.numeric, textAlign: 'right' },
  total: { ...type.h2, ...type.numeric, textAlign: 'right' },
}))
