import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, usePathname } from 'expo-router'
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs'
import { useCallback, useRef } from 'react'
import { StyleSheet, Text, View, type ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useNotifications } from '@/api/useNotifications'
import { useChatUnread } from '@/chat/useChatUnread'
import { useCartCount } from '@/lib/useCartCount'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { PressableScale } from '@/ui/PressableScale'
import { font, radius, space, themed, useTheme } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

// Outline when idle, solid when active, so the current tab reads at a glance.
const icon = (name: 'storefront' | 'heart' | 'receipt' | 'notifications' | 'person') =>
  function TabIcon({ focused, color: tint }: { focused: boolean; color: ColorValue }) {
    const { color } = useTheme()
    return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={focused ? color.red : (tint as string)} />
  }

// Deliberate exception to the 14px minimum: five labels must fit a 320px-wide bar, so one line, 12px, and a capped font scale.
function TabLabel({ children, color: tint }: { children: string; color: ColorValue }) {
  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={{ color: tint, fontFamily: font.medium, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {children}
    </Text>
  )
}

// The Shop has its own band with the same button, so this one only shows on the other tabs' header.
function HeaderMessages() {
  const unread = useChatUnread()
  const opening = useRef(false)
  // A fast double tap must not push Messages twice; allow it again when this tab regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
  const open = () => {
    if (opening.current) return
    opening.current = true
    router.push('/messages')
  }
  return <HeaderIcon testID="header-messages" name="chatbubble-ellipses-outline" label="Messages" status={unread ? 'unread messages' : undefined} dot={unread} onPress={open} />
}

// The Wishlist header carries the same cart button as the Shop's band, since the cart is no longer a tab.
function HeaderCart() {
  const { count } = useCartCount()
  return <HeaderIcon testID="header-cart" name="bag-outline" label="Cart" status={count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : undefined} count={count} onPress={() => router.navigate('/cart')} />
}

// The screen title lives here, not in the content area; the tab label and its screen are both Notifications.
const TITLES: Record<string, string> = { '/wishlist': 'Wishlist', '/orders': 'Orders', '/notifications': 'Notifications', '/profile': 'Profile' }

// Material top tabs have no header, so it is drawn here; the Shop has its own band.
function TabsHeader() {
  const styles = useStyles()
  const { type } = useTheme()
  const { top } = useSafeAreaInsets()
  const pathname = usePathname()
  if (pathname === '/') return null
  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <Text accessibilityRole="header" style={type.h1}>{TITLES[pathname]}</Text>
      <View style={styles.actions}>
        {pathname === '/wishlist' && <HeaderCart />}
        <HeaderMessages />
      </View>
    </View>
  )
}

// Bottom bar drawn by hand so it keeps the old look, roles and testIDs on top of the swipeable pager.
function TabBar({ state, descriptors, emitter, navigateToTab, insets }: MaterialTopTabBarProps) {
  const styles = useStyles()
  const { color } = useTheme()
  const { count } = useNotifications({ list: false })
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key]
        const focused = state.index === i
        const tint = focused ? color.red : color.graphite
        const unread = route.name === 'notifications' && count ? count : 0
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!event.defaultPrevented) navigateToTab(route.key)
        }
        return (
          <PressableScale key={route.key} testID={options.tabBarButtonTestID} accessibilityRole="tab" accessibilityLabel={unread ? `${options.title}, ${unread} unread` : options.title} accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
            <View>
              {options.tabBarIcon?.({ focused, color: tint })}
              {unread > 0 && (
                <View testID={`${options.tabBarButtonTestID}-badge`} style={styles.badge}>
                  <Text maxFontSizeMultiplier={1} style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </View>
            <TabLabel color={focused ? color.redInk : tint}>{options.title ?? route.name}</TabLabel>
          </PressableScale>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  const styles = useStyles()
  const reduce = useReduceMotion()
  return (
    <View style={styles.fill}>
      <TabsHeader />
      <TopTabs tabBarPosition="bottom" tabBar={TabBar} screenOptions={{ animationEnabled: !reduce, lazy: true }}>
        <TopTabs.Screen name="index" options={{ title: 'Shop', tabBarButtonTestID: 'tab-shop', tabBarIcon: icon('storefront') }} />
        <TopTabs.Screen name="wishlist" options={{ title: 'Wishlist', tabBarButtonTestID: 'tab-wishlist', tabBarIcon: icon('heart') }} />
        <TopTabs.Screen name="orders" options={{ title: 'Orders', tabBarButtonTestID: 'tab-orders', tabBarIcon: icon('receipt') }} />
        <TopTabs.Screen name="notifications" options={{ title: 'Notifications', tabBarButtonTestID: 'tab-notifications', tabBarIcon: icon('notifications') }} />
        <TopTabs.Screen name="profile" options={{ title: 'Profile', tabBarButtonTestID: 'tab-profile', tabBarIcon: icon('person') }} />
      </TopTabs>
    </View>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  fill: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  actions: { flexDirection: 'row', alignItems: 'center' },
  bar: { flexDirection: 'row', backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  badge: { position: 'absolute', top: -space.xs, right: -space.md, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: color.onRed, ...type.numeric },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
}))
