import { Image } from 'expo-image'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { addCartItem } from '@/api/cart'
import { fetchProduct, type Product } from '@/api/products'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { useRequest } from '@/lib/useRequest'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const LOW_STOCK = 5
const TARGET = 44

// The gallery tile matches the Shop card ratio (3:4) at full screen width.
const tileHeight = (width: number) => (width * 4) / 3
const unique = (values: string[]) => [...new Set(values)]

// A variant with no colour or size is its own option when siblings have one.
const NONE = '(none)'
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
const colorKey = (v: { color: string | null }) => v.color ?? NONE
const isSize = (v: { size: string | null }, size: string) => (v.size ?? NONE).toLowerCase() === size.toLowerCase()
const sizeRank = (s: string): [number, number] => {
  const i = SIZE_ORDER.indexOf(s.toUpperCase())
  if (i >= 0) return [0, i]
  return /^\d+(\.\d+)?$/.test(s) ? [1, Number(s)] : [s === NONE ? 3 : 2, 0]
}
const bySize = (a: string, b: string) => {
  const [ga, na] = sizeRank(a)
  const [gb, nb] = sizeRank(b)
  return ga - gb || na - nb || a.localeCompare(b)
}

function Strike() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.strikeWrap]}>
      <View style={styles.strike} />
    </View>
  )
}

function Slide({ url, label, name, width }: { url: string | null; label: string; name: string; width: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height: tileHeight(width), backgroundColor: color.porcelain }}>
      {url && !failed ? (
        <Image source={{ uri: url }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />
      ) : (
        <View style={[styles.fill, styles.fallback]}>
          <Text numberOfLines={3} style={styles.fallbackText}>{name}</Text>
        </View>
      )}
    </View>
  )
}

function Gallery({ product }: { product: Product }) {
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const slides: { url: string | null; altText: string | null }[] = product.images.length ? product.images : [{ url: null, altText: null }]
  return (
    <View testID="product-gallery">
      <FlatList
        data={slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <Slide url={item.url} name={product.name} width={width} label={item.altText ?? `${product.name}, photo ${i + 1} of ${slides.length}`} />
        )}
      />
      {slides.length > 1 && (
        <View style={styles.counter}>
          <Text testID="product-gallery-counter" style={styles.counterText}>{`${index + 1} / ${slides.length}`}</Text>
        </View>
      )}
    </View>
  )
}

