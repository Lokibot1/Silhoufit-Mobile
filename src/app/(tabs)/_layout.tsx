import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'

import { KralLogo } from '@/ui/KralLogo'
import { color, font } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

// Outline when idle, solid when active, so the current tab reads at a glance.
const icon = (name: 'storefront' | 'bag' | 'receipt' | 'person') =>
  function TabIcon({ focused, size, color: tint }: { focused: boolean; size: number; color: ColorValue }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={focused ? color.red : (tint as string)} />
  }

export default function TabsLayout() {
  const reduce = useReduceMotion()
  return (
    <Tabs
      screenOptions={{
        animation: reduce ? 'none' : 'shift',
        headerTitle: () => <KralLogo />,
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.porcelain },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain, elevation: 0 },
        tabBarActiveTintColor: color.red,
        tabBarInactiveTintColor: color.graphite,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Shop', headerShown: false, tabBarButtonTestID: 'tab-shop', tabBarIcon: icon('storefront') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarButtonTestID: 'tab-cart', tabBarIcon: icon('bag') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarButtonTestID: 'tab-orders', tabBarIcon: icon('receipt') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarButtonTestID: 'tab-profile', tabBarIcon: icon('person') }} />
    </Tabs>
  )
}
