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
        tabBarInactiveTintColor: color.stonewash,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Shop', tabBarIcon: ({ focused, size }) => <Ionicons name="storefront-outline" size={size} color={focused ? color.red : color.stonewash} /> }}
      />
    </Tabs>
  )
}
