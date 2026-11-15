import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { type ComponentProps, useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useSession } from '@/auth/session'
import { dateOnly } from '@/lib/format'
import { CONTACT_EMAIL, openLegal } from '@/lib/site'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { useToast } from '@/ui/toast'
import { color, hairline, radius, space, type } from '@/ui/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

// Tab ids match the Orders screen's ORDER_TABS.
const SHORTCUTS: { id: string; label: string; icon: IconName }[] = [
  { id: 'to-pay', label: 'To pay', icon: 'wallet-outline' },
  { id: 'to-ship', label: 'To ship', icon: 'cube-outline' },
  { id: 'to-receive', label: 'To receive', icon: 'car-outline' },
  { id: 'completed', label: 'Completed', icon: 'checkmark-circle-outline' },
]

const SOON = 'Coming soon'

// `nav` is unique per tap so Orders re-selects the tab even when the param value is unchanged.
const openOrders = (tab: string) => router.navigate({ pathname: '/orders', params: { tab, nav: String(Date.now()) } })

// A 56px menu row. A disabled row says why instead of pretending to go somewhere.
function MenuRow({ icon, label, onPress, disabled = false, pending = false, divider = true, external = false, hint, testID }: {
  icon: IconName
  label: string
  onPress?: () => void
  disabled?: boolean
  pending?: boolean
  divider?: boolean
  external?: boolean
  hint?: string
  testID: string
}) {
  const off = disabled || pending
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={disabled ? `${label}, ${SOON}` : label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off, busy: pending }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}>
      <Ionicons name={icon} size={24} color={disabled ? color.stonewash : color.obsidian} />
      <Text style={[type.body, styles.grow, disabled && styles.off]}>{label}</Text>
      {pending ? (
        <ActivityIndicator color={color.obsidian} />
      ) : disabled ? (
        <Text style={[type.small, styles.off]}>{SOON}</Text>
      ) : (
        <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={24} color={color.graphite} />
      )}
    </PressableScale>
  )
}

