import { router } from 'expo-router'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { CONFIRM_REDIRECT } from '@/auth/email'
import { useEmailLink } from '@/auth/useEmailLink'
import { StateMessage } from '@/ui/StateMessage'
import { space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

export default function ConfirmEmail() {
  const styles = useStyles()
  const { color } = useTheme()
  const { state, callback, retry } = useEmailLink(CONFIRM_REDIRECT)
  const toast = useToast()
  const welcomed = useRef(false) // the toast function changes on every toast, so the effect must not repeat

  useEffect(() => {
    if (state !== 'ok' || welcomed.current) return
    welcomed.current = true
    toast('Email confirmed. Welcome to KRAL.')
    router.replace('/(tabs)/profile')
  }, [state, toast])

  if (state === 'checking' || state === 'ok') {
    return (
      <View testID="confirm-checking" accessibilityLiveRegion="polite" accessibilityLabel="Confirming your email" style={styles.center}>
        <ActivityIndicator color={color.obsidian} />
      </View>
    )
  }
  if (state === 'network' || state === 'rate-limit') {
    const limited = state === 'rate-limit'
    return (
      <View style={styles.content}>
        <StateMessage
          alert
          testID="confirm-retry"
          title={limited ? 'Too Many Attempts' : "Can't check your link"}
          message={limited ? 'Too many attempts. Try again in a few minutes.' : 'The connection dropped before we could check your link. Check your connection and try again.'}
          actionLabel="Retry"
          onAction={retry}
        />
      </View>
    )
  }
  // The server refused the code. A real confirm link opened on another device lands here, but so does a forged one, so the copy only hedges.
  if (state === 'expired' && callback?.code && !callback.error && !callback.errorCode) {
    return (
      <View style={styles.content}>
        <StateMessage testID="confirm-signin" title="Sign In to Continue" message="If your email was just confirmed, sign in to continue." actionLabel="Sign In" onAction={() => router.replace('/sign-in')} />
      </View>
    )
  }
  return (
    <View style={styles.content}>
      <StateMessage
        alert
        testID="confirm-expired"
        title="Link Expired"
        message="This link has expired or was already used. Request a new link on this phone."
        actionLabel="Send a New Link"
        onAction={() => router.replace('/check-email')}
      />
    </View>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  center: { flex: 1, backgroundColor: color.paper, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, backgroundColor: color.paper, padding: space.lg, gap: space.lg },
}))
