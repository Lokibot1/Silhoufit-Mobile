import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'

import { getPasswordRequirements, getPasswordStrength } from '@/lib/signUpValidation'
import { space, themed, useTheme } from '@/ui/theme'

type Props = { password: string; email: string; firstName: string; testID?: string }

// Live password rules and strength (the web PasswordChecklist). Met is Obsidian with a check; red is kept for errors.
export function PasswordChecklist({ password, email, firstName, testID = 'password-checklist' }: Props) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const requirements = getPasswordRequirements(password)
  const { level, label } = getPasswordStrength(password, { email, firstName })
  return (
    <View testID={testID} accessible accessibilityRole="summary" accessibilityLabel={`Password requirements. Strength: ${label}. ${requirements.map((r) => `${r.label}, ${r.met ? 'met' : 'not met'}`).join('. ')}.`} accessibilityLiveRegion="polite" style={styles.box}>
      <View style={styles.strength}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.bars}>
          {[1, 2, 3, 4].map((bar) => (
            <View key={bar} testID={`${testID}-bar-${bar}`} style={[styles.bar, level >= bar && styles.barOn]} />
          ))}
        </View>
        <Text testID={`${testID}-label`} style={type.small}>{label}</Text>
      </View>
      {requirements.map(({ id, label: text, met }) => (
        <View key={id} testID={`${testID}-${id}`} style={styles.row}>
          {met ? <Ionicons name="checkmark" size={16} color={color.obsidian} /> : <View style={styles.box16} />}
          <Text style={[type.small, { color: met ? color.obsidian : color.graphite }]}>{text}</Text>
        </View>
      ))}
    </View>
  )
}

const useStyles = themed(({ color, hairline }) => StyleSheet.create({
  box: { ...hairline, borderColor: color.stonewash, padding: space.md, gap: space.sm },
  strength: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bars: { flex: 1, flexDirection: 'row', gap: space.xs },
  bar: { flex: 1, height: 4, backgroundColor: color.porcelain },
  barOn: { backgroundColor: color.obsidian },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 20 },
  box16: { width: 16, height: 16, borderWidth: 1, borderColor: color.stonewash },
}))
