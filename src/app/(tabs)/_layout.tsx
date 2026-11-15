import { Ionicons } from '@expo/vector-icons'
import { router, Tabs, useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import { Text, type ColorValue } from 'react-native'

import { useChatUnread } from '@/chat/useChatUnread'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { KralLogo } from '@/ui/KralLogo'
import { PagedTabs } from '@/ui/PagedTabs'
import { color, font } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

// Outline when idle, solid when active, so the current tab reads at a glance.
const icon = (name: 'storefront' | 'bag' | 'receipt' | 'notifications' | 'person') =>
  function TabIcon({ focused, size, color: tint }: { focused: boolean; size: number; color: ColorValue }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={focused ? color.red : (tint as string)} />
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

export default function TabsLayout() {
  const reduce = useReduceMotion()
  return (
    <PagedTabs>
    <Tabs
      screenOptions={{
        animation: reduce ? 'none' : 'shift',
        headerTitle: () => <KralLogo />,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderMessages />,
        headerStyle: { backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.porcelain },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain, elevation: 0 },
        tabBarActiveTintColor: color.red,
        tabBarInactiveTintColor: color.graphite,
        tabBarLabel: TabLabel,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Shop', headerShown: false, tabBarButtonTestID: 'tab-shop', tabBarIcon: icon('storefront') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarButtonTestID: 'tab-cart', tabBarIcon: icon('bag') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarButtonTestID: 'tab-orders', tabBarIcon: icon('receipt') }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarButtonTestID: 'tab-notifications', tabBarIcon: icon('notifications') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarButtonTestID: 'tab-profile', tabBarIcon: icon('person') }} />
    </Tabs>
    </PagedTabs>
  )
}
