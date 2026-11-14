import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { color, space, type } from './theme'

type Props = { title: string; message: string; actionLabel: string; onAction: () => void; testID?: string; alert?: boolean }

// One block for error-with-Retry, empty-with-next-step and signed-out prompts.
export function StateMessage({ title, message, actionLabel, onAction, testID, alert }: Props) {
  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={styles.box}>
      <Text accessibilityRole="header" style={type.h2}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Button testID={testID} label={actionLabel} onPress={onAction} />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: space.md },
  message: { ...type.body, color: color.graphite },
})
