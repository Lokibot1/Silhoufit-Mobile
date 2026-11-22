import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { addCartItem } from '@/api/cart'
import { fetchProduct, type Product } from '@/api/products'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { openLegal } from '@/lib/site'
import { useCartCount } from '@/lib/useCartCount'
import { useRequest } from '@/lib/useRequest'
import { canTryOn } from '@/product/arGarment'
import { SizeGuideSheet } from '@/product/SizeGuideSheet'
import { WishlistHeart } from '@/product/WishlistHeart'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, radius, space, themed, themes, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const LOW_STOCK = 5
const TARGET = 44

// Edge-to-edge at 4:5, capped at half the screen so the price still peeks in on a short phone.
const tileHeight = (width: number, screen: number) => Math.min((width * 5) / 4, screen * 0.5)
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

function Slide({ url, label, name, width, height }: { url: string | null; label: string; name: string; width: number; height: number }) {
  const styles = useStyles()
  const { color } = useTheme()
  const [failed, setFailed] = useState(false)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height, backgroundColor: color.porcelain }}>
      {url && !failed ? (
        <Image source={{ uri: url }} accessible={false} contentFit="cover" transition={200} onError={() => setFailed(true)} style={styles.fill} />
      ) : (
        <View style={[styles.fill, styles.fallback]}>
          <Text numberOfLines={3} style={styles.fallbackText}>{name}</Text>
        </View>
      )}
    </View>
  )
}

function Gallery({ product }: { product: Product }) {
  const styles = useStyles()
  const { width, height } = useWindowDimensions()
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
          <Slide url={item.url} name={product.name} width={width} height={tileHeight(width, height)} label={`${item.altText ?? product.name}, photo ${i + 1} of ${slides.length}`} />
        )}
      />
      {slides.length > 1 && (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.counter}>
          <Text testID="product-gallery-counter" style={styles.counterText}>{`${index + 1} / ${slides.length}`}</Text>
        </View>
      )}
    </View>
  )
}

