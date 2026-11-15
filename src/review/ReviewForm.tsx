import { Ionicons } from '@expo/vector-icons'
import { router, useNavigation, usePreventRemove } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { createReview, notifyReviewsChanged, updateReview, type MyReview } from '@/api/reviews'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { checkReviewPhoto, filterReviewText, REVIEW_LIMITS, validateReview } from '@/lib/reviewValidation'
import { deleteUploaded, isAbort, REVIEW_BUCKET, uploadErrorMessage, uploadPhoto, UploadError, type Photo } from '@/lib/imageUpload'
import { Button } from '@/ui/Button'
import { FloatingField } from '@/ui/FloatingField'
import { PhotoSourceSheet } from '@/ui/PhotoPicker'
import { PressableScale } from '@/ui/PressableScale'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'
import { PhotoGrid, type Tile } from './PhotoGrid'

const TARGET = 44

const expired = (failure: unknown) => (failure instanceof UploadError && failure.kind === 'unauthorized') || (failure instanceof ApiError && failure.status === 401)

function failureCopy(failure: unknown): string {
  if (failure instanceof UploadError) return `${uploadErrorMessage(failure.kind)} Your review wasn't posted.`
  if (failure instanceof ApiError && failure.kind === 'validation') return `We couldn't save your review. The server said: ${failure.detail ?? 'a field is not valid'}. Fix it, then try again.`
  if (failure instanceof ApiError && failure.kind === 'forbidden') return `We couldn't save your review. ${failure.detail ?? "This account isn't allowed to review this product."}`
  return `We couldn't save your review. ${errorMessage(failure)} Your text and photos are still here.`
}

type Props = {
  userId: string
  orderId: string
  productId: string
  productName: string
  /** The saved review, when editing. */
  review?: MyReview
  /** This product is already reviewed (409): the screen reloads and opens it for editing. */
  onConflict: () => void
}

function Stars({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <View testID="review-rating" accessibilityRole="radiogroup" accessibilityLabel="Rating" style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <PressableScale
          key={n}
          testID={`review-star-${n}`}
          accessibilityRole="radio"
          accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
          accessibilityState={{ checked: value === n, disabled }}
          disabled={disabled}
          onPress={() => onChange(n)}
          style={styles.star}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={32} color={n <= value ? color.obsidian : color.stonewash} />
        </PressableScale>
      ))}
    </View>
  )
}

let nextTile = 0

