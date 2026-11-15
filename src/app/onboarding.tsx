import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { BackHandler, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useSession } from '@/auth/session'
import { saveOnboarding, type OnboardingChoice } from '@/onboarding/status'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { color, hairline, radius, space, type } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'shirt-outline', title: 'Shop and Find Your Size', body: 'Browse KRAL pieces, filter by category and open any piece for photos, colours and sizes. The size guide shows each size in centimetres.' },
  { icon: 'body-outline', title: 'Find Your Size', body: 'Save your measurements under Profile, Body Profile to get size advice. Only you can see them. AR try-on is coming soon.' },
  { icon: 'cube-outline', title: 'Order and Track', body: 'Check out in a few taps, then follow each order from Orders: payment, packing, shipping and delivery.' },
]

// Closes the tour. A first run records the choice without waiting for the network, so Skip never hangs; a replay records nothing.
export default function Onboarding() {
  const { session } = useSession()
  const { replay } = useLocalSearchParams<{ replay?: string }>()
  const reduce = useReduceMotion()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null)
  const [index, setIndex] = useState(0)
  const closing = useRef(false)
  const last = index === SLIDES.length - 1

  function close(choice: OnboardingChoice) {
    if (closing.current) return
    closing.current = true
    if (!replay && session) void saveOnboarding(session.user.id, choice)
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  // Hardware back counts as Skip, so the tour cannot reappear on the next launch.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current('skipped')
      return true
    })
    return () => sub.remove()
  }, [])

  function goTo(next: number) {
    setIndex(next)
    scroller.current?.scrollTo({ x: next * width, animated: !reduce })
  }
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))

  return (
    <View testID="onboarding" style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.top}>
        <Text testID="onboarding-step" accessibilityLiveRegion="polite" style={type.label}>{`(Step ${index + 1} of ${SLIDES.length})`}</Text>
        <PressableScale testID="onboarding-skip" accessibilityRole="button" accessibilityLabel="Skip tour" onPress={() => close('skipped')} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
          <Text style={type.button}>Skip</Text>
        </PressableScale>
      </View>

      {/* Keyed by width (like PhotoViewer): a rotation or resize remounts the pager on the current slide, so the offset never goes stale. */}
      <ScrollView key={width} ref={scroller} horizontal pagingEnabled contentOffset={{ x: index * width, y: 0 }} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={settle} style={styles.flex}>
        {SLIDES.map((slide, i) => (
          <ScrollView
            key={slide.title}
            testID={`onboarding-slide-${i}`}
            importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
            accessibilityElementsHidden={i !== index}
            style={{ width }}
            contentContainerStyle={styles.slide}>
            <View style={styles.tile}>
              <Ionicons name={slide.icon} size={32} color={color.obsidian} />
            </View>
            <Text accessibilityRole="header" style={type.h1}>{slide.title}</Text>
            <Text style={[type.body, styles.body]}>{slide.body}</Text>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={styles.dots} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button testID="onboarding-back" variant="secondary" label="Back" disabled={index === 0} onPress={() => goTo(index - 1)} />
        </View>
        <View style={styles.grow}>
          {last ? (
            <Button testID="onboarding-finish" label="Get Started" onPress={() => close('completed')} />
          ) : (
            <Button testID="onboarding-next" label="Next" onPress={() => goTo(index + 1)} />
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, minHeight: 56 },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  pressed: { backgroundColor: color.porcelain },
  slide: { flexGrow: 1, padding: space.lg, gap: space.lg, justifyContent: 'center' },
  tile: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radius.soft, ...hairline },
  body: { color: color.graphite },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.porcelain },
  dotOn: { width: 24, backgroundColor: color.obsidian },
  actions: { flexDirection: 'row', gap: space.md, padding: space.lg },
  grow: { flex: 1 },
})
