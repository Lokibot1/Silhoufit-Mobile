import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Tone } from '@/api/notifications'

import { PressableScale } from './PressableScale'
import { space, themed } from './theme'

const DISMISS_MS = 2500
// A toast with an action (Undo) stays longer so there is time to read it and reach the button.
const ACTION_DISMISS_MS = 5000
type Action = { label: string; onPress: () => void }
type Options = { action?: Action; title?: string; tone?: Tone }
type Show = (message: string, options?: Options) => void
// Fixed light-palette accents: they must read on both the dark and the light toast surface.
const TONE_COLOR: Record<Tone, string> = { success: '#1F6F4A', warning: '#B45309', danger: '#CB1C2B', info: '#1D5FD1' }
const ToastContext = createContext<Show | null>(null)

// One toast at a time: a new message replaces the current one and restarts the timer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [options, setOptions] = useState<Options | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const styles = useStyles()
  const insets = useSafeAreaInsets()

  useEffect(() => () => clearTimeout(timer.current), [])

  // `action` adds one 44px button (Undo) that closes the toast first; `title` sits above the message and `tone` colours the left edge. The toast sits at the top, clear of every bottom bar.
  const show: Show = (next, opts) => {
    clearTimeout(timer.current)
    setOptions(opts ?? null)
    setMessage(next)
    // iOS VoiceOver ignores accessibilityLiveRegion, so the title and message are spoken explicitly.
    AccessibilityInfo.announceForAccessibility([opts?.title, next].filter(Boolean).join('. '))
    timer.current = setTimeout(() => setMessage(null), opts?.action || opts?.tone ? ACTION_DISMISS_MS : DISMISS_MS)
  }
  const action = options?.action

  return (
    <ToastContext value={show}>
      {children}
      <View testID="toast-host" pointerEvents="box-none" accessibilityLiveRegion="polite" style={[styles.host, { top: insets.top + space.sm }]}>
        {message !== null && (
          <View style={[styles.toast, options?.tone && { borderLeftColor: TONE_COLOR[options.tone] }]} testID="toast" pointerEvents={action ? 'auto' : 'none'}>
            {options?.title && <Text style={styles.title}>{options.title}</Text>}
            {message !== '' && <Text style={styles.text}>{message}</Text>}
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

const useStyles = themed(({ color, type }) => StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { backgroundColor: color.obsidian, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.lg },
  title: { ...type.h2, color: color.paper },
  text: { ...type.body, color: color.paper },
  action: { minHeight: 44, minWidth: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: space.xs },
  actionText: { ...type.button, color: color.paper, textDecorationLine: 'underline' },
}))
