import { StyleSheet, Text, View } from 'react-native'

import { color, space, type } from './theme'

// Words carry the status; the border only adds emphasis (Red when the shopper has something to do).
export function StatusChip({ label, attention = false, testID }: { label: string; attention?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={[styles.chip, attention && styles.attention]}>
      <Text style={[type.label, attention && { color: color.red }]}>{label}</Text>
    </View>
  )
}

export const CHIP_HEIGHT = 30

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', height: CHIP_HEIGHT, justifyContent: 'center', paddingHorizontal: space.sm, borderWidth: 1, borderColor: color.obsidian },
  attention: { borderColor: color.red },
})
