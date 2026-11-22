import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Modal, StyleSheet, Text, View } from 'react-native'

import { deleteAddress, fetchAddresses, setDefaultAddress, type Address } from '@/api/addresses'
import { useSession } from '@/auth/session'
import { addressLines } from '@/checkout/AddressLines'
import { hasPin } from '@/checkout/AddressSheet'
import { ApiError, errorMessage } from '@/lib/api'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { PullToRefresh } from '@/ui/PullToRefresh'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const SKELETONS = [0, 1, 2]
const TARGET = 44
const NO_PIN_HINT = 'Edit this address to add a map pin and use it at checkout'

const isForbidden = (failure: unknown) => failure instanceof ApiError && failure.kind === 'forbidden'
const defaultFirst = (list: Address[]) => [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))

// Keyed by account, so switching accounts starts from a clean list instead of the last shopper's.
export default function Addresses() {
  const { session } = useSession()
  return <AddressesScreen key={session?.user.id ?? 'signed-out'} />
}

// Needs a session; signed out it asks for one. Setting a default is optimistic with a rollback; deleting asks first and then only toasts (confirmed, so no Undo).
function AddressesScreen() {
  const styles = useStyles()
  const { type } = useTheme()
  const { session, loading } = useSession()
  const toast = useToast()
  const userId = session?.user.id
  // What is on screen: the last answer with the shopper's changes applied, kept while a refresh loads the next one.
  const [items, setItems] = useState<Address[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [error, setError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [confirming, setConfirming] = useState<Address | null>(null)
  const [deleting, setDeleting] = useState(false)
  const quiet = useRef(false)
  const shown = useRef(false)
  // Bumped when a change starts and again when it ends; a list fetched across one is stale and is dropped.
  const changes = useRef(0)
  const focused = useRef(false)
  const toastRef = useRef(toast)
  // One change at a time: two quick Set as Default taps on different cards must not race.
  const busy = useRef(false)
  const opening = useRef(false)

  useFocusEffect(useCallback(() => {
    opening.current = false
    if (!focused.current) {
      focused.current = true
      return
    }
    quiet.current = true
    setReloadKey((key) => key + 1)
  }, []))
  useEffect(() => {
    toastRef.current = toast
    shown.current = items !== null
  })
  const openAdd = () => {
    if (opening.current) return
    opening.current = true
    router.push('/addresses/new')
  }
  const openEdit = (id: string) => {
    if (opening.current) return
    opening.current = true
    router.push({ pathname: '/addresses/[id]', params: { id } })
  }
  const openSignIn = useCallback(() => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }, [])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    const seen = changes.current
    const background = quiet.current
    quiet.current = false
    fetchAddresses(controller.signal).then(
      (list) => {
        if (controller.signal.aborted) return
        if (seen === changes.current) {
          setItems(list)
          setStatus('ready')
        }
        setRefreshing(false)
      },
      (failure) => {
        if (controller.signal.aborted) return
        if (isForbidden(failure)) openSignIn()
        if (background && shown.current) {
          if (!isForbidden(failure)) toastRef.current(`Couldn't refresh your addresses. ${errorMessage(failure)}`)
        } else {
          setError(failure)
          setStatus('error')
        }
        setRefreshing(false)
      },
    )
    return () => controller.abort()
  }, [userId, reloadKey, openSignIn])

  const retry = () => {
    setStatus('loading')
    setReloadKey((key) => key + 1)
  }
  const refresh = () => {
    quiet.current = true
    setRefreshing(true)
    setReloadKey((key) => key + 1)
  }

  async function makeDefault(address: Address) {
    if (busy.current || address.isDefault) return
    busy.current = true
    changes.current++
    const before = items
    setItems((current) => defaultFirst((current ?? []).map((a) => ({ ...a, isDefault: a.id === address.id }))))
    try {
      await setDefaultAddress(address.id)
      toast('Default address updated')
    } catch (failure) {
      if (failure instanceof ApiError && failure.kind === 'not-found') {
        // Deleted elsewhere: drop it rather than restore a card that no longer exists.
        setItems((current) => (current ?? []).filter((a) => a.id !== address.id))
        quiet.current = true
        setReloadKey((key) => key + 1)
        toast('That address no longer exists.')
      } else {
        setItems(before)
        if (isForbidden(failure)) openSignIn()
        else toast(`Couldn't change your default address. ${errorMessage(failure)}`)
      }
    } finally {
      changes.current++
      busy.current = false
    }
  }

  async function confirmDelete() {
    const address = confirming
    if (!address || busy.current) return
    busy.current = true
    changes.current++
    setDeleting(true)
    try {
      await deleteAddress(address.id)
      setItems((current) => (current ?? []).filter((a) => a.id !== address.id))
      setConfirming(null)
      toast('Address deleted')
      // The API promotes the newest remaining address when the default goes: reload to see which one.
      if (address.isDefault) {
        quiet.current = true
        setReloadKey((key) => key + 1)
      }
    } catch (failure) {
      setConfirming(null)
      if (isForbidden(failure)) openSignIn()
      else toast(`Couldn't delete the address. ${errorMessage(failure)}`)
    } finally {
      changes.current++
      busy.current = false
      setDeleting(false)
    }
  }

  if (!loading && !session) {
    return (
      <View style={styles.message}>
        <StateMessage title="Sign in to see your addresses" message="The places you deliver to are kept in your account once you sign in." actionLabel="Sign In" onAction={openSignIn} testID="addresses-sign-in" />
      </View>
    )
  }
  if (items === null && status === 'error') {
    return (
      <View style={styles.message}>
        <StateMessage alert title="Couldn't load your addresses" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="addresses-retry" />
      </View>
    )
  }
  if (items === null) {
    return (
      <View testID="addresses-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={[styles.content, styles.skeletons]}>
        {SKELETONS.map((key) => (
          <View key={key} style={[styles.card, styles.skeleton]}>
            <Skeleton width="50%" height={24} />
            <Skeleton width="40%" height={20} />
            <Skeleton width="80%" height={20} />
            <Skeleton width="70%" height={20} />
            <Skeleton height={TARGET} />
          </View>
        ))}
      </View>
    )
  }
  if (items.length === 0) {
    return (
      <View testID="addresses-empty" style={styles.message}>
        <View style={styles.empty}>
          <Text accessibilityRole="header" style={type.h2}>No saved addresses yet</Text>
          <Text style={styles.body}>Addresses you save to your account show up here, ready for checkout.</Text>
          <Text testID="addresses-add-hint" style={type.small}>Add one with a map pin so delivery can find you.</Text>
          <Button testID="addresses-add" label="Add Address" onPress={openAdd} />
        </View>
      </View>
    )
  }
  return (
    <>
      <PullToRefresh refreshing={refreshing} onRefresh={refresh}>
        {(scroll) => (
          <FlatList
            {...scroll}
            testID="addresses-list"
            style={styles.screen}
            data={items}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={Gap}
            contentContainerStyle={styles.content}
            ListFooterComponent={<View style={styles.footer}><Button testID="addresses-add" label="Add Address" onPress={openAdd} /></View>}
            renderItem={({ item }) => <AddressCard address={item} onDefault={() => void makeDefault(item)} onEdit={() => openEdit(item.id)} onDelete={() => setConfirming(item)} />}
          />
        )}
      </PullToRefresh>
      <Modal visible={confirming !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { if (!deleting) setConfirming(null) }}>
        <View style={styles.scrim}>
          <View testID="addresses-confirm" accessibilityViewIsModal style={styles.dialog}>
            <Text accessibilityRole="header" style={type.h2}>Are you sure?</Text>
            {confirming && (
              <Text style={styles.body}>
                {`Delete the address for ${confirming.recipientName}, ${addressLines(confirming).street}? This can't be undone.`}
                {confirming.isDefault && items.length > 1 ? ' It is your default address, so your newest remaining address becomes the default.' : ''}
              </Text>
            )}
            <Button testID="addresses-confirm-cancel" label="Cancel" disabled={deleting} onPress={() => setConfirming(null)} />
            <Button testID="addresses-confirm-delete" variant="secondary" label="Delete Address" pending={deleting} onPress={() => void confirmDelete()} />
          </View>
        </View>
      </Modal>
    </>
  )
}

