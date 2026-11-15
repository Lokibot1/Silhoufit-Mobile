import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, usePathname } from 'expo-router'
import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs'
import { useCallback, useRef } from 'react'
import { StyleSheet, Text, View, type ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useChatUnread } from '@/chat/useChatUnread'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { PressableScale } from '@/ui/PressableScale'
import { color, font, space, type } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

// Outline when idle, solid when active, so the current tab reads at a glance.
const icon = (name: 'storefront' | 'bag' | 'receipt' | 'notifications' | 'person') =>
  function TabIcon({ focused, color: tint }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={focused ? color.red : (tint as string)} />
  }

// Deliberate exception to the 14px minimum: five labels must fit a 320px-wide bar, so one line, 12px, and a capped font scale.
function TabLabel({ children, color: tint }: { children: string; color: ColorValue }) {
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: tint, fontFamily: font.medium, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
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

// The screen title lives here, not in the content area; the tab label stays short (Alerts) but its screen is Notifications.
const TITLES: Record<string, string> = { '/cart': 'Cart', '/orders': 'Orders', '/notifications': 'Notifications', '/profile': 'Profile' }

// Material top tabs have no header, so it is drawn here; the Shop has its own band.
function TabsHeader() {
  const { top } = useSafeAreaInsets()
  const pathname = usePathname()
  if (pathname === '/') return null
  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <Text accessibilityRole="header" style={type.h1}>{TITLES[pathname]}</Text>
      <HeaderMessages />
    </View>
  )
}

// Bottom bar drawn by hand so it keeps the old look, roles and testIDs on top of the swipeable pager.
function TabBar({ state, descriptors, emitter, navigateToTab, insets }: MaterialTopTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key]
        const focused = state.index === i
        const tint = focused ? color.red : color.graphite
        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!event.defaultPrevented) navigateToTab(route.key)
        }
        return (
          <PressableScale key={route.key} testID={options.tabBarButtonTestID} accessibilityRole="tab" accessibilityLabel={options.title} accessibilityState={{ selected: focused }} onPress={onPress} style={styles.item}>
            {options.tabBarIcon?.({ focused, color: tint })}
            <TabLabel color={tint}>{options.title ?? route.name}</TabLabel>
          </PressableScale>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  const reduce = useReduceMotion()
  return (
    <View style={styles.fill}>
      <TabsHeader />
      <TopTabs tabBarPosition="bottom" tabBar={TabBar} screenOptions={{ animationEnabled: !reduce, lazy: true }}>
        <TopTabs.Screen name="index" options={{ title: 'Shop', tabBarButtonTestID: 'tab-shop', tabBarIcon: icon('storefront') }} />
        <TopTabs.Screen name="cart" options={{ title: 'Cart', tabBarButtonTestID: 'tab-cart', tabBarIcon: icon('bag') }} />
        <TopTabs.Screen name="orders" options={{ title: 'Orders', tabBarButtonTestID: 'tab-orders', tabBarIcon: icon('receipt') }} />
        <TopTabs.Screen name="notifications" options={{ title: 'Alerts', tabBarButtonTestID: 'tab-notifications', tabBarIcon: icon('notifications') }} />
        <TopTabs.Screen name="profile" options={{ title: 'Profile', tabBarButtonTestID: 'tab-profile', tabBarIcon: icon('person') }} />
      </TopTabs>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  bar: { flexDirection: 'row', backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
})
