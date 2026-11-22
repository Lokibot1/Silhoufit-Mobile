import { StyleSheet, Text } from 'react-native'

import { PressableScale } from './PressableScale'
import { font, radius, space, themed } from './theme'

// Filter chip: 36px tall with 4px of hit slop above and below so the touch target is 44px (a ScrollView holding chips needs 4px vertical padding or it clips the slop).
const FONT_CAP = 1.3 // 20px line height x 1.3 stays inside the fixed 36px height
export function Chip({ label, selected, onPress, testID, accessibilityLabel, disabled, tall, radio }: { radio?: boolean; tall?: boolean; label: string; selected: boolean; onPress: () => void; testID: string; accessibilityLabel?: string; disabled?: boolean }) {
  const styles = useStyles()
  return (
    <PressableScale
      testID={testID}
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={radio ? { checked: selected, disabled } : { selected, disabled }}
      disabled={disabled}
      hitSlop={{ top: space.xs, bottom: space.xs }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected, tall && styles.tall, disabled && styles.off]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={FONT_CAP} style={[styles.text, selected && styles.selectedText, disabled && styles.offText]}>{label}</Text>
    </PressableScale>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  chip: { height: 36, minWidth: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: color.porcelain, alignItems: 'center', justifyContent: 'center' },
  // Own 44px height instead of hit slop, for chips in a wrapping row (no ScrollView padding to hold the slop).
  tall: { height: undefined, minHeight: 44 },
  selected: { backgroundColor: color.obsidian },
  text: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.graphite },
  selectedText: { color: color.paper },
  off: { opacity: 0.4 },
  offText: { textDecorationLine: 'line-through' },
}))
