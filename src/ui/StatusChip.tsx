import { StyleSheet, Text, View } from 'react-native'

import { radius, space, themed, useTheme } from './theme'

// Words carry the status; the border only adds emphasis (Red when the shopper has something to do).
// Grows with the text (wraps rather than clips at large font scales); font scale is capped so it stays a chip.
export function StatusChip({ label, attention = false, testID }: { label: string; attention?: boolean; testID?: string }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  return (
    <View testID={testID} style={[styles.chip, attention && styles.attention]}>
      <Text maxFontSizeMultiplier={1.3} style={[type.label, attention && { color: color.redInk }]}>{label}</Text>
    </View>
  )
}

export const CHIP_HEIGHT = 30

const useStyles = themed(({ color }) => StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexShrink: 1, minHeight: CHIP_HEIGHT, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderWidth: 1, borderColor: color.obsidian, borderRadius: radius.pill },
  attention: { borderColor: color.red },
}))
