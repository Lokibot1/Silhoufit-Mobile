import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import type { ProductListItem } from '@/api/products'
import { peso } from '@/lib/format'
import { WishlistHeart } from '@/product/WishlistHeart'
import { PressableScale } from './PressableScale'
import { Skeleton } from './Skeleton'
import { color, font, radius, space, type } from './theme'

const LOW_STOCK = 5
const NAME_HEIGHT = 40 // two lines of 20
const PRICE_HEIGHT = 24
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

type Wishlist = { saved: boolean; onChange: (saved: boolean) => void; notify: (message: string) => void }

// With `wishlist` a heart sits over the image tile. It is a sibling of the card button, not inside it, so screen readers reach both.
export function ProductCard({ item, onPress, wishlist }: { item: ProductListItem; onPress?: () => void; wishlist?: Wishlist }) {
  const width = useCardWidth()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const price = priceLabel(item)
  const stock = stockLabel(item)
  const rated = item.reviewCount > 0 && item.rating !== null
  const summary = [item.name, price, stock, rated && `rated ${item.rating?.toFixed(1)} from ${item.reviewCount} reviews`].filter(Boolean).join(', ')

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
              <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.badgeText, stock === 'Sold out' && styles.soldOut]}>{stock}</Text>
            </View>
          )}
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={FONT_CAP} style={styles.name}>{item.name}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.price, stock === 'Sold out' && styles.soldOut]}>{price}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={styles.rating}>{rated ? `★ ${item.rating?.toFixed(1)} (${item.reviewCount})` : ''}</Text>
      </PressableScale>
      {wishlist && (
        <View style={styles.heart}>
          <WishlistHeart testID={`shop-card-${item.id}-wishlist`} productId={item.id} name={item.name} saved={wishlist.saved} onChange={wishlist.onChange} notify={wishlist.notify} />
        </View>
      )}
    </View>
  )
}

export function ProductCardSkeleton() {
  const width = useCardWidth()
  return (
    <View style={[styles.card, { width }]}>
      <Skeleton height={(width * 4) / 3} radius={radius.soft} />
      <View style={styles.nameSkeleton}>
        <Skeleton height={16} radius={radius.soft} />
        <Skeleton width="60%" height={16} radius={radius.soft} />
      </View>
      <Skeleton width="50%" height={PRICE_HEIGHT} radius={radius.soft} />
      <Skeleton width="35%" height={ROW_HEIGHT} radius={radius.soft} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  // A 44px paper disc so the heart reads on any photo; inset by xs from the tile corner.
  heart: { position: 'absolute', top: space.xs, right: space.xs, borderRadius: radius.pill, backgroundColor: color.paper },
  tile: { backgroundColor: color.porcelain, borderRadius: radius.soft, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.md },
  fallbackText: { ...type.label, textAlign: 'center' },
  badge: { position: 'absolute', left: space.sm, bottom: space.sm, maxWidth: '90%', paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: color.paper },
  badgeText: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.red },
  name: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.obsidian, height: NAME_HEIGHT },
  nameSkeleton: { height: NAME_HEIGHT, justifyContent: 'space-between' },
  // Left-aligned under the name: in a two-column grid the price reads with its own product, not as a column to compare.
  price: { fontFamily: font.bold, fontSize: 16, lineHeight: PRICE_HEIGHT, color: color.red, ...type.numeric, minHeight: PRICE_HEIGHT },
  soldOut: { color: color.graphite },
  rating: { ...type.small, ...type.numeric, color: color.graphite, minHeight: ROW_HEIGHT },
})
