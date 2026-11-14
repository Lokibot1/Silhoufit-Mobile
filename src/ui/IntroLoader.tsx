import { useEffect, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'

import { percentLabel } from '@/lib/format'
import { LOGO_PATH } from './KralLogo'
import { color, space, type } from './theme'
import { WORDMARK } from './wordmark'

// Port of the web IntroLoader: the wordmark fills with two flowing red waves. Geometry is in wordmark units.
const { width: W, height: H } = WORDMARK
const COUNT_MS = 2300
const HOLD_MS = 320
const FADE_MS = 500
const PERIOD = 1200
const AMP = 44
const BACK_LIFT = 18
const TRAVEL = H + 2 * AMP + BACK_LIFT

const WAVE_PATH = (() => {
  const half = PERIOD / 2
  let d = 'M0 0'
  for (let i = 0; i < 14; i++) d += `Q${i * half + half / 2} ${i % 2 ? 2 * AMP : -2 * AMP} ${(i + 1) * half} 0`
  return `${d}V900H0Z`
})()

const AnimatedG = Animated.createAnimatedComponent(G)

function Wave({ level, fill, lift, flowMs, reverse, still }: { level: SharedLevel; fill: string; lift: number; flowMs: number; reverse?: boolean; still: boolean }) {
  const flow = useSharedValue(reverse ? -PERIOD : 0)
  useEffect(() => {
    if (still) return
    flow.value = reverse ? -PERIOD : 0
    flow.value = withRepeat(withTiming(reverse ? 0 : -PERIOD, { duration: flowMs, easing: Easing.linear }), -1)
  }, [flow, flowMs, reverse, still])
  const rise = useAnimatedProps(() => ({ transform: [{ translateY: H + AMP + BACK_LIFT - lift - (level.value / 100) * TRAVEL }] }))
  const slide = useAnimatedProps(() => ({ transform: [{ translateX: flow.value }] }))
  return (
    <AnimatedG animatedProps={rise}>
      <AnimatedG animatedProps={slide}>
        <Path fill={fill} d={WAVE_PATH} />
      </AnimatedG>
    </AnimatedG>
  )
}
type SharedLevel = ReturnType<typeof useSharedValue<number>>

/**
 * Cold-start screen. Counts to 100 over 2.3s; once that is done AND `ready` is true it holds 320ms,
 * fades out over 500ms, then calls `onFinished`.
 */
export function IntroLoader({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const level = useSharedValue(0)
  const opacity = useSharedValue(1)
  const [percent, setPercent] = useState(0)
  const [counted, setCounted] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
  }, [])

  useEffect(() => {
    level.value = withTiming(100, { duration: COUNT_MS, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(setCounted, true)
    })
  }, [level])

  useAnimatedReaction(
    () => Math.round(level.value),
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setPercent, now)
    },
  )

  useEffect(() => {
    if (!counted || !ready) return
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }, (finished) => {
        if (finished) scheduleOnRN(onFinished)
      })
    }, HOLD_MS)
    return () => clearTimeout(timer)
  }, [counted, ready, opacity, onFinished])

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading KRAL"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.screen, fade]}>
      <View style={styles.stack}>
        <Svg width="100%" style={{ aspectRatio: W / H }} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <ClipPath id="kral-clip">
              <Path clipRule="evenodd" d={LOGO_PATH} />
            </ClipPath>
          </Defs>
          <Path fill={color.graphite} fillRule="evenodd" d={LOGO_PATH} />
          <G clipPath="url(#kral-clip)">
            <Wave level={level} fill={color.redPress} lift={BACK_LIFT} flowMs={5400} reverse still={reduceMotion} />
            <Wave level={level} fill={color.red} lift={0} flowMs={3200} still={reduceMotion} />
          </G>
        </Svg>
        <View style={styles.meta}>
          <Text style={styles.metaText}>(Loading)</Text>
          <Text style={[styles.metaText, type.numeric, styles.num]}>{percentLabel(percent)}</Text>
        </View>
      </View>
      <Text importantForAccessibility="no" style={styles.tagline}>Made to Represent // Mark of Identity</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 100, backgroundColor: color.obsidian, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  stack: { width: '100%' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg },
  metaText: { ...type.label, color: color.stonewash },
  num: { minWidth: 56, textAlign: 'right' },
  tagline: { ...type.label, position: 'absolute', bottom: space.xl + space.lg, left: space.lg, right: space.lg, textAlign: 'center', color: color.stonewash },
})
