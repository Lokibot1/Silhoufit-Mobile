import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// A Pressable that shrinks slightly while held, so every tap answers right away.
export function PressableScale({ style, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.set(withTiming(0.97, { duration: 100 }))
        onPressIn?.(event)
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, { duration: 150 }))
        onPressOut?.(event)
      }}
      style={[style, animated]}
    />
  )
}
