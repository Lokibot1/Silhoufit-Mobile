import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { ProductListItem } from '@/api/products'
import { peso, soldLabel } from '@/lib/format'
import { PressableScale } from './PressableScale'
import { Skeleton } from './Skeleton'
import { font, radius, space, themed, useTheme } from './theme'

const LOW_STOCK = 5
const NAME_HEIGHT = 40 // two lines of 20
const PRICE_HEIGHT = 24
const ACTION_SIZE = 44
const ROW_HEIGHT = 20
const FONT_CAP = 1.3 // keeps the fixed name and row heights in step with the skeleton

// Two columns inside the screen's lg padding with an md gap; the card and its skeleton share this so nothing shifts.
function useCardWidth() {
  return (useWindowDimensions().width - 2 * space.lg - space.md) / 2
}

function priceLabel({ minPrice, maxPrice }: ProductListItem): string | null {
  if (minPrice === null || maxPrice === null) return null
  return minPrice === maxPrice ? peso(minPrice) : `From ${peso(minPrice)}`
}

function stockLabel({ totalStock }: ProductListItem): string | null {
  if (totalStock === null) return null
  if (totalStock <= 0) return 'Sold out'
  return totalStock <= LOW_STOCK ? `Only ${totalStock} left` : null
}

// Whether a list shows the rating / sold meta line. The API sends no sold yet and most pieces have no reviews, so a line nobody in the list uses is left out instead of reserved as a gap.
export type CardRows = { rating: boolean; sold: boolean }
const ALL_ROWS: CardRows = { rating: true, sold: true }
const NO_ROWS: CardRows = { rating: false, sold: false }

const hasRating = (item: ProductListItem) => item.reviewCount > 0 && item.rating !== null
const hasSold = (item: ProductListItem) => !!item.soldCount && item.soldCount > 0

export function cardRows(items: ProductListItem[]): CardRows {
  return { rating: items.some(hasRating), sold: items.some(hasSold) }
}

// Rows only switch on while a list stays mounted, so cards do not flicker as pages append. A reload from page 1 (a different first item, or fewer items than before) starts over.
export function useCardRows(items: ProductListItem[]): CardRows {
  const [kept, setKept] = useState<{ head?: string; size: number; rows: CardRows }>({ size: 0, rows: NO_ROWS })
  const rows = cardRows(items)
  const head = items[0]?.id
  const merged: CardRows =
    head === kept.head && items.length >= kept.size
      ? { rating: kept.rows.rating || rows.rating, sold: kept.rows.sold || rows.sold }
      : rows
  const changed = head !== kept.head || items.length !== kept.size || merged.rating !== kept.rows.rating || merged.sold !== kept.rows.sold
  if (changed) setKept({ head, size: items.length, rows: merged })
  return merged
}