function ProductView({ product }: { product: Product }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { session } = useSession()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const { count, refresh } = useCartCount()
  const { variants } = product
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [pickedSize, setPickedSize] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [pending, setPending] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
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
    setQuantity(1)
    setPickedColor(c === chosenColor ? null : c)
  }
  function pickSize(s: string) {
    setFailure(null)
    setQuantity(1)
    setPickedSize(s === chosenSize ? null : s)
  }
  function signIn() {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  function tryOn() {
    if (!session) return signIn()
    const picked = chosenColor && chosenColor !== NONE ? `?color=${encodeURIComponent(chosenColor)}` : ''
    router.push(`/product/try-on/${product.id}${picked}`)
  }

  // A toast above the sticky bar, like Added to cart.
  const notify = (message: string) => toast(message)

  const prices = variants.map((v) => v.price)
  const price = variant ? peso(variant.price) : prices.length ? (Math.min(...prices) === Math.max(...prices) ? peso(prices[0]) : `From ${peso(Math.min(...prices))}`) : null
  const stock = allSoldOut ? 'Sold out' : !variant ? null : variant.stock <= 0 ? 'Sold out' : variant.stock <= LOW_STOCK ? `Only ${variant.stock} left` : null
  const missing = [hasColor && !chosenColor && 'a colour', hasSize && !chosenSize && 'a size'].filter(Boolean).join(' and ')
  const maxQty = canBuy ? variant.stock : 1
  const total = variant ? peso(Math.round(variant.price * quantity * 100) / 100) : ''
  const selection = variant ? [hasColor && optionLabel(colorKey(variant), 'One colour'), hasSize && optionLabel(variant.size ?? NONE, 'One size')].filter(Boolean).join(' / ') : ''
  const buyLabel = allSoldOut ? 'Sold out' : hasColor && !chosenColor ? 'Choose a Colour' : hasSize && !chosenSize ? 'Choose a Size' : canBuy ? `Add to Cart · ${total}` : 'Add to Cart'
  const choiceHint = !allSoldOut && hasColor && !chosenColor ? 'Select a colour to add this piece to your cart.' : !allSoldOut && hasSize && !chosenSize ? 'Select a size to add this piece to your cart.' : null
  const reviews = `${product.reviewCount} ${product.reviewCount === 1 ? 'review' : 'reviews'}`
  const rated = product.reviewCount > 0 && product.rating !== null
  const sold = product.soldCount > 0 ? `${product.soldCount} sold` : null

  async function add() {
    if (!canBuy || busy.current) return
    if (!session) return signIn()
    busy.current = true
    setPending(true)
    setFailure(null)
    try {
      await addCartItem(variant.id, quantity)
      toast('Added to cart')
      refresh()
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
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Gallery product={product} />
        <View style={styles.block}>
          <View style={styles.headRow}>
            {/* Name first for a screen reader; the price stays first on screen. */}
            <View accessible accessibilityRole="header" accessibilityLabel={[product.name, price, stock].filter(Boolean).join(', ')} style={styles.heading}>
              <View style={styles.priceRow}>
                {price && <Text testID="product-price" style={styles.price}>{price}</Text>}
                {stock && <Text testID="product-stock" style={[styles.stock, stock === 'Sold out' && styles.soldOut]}>{stock}</Text>}
              </View>
              <Text testID="product-name" accessibilityRole="header" style={[type.h2, styles.wrap]}>{product.name}</Text>
            </View>
            <WishlistHeart productId={product.id} notify={notify} />
          </View>
          {(rated || sold) && (
            <Text
              testID="product-rating"
              accessibilityLabel={[rated && `Rated ${product.rating?.toFixed(1)} out of 5 from ${reviews}`, sold].filter(Boolean).join(', ')}
              style={styles.rating}
            >
              {[rated && `★ ${product.rating?.toFixed(1)} (${reviews})`, sold].filter(Boolean).join(' | ')}
            </Text>
          )}
          {!!product.category && <Text style={type.label}>{`(${product.category})`}</Text>}
        </View>

        <View style={styles.infoBlock}>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="truck-outline" size={24} color={color.green} />
            <View style={styles.infoText}>
              <Text style={type.body}>Delivery fee shown at checkout</Text>
              <Text style={type.small}>Final fee depends on your address.</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={24} color={color.green} />
            <Text style={[type.body, styles.infoText]}>Pay online on a secure page</Text>
          </View>
          <PressableScale
            testID="product-refund-policy"
            accessibilityRole="link"
            accessibilityLabel="Refunds follow our Refund Policy"
            accessibilityHint="Opens in your browser"
            onPress={() => openLegal('refund').catch(() => toast("Couldn't open the page. Check your connection and try again."))}
            style={styles.infoRow}>
            <Ionicons name="return-down-back-outline" size={24} color={color.green} />
            <Text style={[type.body, styles.infoText]}>Refunds follow our Refund Policy</Text>
            <Ionicons name="chevron-forward" size={20} color={color.obsidian} />
          </PressableScale>
        </View>

        {hasColor && (
          <View style={styles.block}>
            <Text testID="product-colour-label" style={type.label}>{`(Colour)${chosenColor ? ` ${optionLabel(chosenColor, 'One colour')}` : ''}`}</Text>
            <View style={styles.row}>
              {colors.map((c) => {
                const ok = colorOk(c)
                const selected = c === chosenColor
                const hex = hexOf(c)
                const name = optionLabel(c, 'One colour')
                return (
                  <PressableScale
                    key={c}
                    testID={`product-swatch-${c}`}
                    accessibilityRole="button"
                    accessibilityLabel={ok ? `Colour ${name}` : `Colour ${name}, unavailable`}
                    accessibilityState={{ selected, disabled: !ok }}
                    disabled={!ok}
                    onPress={() => pickColor(c)}
                    style={[styles.card, selected && styles.selectedCard, !ok && styles.off]}>
                    {hex && <View style={[styles.swatchFill, { backgroundColor: hex }]} />}
                    <Text numberOfLines={2} style={[type.body, styles.cardName, !ok && styles.offText]}>{name}</Text>
                    {selected && <Ionicons name="checkmark" size={20} color={color.green} />}
                  </PressableScale>
                )
              })}
            </View>
          </View>
        )}

        {hasSize && (
          <View style={styles.block}>
            <View style={styles.sizeHead}>
              <Text style={type.label}>(Size)</Text>
              <PressableScale testID="size-guide-link" accessibilityRole="button" accessibilityLabel="Size guide" onPress={() => setGuideOpen(true)} style={styles.guideLink}>
                <Text style={[type.small, styles.guideText]}>Size Guide</Text>
              </PressableScale>
            </View>
            <View style={styles.row}>
              {sizes.map((s) => {
                const ok = sizeOk(s)
                const name = optionLabel(s, 'One size')
                return <Chip key={s} testID={`product-size-${s}`} label={name} accessibilityLabel={ok ? `Size ${name}` : `Size ${name}, unavailable`} selected={s === chosenSize} disabled={!ok} onPress={() => pickSize(s)} />
              })}
            </View>
            {choiceHint && <Text testID="product-choice-hint" style={styles.hint}>{choiceHint}</Text>}
          </View>
        )}

        {variants.length > 0 && (
          <View style={styles.block}>
            <View style={styles.qtyRow}>
              <Text style={type.label}>(Quantity)</Text>
              <View style={[styles.stepper, !canBuy && styles.off]}>
                <PressableScale testID="product-qty-minus" accessibilityRole="button" accessibilityLabel="Decrease quantity" accessibilityState={{ disabled: !canBuy || quantity <= 1 }} disabled={!canBuy || quantity <= 1} onPress={() => setQuantity(quantity - 1)} style={[styles.step, quantity <= 1 && styles.off]}>
                  <Ionicons name="remove" size={24} color={color.obsidian} />
                </PressableScale>
                <Text testID="product-qty" accessibilityLabel="Quantity" accessibilityValue={{ min: 1, max: maxQty, now: quantity }} style={[type.body, type.numeric, styles.qty]}>{quantity}</Text>
                <PressableScale testID="product-qty-plus" accessibilityRole="button" accessibilityLabel="Increase quantity" accessibilityState={{ disabled: !canBuy || quantity >= maxQty }} disabled={!canBuy || quantity >= maxQty} onPress={() => setQuantity(quantity + 1)} style={[styles.step, quantity >= maxQty && styles.off]}>
                  <Ionicons name="add" size={24} color={color.obsidian} />
                </PressableScale>
              </View>
            </View>
            {canBuy && <Text testID="product-selection" style={[type.body, type.numeric]}>{`Selected: ${selection ? `${selection} ` : ''}× ${quantity}`}</Text>}
          </View>
        )}

        {product.isArReady && (
          <View style={styles.block}>
            <Button
              testID="product-try-on"
              variant="secondary"
              label="AR Virtual Try-On"
              icon={<Ionicons name="camera-outline" size={24} color={color.obsidian} />}
              disabled={!canTryOn(product)}
              onPress={tryOn}
            />
            {!canTryOn(product) && <Text testID="product-try-on-hint" style={styles.hint}>Try-on is only available for shirts right now.</Text>}
          </View>
        )}

        {product.description && (
          <View style={styles.block}>
            <Text style={type.label}>(Description)</Text>
            <Text testID="product-description" style={styles.description}>{product.description}</Text>
          </View>
        )}

        {rated ? (
          <PressableScale
            testID="product-reviews"
            accessibilityRole="button"
            accessibilityLabel={`Rated ${product.rating?.toFixed(1)} out of 5 from ${reviews}. Opens customer reviews.`}
            onPress={() => router.push(`/product/reviews/${product.id}`)}
            style={styles.reviewsRow}>
            <Ionicons name="star" size={16} color={color.obsidian} />
            <Text style={[type.body, type.numeric, styles.reviewsAverage]}>{product.rating?.toFixed(1)}</Text>
            <Text style={[type.small, type.numeric, styles.reviewsCount]}>{reviews}</Text>
            <Ionicons name="chevron-forward" size={20} color={color.obsidian} />
          </PressableScale>
        ) : (
          <View testID="product-reviews-empty" style={styles.reviewsRow}>
            <Text style={[type.small, styles.reviewsCount]}>No reviews yet</Text>
          </View>
        )}
      </ScrollView>
      <SizeGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} category={product.category} variants={variants} selected={chosenSize === NONE ? null : chosenSize} />

      <View testID="product-bar" style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        {variants.length === 0 && <Text testID="product-unavailable" style={styles.hint}>Not available to buy yet</Text>}
        {failure && failure.variantId === variant?.id && (
          <View testID="product-inline-error" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure.message}</Text>
          </View>
        )}
        <View style={styles.barRow}>
          <HeaderIcon testID="product-cart" name="bag-outline" label="Cart" status={count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : undefined} count={count} onPress={() => router.navigate('/cart')} />
          <View style={styles.barButton}>
            <Button testID="product-add-to-cart" label={buyLabel} disabled={!canBuy} accessibilityHint={!canBuy && !allSoldOut && variants.length > 0 ? `Choose ${missing || 'an option'} first` : undefined} pending={pending} onPress={add} />
          </View>
        </View>
      </View>
    </>
  )
}

