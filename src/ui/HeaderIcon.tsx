import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { PressableScale } from './PressableScale'
import { color, font, radius, space, type } from './theme'

type Props = {
  name: ComponentProps<typeof Ionicons>['name']
  label: string
  /** Appended to the accessibility label ("Cart, 3 items"). */
  status?: string
  /** A number badge, capped at 99+. Wins over `dot`. */
  count?: number
  dot?: boolean
  onPress: () => void
  testID: string
}

// A 44px icon button for the top bars. The badge testID is `<testID>-badge`.
export function HeaderIcon({ name, label, status, count = 0, dot = false, onPress, testID }: Props) {
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={status ? `${label}, ${status}` : label} onPress={onPress} style={styles.button}>
      <Ionicons name={name} size={24} color={color.obsidian} />
      {count > 0 ? (
        <View testID={`${testID}-badge`} style={[styles.badge, { backgroundColor: color.red }]}>
          <Text maxFontSizeMultiplier={1} style={[styles.badgeText, { color: color.paper }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : dot ? (
        <View testID={`${testID}-badge`} style={[styles.dot, { backgroundColor: color.red }]} />
      ) : null}
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 20, height: 20, paddingHorizontal: space.xs, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20, ...type.numeric },
  dot: { position: 'absolute', top: space.sm, right: space.sm, width: 12, height: 12, borderRadius: radius.pill },
})
