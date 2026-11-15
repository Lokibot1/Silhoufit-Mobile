import { useState } from 'react'
import { Pressable, StyleSheet, type PressableProps } from 'react-native'
import Animated, { Easing, Extrapolation, ReduceMotion, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'

import { useReduceMotion } from './useReduceMotion'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// The one press feel: sink fast, then spring back with a small overshoot (peak about 1.03, settled in under 800 ms).
export const PRESS = {
  sink: 0.95,
  sinkMs: 80,
  spring: { stiffness: 600, damping: 8, mass: 1, restDisplacementThreshold: 0.002, restSpeedThreshold: 0.2, reduceMotion: ReduceMotion.Never },
  // Reduced motion: no spring, no overshoot, just a quick dip and fade.
  reducedSink: 0.98,
  reducedOpacity: 0.85,
  reducedMs: 100,
}

// A Pressable that sinks while held and springs back on release, so every tap answers right away.
// Accepts the same style and children (including the function forms) as Pressable.
export function PressableScale({ style, children, onPressIn, onPressOut, ...props }: PressableProps) {
  const reduce = useReduceMotion()
  const scale = useSharedValue(1)
  const [pressed, setPressed] = useState(false)
  const track = typeof style === 'function' || typeof children === 'function'
  const resolved = typeof style === 'function' ? style({ pressed, hovered: false }) : style
  const baseOpacity = StyleSheet.flatten(resolved)?.opacity ?? 1
  const animated = useAnimatedStyle(() =>
    reduce
      ? { transform: [{ scale: scale.get() }], opacity: baseOpacity * interpolate(scale.get(), [PRESS.reducedSink, 1], [PRESS.reducedOpacity, 1], Extrapolation.CLAMP) }
      : { transform: [{ scale: scale.get() }] },
  )
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        // Assigning a new animation cancels the one running, so a fresh press interrupts a spring mid-flight.
        scale.set(reduce ? withTiming(PRESS.reducedSink, { duration: PRESS.reducedMs, reduceMotion: ReduceMotion.Never }) : withTiming(PRESS.sink, { duration: PRESS.sinkMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never }))
        if (track) setPressed(true)
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        scale.set(reduce ? withTiming(1, { duration: PRESS.reducedMs, reduceMotion: ReduceMotion.Never }) : withSpring(1, PRESS.spring))
        if (track) setPressed(false)
        onPressOut?.(event)
      }}
      style={[resolved, animated]}>
      {typeof children === 'function' ? children({ pressed, hovered: false }) : children}
    </AnimatedPressable>
  )
}
