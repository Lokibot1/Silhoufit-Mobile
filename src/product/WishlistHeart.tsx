import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'

import { addWishlistItem, fetchWishlistIds, removeWishlistItem } from '@/api/wishlist'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { useRequest } from '@/lib/useRequest'
import { PressableScale } from '@/ui/PressableScale'
import { color } from '@/ui/theme'

const LOAD_FAILED = "Couldn't load your wishlist. Tap to retry."

/** A 44px heart that saves or removes one product. Signed out, a tap opens Sign In (which returns here). `notify` shows the toast above the page's sticky bar. */
export function WishlistHeart({ productId, notify }: { productId: string; notify: (message: string) => void }) {
  const { session } = useSession()
  const userId = session?.user.id
  // The saved ids load once per account; `picked` is what the shopper chose since, so a tap shows at once and a failure puts it back.
  const key = `${productId}|${userId ?? ''}`
  const { status, data, retry } = useRequest(key, (signal) => (userId ? fetchWishlistIds(signal) : Promise.resolve([])))
  // A pick belongs to one product and account; after a switch it no longer applies.
  const [pick, setPick] = useState<{ key: string; value: boolean } | null>(null)
  const picked = pick?.key === key ? pick.value : null
  const setPicked = (value: boolean) => setPick({ key, value })
  const saved = picked ?? !!data?.includes(productId)
  const unknown = !!userId && status === 'error'
  const notifyRef = useRef(notify)
  useEffect(() => {
    notifyRef.current = notify
  })
  // Without the saved ids the heart cannot tell "saved" from "not saved", so say so instead of showing it as not saved.
  useEffect(() => {
    if (unknown) notifyRef.current(LOAD_FAILED)
  }, [unknown])
  const busy = useRef(false)
  const opening = useRef(false)
  // A fast double tap must not stack two sign-in screens; allow it again when this screen regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))

  function signIn() {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  async function toggle() {
    if (!session) return signIn()
    if (unknown) return retry()
    if (busy.current) return
    busy.current = true
    const next = !saved
    setPicked(next)
    try {
      await (next ? addWishlistItem(productId) : removeWishlistItem(productId))
      notify(next ? 'Saved to wishlist' : 'Removed from wishlist')
    } catch (error) {
      setPicked(!next)
      if (error instanceof ApiError && error.kind === 'forbidden') signIn()
      else notify(`Couldn't ${next ? 'save to' : 'remove from'} your wishlist. ${errorMessage(error)}`)
    } finally {
      busy.current = false
    }
  }

  const label = unknown ? LOAD_FAILED : saved ? 'Remove from wishlist' : 'Add to wishlist'
  return (
    <PressableScale
      testID="product-wishlist"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !unknown && saved, disabled: !!userId && status === 'loading' }}
      disabled={!!userId && status === 'loading'}
      onPress={toggle}
      style={styles.button}>
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={unknown ? color.stonewash : saved ? color.red : color.obsidian} />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