// Empty state is the signed-out prompt: a signed-in customer always has a profile.
export default function Profile() {
  const { session, profile, loading, error, retry, signOut } = useSession()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const busy = useRef(false)
  const asking = useRef(false)
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
  // One Alert at a time; the lock opens again when it is dismissed or answered.
  const confirmSignOut = () => {
    if (asking.current) return
    asking.current = true
    const release = () => { asking.current = false }
    Alert.alert(
      'Are you sure?',
      'You will need to sign in again to see your orders and cart.',
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        { text: 'Sign Out', style: 'destructive', onPress: () => { release(); void handleSignOut() } },
      ],
      { cancelable: true, onDismiss: release },
    )
  }
  const openEdit = () => {
    if (opening.current) return
    opening.current = true
    router.push('/profile/edit')
  }
  const openWishlist = () => {
    if (opening.current) return
    opening.current = true
    router.push('/wishlist')
  }
  const openRoute = (href: Parameters<typeof router.push>[0]) => {
    if (opening.current) return
    opening.current = true
    router.push(href)
  }
  const openPage = (doc: Parameters<typeof openLegal>[0]) =>
    openLegal(doc).catch(() => toast("Couldn't open the page. Check your connection and try again."))
  const writeToUs = () => Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => toast(`No email app found. Write to ${CONTACT_EMAIL}.`))
  const name = profile ? profile.fullName?.trim() || `${profile.firstName} ${profile.lastName}`.trim() : ''

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.screen}>
      {loading && (
        <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.stack}>
          <View style={styles.head}>
            <Skeleton width={56} height={56} />
            <View style={[styles.grow, styles.skeletonText]}>
              <Skeleton width="60%" height={24} />
              <Skeleton width="80%" height={24} />
              <Skeleton width="50%" height={20} />
            </View>
          </View>
          <Skeleton width="50%" height={44} />
          <View style={styles.tiles}>
            {SHORTCUTS.map((s) => <View key={s.id} style={styles.grow}><Skeleton height={80} /></View>)}
          </View>
          <View style={styles.card}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={[styles.row, i > 0 && styles.divider]}><Skeleton height={24} /></View>)}
          </View>
        </View>
      )}
      {!loading && error && (
        <>
          <StateMessage alert title="Couldn't load your profile" message={error} actionLabel="Retry" onAction={retry} testID="profile-retry" />
          <Button testID="profile-sign-out" variant="secondary" label="Sign Out" accessibilityLabel="Sign out" pending={signingOut} onPress={confirmSignOut} />
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
          <View style={styles.head}>
            <Avatar name={name} url={profile.avatarUrl} />
            <View style={[styles.grow, styles.headText]}>
              <Text testID="profile-name" style={[type.h2, styles.wrap]}>{name}</Text>
              <Text testID="profile-email" style={[type.body, styles.wrap]}>{profile.email}</Text>
              {profile.createdAt && (
                <Text testID="profile-member-since" style={[type.small, type.numeric, styles.muted]}>Member since {dateOnly(profile.createdAt)}</Text>
              )}
            </View>
            {/* Hidden from screen readers: the Edit Profile row below announces it once. */}
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <HeaderIcon testID="profile-edit" name="create-outline" label="Edit profile" onPress={openEdit} />
            </View>
          </View>

          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={type.h2}>My Orders</Text>
            <PressableScale
              testID="profile-orders-all"
              accessibilityRole="button"
              accessibilityLabel="View all orders"
              onPress={() => openOrders('all')}
              style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}>
              <Text style={type.body}>View all</Text>
              <Ionicons name="chevron-forward" size={16} color={color.obsidian} />
            </PressableScale>
          </View>
          <View style={styles.tiles}>
            {SHORTCUTS.map((s) => (
              <PressableScale
                key={s.id}
                testID={`profile-orders-${s.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${s.label} orders`}
                onPress={() => openOrders(s.id)}
                style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                <Ionicons name={s.icon} size={24} color={color.obsidian} />
                <Text maxFontSizeMultiplier={1.3} style={[type.small, styles.tileLabel]}>{s.label}</Text>
              </PressableScale>
            ))}
          </View>

          <View style={styles.card}>
            <MenuRow testID="profile-menu-edit" icon="person-outline" label="Edit Profile" onPress={openEdit} divider={false} />
            <MenuRow testID="profile-menu-wishlist" icon="heart-outline" label="Wishlist" onPress={openWishlist} />
            <MenuRow testID="profile-menu-addresses" icon="location-outline" label="Delivery Addresses" onPress={() => openRoute('/addresses')} />
            <MenuRow testID="profile-menu-body" icon="body-outline" label="Body Profile" onPress={() => openRoute('/profile/body')} />
            <MenuRow testID="profile-sign-out" icon="log-out-outline" label="Sign Out" pending={signingOut} onPress={confirmSignOut} />
          </View>
        </View>
      )}
      {/* Also shown signed out and on a profile error: the policies and contact need no account. */}
      {!loading && (
        <View style={styles.stack}>
          <Text accessibilityRole="header" style={type.h2}>About KRAL</Text>
          <View style={styles.card}>
            <MenuRow testID="profile-menu-about" icon="information-circle-outline" label="About" external hint="Opens in your browser" onPress={() => openPage('about')} divider={false} />
            <MenuRow testID="profile-menu-privacy" icon="shield-checkmark-outline" label="Privacy Policy" external hint="Opens in your browser" onPress={() => openPage('privacy')} />
            <MenuRow testID="profile-menu-terms" icon="document-text-outline" label="Terms and Conditions" external hint="Opens in your browser" onPress={() => openPage('terms')} />
            <MenuRow testID="profile-menu-refund" icon="return-down-back-outline" label="Refund Policy" external hint="Opens in your browser" onPress={() => openPage('refund')} />
            <MenuRow testID="profile-menu-cookies" icon="options-outline" label="Cookie Policy" external hint="Opens in your browser" onPress={() => openPage('cookies')} />
            <MenuRow testID="profile-menu-faq" icon="help-circle-outline" label="FAQ" onPress={() => openRoute('/faq')} />
            <MenuRow testID="profile-menu-tour" icon="compass-outline" label="Replay Tour" onPress={() => openRoute({ pathname: '/onboarding', params: { replay: '1' } })} />
            <MenuRow testID="profile-menu-contact" icon="mail-outline" label="Contact Us" external hint="Opens your email app" onPress={writeToUs} />
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  screen: { padding: space.lg, gap: space.md },
  stack: { gap: space.md, alignItems: 'stretch' },
  grow: { flex: 1 },
  wrap: { flexShrink: 1 },
  muted: { color: color.graphite },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { gap: space.xs },
  skeletonText: { gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingLeft: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.sm, borderRadius: radius.soft, ...hairline },
  tileLabel: { color: color.obsidian, textAlign: 'center' },
  card: { borderRadius: radius.soft, overflow: 'hidden', ...hairline },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: color.porcelain },
  pressed: { backgroundColor: color.porcelain },
  // Graphite on Paper is about 13:1 (Stonewash is 3.7:1, too low for text); the Stonewash icon is non-text (3:1 needed).
  off: { color: color.graphite },
})
