import { StyleSheet, Text } from 'react-native'

import { PressableScale } from './PressableScale'
import { color, font, radius, space } from './theme'

// Filter chip: 36px tall with 4px of hit slop above and below so the touch target is 44px (a ScrollView holding chips needs 4px vertical padding or it clips the slop).
const FONT_CAP = 1.3 // 20px line height x 1.3 stays inside the fixed 36px height
export function Chip({ label, selected, onPress, testID, accessibilityLabel, disabled }: { label: string; selected: boolean; onPress: () => void; testID: string; accessibilityLabel?: string; disabled?: boolean }) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: space.xs, bottom: space.xs }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected, disabled && styles.off]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.text, selected && styles.selectedText, disabled && styles.offText]}>{label}</Text>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  chip: { height: 36, minWidth: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: color.porcelain, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: color.obsidian },
  text: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.graphite },
  selectedText: { color: color.paper },
  off: { opacity: 0.4 },
  offText: { textDecorationLine: 'line-through' },
})