function Details({ product }: { product: Product }) {
  const { session } = useSession()
  const toast = useToast()
  const { variants } = product
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [pickedSize, setPickedSize] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ variantId: string; message: string } | null>(null)
  const busy = useRef(false)
  const opening = useRef(false)
  // A fast double tap must not stack two sign-in screens; allow it again when this screen regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))

  const colors = unique(variants.map(colorKey))
  const sizes = variants.map((v) => v.size ?? NONE).filter((s, i, all) => all.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i).sort(bySize)
  const hasColor = colors.some((c) => c !== NONE)
  const hasSize = sizes.some((s) => s !== NONE)
  // A product with exactly one colour or size needs no choice.
  const chosenColor = pickedColor ?? (colors.length === 1 ? colors[0] : null)
  const chosenSize = pickedSize ?? (sizes.length === 1 ? sizes[0] : null)
  const complete = (!hasColor || chosenColor) && (!hasSize || chosenSize)
  const matches = (v: (typeof variants)[number]) => (!hasColor || colorKey(v) === chosenColor) && (!hasSize || (!!chosenSize && isSize(v, chosenSize)))
  const variant = complete ? (variants.find((v) => matches(v) && v.stock > 0) ?? variants.find(matches)) : undefined
  const canBuy = !!variant && variant.stock > 0
  const allSoldOut = variants.length > 0 && variants.every((v) => v.stock <= 0)

  // A choice is offered only while some variant with stock matches it and the other choice already made.
  const colorOk = (c: string) => variants.some((v) => colorKey(v) === c && v.stock > 0 && (!chosenSize || isSize(v, chosenSize)))
  const sizeOk = (s: string) => variants.some((v) => isSize(v, s) && v.stock > 0 && (!chosenColor || colorKey(v) === chosenColor))
  const hexOf = (c: string) => variants.find((v) => colorKey(v) === c && v.colorHex && HEX.test(v.colorHex))?.colorHex
  const optionLabel = (o: string, none: string) => (o === NONE ? none : o)

  // A new pick clears a stale 400. A colour or size the other pick cannot have in stock is disabled, so no pair is left invalid.
  function pickColor(c: string) {
    setFailure(null)
    setPickedColor(c === chosenColor ? null : c)
  }
  function pickSize(s: string) {
    setFailure(null)
    setPickedSize(s === chosenSize ? null : s)
  }
  function signIn() {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  const prices = variants.map((v) => v.price)
  const price = variant ? peso(variant.price) : prices.length ? (Math.min(...prices) === Math.max(...prices) ? peso(prices[0]) : `From ${peso(Math.min(...prices))}`) : null
  const stock = allSoldOut ? 'Sold out' : !variant ? null : variant.stock <= 0 ? 'Sold out' : variant.stock <= LOW_STOCK ? `Only ${variant.stock} left` : null
  const missing = [hasColor && !chosenColor && 'a colour', hasSize && !chosenSize && 'a size'].filter(Boolean).join(' and ')
  const label = [product.brand, product.category].filter(Boolean).join(' / ')

  async function add() {
    if (!canBuy || busy.current) return
    if (!session) return signIn()
    busy.current = true
    setPending(true)
    setFailure(null)
    try {
      await addCartItem(variant.id, 1)
      toast('Added to cart')
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'forbidden') signIn()
      else if (error instanceof ApiError && error.kind === 'validation' && error.detail) setFailure({ variantId: variant.id, message: `${error.detail} Check your cart or choose another size.` })
      else setFailure({ variantId: variant.id, message: errorMessage(error) })
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <View style={styles.details}>
      {label !== '' && <Text style={type.label}>{`(${label})`}</Text>}
      <Text testID="product-name" accessibilityRole="header" style={[type.h1, styles.wrap]}>{product.name}</Text>
      {price && <Text testID="product-price" style={styles.price}>{price}</Text>}
      {stock && <Text testID="product-stock" style={[styles.stock, stock === 'Sold out' && styles.soldOut]}>{stock}</Text>}

      {hasColor && (
        <View style={styles.group}>
          <Text testID="product-colour-label" style={type.label}>{`(Colour)${chosenColor ? ` ${optionLabel(chosenColor, 'One colour')}` : ''}`}</Text>
          <View style={styles.row}>
            {colors.map((c) => {
              const ok = colorOk(c)
              const selected = c === chosenColor
              const hex = hexOf(c)
              const name = optionLabel(c, 'One colour')
              return (
                <Pressable
                  key={c}
                  testID={`product-swatch-${c}`}
                  accessibilityRole="button"
                  accessibilityLabel={ok ? `Colour ${name}` : `Colour ${name}, unavailable`}
                  accessibilityState={{ selected, disabled: !ok }}
                  disabled={!ok}
                  onPress={() => pickColor(c)}
                  style={[hex ? styles.swatch : styles.chip, selected && (hex ? styles.selectedSwatch : styles.selectedChip), !ok && styles.off]}>
                  {hex ? <View style={[styles.swatchFill, { backgroundColor: hex }]} /> : <Text style={[type.label, selected && { color: color.paper }]}>{name}</Text>}
                  {!ok && <Strike />}
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {hasSize && (
        <View style={styles.group}>
          <Text style={type.label}>(Size)</Text>
          <View style={styles.row}>
            {sizes.map((s) => {
              const ok = sizeOk(s)
              const selected = s === chosenSize
              const name = optionLabel(s, 'One size')
              return (
                <Pressable
                  key={s}
                  testID={`product-size-${s}`}
                  accessibilityRole="button"
                  accessibilityLabel={ok ? `Size ${name}` : `Size ${name}, unavailable`}
                  accessibilityState={{ selected, disabled: !ok }}
                  disabled={!ok}
                  onPress={() => pickSize(s)}
                  style={[styles.chip, selected && styles.selectedChip, !ok && styles.off]}>
                  <Text style={[type.label, selected && { color: color.paper }]}>{name}</Text>
                  {!ok && <Strike />}
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {variants.length === 0 && <Text testID="product-unavailable" style={styles.hint}>Not available to buy yet</Text>}
      {variants.length > 0 && !variant && !allSoldOut && <Text style={styles.hint}>{`Choose ${missing}.`}</Text>}
      {failure && failure.variantId === variant?.id && (
        <View testID="product-inline-error" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{failure.message}</Text>
        </View>
      )}

      <Button testID="product-add-to-cart" label={allSoldOut ? 'Sold out' : 'Add to Cart'} disabled={!canBuy} pending={pending} onPress={add} />
      {product.description && <Text testID="product-description" style={styles.description}>{product.description}</Text>}
    </View>
  )
}

function ProductSkeleton() {
  const { width } = useWindowDimensions()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      <Skeleton height={tileHeight(width)} />
      <View style={styles.details}>
        <Skeleton width={120} height={20} />
        <Skeleton width="80%" height={28} />
        <View style={styles.priceSkeleton}><Skeleton width={100} height={24} /></View>
        <View style={styles.row}>
          {[0, 1, 2].map((key) => <Skeleton key={key} width={TARGET} height={TARGET} />)}
        </View>
        <Skeleton height={48} />
      </View>
    </View>
  )
}

// Public: browsing needs no session; only Add to Cart reads it.
export default function ProductScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const insets = useSafeAreaInsets()
  const { status, data, error, retry } = useRequest(id, (signal) => (id ? fetchProduct(id, signal) : Promise.reject(new ApiError('not-found'))))
  const gone = error instanceof ApiError && error.kind === 'not-found'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
      {/* A deep link has no screen to go back to. The native back button takes no testID, so only this case gets a custom header-left. */}
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <Pressable testID="product-header-back" accessibilityRole="button" accessibilityLabel="Shop" onPress={() => router.navigate('/')} style={styles.headerBack}>
                  <Text style={[type.label, { color: color.obsidian }]}>Shop</Text>
                </Pressable>
              ),
        }}
      />
      {status === 'loading' && <ProductSkeleton />}
      {status === 'error' && (
        <View style={styles.message}>
          {gone ? (
            <StateMessage title="This piece is no longer available" message="It may have been removed from the shop. Head back to see what is in stock." actionLabel="Back to Shop" onAction={() => router.navigate('/')} testID="product-error-back" />
          ) : (
            <StateMessage
              alert
              title="Couldn't load this piece"
              message={error instanceof ApiError && error.kind === 'forbidden' ? "This piece couldn't be loaded. Try again." : errorMessage(error)}
              actionLabel="Retry"
              onAction={retry}
              testID="product-retry"
            />
          )}
        </View>
      )}
      {data && (
        <>
          <Gallery product={data} />
          <Details product={data} />
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { padding: space.lg },
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  fallbackText: { ...type.label, textAlign: 'center' },
  counter: { position: 'absolute', right: space.md, bottom: space.md, backgroundColor: color.paper, paddingHorizontal: space.sm, paddingVertical: space.xs },
  counterText: { ...type.label, ...type.numeric },
  details: { padding: space.lg, gap: space.md },
  wrap: { flexShrink: 1 },
  price: { ...type.h2, ...type.numeric, textAlign: 'right' },
  priceSkeleton: { alignItems: 'flex-end' },
  stock: { ...type.small, color: color.red, textAlign: 'right' },
  soldOut: { color: color.graphite },
  group: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: TARGET, height: TARGET, borderWidth: 1, borderColor: color.porcelain, alignItems: 'center', justifyContent: 'center' },
  selectedSwatch: { borderWidth: 2, borderColor: color.obsidian },
  swatchFill: { width: 28, height: 28, borderWidth: 1, borderColor: color.porcelain },
  chip: { minWidth: TARGET, minHeight: TARGET, paddingHorizontal: space.md, borderWidth: 1, borderColor: color.obsidian, alignItems: 'center', justifyContent: 'center' },
  selectedChip: { backgroundColor: color.obsidian },
  off: { opacity: 0.4, borderStyle: 'dashed', overflow: 'hidden' },
  strikeWrap: { alignItems: 'center', justifyContent: 'center' },
  strike: { width: 1, height: 64, backgroundColor: color.obsidian, transform: [{ rotate: '45deg' }] },
  headerBack: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center' },
  hint: { ...type.body, color: color.graphite },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
  description: { ...type.body, color: color.graphite },
})
