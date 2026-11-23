import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

import { notificationOpensMessages, notificationOrderId, type NotificationItem } from '@/api/notifications'
import { useNotifications } from '@/api/useNotifications'
import { useSession } from '@/auth/session'
import type { ApiError } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { PressableScale } from '@/ui/PressableScale'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, space, themed, useTheme } from '@/ui/theme'

const UNREAD_DOT = 8

function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const unread = !item.readAt
  const time = relativeTime(item.createdAt)
  return (
    <PressableScale
      testID={`notification-row-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread, ' : ''}${item.title}${item.body ? `, ${item.body}` : ''}, ${time}`}
      disabled={!unread && !notificationOrderId(item) && !notificationOpensMessages(item)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.line}>
        {unread && <View testID="notification-unread" style={styles.dot} />}
        <Text style={[type.h2, styles.grow, !unread && styles.read]}>{item.title}</Text>
      </View>
      {item.body ? <Text style={[type.small, { color: color.graphite }]}>{item.body}</Text> : null}
      <Text style={[type.small, type.numeric, { color: color.graphite }]}>{time}</Text>
    </PressableScale>
  )
}

// Same row chrome as NotificationRow (title, body, time); the body can wrap, so a long one shifts a little.
function NotificationsSkeleton() {
  const styles = useStyles()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.row}>
          <Skeleton height={24} />
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={20} />
        </View>
      ))}
    </View>
  )
}

// What went wrong and what to do about it, for a failed read.
function failureCopy(error: ApiError | null) {
  if (error?.kind === 'forbidden') return 'Your session has ended, so we could not read your notifications. Sign in again, then come back.'
  if (error?.kind === 'rate-limit') return 'Too many requests were sent just now, so the notifications did not load. Wait for the countdown, then try again.'
  if (error?.kind === 'network') return 'The connection dropped before the notifications loaded. Check your connection, then try again.'
  return 'The server had a problem loading your notifications. Try again in a moment.'
}

// Try again; after a 429 it waits out the server's Retry-After first, since asking sooner only spends the budget that ran out.
function LoadError({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const [wait, setWait] = useState(error?.kind === 'rate-limit' ? Math.ceil((error.retryAfterMs ?? 15_000) / 1000) : 0)
  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  return (
    <View accessibilityRole="alert" style={styles.box}>
      <Text accessibilityRole="header" style={type.h2}>{"Couldn't load your notifications"}</Text>
      <Text style={[type.body, { color: color.graphite }]}>{failureCopy(error)}</Text>
      <Button testID="notifications-retry" label={wait > 0 ? `Try again in ${wait}s` : 'Try again'} disabled={wait > 0} onPress={onRetry} labelStyle={type.numeric} />
    </View>
  )
}

export default function NotificationsScreen() {
  const styles = useStyles()
  const { type } = useTheme()
  const { session, loading } = useSession()
  const signedIn = !!session
  const { count, items, hasNextPage, status, error, loadingMore, unreadOnly, setUnreadOnly, markRead, markAllRead, loadMore, refresh, retry } = useNotifications()
  const [refreshing, setRefreshing] = useState(false)
  const opening = useRef(false)
  // A fast double tap must not stack two screens; allow it again when this tab regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))

  const doRefresh = () => {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }
  const open = (item: NotificationItem) => {
    void markRead(item.id)
    if (notificationOpensMessages(item)) {
      if (opening.current) return
      opening.current = true
      router.push('/messages')
      return
    }
    const orderId = notificationOrderId(item)
    if (!orderId || opening.current) return
    opening.current = true
    router.push({ pathname: '/orders/[id]', params: { id: orderId } })
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <NotificationsSkeleton />
      </View>
    )
  }
  if (!signedIn) {
    return (
      <View style={styles.screen}>
        <View style={styles.message}>
          <StateMessage title="Sign in to see your order updates" message="Payment, shipping and delivery updates for your orders show up here once you sign in." actionLabel="Sign In" onAction={signIn} testID="notifications-sign-in" />
        </View>
      </View>
    )
  }

  const unreadLabel = count ? `Unread (${count})` : 'Unread'
  const toolbar = (
    <View style={styles.toolbar}>
      <View style={styles.chips}>
        <Chip tall testID="notifications-filter-all" label="All" selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
        <Chip tall testID="notifications-filter-unread" label={unreadLabel} accessibilityLabel={count ? `Unread, ${count} ${count === 1 ? 'notification' : 'notifications'}` : 'Unread'} selected={unreadOnly} onPress={() => setUnreadOnly(true)} />
      </View>
      {count ? (
        <PressableScale testID="notifications-mark-all" accessibilityRole="button" accessibilityLabel="Mark all read" onPress={() => void markAllRead()} style={styles.markAll}>
          <Text style={[type.small, styles.markAllText]}>Mark all read</Text>
        </PressableScale>
      ) : null}
    </View>
  )

  if (status !== 'ready') {
    return (
      <View style={styles.screen}>
        {toolbar}
        {status === 'loading' ? (
          <NotificationsSkeleton />
        ) : (
          <View style={styles.message}>
            <LoadError error={error} onRetry={retry} />
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {toolbar}
      <PullToRefresh refreshing={refreshing} onRefresh={doRefresh}>
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="notifications-list"
            contentContainerStyle={styles.listContent}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <NotificationRow item={item} onPress={() => open(item)} />}
            ListEmptyComponent={
              <View style={styles.message}>
                {unreadOnly ? (
                  <StateMessage title="You're all caught up" message="You have no unread notifications." actionLabel="Show All" onAction={() => setUnreadOnly(false)} testID="notifications-show-all" />
                ) : (
                  <StateMessage title="No notifications yet" message="Updates on your orders and replies to your reviews show up here." actionLabel="Browse the Shop" onAction={() => router.navigate('/')} testID="notifications-empty-action" />
                )}
              </View>
            }
            ListFooterComponent={hasNextPage ? <View style={styles.message}><Button testID="notifications-more" variant="secondary" label="Show More" pending={loadingMore} onPress={loadMore} /></View> : undefined}
          />
        )}
      </PullToRefresh>
    </View>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  listContent: { paddingBottom: space.xxl },
  message: { padding: space.lg },
  box: { gap: space.md },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  chips: { flexDirection: 'row', gap: space.sm },
  markAll: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  markAllText: { fontFamily: font.semibold, color: color.redInk, textDecorationLine: 'underline' },
  grow: { flex: 1 },
  row: { gap: space.xs, paddingVertical: space.lg, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  pressed: { backgroundColor: color.porcelain },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  // Unread is a square dot and the bold title, so it never rests on colour alone.
  dot: { width: UNREAD_DOT, height: UNREAD_DOT, backgroundColor: color.red },
  read: { fontFamily: font.regular },
}))
