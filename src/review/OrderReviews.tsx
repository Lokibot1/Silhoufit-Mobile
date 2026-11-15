import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, useIsFocused } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { Order } from '@/api/orders'
import { fetchOrderReviews, onReviewsChanged, type MyReview, type OrderReviews as Data, type PendingReview } from '@/api/reviews'
import { errorMessage } from '@/lib/api'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { color, space, type } from '@/ui/theme'

const IMG_W = 56
const IMG_H = 72
// shortcut: mirrors the API's 30 day edit window, read it from the API if it changes
const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type Row = { key: string; productId: string; name: string; image: string | null; pending?: PendingReview; review?: MyReview }

function rowsOf(order: Order, { pending, mine }: Data): Row[] {
  return [
    ...pending.map((p): Row => ({ key: `p${p.productId}`, productId: p.productId, name: p.name, image: p.image, pending: p })),
    ...mine.map((review): Row => {
      const item = order.items.find((i) => i.sku && review.skus.includes(i.sku))
      return { key: `r${review.id}`, productId: review.productId, name: item?.name ?? 'Product', image: item?.imageUrl ?? null, review }
    }),
  ]
}

function Stars({ value }: { value: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${value} out of 5 stars`} style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= value ? 'star' : 'star-outline'} size={16} color={n <= value ? color.obsidian : color.stonewash} />)}
    </View>
  )
}

function ReviewRow({ row, onOpen }: { row: Row; onOpen: (row: Row) => void }) {
  const [failed, setFailed] = useState(false)
  const [now] = useState(Date.now)
  const { review } = row
  const editable = review && now - Date.parse(review.createdAt) <= EDIT_WINDOW_MS
  return (
    <View testID={`order-review-${row.productId}`} style={styles.row}>
      <View style={styles.tile}>
        {row.image && !failed && <Image source={{ uri: row.image }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />}
      </View>
      <View style={styles.info}>
        <Text numberOfLines={2} style={type.body}>{row.name}</Text>
        {review ? (
          <>
            <Stars value={review.rating} />
            {review.comment && <Text numberOfLines={3} style={[type.small, styles.text]}>{review.comment}</Text>}
            {review.photos.length > 0 && <Text style={[type.small, type.numeric]}>{`${review.photos.length} ${review.photos.length === 1 ? 'photo' : 'photos'}`}</Text>}
            {editable ? (
              <Button testID={`order-review-edit-${row.productId}`} variant="secondary" label="Edit Your Review" accessibilityLabel={`Edit your review of ${row.name}`} onPress={() => onOpen(row)} />
            ) : (
              <Text style={type.small}>Reviews can be edited for 30 days after posting. That time has passed.</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[type.small, styles.text]}>How did it go? Rate it, say a few words, and add photos if you like.</Text>
            <Button testID={`order-review-write-${row.productId}`} label="Write a Review" accessibilityLabel={`Write a review of ${row.name}`} onPress={() => onOpen(row)} />
          </>
        )}
      </View>
    </View>
  )
}

/** The reviews of a delivered order, a row per product: write the ones still waiting, edit a saved one. It owns its data, so a failure here never touches the order. */
export function OrderReviews({ order }: { order: Order }) {
  const [state, setState] = useState<{ data: Data | null; error: unknown }>({ data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const focused = useIsFocused()
  const opening = useRef(false)

  // A new attempt keeps what is on screen while it loads, so a saved review refreshes the rows without a flash.
  useEffect(() => {
    const controller = new AbortController()
    fetchOrderReviews(order.id, controller.signal).then(
      (data) => !controller.signal.aborted && setState({ data, error: null }),
      (error) => !controller.signal.aborted && setState((current) => ({ ...current, error })),
    )
    return () => controller.abort()
  }, [order.id, attempt])
  useEffect(() => onReviewsChanged(() => setAttempt((n) => n + 1)), [])
  // A fast double tap must not stack two review screens; allow it again when this screen regains focus.
  useEffect(() => {
    if (focused) opening.current = false
  }, [focused])

  const open = ({ productId, name }: Row) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/orders/review', params: { orderId: order.id, productId, name } })
  }

  const { data, error } = state
  let body
  if (!data && !error) {
    body = (
      <View testID="order-reviews-loading" accessible accessibilityLabel="Loading your reviews" accessibilityRole="progressbar" style={styles.row}>
        <Skeleton width={IMG_W} height={IMG_H} />
        <View style={styles.info}>
          <Skeleton height={24} />
          <Skeleton width="70%" height={20} />
          <Skeleton height={48} />
        </View>
      </View>
    )
  } else if (!data) {
    body = (
      <View testID="order-reviews-error" accessibilityRole="alert" style={styles.info}>
        <Text style={type.body}>{`Couldn't load your reviews. ${errorMessage(error)} Your order is not affected.`}</Text>
        <Button
          testID="order-reviews-retry"
          variant="secondary"
          label="Retry"
          onPress={() => {
            setState({ data: null, error: null })
            setAttempt((n) => n + 1)
          }}
        />
      </View>
    )
  } else {
    const rows = rowsOf(order, data)
    body =
      rows.length === 0 ? (
        <Text testID="order-reviews-empty" style={[type.body, styles.text]}>There is nothing to review on this order. Items that are no longer in the shop can&apos;t be reviewed.</Text>
      ) : (
        rows.map((row) => <ReviewRow key={row.key} row={row} onOpen={open} />)
      )
  }

  return (
    <View testID="order-reviews" style={styles.section}>
      <Text style={type.label}>(Your Reviews)</Text>
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  tile: { width: IMG_W, height: IMG_H, backgroundColor: color.porcelain },
  fill: { width: IMG_W, height: IMG_H },
  info: { flex: 1, gap: space.xs },
  stars: { flexDirection: 'row', gap: 2 },
  text: { color: color.graphite },
})
