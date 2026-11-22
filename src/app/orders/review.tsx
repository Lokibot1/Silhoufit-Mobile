import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { fetchOrderReviews, type MyReview, type OrderReviews } from '@/api/reviews'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { useRequest } from '@/lib/useRequest'
import { ReviewForm } from '@/review/ReviewForm'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { space, themed } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '')

// Write or edit the review of one product on one order. Opens in the mode the server says: a saved review means edit, a pending one means write.
export default function ReviewScreen() {
  const styles = useStyles()
  const params = useLocalSearchParams<{ orderId?: string | string[]; productId?: string | string[]; name?: string | string[] }>()
  const orderId = one(params.orderId)
  const productId = one(params.productId)
  const { session, loading, signOut } = useSession()
  const toast = useToast()
  const userId = session?.user.id ?? null
  const opening = useRef(false)
  const { status, data, error, retry } = useRequest(`${userId}:${orderId}`, (signal) => (userId ? fetchOrderReviews(orderId, signal) : new Promise<OrderReviews>(() => {})))

  // The backend can reject a token Supabase still holds: sign out so the sign-in prompt is truthful.
  const lapsed = error instanceof ApiError && error.status === 401
  useEffect(() => {
    if (!lapsed) return
    toast('Your session has expired. Sign in again.')
    void signOut()
  }, [lapsed, toast, signOut])

  // A 409 means the review exists now: fetch it quietly (no skeleton, so the form and the photos just added stay) and open it for editing.
  const [found, setFound] = useState<MyReview>()
  const onConflict = () =>
    fetchOrderReviews(orderId).then(
      (latest) => setFound(latest.mine.find((r) => r.productId === productId)),
      () => toast("Couldn't load your existing review. Go back and open it from the order."),
    )
  const review = data?.mine.find((r) => r.productId === productId) ?? found
  const waiting = data?.pending.find((p) => p.productId === productId)

  let body
  if (loading || lapsed || (userId && status === 'loading')) {
    body = (
      <View testID="review-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
        <Skeleton width="30%" height={20} />
        <Skeleton width="60%" height={32} />
        <Skeleton width="50%" height={24} />
        <Skeleton width={236} height={44} />
        <Skeleton height={56} />
        <Skeleton height={104} />
        <Skeleton height={48} />
      </View>
    )
  } else if (!userId) {
    body = (
      <View style={styles.content}>
        <StateMessage
          title="Sign in to write a review"
          message="Your reviews are saved to your account once you sign in."
          actionLabel="Sign In"
          onAction={() => {
            if (opening.current) return
            opening.current = true
            router.push('/sign-in')
          }}
          testID="review-sign-in"
        />
      </View>
    )
  } else if (status === 'error') {
    body = (
      <View style={styles.content}>
        <StateMessage alert title="Couldn't load your review" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="review-retry" />
      </View>
    )
  } else if (!review && !waiting) {
    body = (
      <View style={styles.content}>
        <StateMessage
          title="Nothing to review here"
          message="This product isn't waiting for a review on this order. Reviews open once an order is delivered."
          actionLabel="Back to Order"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/orders'))}
          testID="review-empty-back"
        />
      </View>
    )
  } else {
    body = <ReviewForm userId={userId} orderId={orderId} productId={productId} productName={waiting?.name ?? (one(params.name) || 'Product')} review={review} onConflict={onConflict} />
  }
  return <View style={styles.screen}>{body}</View>
}

const useStyles = themed(({ color }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.md, backgroundColor: color.paper },
}))
