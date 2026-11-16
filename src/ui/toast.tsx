import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PressableScale } from './PressableScale'
import { color, space, type } from './theme'

const DISMISS_MS = 2500
// A toast with an action (Undo) stays longer so there is time to read it and reach the button.
const ACTION_DISMISS_MS = 5000
type Action = { label: string; onPress: () => void }
type Show = (message: string, options?: { action?: Action }) => void
const ToastContext = createContext<Show | null>(null)

// One toast at a time: a new message replaces the current one and restarts the timer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const insets = useSafeAreaInsets()

  useEffect(() => () => clearTimeout(timer.current), [])

  // `action` adds one 44px button (Undo) that closes the toast first. The toast sits at the top, clear of every bottom bar.
  const show: Show = (next, options) => {
    clearTimeout(timer.current)
    setAction(options?.action ?? null)
    setMessage(next)
    // iOS VoiceOver ignores accessibilityLiveRegion, so the message is spoken explicitly.
    AccessibilityInfo.announceForAccessibility(next)
    timer.current = setTimeout(() => setMessage(null), options?.action ? ACTION_DISMISS_MS : DISMISS_MS)
  }

  return (
    <ToastContext value={show}>
      {children}
      <View testID="toast-host" pointerEvents="box-none" accessibilityLiveRegion="polite" style={[styles.host, { top: insets.top + space.sm }]}>
        {message && (
          <View style={styles.toast} testID="toast" pointerEvents={action ? 'auto' : 'none'}>
            <Text style={styles.text}>{message}</Text>
            {action && (
              <PressableScale
                testID="toast-action"
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  clearTimeout(timer.current)
                  setMessage(null)
                  action.onPress()
                }}
                style={styles.action}>
                <Text style={styles.actionText}>{action.label}</Text>
              </PressableScale>
            )}
          </View>
        )}
      </View>
    </ToastContext>
  )
}

export function useToast(): Show {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside ToastProvider')
  return show
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { backgroundColor: color.obsidian, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.lg },
  text: { ...type.body, color: color.paper },
  action: { minHeight: 44, minWidth: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: space.xs },
  actionText: { ...type.button, color: color.paper, textDecorationLine: 'underline' },
})
