import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native'

import { useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { StateMessage } from '@/ui/StateMessage'
import { radius, space, themed, useTheme } from '@/ui/theme'

/**
 * Until the profile is known it covers the app instead of waving the user through: a spinner while it loads, Retry or Sign Out if it failed.
 * A deactivated account (the API refused a call) is signed out and shown a blocking notice that only its button closes.
 * Staff roles are signed out as soon as their profile loads (the app is for customers only); the cover then stays until they dismiss the notice.
 */
export function AgeGate() {
  const styles = useStyles()
  const { color } = useTheme()
  const { session, profile, error, retry, signOut, deactivated, acknowledgeDeactivated } = useSession()
  const [staffNotice, setStaffNotice] = useState(false)
  const staff = profile != null && profile.role !== 'customer'

  if (staff && !staffNotice) setStaffNotice(true)
  // The sign-out drops the session, so the notice lives in this state to survive it.
  useEffect(() => {
    if (!staff) return
    signOut().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps -- signOut is a new function every render; run once per staff profile
  }, [staff])

  if (deactivated) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.scrim}>
          <View testID="deactivated-notice" accessibilityViewIsModal style={styles.dialog}>
            <StateMessage alert testID="deactivated-ack" title="This account has been deactivated" message="An administrator turned this account off, so you have been signed out. Contact the store to have it activated again." actionLabel="I understand" onAction={acknowledgeDeactivated} />
          </View>
        </View>
      </Modal>
    )
  }
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
  scrim: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: color.scrim },
  dialog: { backgroundColor: color.paper, borderRadius: radius.soft, padding: space.lg, gap: space.md },
  content: { padding: space.lg, gap: space.lg },
}))
