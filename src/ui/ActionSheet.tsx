import { useEffect, useRef } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { color, font, radius, space, type } from './theme'

export type SheetOption = { label: string; onPress: () => void; testID: string; destructive?: boolean }

const ANDROID_CLOSE_MS = 300 // Android's Modal has no onDismiss: let its fade finish before a picker or camera opens

// A bottom sheet of choices with a Cancel row. An option's action runs once the sheet is gone: a picker presented over a modal that is still closing fails or flickers.
export function ActionSheet({ visible, title, options, onClose }: { visible: boolean; title: string; options: SheetOption[]; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const after = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const choose = (option: SheetOption) => {
    if (Platform.OS === 'ios') after.current = option.onPress
    else timer.current = setTimeout(option.onPress, ANDROID_CLOSE_MS)
    onClose()
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={() => {
        const run = after.current
        after.current = null
        run?.()
      }}>
      <View style={styles.backdrop}>
        <Pressable testID="sheet-backdrop" accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
          <Text accessibilityRole="header" style={[type.h2, styles.title]}>{title}</Text>
          {options.map((option) => (
            <Pressable key={option.testID} testID={option.testID} accessibilityRole="button" onPress={() => choose(option)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={[type.body, option.destructive && styles.destructive]}>{option.label}</Text>
            </Pressable>
          ))}
          <Pressable testID="sheet-cancel" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={[type.body, styles.cancel]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22, 17, 19, 0.5)' },
  sheet: { backgroundColor: color.paper, borderTopLeftRadius: radius.soft, borderTopRightRadius: radius.soft, paddingTop: space.lg, paddingHorizontal: space.lg },
  title: { paddingBottom: space.sm },
  row: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: color.porcelain },
  pressed: { backgroundColor: color.porcelain },
  destructive: { color: color.red },
  cancel: { fontFamily: font.semibold },
})
