import { router, useLocalSearchParams } from 'expo-router'
import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import { AddressForm, FormSkeleton } from '@/address/AddressForm'
import { useSession } from '@/auth/session'
import { StateMessage } from '@/ui/StateMessage'
import { space, themed } from '@/ui/theme'

// Keyed by account, so switching accounts starts from a clean form instead of the last shopper's.
export default function NewAddress() {
  const { session } = useSession()
  return <NewAddressScreen key={session?.user.id ?? 'signed-out'} />
}

// Needs a session; the name is pre-filled from the profile, so it waits for it (a profile that failed to load still lets the form open, just empty).
function NewAddressScreen() {
  const styles = useStyles()
  const { session, loading } = useSession()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const opening = useRef(false)

  if (loading) return <FormSkeleton />
  if (!session) {
    return (
      <View style={styles.message}>
        <StateMessage
          title="Sign in to add an address"
          message="Your addresses are kept in your account once you sign in."
          actionLabel="Sign In"
          testID="addr-sign-in"
          onAction={() => {
            if (opening.current) return
            opening.current = true
            router.push('/sign-in')
          }}
        />
      </View>
    )
  }
  return <AddressForm fromCheckout={from === 'checkout'} />
}

const useStyles = themed(({ color }) => StyleSheet.create({
  message: { flex: 1, padding: space.lg, backgroundColor: color.paper },
}))
