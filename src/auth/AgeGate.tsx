import { router, usePathname } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native'

import { useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { StateMessage } from '@/ui/StateMessage'
import { color, space } from '@/ui/theme'

const AGE_PATH = '/auth/age'

/**
 * Keeps a signed-in customer with no birthday (a first Google sign-in) on the age step until they save an adult birthday or sign out.
 * Until the profile is known it covers the app instead of waving the user through: a spinner while it loads, Retry or Sign Out if it failed.
 * Staff roles are exempt.
 */
export function AgeGate() {
  const { session, profile, error, retry, signOut } = useSession()
  const pathname = usePathname()
  const needsAge = profile?.role === 'customer' && profile.birthday === null

  useEffect(() => {
    if (needsAge && pathname !== AGE_PATH) router.replace(AGE_PATH)
  }, [needsAge, pathname])

  // Hardware back must not leave the age step (the screen's own Back to Sign In signs out).
  useEffect(() => {
    if (!needsAge) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => subscription.remove()
  }, [needsAge])

  if (!session || profile) return null
  return (
    <View testID="gate-cover" style={styles.cover}>
      {error ? (
        <View style={styles.content}>
          <StateMessage alert testID="gate-retry" title="Can't Load Your Account" message={`${error} Retry, or sign out and sign in again.`} actionLabel="Retry" onAction={retry} />
          <Button testID="gate-signout" variant="secondary" label="Sign Out" onPress={() => signOut()} />
        </View>
      ) : (
        <View testID="gate-loading" accessibilityLiveRegion="polite" accessibilityLabel="Loading your account" style={styles.center}>
          <ActivityIndicator color={color.obsidian} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, backgroundColor: color.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg, gap: space.lg },
})