function AddressCard({ address, onDefault, onEdit, onDelete }: { address: Address; onDefault: () => void; onEdit: () => void; onDelete: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const lines = addressLines(address)
  const pinned = hasPin(address)
  return (
    <View testID={`address-${address.id}`} style={[styles.card, address.isDefault && styles.cardOn]}>
      <View style={styles.tags}>
        {address.label && <Text style={[styles.tag, styles.tagLabel]}>{address.label}</Text>}
        {address.isDefault && <Text style={[styles.tag, styles.tagDefault]}>Default</Text>}
        {!pinned && <Text style={[styles.tag, styles.tagPin]}>No map pin</Text>}
      </View>
      <Text style={styles.name}>{address.recipientName}</Text>
      <Text style={[type.body, type.numeric]}>{address.phone}</Text>
      <Text style={styles.line}>{lines.street}</Text>
      <Text style={styles.line}>{lines.area}</Text>
      {!pinned && <Text style={type.small}>{NO_PIN_HINT}</Text>}
      <View style={styles.actions}>
        {!address.isDefault && (
          <PressableScale
            testID={`address-default-${address.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Set ${address.recipientName}, ${lines.street} as default address`}
            onPress={onDefault}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <Ionicons name="star-outline" size={24} color={color.obsidian} />
          </PressableScale>
        )}
        <PressableScale
          testID={`address-edit-${address.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${address.recipientName}, ${lines.street}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={24} color={color.obsidian} />
        </PressableScale>
        <PressableScale
          testID={`address-delete-${address.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${address.recipientName}, ${lines.street}`}
          onPress={onDelete}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Ionicons name="trash-outline" size={24} color={color.obsidian} />
        </PressableScale>
      </View>
    </View>
  )
}

function Gap() {
  const styles = useStyles()
  return <View style={styles.gap} />
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { flex: 1, padding: space.lg, backgroundColor: color.paper },
  empty: { gap: space.md },
  content: { flexGrow: 1, padding: space.lg, paddingBottom: space.xl, backgroundColor: color.paper },
  gap: { height: space.md },
  footer: { marginTop: space.lg },
  body: { ...type.body, color: color.graphite },
  card: { borderWidth: 1, borderColor: color.porcelain, borderRadius: radius.soft, padding: space.lg, gap: space.xs },
  cardOn: { borderColor: color.obsidian },
  skeletons: { gap: space.md },
  skeleton: { gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { ...type.small, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, overflow: 'hidden' },
  tagLabel: { backgroundColor: color.porcelain, color: color.graphite },
  tagDefault: { backgroundColor: color.obsidian, color: color.paper },
  tagPin: { borderWidth: 1, borderColor: color.red, color: color.redInk },
  name: { ...type.body, fontFamily: font.semibold },
  line: { ...type.small, color: color.graphite },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  action: { width: TARGET, minHeight: TARGET, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.obsidian, borderRadius: radius.soft },
  pressed: { backgroundColor: color.porcelain },
  scrim: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: color.scrim },
  dialog: { backgroundColor: color.paper, borderRadius: radius.soft, padding: space.lg, gap: space.md },
}))
