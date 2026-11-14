import { router } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { useSession } from '@/auth/session'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { useToast } from '@/ui/toast'
import { color, space, type } from '@/ui/theme'

// shortcut: placeholder to exercise the session, replaced by the Shop screen in step 3
export default function Shop() {
  const { session, profile, loading, error, retry, signOut } = useSession()
  const toast = useToast()
  const signOutButton = (
    <Button
      testID="shop-sign-out"
      variant="secondary"
      label="Sign Out"
      accessibilityLabel="Sign out"
      onPress={async () => {
        await signOut()
        toast('Signed out')
      }}
    />
  )

  return (
    <View style={styles.screen}>
      <Text style={type.label}>(Welcome)</Text>
      <Text accessibilityRole="header" style={type.h1}>Shop</Text>
      {loading && (
        <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeleton}>
          <Skeleton width={200} height={24} />
          <Skeleton width={72} height={28} />
          <Skeleton height={48} />
        </View>
      )}
      {!loading && !session && <Button testID="shop-sign-in" label="Sign In" onPress={() => router.push('/sign-in')} />}
      {profile && (
        <>
          <Text testID="shop-profile-name" style={type.body}>{profile.fullName ?? `${profile.firstName} ${profile.lastName}`}</Text>
          <Text style={styles.tag}>{profile.role}</Text>
          {signOutButton}
        </>
      )}
      {error && (
        <>
          <Text accessibilityRole="alert" style={type.body}>{error}</Text>
          <Button testID="shop-retry" label="Retry" onPress={retry} />
          {signOutButton}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, padding: space.lg, gap: space.md },
  skeleton: { gap: space.md },
  tag: { ...type.label, alignSelf: 'flex-start', borderWidth: 1, borderColor: color.stonewash, paddingHorizontal: space.sm, paddingVertical: space.xs },
})
