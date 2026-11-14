import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchCart } from '@/api/cart'
import { fetchCategories, fetchProducts, type ProductListItem, type ProductSort } from '@/api/products'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { PressableScale } from '@/ui/PressableScale'
import { ProductCard, ProductCardSkeleton } from '@/ui/ProductCard'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, radius, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const LIMIT = 12
const DEBOUNCE_MS = 300
const SKELETONS = [0, 1, 2, 3, 4, 5]
// One tap on the sort chip moves to the next option; Newest is the API default, so it sends nothing.
const SORTS: { label: string; params: ProductSort }[] = [
  { label: 'Newest', params: {} },
  { label: 'Price: low to high', params: { sortBy: 'price', sortOrder: 'asc' } },
  { label: 'Price: high to low', params: { sortBy: 'price', sortOrder: 'desc' } },
]

// The shop is public, so a 401/403 is never a session problem.
const shopError = (failure: unknown) => (failure instanceof ApiError && failure.kind === 'forbidden' ? "The shop couldn't be loaded. Try again." : errorMessage(failure))

// Public: browsing needs no session. The session is read only to badge the cart icon.
export default function Shop() {
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [focused, setFocused] = useState(false)
  // Light status-bar icons on the red band only while the Shop is showing.
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false) }, []))
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | undefined>()
  const [categories, setCategories] = useState<string[]>([])
  const [sort, setSort] = useState(0)
  const [cartCount, setCartCount] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [items, setItems] = useState<ProductListItem[]>([])
  const [meta, setMeta] = useState({ total: 0, page: 1, hasNextPage: false })
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const pulled = useRef(false)
  const moreBusy = useRef(false)
  const opening = useRef(false)
  // A fast double tap must not push the product twice; allow it again when the Shop regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
  // A different account must not inherit the previous one's count: reset while rendering, before the fetch effect runs.
  const [countUser, setCountUser] = useState(userId)
  if (countUser !== userId) {
    setCountUser(userId)
    setCartCount(0)
  }
  // The cart badge is a nicety: it needs a session, and a failed load just leaves it as it was.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return
      const ctl = new AbortController()
      fetchCart(ctl.signal).then((cart) => setCartCount(cart.totalItems), () => {})
      return () => ctl.abort()
    }, [userId]),
  )
  const badge = userId ? cartCount : 0
  // Category chips come from the API; if it fails the row simply keeps "All".
  useEffect(() => {
    const ctl = new AbortController()
    fetchCategories(ctl.signal).then(setCategories, () => {})
    return () => ctl.abort()
  }, [])
  const open = (id: string) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/product/[id]', params: { id } })
  }
  // A ref keeps the effect below from re-running (and refetching) if the toast function's identity changes.
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  })

  // First page: runs on a new search, category, sort, Retry or pull-to-refresh. Aborts the previous request, and on unmount.
  useEffect(() => {
    const ctl = new AbortController()
    controller.current = ctl
    const pull = pulled.current
    pulled.current = false
    moreBusy.current = false
    fetchProducts({ search, category, ...SORTS[sort].params, page: 1, limit: LIMIT }, ctl.signal)
      .then((result) => {
        if (ctl.signal.aborted) return
        setItems(result.items)
        setMeta({ total: result.total, page: result.page, hasNextPage: result.hasNextPage })
        setMore('idle')
        setStatus('ready')
      })
      .catch((failure) => {
        if (ctl.signal.aborted) return
        if (pull) toastRef.current(shopError(failure))
        else {
          setError(shopError(failure))
          setStatus('error')
        }
      })
      .finally(() => {
        if (!ctl.signal.aborted) setRefreshing(false)
      })
    return () => ctl.abort()
  }, [search, category, sort, reloadKey])

  // Debounce: only the last keystroke in 300 ms starts a search.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim()
      if (next === search) return
      setSearch(next)
      setStatus('loading')
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, search])

  const reload = () => {
    setStatus('loading')
    setReloadKey((key) => key + 1)
  }
  const refresh = () => {
    pulled.current = true
    setMore('idle')
    setRefreshing(true)
    setReloadKey((key) => key + 1)
  }
  const clear = () => {
    setQuery('')
    if (search) {
      setSearch('')
      setStatus('loading')
    }
  }
  const pickCategory = (next: string | undefined) => {
    if (next === category) return
    setCategory(next)
    setStatus('loading')
  }
  const nextSort = () => {
    setSort((current) => (current + 1) % SORTS.length)
    setStatus('loading')
  }
  const showAll = () => {
    clear()
    pickCategory(undefined)
  }
  const loadMore = () => {
    const signal = controller.current?.signal
    if (!signal || moreBusy.current || refreshing || !meta.hasNextPage) return
    moreBusy.current = true
    setMore('loading')
    fetchProducts({ search, category, ...SORTS[sort].params, page: meta.page + 1, limit: LIMIT }, signal)
      .then((result) => {
        if (signal.aborted) return
        // A product moved between pages while browsing must not appear twice.
        setItems((current) => [...current, ...result.items.filter((next) => !current.some((known) => known.id === next.id))])
        setMeta({ total: result.total, page: result.page, hasNextPage: result.hasNextPage })
        setMore('idle')
      })
      .catch(() => {
        if (!signal.aborted) setMore('error')
      })
      .finally(() => {
        if (signal === controller.current?.signal) moreBusy.current = false
      })
  }

  const footer =
    more === 'loading' ? (
      <View style={styles.footer}><ActivityIndicator accessibilityLabel="Loading more" color={color.obsidian} /></View>
    ) : more === 'error' ? (
      <View accessibilityRole="alert" style={styles.footer}>
        <Text style={styles.footerText}>{"Couldn't load more pieces. Check your connection."}</Text>
        <Button testID="shop-load-more-retry" variant="secondary" label="Retry" onPress={() => { setMore('idle'); loadMore() }} />
      </View>
    ) : undefined

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.heading}>Shop</Text>
      {focused && <StatusBar style="light" />}
      <View style={[styles.band, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Ionicons name="search" size={24} color={color.graphite} style={styles.searchIcon} />
            <TextInput
              testID="shop-search"
              accessibilityLabel="Search pieces"
              placeholder="Search pieces"
              placeholderTextColor={color.graphite}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              maxLength={80}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query !== '' && (
              <Pressable testID="shop-search-clear" accessibilityRole="button" accessibilityLabel="Clear search" onPress={clear} style={styles.clear}>
                <Ionicons name="close" size={24} color={color.obsidian} />
              </Pressable>
            )}
          </View>
          <PressableScale
            testID="shop-cart"
            accessibilityRole="button"
            accessibilityLabel={badge > 0 ? `Cart, ${badge} ${badge === 1 ? 'item' : 'items'}` : 'Cart'}
            onPress={() => router.navigate('/cart')}
            style={styles.cart}>
            <Ionicons name="bag-outline" size={24} color={color.paper} />
            {badge > 0 && (
              <View testID="shop-cart-badge" style={styles.badge}>
                <Text maxFontSizeMultiplier={1} style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            )}
          </PressableScale>
        </View>
      </View>
      <View style={styles.header}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
          <Chip testID="shop-category-all" label="All" selected={category === undefined} onPress={() => pickCategory(undefined)} />
          {categories.map((name) => (
            <Chip key={name} testID={`shop-category-${name}`} label={name} selected={category === name} onPress={() => pickCategory(name)} />
          ))}
        </ScrollView>
        <View style={styles.meta}>
          <Text testID="shop-count" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.count}>{status === 'ready' ? `${meta.total} ${meta.total === 1 ? 'piece' : 'pieces'}` : ''}</Text>
          <Chip testID="shop-sort" label={SORTS[sort].label} accessibilityLabel={`Sort by ${SORTS[sort].label}. Tap to change.`} selected={sort !== 0} onPress={nextSort} />
        </View>
      </View>

      {status === 'loading' && (
        <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeletons}>
          {SKELETONS.map((key) => <ProductCardSkeleton key={key} />)}
        </View>
      )}
      {status === 'error' && (
        <View style={styles.message}>
          <StateMessage alert title="Couldn't load the shop" message={error} actionLabel="Retry" onAction={reload} testID="shop-retry" />
        </View>
      )}
      {status === 'ready' && items.length === 0 && (
        <View testID="shop-empty" style={styles.message}>
          {search ? (
            <StateMessage title={`No pieces match "${search}"`} message="Check the spelling or try a shorter word." actionLabel="Clear Search" onAction={showAll} testID="shop-empty-action" />
          ) : category ? (
            <StateMessage title={`No ${category} pieces yet`} message="Try another category to see more." actionLabel="Show All" onAction={showAll} testID="shop-empty-action" />
          ) : (
            <StateMessage title="No pieces yet" message="The collection is empty right now. Tap Refresh to check again." actionLabel="Refresh" onAction={reload} testID="shop-empty-action" />
          )}
        </View>
      )}
      {status === 'ready' && items.length > 0 && (
        <FlatList
          testID="shop-list"
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => <ProductCard item={item} onPress={() => open(item.id)} />}
          columnWrapperStyle={styles.columns}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => more !== 'error' && loadMore()}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={refresh}
          ListFooterComponent={footer}
        />
      )}
    </View>
  )
}

const Gap = () => <View style={styles.gap} />

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  band: { backgroundColor: color.red, paddingBottom: space.sm },
  header: { paddingVertical: space.sm, gap: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  search: { flex: 1, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.paper },
  searchIcon: { position: 'absolute', left: space.md },
  input: { ...type.body, minHeight: 44, paddingVertical: space.sm, paddingLeft: 48, paddingRight: 44 },
  clear: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.red, ...type.numeric },
  // Screen-reader heading only: 1px, clipped, transparent, out of layout (no visible title).
  heading: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent' },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.lg },
  count: { flexShrink: 1, ...type.small, ...type.numeric, color: color.graphite },
  skeletons: { flex: 1, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, gap: space.md },
  message: { padding: space.lg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  columns: { gap: space.md },
  gap: { height: space.md },
  footer: { paddingVertical: space.lg, gap: space.md },
  footerText: { ...type.body, color: color.graphite },
})