// Mirrors the final layout (gallery, price block, one option row, the bar) so nothing shifts when the data lands.
function ProductSkeleton() {
  const styles = useStyles()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.fillScreen}>
      <ScrollView scrollEnabled={false} style={styles.scroll} contentContainerStyle={styles.content}>
        <Skeleton height={tileHeight(width, height)} />
        <View style={styles.block}>
          <Skeleton width={140} height={32} />
          <Skeleton width="80%" height={24} />
          <Skeleton width={120} height={20} />
        </View>
        <View style={styles.block}>
          <Skeleton width={80} height={20} />
          <View style={styles.row}>
            {[0, 1, 2].map((key) => <Skeleton key={key} width={TARGET} height={TARGET} />)}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        <View style={styles.barRow}>
          <Skeleton width={TARGET} height={TARGET} />
          <View style={styles.barButton}><Skeleton height={48} /></View>
        </View>
      </View>
    </View>
  )
}

// Public: browsing needs no session; only Add to Cart reads it.
export default function ProductScreen() {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const { status, data, error, retry } = useRequest(id, (signal) => (id ? fetchProduct(id, signal) : Promise.reject(new ApiError('not-found'))))
  const gone = error instanceof ApiError && error.kind === 'not-found'

  return (
    <View style={styles.screen}>
      {/* A deep link has no screen to go back to. The native back button takes no testID, so only this case gets a custom header-left. */}
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <PressableScale testID="product-header-back" accessibilityRole="button" accessibilityLabel="Shop" onPress={() => router.navigate('/')} style={styles.headerBack}>
                  <Text style={[type.label, { color: color.obsidian }]}>Shop</Text>
                </PressableScale>
              ),
        }}
      />
      {status === 'loading' && <ProductSkeleton />}
      {status === 'error' && (
        <ScrollView contentContainerStyle={styles.message}>
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
        </ScrollView>
      )}
      {data && <ProductView product={data} />}
    </View>
  )
}

