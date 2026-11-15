import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { fetchProductReviews, onReviewsChanged, type Review, type ReviewSort, type ReviewSummary } from '@/api/reviews'
import { errorMessage } from '@/lib/api'
import { dateOnly } from '@/lib/format'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { Chip } from '@/ui/Chip'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { color, font, radius, space, type } from '@/ui/theme'
import { PhotoViewer } from './PhotoViewer'

const PHOTO = 72
const STARS = [5, 4, 3, 2, 1] as const
// One tap on the sort chip moves to the next option, like the Shop's.
const SORTS: { label: string; value: ReviewSort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Highest rating', value: 'highest_rating' },
  { label: 'Lowest rating', value: 'lowest_rating' },
]
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type State = {
  status: 'loading' | 'ready' | 'error'
  reviews: Review[]
  page: number
  totalPages: number
  total: number
  /** Kept across filter changes so the summary and the filters stay put while a new list loads. */
  summary: ReviewSummary | null
  more: 'idle' | 'loading' | 'error'
  error: unknown
}
const INITIAL: State = { status: 'loading', reviews: [], page: 1, totalPages: 1, total: 0, summary: null, more: 'idle', error: null }

function Stars({ value, label, size = 16 }: { value: number; label: string; size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? color.obsidian : color.stonewash} />
      ))}
    </View>
  )
}

function Photo({ url, label, onPress, testID }: { url: string; label: string; onPress: () => void; testID: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.photo}>
      {failed ? <Ionicons name="image-outline" size={24} color={color.stonewash} /> : <Image source={{ uri: url }} accessible={false} contentFit="cover" onError={() => setFailed(true)} style={styles.fill} />}
    </PressableScale>
  )
}

function ReviewCard({ review, onPhoto }: { review: Review; onPhoto: (photos: string[], start: number, author: string) => void }) {
  return (
    <View testID={`review-${review.id}`} style={styles.review}>
      <View style={styles.who}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Avatar name={review.name} url={review.avatarUrl} size="sm" />
        </View>
        <Text numberOfLines={1} style={[type.body, styles.name]}>{review.name}</Text>
      </View>
      <View style={styles.meta}>
        <Stars value={review.rating} label={`${review.rating} out of 5 stars`} />
        <Text style={[type.small, type.numeric, styles.muted]}>{dateOnly(review.createdAt)}</Text>
      </View>
      {review.purchased && <Text style={[type.small, styles.muted]}>{review.purchased}</Text>}
      {review.comment && <Text style={type.body}>{review.comment}</Text>}
      {review.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {review.photos.map((url, i) => (
            <Photo key={`${i}-${url}`} testID={`review-photo-${review.id}-${i}`} url={url} label={`Photo ${i + 1} of ${review.photos.length} from ${review.name}. Opens full screen.`} onPress={() => onPhoto(review.photos, i, review.name)} />
          ))}
        </ScrollView>
      )}
      {review.adminReply && (
        <View style={styles.reply}>
          <Text style={type.label}>(Reply from KRAL)</Text>
          <Text style={[type.body, styles.muted]}>{review.adminReply}</Text>
        </View>
      )}
    </View>
  )
}

