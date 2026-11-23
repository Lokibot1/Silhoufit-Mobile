import { router, usePathname } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native'

import { useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { StateMessage } from '@/ui/StateMessage'
import { space, themed, useTheme } from '@/ui/theme'

const AGE_PATH = '/auth/age'

/**
 * Keeps a signed-in customer with no birthday (a first Google sign-in) on the age step until they save an adult birthday or sign out.
 * Until the profile is known it covers the app instead of waving the user through: a spinner while it loads, Retry or Sign Out if it failed.
 * Staff roles are signed out as soon as their profile loads (the app is for customers only); the cover then stays until they dismiss the notice.
 */
export function AgeGate() {
  const styles = useStyles()
  const { color } = useTheme()
  const { session, profile, error, retry, signOut } = useSession()
  const pathname = usePathname()
  const [staffNotice, setStaffNotice] = useState(false)
  const staff = profile != null && profile.role !== 'customer'
  const needsAge = profile?.role === 'customer' && profile.birthday === null

  useEffect(() => {
    if (needsAge && pathname !== AGE_PATH) router.replace(AGE_PATH)
  }, [needsAge, pathname])

  if (staff && !staffNotice) setStaffNotice(true)
  // The sign-out drops the session, so the notice lives in this state to survive it.
  useEffect(() => {
    if (!staff) return
    signOut().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps -- signOut is a new function every render; run once per staff profile
  }, [staff])

  // Hardware back must not leave the age step (the screen's own Back to Sign In signs out).
  useEffect(() => {
    if (!needsAge) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => subscription.remove()
  }, [needsAge])

  if (staffNotice) {
    return (
      <View testID="gate-cover" style={styles.cover}>
        <View style={styles.content}>
          <StateMessage testID="gate-staff" title="SilhouFit mobile is for customers" message="Staff accounts can't use the mobile app, so you have been signed out. Sign in on the web to reply to customers and manage the store." actionLabel="Back to Sign In" onAction={() => setStaffNotice(false)} />
        </View>
      </View>
    )
  }
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

const useStyles = themed(({ color }) => StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, backgroundColor: color.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg, gap: space.lg },
}))
