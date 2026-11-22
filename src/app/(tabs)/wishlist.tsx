import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native'

import { addWishlistItem, clearWishlist, fetchWishlist, removeWishlistItem, type WishlistItem } from '@/api/wishlist'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { PressableScale } from '@/ui/PressableScale'
import { ProductCard, ProductCardSkeleton, useCardRows } from '@/ui/ProductCard'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const SKELETONS = [0, 1, 2, 3]
const insertAt = (list: WishlistItem[], item: WishlistItem, at: number) =>
  list.some((x) => x.productId === item.productId) ? list : [...list.slice(0, at), item, ...list.slice(at)]

const isForbidden = (failure: unknown) => failure instanceof ApiError && failure.kind === 'forbidden'

// Keyed by account, so switching accounts starts from a clean list instead of the last shopper's.
export default function Wishlist() {
  const { session } = useSession()
  return <WishlistScreen key={session?.user.id ?? 'signed-out'} />
}

// Needs a session; signed out it asks for one. Removing is not critical, so there is no confirm: an Undo toast puts the piece back.
function WishlistScreen() {
  const { session, loading } = useSession()
  const toast = useToast()
  const userId = session?.user.id
  // What is on screen: the last answer with the shopper's removals applied, kept while a pull-to-refresh loads the next one.
  const [items, setItems] = useState<WishlistItem[] | null>(null)
  const rows = useCardRows((items ?? []).map((x) => x.product))
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const quiet = useRef(false)
  const shown = useRef(false)
  // Bumped when a remove or Undo starts and again when it ends; a list fetched across one is stale, so it is dropped instead of resurrecting a removed card.
  const changes = useRef(0)
  const focused = useRef(false)
  const toastRef = useRef(toast)
  const working = useRef(new Set<string>())
  const asking = useRef(false)
  const [clearing, setClearing] = useState(false)
  const opening = useRef(false)
  // A fast double tap must not stack two screens; allow it again when this screen regains focus.
  // Coming back (say after un-hearting on the product page) also reloads quietly: the list stays on screen meanwhile.
  useFocusEffect(useCallback(() => {
    opening.current = false
    if (!focused.current) {
      focused.current = true
      return
    }
    quiet.current = true
    setReloadKey((key) => key + 1)
  }, []))
  useEffect(() => {
    toastRef.current = toast
    shown.current = items !== null
  })
  const openSignIn = useCallback(() => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }, [])

  // Runs for the signed-in account, on Retry, on pull-to-refresh and on regaining focus; aborts the previous request, and on unmount.
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    const seen = changes.current
    const background = quiet.current
    quiet.current = false
    fetchWishlist(controller.signal).then(
      (list) => {
        if (controller.signal.aborted) return
        if (seen === changes.current) {
          setItems(list)
          setStatus('ready')
        }
        setRefreshing(false)
      },
      (failure) => {
        if (controller.signal.aborted) return
        if (isForbidden(failure)) openSignIn()
        if (background && shown.current) {
          if (!isForbidden(failure)) toastRef.current(`Couldn't refresh your wishlist. ${errorMessage(failure)}`)
        } else {
          setError(failure)
          setStatus('error')
        }
        setRefreshing(false)
      },
    )
    return () => controller.abort()
  }, [userId, reloadKey, openSignIn])

  const retry = () => {
    setStatus('loading')
    setReloadKey((key) => key + 1)
  }
  const refresh = () => {
    quiet.current = true
    setRefreshing(true)
    setReloadKey((key) => key + 1)
  }

  const open = (id: string) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/product/[id]', params: { id } })
  }

  async function remove(item: WishlistItem) {
    const id = item.productId
    if (working.current.has(id)) return
    working.current.add(id)
    changes.current++
    const at = (items ?? []).findIndex((x) => x.productId === id)
    setItems((current) => (current ?? []).filter((x) => x.productId !== id))
    try {
      await removeWishlistItem(id)
      toast('Removed from wishlist', { action: { label: 'Undo', onPress: () => undo(item, at) } })
    } catch (failure) {
      setItems((current) => insertAt(current ?? [], item, at))
      if (isForbidden(failure)) openSignIn()
      else toast(`Couldn't remove it from your wishlist. ${errorMessage(failure)}`)
    } finally {
      changes.current++
      working.current.delete(id)
    }
  }

  async function undo(item: WishlistItem, at: number) {
    const id = item.productId
    if (working.current.has(id)) return
    working.current.add(id)
    changes.current++
    try {
      await addWishlistItem(id)
      setItems((current) => insertAt(current ?? [], item, at))
      toast('Back in your wishlist')
    } catch (failure) {
      toast(`Couldn't put it back. ${errorMessage(failure)}`)
    } finally {
      changes.current++
      working.current.delete(id)
    }
  }

  // One Alert at a time; the lock opens again when it is dismissed or the clear ends.
  function confirmClear() {
    if (asking.current) return
    asking.current = true
    const release = () => {
      asking.current = false
    }
    Alert.alert(
      'Are you sure?',
      'Every piece you saved will be removed from your wishlist.',
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: 'Clear Wishlist', style: 'destructive', onPress: () => void clearAll().finally(release) },
      ],
      { cancelable: true, onDismiss: release },
    )
  }

  async function clearAll() {
    setClearing(true)
    changes.current++
    try {
      await clearWishlist()
      setItems([])
      toast('Wishlist cleared')
    } catch (failure) {
      if (isForbidden(failure)) openSignIn()
      else toast(`Couldn't clear your wishlist. ${errorMessage(failure)}`)
    } finally {
      changes.current++
      setClearing(false)
    }
  }

  if (!loading && !session) {
    return (
      <View style={styles.message}>
        <StateMessage title="Sign in to see your wishlist" message="The pieces you save are kept in your account once you sign in." actionLabel="Sign In" onAction={openSignIn} testID="wishlist-sign-in" />
      </View>
    )
  }
  if (items === null && status === 'error') {
    return (
      <View style={styles.message}>
        <StateMessage alert title="Couldn't load your wishlist" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="wishlist-retry" />
      </View>
    )
  }
  if (items === null) {
    return (
      <View testID="wishlist-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeletons}>
        {SKELETONS.map((key) => <ProductCardSkeleton key={key} rows={rows} />)}
      </View>
    )
  }
  if (items.length === 0) {
    return (
      <View testID="wishlist-empty" style={styles.message}>
        <StateMessage title="Your wishlist is empty" message="Tap the heart on a piece you like to keep it here." actionLabel="Browse the Shop" onAction={() => router.navigate('/')} testID="wishlist-empty-action" />
      </View>
    )
  }
  return (
    <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
      {(scroll) => (
        <FlatList
          {...scroll}
          testID="wishlist-list"
          style={styles.screen}
          data={items}
          keyExtractor={(item) => item.productId}
          numColumns={2}
          columnWrapperStyle={styles.columns}
          ListHeaderComponent={
            <PressableScale
              testID="wishlist-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear wishlist"
              accessibilityState={{ disabled: clearing, busy: clearing }}
              disabled={clearing}
              onPress={confirmClear}
              style={[styles.clear, clearing && styles.off]}>
              {clearing ? <ActivityIndicator color={color.graphite} /> : <Text style={styles.clearText}>Clear All</Text>}
            </PressableScale>
          }
          ItemSeparatorComponent={Gap}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => (
            <ProductCard
              item={item.product}
              rows={rows}
              onPress={() => open(item.productId)}
              action={
                <PressableScale
                  testID={`wishlist-remove-${item.productId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.product.name} from wishlist`}
                  onPress={() => remove(item)}
                  style={styles.remove}>
                  <Ionicons name="heart" size={18} color={color.red} />
                </PressableScale>
              }
            />
          )}
        />
      )}
    </PullToRefresh>
  )
}

const Gap = () => <View style={styles.gap} />

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { flex: 1, padding: space.lg, backgroundColor: color.paper },
  skeletons: { flex: 1, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md, backgroundColor: color.paper },
  content: { padding: space.lg, paddingBottom: space.xl },
  columns: { gap: space.md },
  gap: { height: space.md },
  clear: { minHeight: 44, minWidth: 44, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' },
  clearText: { ...type.label, color: color.graphite },
  off: { opacity: 0.4 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
