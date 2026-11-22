import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { PressableScale } from './PressableScale'
import { font, radius, space, themed, useTheme } from './theme'

type Props = {
  name: ComponentProps<typeof Ionicons>['name']
  label: string
  /** Appended to the accessibility label ("Cart, 3 items"). */
  status?: string
  /** A number badge, capped at 99+. Wins over `dot`. */
  count?: number
  dot?: boolean
  disabled?: boolean
  /** Icon colour; Obsidian unless a primary action needs Red. */
  tint?: string
  onPress: () => void
  testID: string
}

// A 44px icon button for the top bars. The badge testID is `<testID>-badge`.
export function HeaderIcon({ name, label, status, count = 0, dot = false, disabled = false, tint, onPress, testID }: Props) {
  const styles = useStyles()
  const { color } = useTheme()
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={status ? `${label}, ${status}` : label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.off]}>
      <Ionicons name={name} size={24} color={tint ?? color.obsidian} />
      {count > 0 ? (
        <View testID={`${testID}-badge`} style={[styles.badge, { backgroundColor: color.red }]}>
          <Text maxFontSizeMultiplier={1} style={[styles.badgeText, { color: color.onRed }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : dot ? (
        <View testID={`${testID}-badge`} style={[styles.dot, { backgroundColor: color.red }]} />
      ) : null}
    </PressableScale>
  )
}

const useStyles = themed(({ type }) => StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, ...type.numeric },
  dot: { position: 'absolute', top: space.sm, right: space.sm, width: 12, height: 12, borderRadius: radius.pill },
}))
