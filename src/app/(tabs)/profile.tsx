import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useSession } from '@/auth/session'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { useToast } from '@/ui/toast'
import { color, space, type } from '@/ui/theme'

// Empty state is the signed-out prompt: a signed-in customer always has a profile.
export default function Profile() {
  const { session, profile, loading, error, retry, signOut } = useSession()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const busy = useRef(false)
  const opening = useRef(false)
  // A fast double tap must not stack two sign-in screens; allow it again when this tab regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
  const handleSignOut = async () => {
    if (busy.current) return
    busy.current = true
    setSigningOut(true)
    try {
      await signOut()
      toast('Signed out')
    } catch {
      toast("Couldn't sign out. Try again.")
    } finally {
      busy.current = false
      setSigningOut(false)
    }
  }
  const signOutButton = (
    <Button
      testID="profile-sign-out"
      variant="secondary"
      label="Sign Out"
      accessibilityLabel="Sign out"
      pending={signingOut}
      onPress={handleSignOut}
    />
  )
  const name = profile ? profile.fullName?.trim() || `${profile.firstName} ${profile.lastName}`.trim() : ''

  return (
    <View style={styles.screen}>
      <Text style={type.label}>(Account)</Text>
      <Text accessibilityRole="header" style={type.h1}>Profile</Text>
      {loading && (
        <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.stack}>
          <Skeleton width={56} height={56} />
          <Skeleton width={200} height={24} />
          <Skeleton width={160} height={24} />
          <Skeleton height={48} />
        </View>
      )}
      {!loading && error && (
        <>
          <StateMessage alert title="Couldn't load your profile" message={error} actionLabel="Retry" onAction={retry} testID="profile-retry" />
          {signOutButton}
        </>
      )}
      {!loading && !error && !session && (
        <StateMessage
          title="Sign in to see your profile"
          message="Your details and orders appear here once you sign in."
          actionLabel="Sign In"
          onAction={() => {
            if (opening.current) return
            opening.current = true
            router.push('/sign-in')
          }}
          testID="profile-sign-in"
        />
      )}
      {!loading && profile && (
        <View style={styles.stack}>
          <Avatar name={name} url={profile.avatarUrl} />
          <Text testID="profile-name" style={[type.h2, styles.wrap]}>{name}</Text>
          <Text testID="profile-email" style={[type.body, styles.wrap]}>{profile.email}</Text>
          {signOutButton}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, padding: space.lg, gap: space.md },
  stack: { gap: space.md, alignItems: 'stretch' },
  wrap: { flexShrink: 1 },
})