const useStyles = themed((t) => {
  const { color, type } = t
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  fillScreen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xl },
  message: { padding: space.lg },
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  fallbackText: { ...type.label, textAlign: 'center' },
  counter: { position: 'absolute', right: space.md, bottom: space.md, backgroundColor: color.paper, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  counterText: { ...type.label, ...type.numeric },
  block: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  infoBlock: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  infoRow: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  infoText: { flex: 1 },
  wrap: { flexShrink: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  heading: { flex: 1, gap: space.sm },
  sizeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guideLink: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center', alignItems: 'flex-end' },
  guideText: { color: color.obsidian, textDecorationLine: 'underline' },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space.md },
  price: { fontFamily: font.bold, fontSize: 24, lineHeight: 32, color: color.redInk, ...type.numeric },
  rating: { ...type.small, ...type.numeric, color: color.graphite },
  stock: { ...type.small, color: color.redInk },
  soldOut: { color: color.graphite },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Two cards a row: each may grow to just under half, so a lone last card stays half width.
  card: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: TARGET + space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, borderRadius: radius.soft, borderWidth: 1, borderColor: color.porcelain },
  selectedCard: { backgroundColor: color.mint, borderColor: color.green },
  cardName: { flex: 1 },
  // Porcelain vanishes against dark Paper, so dark swatches get a Stonewash ring.
  swatchFill: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: t === themes.light ? color.porcelain : color.stonewash },
  off: { opacity: 0.4 },
  offText: { textDecorationLine: 'line-through' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.soft, borderWidth: 1, borderColor: color.stonewash },
  step: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: TARGET, textAlign: 'center' },
  headerBack: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center' },
  hint: { ...type.small, color: color.graphite },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
  description: { ...type.body, color: color.graphite },
  reviewsRow: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  reviewsAverage: { fontFamily: font.semibold },
  reviewsCount: { flex: 1 },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barButton: { flex: 1 },
})
})
