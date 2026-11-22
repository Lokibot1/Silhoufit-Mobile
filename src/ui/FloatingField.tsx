import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, type ComponentRef, type Ref } from 'react'
import { Animated, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { PressableScale } from './PressableScale'
import { radius, space, themed, useTheme } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

type Props = Omit<TextInputProps, 'style' | 'placeholder' | 'accessibilityLabel'> & {
  label: string
  value: string
  onChangeText: (text: string) => void
  error?: string
  helper?: string
  /** Must equal the screen background: the floated label's patch hides the border behind it. */
  background?: string
  /** Right-aligned tabular digits, for measurements and amounts. */
  numeric?: boolean
  /** Only used with secureTextEntry: testID of the show/hide button. */
  toggleTestID?: string
  /** Makes the field a button that opens a picker instead of a text input; `value` is what it shows. The input's testID stays on the input, the button's is `<testID>-open`. */
  onPress?: () => void
  ref?: Ref<ComponentRef<typeof TextInput>>
}

const FLOAT_SCALE = 14 / 16
const DURATION = 180

// Outlined field whose label sits inside like a placeholder and floats onto the top border on focus or when filled (the web FloatingField).
export function FloatingField({
  label,
  value,
  error,
  helper,
  background,
  toggleTestID,
  onPress,
  numeric,
  secureTextEntry,
  editable = true,
  onFocus,
  onBlur,
  ref,
  ...input
}: Props) {
  const styles = useStyles()
  const { color } = useTheme()
  const reduceMotion = useReduceMotion()
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [height, setHeight] = useState(56)
  const floated = focused || value.length > 0
  const [progress] = useState(() => new Animated.Value(floated ? 1 : 0))

  useEffect(() => {
    if (reduceMotion) return progress.setValue(floated ? 1 : 0)
    Animated.timing(progress, { toValue: floated ? 1 : 0, duration: DURATION, useNativeDriver: true }).start()
  }, [floated, reduceMotion, progress])

  const bg = background ?? color.paper
  const tint = error ? color.redInk : focused ? color.obsidian : color.graphite
  const message = error ?? helper
  return (
    <View style={[styles.field, !editable && styles.disabled]}>
      <View onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
        <TextInput
          {...input}
          ref={ref}
          value={value}
          editable={editable}
          readOnly={!!onPress}
          importantForAccessibility={onPress ? 'no-hide-descendants' : undefined}
          accessibilityElementsHidden={!!onPress}
          secureTextEntry={secureTextEntry && !revealed}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          maxFontSizeMultiplier={1.2}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          style={[styles.input, secureTextEntry && styles.inputSecure, numeric && styles.inputNumeric]}
        />
        <View pointerEvents="none" style={[styles.outline, { borderColor: error ? color.red : focused ? color.obsidian : color.stonewash, borderWidth: focused ? 2 : 1 }]} />
        <View pointerEvents="none" style={styles.labelBox}>
          <Animated.Text
            testID={input.testID ? `${input.testID}-label` : undefined}
            importantForAccessibility="no"
            accessibilityElementsHidden
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={[
              styles.label,
              { color: tint, backgroundColor: bg }, // always patched: at rest it sits over the empty input, and it must hide the border until it has settled
              {
                transform: [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -(height / 2 - 1)] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, FLOAT_SCALE] }) },
                ],
              },
            ]}>
            {label}
          </Animated.Text>
        </View>
        {onPress && (
          <PressableScale
            testID={input.testID ? `${input.testID}-open` : undefined}
            accessibilityRole="button"
            accessibilityLabel={value ? `${label}, ${value}` : `${label}, not set`}
            disabled={!editable}
            style={StyleSheet.absoluteFill}
            onPress={onPress}
          />
        )}
        {secureTextEntry && (
          <PressableScale
            testID={toggleTestID}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            disabled={!editable}
            style={styles.toggle}
            onPress={() => setRevealed((shown) => !shown)}>
            <Ionicons name={revealed ? 'eye-off' : 'eye'} size={24} color={color.graphite} />
          </PressableScale>
        )}
      </View>
      <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.2} style={[styles.message, error ? styles.messageError : null]}>
        {message}
      </Text>
    </View>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  field: { gap: space.xs },
  disabled: { opacity: 0.5 },
  input: { ...type.body, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.lg },
  inputSecure: { paddingRight: 56 },
  inputNumeric: { ...type.numeric, textAlign: 'right' },
  outline: { ...StyleSheet.absoluteFill, borderRadius: radius.soft },
  labelBox: { position: 'absolute', top: 0, bottom: 0, left: space.md - space.xs, justifyContent: 'center', alignItems: 'flex-start' },
  label: { ...type.body, paddingHorizontal: space.xs, transformOrigin: 'left center' },
  toggle: { position: 'absolute', right: space.xs, top: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  message: { ...type.small, color: color.graphite, minHeight: 20 },
  messageError: { color: color.redInk },
}))
