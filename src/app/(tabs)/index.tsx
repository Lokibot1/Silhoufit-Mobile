import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import { fetchProducts, type ProductListItem } from '@/api/products'
import { ApiError, errorMessage } from '@/lib/api'
import { Button } from '@/ui/Button'
import { ProductCard, ProductCardSkeleton } from '@/ui/ProductCard'
import { StateMessage } from '@/ui/StateMessage'
import { color, space, type } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const LIMIT = 12
const DEBOUNCE_MS = 300
const SKELETONS = [0, 1, 2, 3, 4, 5]

// The shop is public, so a 401/403 is never a session problem.
const shopError = (failure: unknown) => (failure instanceof ApiError && failure.kind === 'forbidden' ? "The shop couldn't be loaded. Try again." : errorMessage(failure))

// Public: browsing needs no session, so nothing here reads it.
export default function Shop() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
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
  // A ref keeps the effect below from re-running (and refetching) if the toast function's identity changes.
  const toastRef = useRef(toast)
  useEffect(() => {
    toastRef.current = toast
  })

  // First page: runs on a new search, Retry or pull-to-refresh. Aborts the previous request, and on unmount.
  useEffect(() => {
    const ctl = new AbortController()
    controller.current = ctl
    const pull = pulled.current
    pulled.current = false
    moreBusy.current = false
    fetchProducts({ search, page: 1, limit: LIMIT }, ctl.signal)
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
  }, [search, reloadKey])

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
  const loadMore = () => {
    const signal = controller.current?.signal
    if (!signal || moreBusy.current || refreshing || !meta.hasNextPage) return
    moreBusy.current = true
    setMore('loading')
    fetchProducts({ search, page: meta.page + 1, limit: LIMIT }, signal)
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
      <View style={styles.header}>
        <Text style={type.label}>(Collection)</Text>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={type.h1}>Shop</Text>
          {status === 'ready' && <Text testID="shop-count" style={styles.count}>{`${meta.total} ${meta.total === 1 ? 'piece' : 'pieces'}`}</Text>}
        </View>
        <View style={styles.search}>
          <TextInput
            testID="shop-search"
            accessibilityLabel="Search pieces"
            placeholder="Search pieces"
            placeholderTextColor={color.stonewash}
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
            <StateMessage title={`No pieces match "${search}"`} message="Check the spelling or try a shorter word." actionLabel="Clear Search" onAction={clear} testID="shop-empty-action" />
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
          renderItem={({ item }) => <ProductCard item={item} />}
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
  header: { padding: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  count: { ...type.label, ...type.numeric, textAlign: 'right' },
  search: { justifyContent: 'center' },
  input: { ...type.body, borderWidth: 1, borderColor: color.stonewash, minHeight: 48, paddingLeft: space.md, paddingRight: 48, backgroundColor: color.paper },
  clear: { position: 'absolute', right: 0, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  skeletons: { flex: 1, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, gap: space.md },
  message: { padding: space.lg },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  columns: { gap: space.md },
  gap: { height: space.md },
  footer: { paddingVertical: space.lg, gap: space.md },
  footerText: { ...type.body, color: color.graphite },
})