// `action` is one 44px button placed at the right end of the price row (the Wishlist's remove heart). It is a sibling of the card button, not inside it, so screen readers reach both.
export function ProductCard({ item, onPress, action, rows = ALL_ROWS }: { item: ProductListItem; onPress?: () => void; action?: ReactNode; rows?: CardRows }) {
  const styles = useStyles()
  const { color } = useTheme()
  const width = useCardWidth()
  const [priceTop, setPriceTop] = useState<number | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const price = priceLabel(item)
  const stock = stockLabel(item)
  const rated = hasRating(item)
  const sold = hasSold(item) ? soldLabel(item.soldCount as number) : null
  const summary = [item.name, price, stock, rated && `rated ${item.rating?.toFixed(1)} from ${item.reviewCount} reviews`, sold].filter(Boolean).join(', ')

  return (
    <View style={{ width }}>
      <PressableScale
        testID={`shop-card-${item.id}`}
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={summary}
        onPress={onPress}
        style={styles.card}>
        <View style={[styles.tile, { height: (width * 4) / 3 }]}>
          {item.imageUrl && failedUrl !== item.imageUrl ? (
            <Image testID={`shop-card-${item.id}-image`} source={{ uri: item.imageUrl }} accessible={false} contentFit="cover" transition={200} onError={() => setFailedUrl(item.imageUrl)} style={styles.fill} />
          ) : (
            <View style={[styles.fill, styles.fallback]}>
              <Text numberOfLines={3} style={styles.fallbackText}>{item.name}</Text>
            </View>
          )}
          {stock && (
            <View style={styles.badge}>
              <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.badgeText, stock === 'Sold out' && styles.badgeSoldOut]}>{stock}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={FONT_CAP} style={styles.name}>{item.name}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} onLayout={action ? (e) => setPriceTop(e.nativeEvent.layout.y) : undefined} style={[styles.price, action ? styles.priceBeside : null, stock === 'Sold out' && styles.soldOut]}>{price}</Text>
        {(rows.rating || rows.sold) && (
          <View style={styles.meta}>
            {rated && (
              <>
                <Ionicons name="star" size={14} color={color.graphite} />
                <Text maxFontSizeMultiplier={FONT_CAP} style={styles.metaText}>{item.rating?.toFixed(1)}</Text>
              </>
            )}
            {rated && sold && <Text maxFontSizeMultiplier={FONT_CAP} style={styles.metaText}>|</Text>}
            {sold && <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.metaText, styles.shrink]}>{sold}</Text>}
          </View>
        )}
      </PressableScale>
      {action ? <View style={[styles.action, { top: ((priceTop ?? 0) + PRICE_HEIGHT / 2) - ACTION_SIZE / 2, opacity: priceTop === null ? 0 : 1 }]}>{action}</View> : null}
    </View>
  )
}

// Reserves the meta row by default: loaded cards usually have it, and a skeleton without it shifts every row down 24px when they land.
export function ProductCardSkeleton({ rows = ALL_ROWS }: { rows?: CardRows }) {
  const styles = useStyles()
  const width = useCardWidth()
  return (
    <View style={[styles.card, { width }]}>
      <Skeleton height={(width * 4) / 3} radius={radius.soft} />
      <View style={styles.nameSkeleton}>
        <Skeleton height={16} radius={radius.soft} />
        <Skeleton width="60%" height={16} radius={radius.soft} />
      </View>
      <Skeleton width="50%" height={PRICE_HEIGHT} radius={radius.soft} />
      {(rows.rating || rows.sold) && <Skeleton width="45%" height={ROW_HEIGHT} radius={radius.soft} />}
    </View>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  card: { gap: space.xs },
  tile: { backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden', marginBottom: space.xs },
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.md },
  fallbackText: { ...type.label, textAlign: 'center' },
  badge: { position: 'absolute', left: space.sm, bottom: space.sm, maxWidth: '90%', paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: color.paper },
  badgeText: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.redInk },
  badgeSoldOut: { color: color.obsidian },
  name: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.obsidian, height: NAME_HEIGHT },
  nameSkeleton: { height: NAME_HEIGHT, justifyContent: 'space-between', marginTop: space.xs },
  // Left-aligned under the name: in a two-column grid the price reads with its own product, not as a column to compare.
  price: { fontFamily: font.bold, fontSize: 16, lineHeight: PRICE_HEIGHT, color: color.redInk, ...type.numeric, minHeight: PRICE_HEIGHT },
  priceBeside: { marginRight: ACTION_SIZE - 12 }, // the 44px target is wider than the 18px heart in it,
  action: { position: 'absolute', right: 0, width: ACTION_SIZE, height: ACTION_SIZE, alignItems: 'center', justifyContent: 'center' },
  soldOut: { color: color.graphite },
  // One line under the price, reserved whether or not a card has data so cards with and without line up.
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: ROW_HEIGHT },
  metaText: { ...type.small, ...type.numeric, color: color.graphite },
  shrink: { flexShrink: 1 },
}))
