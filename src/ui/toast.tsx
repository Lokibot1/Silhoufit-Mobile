import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { color, space, type } from './theme'

const DISMISS_MS = 4500
const ToastContext = createContext<((message: string) => void) | null>(null)

// One toast at a time: a new message replaces the current one and restarts the timer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const insets = useSafeAreaInsets()

  useEffect(() => () => clearTimeout(timer.current), [])

  function show(next: string) {
    clearTimeout(timer.current)
    setMessage(next)
    timer.current = setTimeout(() => setMessage(null), DISMISS_MS)
  }

  return (
    <ToastContext value={show}>
      {children}
      <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.host, { bottom: insets.bottom + space.lg }]}>
        {message && (
          <View style={styles.toast} testID="toast">
            <Text style={styles.text}>{message}</Text>
          </View>
        )}
      </View>
    </ToastContext>
  )
}

export function useToast(): (message: string) => void {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside ToastProvider')
  return show
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { backgroundColor: color.obsidian, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.lg },
  text: { ...type.body, color: color.paper },
})