function Summary({ summary }: { summary: ReviewSummary }) {
  return (
    <View testID="reviews-summary" style={styles.summary}>
      <View style={styles.average}>
        <Text testID="reviews-average" style={styles.averageText}>{summary.averageRating.toFixed(1)}</Text>
        <Stars value={Math.round(summary.averageRating)} label={`${summary.averageRating.toFixed(1)} out of 5 stars`} />
        <Text style={[type.small, type.numeric, styles.muted]}>{plural(summary.totalReviews, 'review')}</Text>
      </View>
      <View accessibilityRole="list" accessibilityLabel="Reviews by rating" style={styles.bars}>
        {STARS.map((n) => (
          <View key={n} accessible accessibilityLabel={`${plural(n, 'star')}, ${plural(summary.distribution[n], 'review')}`} style={styles.bar}>
            <Text style={[type.small, type.numeric, styles.barLabel]}>{n}</Text>
            <Ionicons name="star" size={14} color={color.obsidian} />
            <View style={styles.track}>
              <View style={[styles.fillBar, { width: `${(summary.distribution[n] / Math.max(summary.totalReviews, 1)) * 100}%` }]} />
            </View>
            <Text style={[type.small, type.numeric, styles.barCount]}>{summary.distribution[n]}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function ReviewSkeleton() {
  return (
    <View style={styles.review}>
      <View style={styles.who}>
        <Skeleton width={32} height={32} />
        <Skeleton width={120} height={24} />
      </View>
      <Skeleton width={96} height={20} />
      <Skeleton height={24} />
      <Skeleton width="70%" height={24} />
    </View>
  )
}

function SectionSkeleton() {
  return (
    <View testID="reviews-loading" accessible accessibilityLabel="Loading reviews" accessibilityRole="progressbar" style={styles.stack}>
      <View style={styles.summary}>
        <View style={styles.average}>
          <Skeleton width={72} height={32} />
          <Skeleton width={80} height={16} />
          <Skeleton width={72} height={20} />
        </View>
        <View style={styles.bars}>{STARS.map((n) => <Skeleton key={n} height={20} />)}</View>
      </View>
      <ReviewSkeleton />
    </View>
  )
}

/** A product's reviews: the rating summary, filters, a sort and the reviews a page at a time. It owns its data, so a failure here never touches the rest of the page. */
export function ProductReviews({ productId }: { productId: string }) {
  const [rating, setRating] = useState(0)
  const [photos, setPhotos] = useState(false)
  const [sort, setSort] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<State>(INITIAL)
  const [viewing, setViewing] = useState<{ photos: string[]; start: number; author: string } | null>(null)
  const moreController = useRef<AbortController | undefined>(undefined)
  const fetching = useRef(false)
  const query = (page: number) => ({ page, rating: rating || undefined, hasImages: photos, sortBy: SORTS[sort].value })

  // A new filter, sort or Retry shows the loading state at once; the effect below fetches.
  const reload = (next: { rating?: number; photos?: boolean; sort?: number } = {}) => {
    setState((current) => ({ ...current, status: 'loading', more: 'idle' }))
    if (next.rating !== undefined) setRating(next.rating)
    if (next.photos !== undefined) setPhotos(next.photos)
    if (next.sort !== undefined) setSort(next.sort)
    if (Object.keys(next).length === 0) setAttempt((n) => n + 1)
  }

  // A review saved elsewhere refetches the first page without the loading state.
  useEffect(() => onReviewsChanged(() => setAttempt((n) => n + 1)), [])

  // First page: a new product, filter, sort or Retry. Aborts the previous request (and a Load more in flight), and on unmount.
  useEffect(() => {
    const controller = new AbortController()
    moreController.current?.abort()
    fetching.current = false
    fetchProductReviews(productId, { page: 1, rating: rating || undefined, hasImages: photos, sortBy: SORTS[sort].value }, controller.signal).then(
      (page) => !controller.signal.aborted && setState({ status: 'ready', reviews: page.reviews, page: page.page, totalPages: page.totalPages, total: page.total, summary: page.summary, more: 'idle', error: null }),
      (error) => !controller.signal.aborted && setState((current) => ({ ...current, status: 'error', error })),
    )
    return () => {
      controller.abort()
      moreController.current?.abort()
    }
  }, [productId, rating, photos, sort, attempt])

  function loadMore() {
    if (fetching.current || state.page >= state.totalPages) return
    fetching.current = true
    const controller = new AbortController()
    moreController.current = controller
    setState((current) => ({ ...current, more: 'loading' }))
    fetchProductReviews(productId, query(state.page + 1), controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return
        fetching.current = false
        setState((current) => {
          const known = new Set(current.reviews.map((review) => review.id))
          return { ...current, reviews: [...current.reviews, ...page.reviews.filter((review) => !known.has(review.id))], page: page.page, totalPages: page.totalPages, total: page.total, summary: page.summary, more: 'idle' }
        })
      },
      (error) => {
        if (controller.signal.aborted) return
        fetching.current = false
        setState((current) => ({ ...current, more: 'error', error }))
      },
    )
  }

  const { status, summary, reviews, total } = state
  const filtered = rating > 0 || photos
  // With nothing filtered there is nothing to clear: reloading would only flash the skeleton.
  const clearFilters = () => filtered && reload({ rating: 0, photos: false })
  const failure = (
    <View testID="reviews-error" accessibilityRole="alert" style={styles.stack}>
      <Text style={type.body}>{`Couldn't load the reviews. ${errorMessage(state.error)} The rest of the page is not affected.`}</Text>
      <HeaderIcon testID="reviews-retry" name="refresh" label="Retry" onPress={() => reload()} />
    </View>
  )

  let body
  if (!summary) {
    body = status === 'error' ? failure : <SectionSkeleton />
  } else if (summary.totalReviews === 0) {
    body = (
      <View testID="reviews-empty" style={styles.stack}>
        <Text accessibilityRole="header" style={type.h2}>No reviews yet</Text>
        <Text style={[type.body, styles.muted]}>Reviews from customers who bought this piece will show here.</Text>
      </View>
    )
  } else {
    body = (
      <>
        <Summary summary={summary} />
        <View style={styles.chips}>
          <Chip testID="reviews-filter-all" label="All" accessibilityLabel="All reviews" selected={!filtered} onPress={clearFilters} />
          {STARS.map((n) => (
            <Chip key={n} testID={`reviews-filter-${n}`} label={plural(n, 'star')} accessibilityLabel={`${plural(n, 'star')} reviews`} selected={rating === n} onPress={() => reload({ rating: rating === n ? 0 : n })} />
          ))}
          <Chip testID="reviews-filter-photos" label="With photos" selected={photos} onPress={() => reload({ photos: !photos })} />
          <Chip testID="reviews-sort" label={SORTS[sort].label} accessibilityLabel={`Sort by ${SORTS[sort].label}. Tap to change.`} selected={sort !== 0} onPress={() => reload({ sort: (sort + 1) % SORTS.length })} />
        </View>
        {status === 'loading' && (
          <View testID="reviews-list-loading" accessible accessibilityLabel="Loading reviews" accessibilityRole="progressbar" style={styles.stack}>
            <ReviewSkeleton />
          </View>
        )}
        {status === 'error' && failure}
        {status === 'ready' && total === 0 && (
          <View testID="reviews-none" style={styles.stack}>
            <Text accessibilityRole="header" style={type.h2}>{`No ${rating ? `${rating}-star reviews` : 'reviews'}${photos ? ' with photos' : ''}`}</Text>
            <Text style={[type.body, styles.muted]}>Nothing matches these filters. Clear them to see every review of this piece.</Text>
            <Button testID="reviews-clear-filters" variant="secondary" label="Clear Filters" onPress={clearFilters} />
          </View>
        )}
        {status === 'ready' && total > 0 && (
          <>
            {reviews.map((review) => <ReviewCard key={review.id} review={review} onPhoto={(urls, start, author) => setViewing({ photos: urls, start, author })} />)}
            <Text testID="reviews-count" style={[type.small, type.numeric, styles.muted]}>{`Showing ${reviews.length} of ${total}`}</Text>
            {state.more === 'error' && (
              <View testID="reviews-more-error" accessibilityRole="alert" style={styles.banner}>
                <Text style={type.body}>{`Couldn't load more reviews. ${errorMessage(state.error)}`}</Text>
              </View>
            )}
            {state.page < state.totalPages && (
              <Button testID="reviews-load-more" variant="secondary" label={state.more === 'error' ? 'Try Again' : 'Load More Reviews'} pending={state.more === 'loading'} onPress={loadMore} />
            )}
          </>
        )}
      </>
    )
  }

  return (
    <View testID="product-reviews" style={styles.section}>
      <Text accessibilityRole="header" accessibilityLabel="Reviews" style={type.label}>(Reviews)</Text>
      {body}
      <PhotoViewer photos={viewing?.photos ?? []} start={viewing?.start ?? null} author={viewing?.author ?? ''} onClose={() => setViewing(null)} />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.md },
  stack: { gap: space.md },
  muted: { color: color.graphite },
  fill: { width: '100%', height: '100%' },
  stars: { flexDirection: 'row', gap: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  average: { gap: space.xs },
  averageText: { fontFamily: font.bold, fontSize: 24, lineHeight: 32, color: color.obsidian, ...type.numeric },
  bars: { flex: 1, gap: space.xs },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 20 },
  barLabel: { width: 12, textAlign: 'right', color: color.graphite },
  track: { flex: 1, height: 8, backgroundColor: color.porcelain },
  fillBar: { height: '100%', backgroundColor: color.obsidian },
  barCount: { width: 32, textAlign: 'right', color: color.graphite },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  review: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.porcelain },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space.md },
  photos: { gap: space.sm },
  photo: { width: PHOTO, height: PHOTO, borderRadius: radius.soft, overflow: 'hidden', backgroundColor: color.porcelain, alignItems: 'center', justifyContent: 'center' },
  reply: { gap: space.xs, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: color.porcelain },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
