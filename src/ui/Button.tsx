import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { color, space, type } from './theme'

type Props = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
  pending?: boolean
  disabled?: boolean
  icon?: ReactNode
}

// KRAL button: square, 48px, uppercase. Primary is Red; secondary is an Obsidian outline that fills when pressed.
export function Button({ label, onPress, variant = 'primary', testID, accessibilityLabel, accessibilityHint, pending = false, disabled = false, icon }: Props) {
  const primary = variant === 'primary'
  const off = pending || disabled
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: pending }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        off && styles.pending,
      ]}>
      {({ pressed }) =>
        pending ? (
          <ActivityIndicator color={primary ? color.paper : color.obsidian} />
        ) : (
          <View style={styles.row}>
            {icon}
            <Text style={[type.button, { color: primary || pressed ? color.paper : color.obsidian }]}>{label}</Text>
          </View>
        )
      }
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: color.red },
  primaryPressed: { backgroundColor: color.redPress },
  secondary: { borderWidth: 1, borderColor: color.obsidian, backgroundColor: 'transparent' },
  secondaryPressed: { backgroundColor: color.obsidian },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pending: { opacity: 0.6 },
})
