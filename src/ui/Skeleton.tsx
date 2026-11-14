import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import type { DimensionValue } from 'react-native'

import { color } from './theme'

// A Porcelain block with a slow opacity pulse. Size it to match the content it stands in for.
export function Skeleton({ width = '100%', height }: { width?: DimensionValue; height: number }) {
  const opacity = useSharedValue(1)
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true)
  }, [opacity])
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={[{ width, height, backgroundColor: color.porcelain }, animated]} />
}
