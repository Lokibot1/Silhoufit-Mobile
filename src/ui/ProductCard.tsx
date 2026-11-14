import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { ProductListItem } from '@/api/products'
import { peso } from '@/lib/format'
import { Skeleton } from './Skeleton'
import { color, space, type } from './theme'

const LOW_STOCK = 5
const NAME_HEIGHT = 40 // two lines of 20
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

export function ProductCard({ item, onPress }: { item: ProductListItem; onPress?: () => void }) {
  const width = useCardWidth()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const price = priceLabel(item)
  const stock = stockLabel(item)
  const rated = item.reviewCount > 0 && item.rating !== null
  const summary = [item.name, price, stock, rated && `rated ${item.rating?.toFixed(1)} from ${item.reviewCount} reviews`].filter(Boolean).join(', ')

  return (
    <Pressable
      testID={`shop-card-${item.id}`}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={summary}
      onPress={onPress}
      style={[styles.card, { width }]}>
      <View style={[styles.tile, { height: (width * 4) / 3 }]}>
        {item.imageUrl && failedUrl !== item.imageUrl ? (
          <Image testID={`shop-card-${item.id}-image`} source={{ uri: item.imageUrl }} accessible={false} contentFit="cover" onError={() => setFailedUrl(item.imageUrl)} style={styles.fill} />
        ) : (
          <View style={[styles.fill, styles.fallback]}>
            <Text numberOfLines={3} style={styles.fallbackText}>{item.name}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} maxFontSizeMultiplier={FONT_CAP} style={styles.name}>{item.name}</Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={styles.price}>{price}</Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.stock, stock === 'Sold out' && styles.soldOut]}>{stock}</Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={styles.rating}>{rated ? `★ ${item.rating?.toFixed(1)} (${item.reviewCount})` : ''}</Text>
    </Pressable>
  )
}

export function ProductCardSkeleton() {
  const width = useCardWidth()
  return (
    <View style={[styles.card, { width }]}>
      <Skeleton height={(width * 4) / 3} />
      <Skeleton height={NAME_HEIGHT} />
      <Skeleton height={ROW_HEIGHT} />
      <Skeleton height={ROW_HEIGHT} />
      <Skeleton height={ROW_HEIGHT} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  tile: { backgroundColor: color.porcelain },
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.md },
  fallbackText: { ...type.label, textAlign: 'center' },
  name: { ...type.label, height: NAME_HEIGHT },
  price: { ...type.body, ...type.numeric, fontSize: 14, lineHeight: ROW_HEIGHT, textAlign: 'right', minHeight: ROW_HEIGHT },
  stock: { ...type.small, color: color.red, minHeight: ROW_HEIGHT },
  soldOut: { color: color.graphite },
  rating: { ...type.small, ...type.numeric, color: color.graphite, textAlign: 'right', minHeight: ROW_HEIGHT },
})
