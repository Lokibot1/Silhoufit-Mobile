import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'

import { color, type } from './theme'

type Props = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
  testID?: string
  accessibilityLabel?: string
  pending?: boolean
}

// KRAL button: square, 48px, uppercase. Primary is Red; secondary is an Obsidian outline that fills when pressed.
export function Button({ label, onPress, variant = 'primary', testID, accessibilityLabel, pending = false }: Props) {
  const primary = variant === 'primary'
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: pending, busy: pending }}
      disabled={pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        pending && styles.pending,
      ]}>
      {({ pressed }) =>
        pending ? (
          <ActivityIndicator color={color.paper} />
        ) : (
          <Text style={[type.button, { color: primary || pressed ? color.paper : color.obsidian }]}>{label}</Text>
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
  pending: { opacity: 0.6 },
})
