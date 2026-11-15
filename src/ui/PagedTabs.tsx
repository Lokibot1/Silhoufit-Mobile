import { router, usePathname } from 'expo-router'
import type { ReactNode } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'

import { swipeTarget, TAB_ROUTES, tabIndex } from './tabSwipe'

// Only drags that start in these edge strips page the tabs. A full-width pan would steal the chip rows,
// photo carousels and onboarding pager, which scroll sideways inside the screens.
const EDGE = 24

// Swiping sideways from a screen edge moves to the neighbouring tab. The tab bar stays the accessible way to switch.
export function PagedTabs({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions()
  const index = tabIndex(usePathname())
  const onDeactivate = (e: { translationX: number; velocityX: number }) => {
    const to = swipeTarget(e.translationX, e.velocityX, width, index)
    if (to !== null) router.navigate(TAB_ROUTES[to])
  }
  const left = usePanGesture({ runOnJS: true, activeOffsetX: [-24, 24], failOffsetY: [-12, 12], hitSlop: { left: 0, width: EDGE }, onDeactivate })
  const right = usePanGesture({ runOnJS: true, activeOffsetX: [-24, 24], failOffsetY: [-12, 12], hitSlop: { right: 0, width: EDGE }, onDeactivate })
  return (
    <GestureDetector gesture={left}>
      <View style={styles.fill}>
        <GestureDetector gesture={right}>
          <View style={styles.fill}>{children}</View>
        </GestureDetector>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
