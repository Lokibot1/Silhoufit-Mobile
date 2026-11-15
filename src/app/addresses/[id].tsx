import { router, useLocalSearchParams } from 'expo-router'
import { useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import { AddressForm, FormSkeleton } from '@/address/AddressForm'
import { fetchAddresses } from '@/api/addresses'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { resolveAddressCodes } from '@/lib/psgcMatch'
import { useRequest } from '@/lib/useRequest'
import { StateMessage } from '@/ui/StateMessage'
import { color, space } from '@/ui/theme'

// Keyed by account, so switching accounts starts from a clean form instead of the last shopper's.
export default function EditAddress() {
  const { session } = useSession()
  return <EditAddressScreen key={session?.user.id ?? 'signed-out'} />
}

// Loads the address from the list (there is no single-address call the app needs), then puts its place names back on the PSGC lists.
function EditAddressScreen() {
  const { session, loading } = useSession()
  const { id } = useLocalSearchParams<{ id: string }>()
  const userId = session?.user.id
  const opening = useRef(false)
  const found = useRequest(`${userId}:address:${id}`, async (signal) => {
    if (!userId) return new Promise<never>(() => {}) // waits for a session: the key changes when there is one
    const address = (await fetchAddresses(signal)).find((a) => a.id === id)
    if (!address) throw new ApiError('not-found')
    return { address, resolved: await resolveAddressCodes(address, signal) }
  })

  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }
  const toList = () => (router.canGoBack() ? router.back() : router.replace('/addresses'))

  if (!loading && !session) return <View style={styles.message}><StateMessage title="Sign in to edit an address" message="Your addresses are kept in your account once you sign in." actionLabel="Sign In" onAction={signIn} testID="addr-sign-in" /></View>
  if (loading || found.status === 'loading') return <FormSkeleton />
  if (found.status === 'error') {
    const gone = found.error instanceof ApiError && found.error.kind === 'not-found'
    const expired = found.error instanceof ApiError && found.error.kind === 'forbidden'
    return (
      <View style={styles.message}>
        {expired ? (
          <StateMessage alert title="Your session has expired" message={errorMessage(found.error)} actionLabel="Sign In" onAction={signIn} testID="addr-sign-in" />
        ) : gone ? (
          <StateMessage title="This address no longer exists" message="It was probably deleted on another device. Go back to your addresses to see what is saved." actionLabel="Back to Addresses" onAction={toList} testID="addr-gone" />
        ) : (
          <StateMessage alert title="Couldn't load this address" message={errorMessage(found.error)} actionLabel="Retry" onAction={found.retry} testID="addr-retry" />
        )}
      </View>
    )
  }
  return <AddressForm saved={found.data} />
}

const styles = StyleSheet.create({
  message: { flex: 1, padding: space.lg, backgroundColor: color.paper },
})
