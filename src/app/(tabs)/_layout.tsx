import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { KralLogo } from '@/ui/KralLogo'
import { color, font } from '@/ui/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <KralLogo />,
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: color.paper, borderBottomWidth: 1, borderBottomColor: color.porcelain },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain, elevation: 0 },
        tabBarActiveTintColor: color.red,
        tabBarInactiveTintColor: color.graphite,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Shop', tabBarButtonTestID: 'tab-shop', tabBarIcon: ({ focused, size, color: tint }) => <Ionicons name="storefront-outline" size={size} color={focused ? color.red : (tint as string)} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarButtonTestID: 'tab-profile',
          tabBarIcon: ({ focused, size, color: tint }) => <Ionicons name="person-outline" size={size} color={focused ? color.red : (tint as string)} />,
        }}
      />
    </Tabs>
  )
}
