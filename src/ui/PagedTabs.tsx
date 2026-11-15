import { router, usePathname } from 'expo-router'
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureDetector, ScrollView, usePanGesture, type PanGesture } from 'react-native-gesture-handler'

import { swipeTarget, TAB_ROUTES, tabIndex } from './tabSwipe'

const PanContext = createContext<PanGesture | null>(null)

// Swiping sideways anywhere on a tab screen moves to the neighbouring tab. The tab bar stays the accessible way to switch.
export function PagedTabs({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions()
  const index = tabIndex(usePathname())
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetX: [-24, 24],
    failOffsetY: [-12, 12],
    onDeactivate: (e) => {
      const to = swipeTarget(e.translationX, e.velocityX, width, index)
      if (to !== null) router.navigate(TAB_ROUTES[to])
    },
  })
  return (
    <PanContext.Provider value={pan}>
      <GestureDetector gesture={pan}>
        <View style={styles.fill}>{children}</View>
      </GestureDetector>
    </PanContext.Provider>
  )
}

// A horizontal scroller on a tab screen: its drags scroll it and never switch the tab.
export function SideScroll(props: ComponentProps<typeof ScrollView>) {
  return <ScrollView horizontal {...props} block={useContext(PanContext) ?? undefined} />
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