// Rating, text and up to five photos. New photos upload when the review is submitted; a failed one keeps its place and can be retried.
export function ReviewForm({ userId, orderId, productId, productName, review, onConflict }: Props) {
  const { signOut } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const size = Math.floor((width - 2 * space.lg - 2 * space.sm) / 3)
  const initialTiles = (review?.photos ?? []).map((url): Tile => ({ id: url, uri: url, remote: url, photo: null, state: 'ready', percent: 0 }))
  const [rating, setRating] = useState(review?.rating ?? 0)
  const [text, setText] = useState(review?.comment ?? '')
  const [tiles, setTiles] = useState<Tile[]>(initialTiles)
  const [submitted, setSubmitted] = useState(false)
  const [touched, setTouched] = useState(false)
  const [phase, setPhase] = useState<'uploading' | 'saving' | null>(null)
  const [finished, setFinished] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [sheet, setSheet] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const textRef = useRef<ComponentRef<typeof TextInput>>(null)
  const saved = useRef(false)
  const mounted = useRef(true)
  const phaseNow = useRef<'uploading' | 'saving' | null>(null)
  const live = useRef(tiles)
  useEffect(() => {
    live.current = tiles
  })
  const pending = phase !== null
  const goTo = (next: 'uploading' | 'saving' | null) => {
    phaseNow.current = next
    setPhase(next)
  }
  const dropUploads = () => live.current.forEach((t) => t.photo && t.remote && void deleteUploaded(t.remote, userId, REVIEW_BUCKET))
  // Photos uploaded for a review that was never saved are no use to anyone: leaving stops an upload and deletes them. Once the save is sent
  // it may still land and use them, so then nothing is aborted or deleted (a failure after that cleans up in submit).
  useEffect(
    () => () => {
      mounted.current = false
      if (phaseNow.current === 'saving') return
      controller.current?.abort()
      if (!saved.current) dropUploads()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const errors = validateReview({ rating, text })
  const textError = touched || submitted ? errors.text : undefined
  const dirty = rating !== (review?.rating ?? 0) || text !== (review?.comment ?? '') || tiles.map((t) => t.id).join() !== initialTiles.map((t) => t.id).join()
  const hasFailed = tiles.some((t) => t.state === 'failed')

  usePreventRemove(dirty && !finished, ({ data }) =>
    Alert.alert('Discard changes?', 'Your review has not been saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]),
  )
  // Leaves once the review is saved. The guard above is released by a re-render, so leave a tick after it, never in the same flush.
  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/orders')), 0)
    return () => clearTimeout(timer)
  }, [finished])

  // The screen found this product already reviewed (409): the saved photos join the ones just added, the draft stays.
  const adopted = useRef(review?.id)
  useEffect(() => {
    if (!review || adopted.current === review.id) return
    adopted.current = review.id
    const keep = review.photos.map((url): Tile => ({ id: url, uri: url, remote: url, photo: null, state: 'ready', percent: 0 }))
    const room = Math.max(0, REVIEW_LIMITS.photosMax - keep.length)
    live.current.slice(room).forEach((t) => t.photo && t.remote && void deleteUploaded(t.remote, userId, REVIEW_BUCKET))
    setTiles([...keep, ...live.current.slice(0, room)])
  }, [review, userId])

  const patch = (id: string, change: Partial<Tile>) => setTiles((current) => current.map((t) => (t.id === id ? { ...t, ...change } : t)))

  function pick(photos: Photo[]) {
    const problems: string[] = []
    const added: Tile[] = []
    for (const photo of photos) {
      const problem = checkReviewPhoto(photo, tiles.length + added.length)
      if (problem) problems.push(problem)
      else added.push({ id: `new${++nextTile}`, uri: photo.uri, remote: null, photo, state: 'ready', percent: 0 })
    }
    setNotes(problems)
    setFailure(null)
    if (added.length) setTiles((current) => [...current, ...added])
  }

  function remove(id: string) {
    const gone = tiles.find((t) => t.id === id)
    if (gone?.photo && gone.remote) void deleteUploaded(gone.remote, userId, REVIEW_BUCKET)
    setNotes([])
    setTiles((current) => current.filter((t) => t.id !== id))
  }

  async function submit() {
    if (controller.current) return
    setSubmitted(true)
    if (errors.rating || errors.text) {
      if (errors.text && !errors.rating) textRef.current?.focus()
      return
    }
    const own = new AbortController()
    controller.current = own
    goTo('uploading')
    setFailure(null)
    try {
      const urls: string[] = []
      for (const tile of live.current) {
        if (tile.remote) {
          urls.push(tile.remote)
          continue
        }
        patch(tile.id, { state: 'uploading', percent: 0 })
        try {
          const url = await uploadPhoto(tile.photo!, { userId, bucket: REVIEW_BUCKET, signal: own.signal, onProgress: (percent) => patch(tile.id, { percent }) })
          patch(tile.id, { remote: url, state: 'ready', percent: 100 })
          urls.push(url)
        } catch (reason) {
          patch(tile.id, { state: isAbort(reason) ? 'ready' : 'failed', percent: 0 })
          throw reason
        }
      }
      const body = { rating, comment: text.trim() }
      goTo('saving')
      if (review) await updateReview(review.id, { ...body, imageUrls: urls })
      else await createReview(orderId, productId, { ...body, ...(urls.length > 0 && { imageUrls: urls }) })
      saved.current = true
      // Photos taken off the review are no use to anyone now.
      if (review) review.photos.filter((url) => !urls.includes(url)).forEach((url) => void deleteUploaded(url, userId, REVIEW_BUCKET))
      notifyReviewsChanged()
      toast(review ? 'Review updated' : 'Review posted')
      setFinished(true) // stays pending until this screen unmounts, so the button cannot be tapped twice
    } catch (reason) {
      const wasSaving = phaseNow.current === 'saving'
      controller.current = null
      goTo(null)
      if (!mounted.current) {
        if (wasSaving) dropUploads() // left while saving and the save failed: nobody is left to retry
        return
      }
      if (isAbort(reason)) toast('Upload cancelled')
      else if (expired(reason)) {
        toast('Your session has expired. Sign in again.')
        void signOut()
      } else if (!review && reason instanceof ApiError && reason.kind === 'conflict') {
        toast('You already reviewed this product on this order. Opening your review so you can edit it.')
        onConflict()
      } else setFailure(failureCopy(reason))
    }
  }

  return (
    <KeyboardScreen style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={type.h1}>{review ? 'Edit Your Review' : 'Write A Review'}</Text>
        <Text testID="review-product" style={type.body}>{productName}</Text>

        <View style={styles.group}>
          <Text style={type.label}>(Rating)</Text>
          <Stars value={rating} onChange={(n) => { setFailure(null); setRating(n) }} disabled={pending} />
          {submitted && errors.rating && <Text testID="review-rating-error" accessibilityLiveRegion="polite" style={[type.small, styles.error]}>{errors.rating}</Text>}
        </View>

        <View style={styles.group}>
          <FloatingField
            ref={textRef}
            testID="review-text"
            label="Your review"
            value={text}
            onChangeText={(next) => { setFailure(null); setText(filterReviewText(next)) }}
            onBlur={() => setTouched(true)}
            error={textError}
            editable={!pending}
            multiline
          />
          <Text testID="review-count" style={[type.small, type.numeric, styles.count]}>{`${text.length}/${REVIEW_LIMITS.textMax}`}</Text>
        </View>

        <View style={styles.group}>
          <Text style={type.label}>(Photos)</Text>
          <Text style={[type.small, styles.hint]}>{`Up to ${REVIEW_LIMITS.photosMax} photos. JPG, PNG or WebP, 5 MB each.`}</Text>
          <PhotoGrid tiles={tiles} size={size} locked={pending} onAdd={() => setSheet(true)} onRemove={remove} onRetry={() => void submit()} />
          {notes.map((note) => (
            <View key={note} testID="review-photo-note" accessibilityRole="alert" style={styles.banner}>
              <Text style={type.body}>{note}</Text>
            </View>
          ))}
        </View>

        {failure && (
          <View testID="review-banner" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure}</Text>
          </View>
        )}

        <Button testID="review-submit" label={hasFailed ? 'Retry Upload' : review ? 'Save Review' : 'Post Review'} pending={pending} disabled={!!review && !dirty} onPress={() => void submit()} />
        {phase === 'uploading' && <Button testID="review-cancel" variant="secondary" label="Cancel Upload" onPress={() => controller.current?.abort()} />}
      </ScrollView>
      <PhotoSourceSheet visible={sheet} onClose={() => setSheet(false)} title="Add a photo" limit={REVIEW_LIMITS.photosMax - tiles.length} onPhotos={pick} />
    </KeyboardScreen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.md, backgroundColor: color.paper },
  group: { gap: space.sm },
  stars: { flexDirection: 'row', gap: space.xs },
  star: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  error: { color: color.red },
  count: { textAlign: 'right', color: color.graphite },
  hint: { color: color.graphite },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
})
