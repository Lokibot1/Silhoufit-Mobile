import { useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { KeyboardAvoidingView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

// A screen that keeps its form above the keyboard. SDK 58 Android is always edge-to-edge, so the window no longer resizes for the keyboard,
// and KeyboardAvoidingView cannot know how far the screen sits below the top of the window (status bar and header), so it is measured here.
export function KeyboardScreen({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const wrap = useRef<ComponentRef<typeof View>>(null)
  const [top, setTop] = useState(0)
  return (
    <View ref={wrap} style={style} onLayout={() => wrap.current?.measureInWindow((_x, y) => setTop(y))}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={top}>
        {children}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
