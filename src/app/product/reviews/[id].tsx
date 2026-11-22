import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchProduct, type Product } from '@/api/products'
import { ApiError, errorMessage } from '@/lib/api'
import { peso } from '@/lib/format'
import { useRequest } from '@/lib/useRequest'
import { ProductReviews } from '@/product/ProductReviews'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, radius, space, type } from '@/ui/theme'

const IMAGE = 80

function MiniCard({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  const url = product.images[0]?.url
  const prices = product.variants.map((v) => v.price)
  const low = Math.min(...prices)
  const price = prices.length ? (low === Math.max(...prices) ? peso(low) : `From ${peso(low)}`) : null
  return (
    <View testID="reviews-product" style={styles.card}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.image}>
        {url && !failed && <Image source={{ uri: url }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={2} style={type.h2}>{product.name}</Text>
        {price && <Text style={styles.price}>{price}</Text>}
        {product.soldCount > 0 && <Text style={[type.small, type.numeric]}>{`${product.soldCount} sold`}</Text>}
      </View>
    </View>
  )
}

// Mirrors the mini card so nothing shifts when the product lands.
function CardSkeleton() {
  return (
    <View testID="reviews-product-loading" accessible accessibilityLabel="Loading product" accessibilityRole="progressbar" style={styles.card}>
      <Skeleton width={IMAGE} height={IMAGE} />
      <View style={styles.info}>
        <Skeleton width="70%" height={24} />
        <Skeleton width={96} height={32} />
        <Skeleton width={64} height={20} />
      </View>
    </View>
  )
}

export default function ProductReviewsScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string | string[] }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const insets = useSafeAreaInsets()
  const { status, data, error, retry } = useRequest(id, (signal) => (id ? fetchProduct(id, signal) : Promise.reject(new ApiError('not-found'))))

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/product/${id}`))

  return (
    <View style={styles.screen}>
      {/* A deep link or refresh has no screen to go back to, so the header arrow and the bar button fall back to the product page. */}
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <PressableScale testID="reviews-header-back" accessibilityRole="button" accessibilityLabel="Back to product" onPress={goBack} style={styles.headerBack}>
                  <Ionicons name="chevron-back" size={24} color={color.obsidian} />
                </PressableScale>
              ),
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {status === 'loading' && <CardSkeleton />}
        {status === 'error' && (
          <View style={styles.error}>
            <StateMessage alert title="Couldn't load this piece" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="reviews-product-retry" />
          </View>
        )}
        {data && <MiniCard product={data} />}
        {id !== '' && <ProductReviews productId={id} />}
      </ScrollView>
      <View testID="reviews-bar" style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
        <Button testID="reviews-back" label="Back to Product" onPress={goBack} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { flex: 1 },
  error: { padding: space.lg },
  content: { paddingBottom: space.xl },
  card: { flexDirection: 'row', gap: space.md, margin: space.lg, padding: space.md, borderRadius: radius.soft, backgroundColor: color.porcelain },
  image: { width: IMAGE, height: IMAGE, borderRadius: radius.soft, overflow: 'hidden', backgroundColor: color.paper },
  fill: { width: '100%', height: '100%' },
  info: { flex: 1, gap: space.xs, justifyContent: 'center' },
  price: { fontFamily: font.bold, fontSize: 24, lineHeight: 32, color: color.red, ...type.numeric },
  headerBack: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
})
