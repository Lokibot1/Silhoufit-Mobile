import { useEffect, useRef, type ReactElement } from 'react'
import { ActivityIndicator, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { GestureDetector, useNativeGesture, usePanGesture, useSimultaneousGestures } from 'react-native-gesture-handler'
import Animated, { ReduceMotion, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { PULL_THRESHOLD, pastThreshold, pullOffset } from './pullMath'
import { radius, space, themed, useTheme } from './theme'
import { useReduceMotion } from './useReduceMotion'

const SPINNER = 40
// Same stiffness and mass as the button spring, damped harder: a 64 pt return would otherwise swing about 40 pt past the top.
const RETURN_SPRING = { stiffness: 600, damping: 29, mass: 1, reduceMotion: ReduceMotion.Never }

// Props to spread on the wrapped FlatList / ScrollView. The pull replaces the native overscroll, so both are switched off.
type ScrollProps = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  scrollEventThrottle: number
  overScrollMode: 'never'
  bounces: false
}

type Props = {
  refreshing: boolean
  onRefresh: () => void
  children: (scroll: ScrollProps) => ReactElement
}

// Custom pull to refresh (replaces RefreshControl): `<PullToRefresh refreshing onRefresh>{(scroll) => <FlatList {...scroll} />}</PullToRefresh>`.
// The list follows the finger with progressive resistance, refreshes once pulled past PULL_THRESHOLD, and springs back when done.
export function PullToRefresh({ refreshing, onRefresh, children }: Props) {
  const styles = useStyles()
  const { color } = useTheme()
  const reduce = useReduceMotion()
  const offset = useSharedValue(0)
  const scrollY = useSharedValue(0)
  const armed = useSharedValue(false)
  const holding = useSharedValue(false)
  const latest = useRef({ refreshing, onRefresh })
  useEffect(() => {
    latest.current = { refreshing, onRefresh }
  })

  const settle = () => {
    holding.set(false)
    armed.set(false)
    offset.set(reduce ? 0 : withSpring(0, RETURN_SPRING))
  }
  const start = () => {
    latest.current.onRefresh()
    // A screen that ignores the pull (nothing to refresh) must not leave the list held open.
    setTimeout(() => !latest.current.refreshing && settle(), 300)
  }
  useEffect(() => {
    if (!refreshing && holding.get()) settle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing])

  // Only a downward drag that starts with the list at the top; anything else is left to the list and the pager.
  const atTop = useDerivedValue(() => scrollY.get() <= 0 && !holding.get())
  const pan = usePanGesture({
    enabled: atTop,
    activeOffsetY: 10,
    failOffsetY: -10,
    failOffsetX: [-15, 15],
    onUpdate: (event) => {
      'worklet'
      const next = pullOffset(event.translationY)
      offset.set(next)
      armed.set(pastThreshold(next))
    },
    onDeactivate: () => {
      'worklet'
      if (pastThreshold(offset.get())) {
        holding.set(true)
        offset.set(reduce ? PULL_THRESHOLD : withSpring(PULL_THRESHOLD, RETURN_SPRING))
        scheduleOnRN(start)
      } else {
        armed.set(false)
        offset.set(reduce ? 0 : withSpring(0, RETURN_SPRING))
      }
    },
  })
  const native = useNativeGesture()
  const gesture = useSimultaneousGestures(pan, native)

  const lit = useDerivedValue(() => withTiming(armed.get() || holding.get() ? 1 : 0, { duration: 120, reduceMotion: ReduceMotion.Never }))
  const listStyle = useAnimatedStyle(() => ({ transform: [{ translateY: reduce ? 0 : offset.get() }] }))
  const spinnerStyle = useAnimatedStyle(() => {
    if (reduce) return { opacity: lit.get(), transform: [{ translateY: space.sm }] }
    const progress = Math.min(offset.get() / PULL_THRESHOLD, 1)
    return { opacity: progress, transform: [{ translateY: offset.get() / 2 - SPINNER / 2 }, { scale: 0.6 + 0.2 * progress + 0.2 * lit.get() }] }
  })

  return (
    <View
      style={styles.fill}
      accessibilityActions={[{ name: 'refresh', label: 'Refresh' }]}
      onAccessibilityAction={(event) => event.nativeEvent.actionName === 'refresh' && !refreshing && onRefresh()}>
      <Animated.View style={[styles.fill, listStyle]}>
        <GestureDetector gesture={gesture}>
          {children({
            onScroll: (event) => scrollY.set(event.nativeEvent.contentOffset.y),
            scrollEventThrottle: 16,
            overScrollMode: 'never',
            bounces: false,
          })}
        </GestureDetector>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.spinner, spinnerStyle]}>
        <ActivityIndicator accessibilityLabel="Refreshing" color={color.obsidian} />
      </Animated.View>
    </View>
  )
}

const useStyles = themed(({ color, hairline }) => StyleSheet.create({
  fill: { flex: 1 },
  spinner: { position: 'absolute', top: 0, alignSelf: 'center', width: SPINNER, height: SPINNER, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.paper, ...hairline },
}))
