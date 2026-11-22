import { router, useNavigation, usePreventRemove } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Alert, Keyboard, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { createAddress, updateAddress, type Address } from '@/api/addresses'
import { getBarangays, getCities, getRegions, type Barangay, type City, type Region } from '@/api/psgc'
import { ReverseGeocodeError, reverseGeocode } from '@/api/reverseGeocode'
import { useSession } from '@/auth/session'
import { rememberCreated } from '@/checkout/newAddress'
import {
  ADDRESS_LIMITS,
  filterLabel,
  filterName,
  filterPhone,
  filterPostal,
  filterStreet,
  fromAddress,
  QUICK_LABELS,
  toNewAddress,
  toPatch,
  validateLabel,
  validatePhone,
  validatePostal,
  validateStreet,
  type AddressValues,
} from '@/lib/addressValidation'
import { ApiError, errorMessage } from '@/lib/api'
import { validateName } from '@/lib/profileValidation'
import { NONE, provinceNameOf, resolveReverse, type ResolvedAddress } from '@/lib/psgcMatch'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { FloatingField } from '@/ui/FloatingField'
import { MAP_HEIGHT, MapPicker } from '@/ui/MapPicker'
import { Skeleton } from '@/ui/Skeleton'
import { space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'
import { KeyboardScreen } from '@/ui/KeyboardScreen'

import { PinSearch } from './PinSearch'
import { PlacePicker } from './PlacePicker'

type Field = 'recipientName' | 'phone' | 'label' | 'street' | 'postal' | 'region' | 'city' | 'barangay' | 'pin'
const TEXT_ORDER = ['recipientName', 'phone', 'label', 'street', 'postal'] as const
const ALL_TOUCHED: Record<Field, boolean> = { recipientName: true, phone: true, label: true, street: true, postal: true, region: true, city: true, barangay: true, pin: true }

function validate(v: AddressValues): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string | null>> = {
    recipientName: validateName(v.recipientName, 'Recipient name', true),
    phone: validatePhone(v.phone),
    label: validateLabel(v.label),
    street: validateStreet(v.street),
    postal: validatePostal(v.postal),
    region: v.region.name ? null : 'Choose your region.',
    city: v.city.name ? null : 'Choose your city or municipality.',
    barangay: v.barangay.name ? null : 'Choose your barangay.',
    pin: v.pin ? null : 'Drop a pin on the map. Delivery needs it to find you and price your shipping.',
  }
  return Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as Partial<Record<Field, string>>
}

type Edit = 'street' | 'postal' | 'region' | 'city' | 'barangay'
type Area = Pick<AddressValues, 'region' | 'city' | 'barangay' | 'province'>

// A lookup fills the area level by level but never overrides what the user picked since the last fill (a lower pick freezes the levels above it,
// since it belongs to them), and never blanks a level it could not match. A level that changes drops the levels below it.
function mergeArea(current: Area, found: ResolvedAddress, edited: ReadonlySet<Edit>): Area {
  const area = { ...current }
  const lowest = edited.has('barangay') ? 3 : edited.has('city') ? 2 : edited.has('region') ? 1 : 0
  if (lowest < 1 && found.region.code && found.region.code !== area.region.code) Object.assign(area, { region: found.region, city: NONE, barangay: NONE, province: '' })
  if (lowest < 2 && found.city.code && area.region.code === found.region.code && found.city.code !== area.city.code) Object.assign(area, { city: found.city, barangay: NONE, province: found.province })
  if (lowest < 3 && found.barangay.code && area.city.code === found.city.code) area.barangay = found.barangay
  return area
}

function failureCopy(failure: unknown, editing: boolean): string {
  if (failure instanceof ApiError && failure.kind === 'validation') return `We couldn't save your address. The server said: ${failure.detail ?? 'a field is not valid'}. Check each field, then save again.`
  if (failure instanceof ApiError && failure.kind === 'not-found') return "We couldn't save your address because it no longer exists, probably deleted on another device. Go back to your addresses and check the list."
  if (failure instanceof ApiError && failure.kind === 'forbidden') return "We couldn't save your address. This account isn't allowed to change it. Contact the store for help."
  return `We couldn't save your ${editing ? 'changes' : 'address'}. ${errorMessage(failure)}`
}

type Props = {
  /** Present when editing; its places are already put back on the PSGC lists. */
  saved?: { address: Address; resolved: ResolvedAddress }
  /** Opened from checkout: the new address is selected there on return. */
  fromCheckout?: boolean
}

// One form for Add and Edit. A pin is required (the API refuses an address without one); it fills the area fields from OpenStreetMap, which the shopper can still change.
export function AddressForm({ saved, fromCheckout }: Props) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { signOut, profile } = useSession()
  const toast = useToast()
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const [initial] = useState<AddressValues>(() =>
    saved
      ? fromAddress(saved.address, saved.resolved)
      : { recipientName: filterName(profile ? `${profile.firstName} ${profile.lastName}` : ''), phone: '', label: '', street: '', postal: '', region: NONE, city: NONE, barangay: NONE, province: '', pin: null, isDefault: false },
  )
  const [values, setValues] = useState<AddressValues>(initial)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pinNote, setPinNote] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [finished, setFinished] = useState(false)
  const lookup = useRef<AbortController | null>(null)
  // What the user typed or picked, for the form's life (a saved address counts as the user's): a pin never overwrites it. What a pin filled is not here, so the next pin refreshes it.
  const [edited] = useState(() => {
    const kept = new Set<Edit>()
    if (saved) {
      // Only the street and postal are protected: moving the pin to another city must still move the area with it.
      kept.add('street').add('postal')
    }
    return kept
  })
  const recipientNameRef = useRef<ComponentRef<typeof TextInput>>(null)
  const phoneRef = useRef<ComponentRef<typeof TextInput>>(null)
  const labelRef = useRef<ComponentRef<typeof TextInput>>(null)
  const streetRef = useRef<ComponentRef<typeof TextInput>>(null)
  const postalRef = useRef<ComponentRef<typeof TextInput>>(null)

  const errors = validate(values)
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined)
  const patch = saved ? toPatch(values, saved.address) : null
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  useEffect(() => () => lookup.current?.abort(), [])
  // Leaving with edits asks first (the header back, swipe-back and the Android back button all pass through here); a saved or clean form leaves freely.
  usePreventRemove(dirty && !finished, ({ data }) =>
    Alert.alert('Discard changes?', 'You have unsaved changes to this address. If you leave now they are lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard Changes', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]),
  )
  // Leaves once a save has gone through (after the guard has let go); the form stays pending until then, so it cannot be saved twice.
  useEffect(() => {
    if (!finished) return
    if (router.canGoBack()) router.back()
    else router.replace('/addresses')
  }, [finished])

  function set(next: Partial<AddressValues>) {
    setFailure(null)
    setValues((current) => ({ ...current, ...next }))
  }
  const touch = (field: Field) => setTouched((current) => ({ ...current, [field]: true }))
  // The note about the last fill is stale once the user changes what it filled.
  const edit = (field: Edit) => {
    edited.add(field)
    setPinNote(null)
  }
  const text = (field: 'recipientName' | 'phone' | 'label' | 'street' | 'postal', filter: (input: string) => string) => ({
    value: values[field],
    onChangeText: (input: string) => {
      if (field === 'street' || field === 'postal') edit(field)
      set({ [field]: filter(input) })
    },
    onBlur: () => touch(field),
    error: shown(field),
    editable: !pending,
  })

  function pickRegion(region: Region) {
    edit('region')
    if (region.code === values.region.code) return
    set({ region: { code: region.code, name: region.name }, city: NONE, barangay: NONE, province: '' })
    touch('region')
  }
  function pickCity(city: City) {
    edit('city')
    if (city.code === values.city.code) return
    set({ city: { code: city.code, name: city.name }, barangay: NONE, province: '' })
    touch('city')
    // The province is read off the city (NCR and independent cities have none), as on the web.
    void provinceNameOf(values.region.code!, city.provinceCode).then((province) => setValues((current) => (current.city.code === city.code ? { ...current, province } : current)))
  }
  function pickBarangay(barangay: Barangay) {
    edit('barangay')
    set({ barangay: { code: barangay.code, name: barangay.name } })
    touch('barangay')
  }

  // A moved pin helps fill the area, street and postal code, except what the user changed since the last fill. A newer pin or a late answer
  // is ignored. Any failure only leaves a note: the form never waits on it.
  async function onPin(lat: number, lon: number) {
    set({ pin: { lat, lon } })
    lookup.current?.abort()
    const controller = new AbortController()
    lookup.current = controller
    setPinNote('Looking up the address for this pin…')
    try {
      const found = await reverseGeocode(lat, lon, controller.signal)
      const area = await resolveReverse(found, controller.signal)
      if (controller.signal.aborted) return
      const street = filterStreet(found.street)
      const postal = filterPostal(found.postal)
      const skip = edited
      setValues((current) => ({ ...current, ...mergeArea(current, area, skip), ...(street && !skip.has('street') && { street }), ...(postal && !skip.has('postal') && { postal }) }))
      setPinNote(area.note ?? 'We filled in the area from your pin. Check it before saving.')
    } catch (failure) {
      if (controller.signal.aborted) return
      setPinNote(failure instanceof ReverseGeocodeError && failure.kind === 'outside' ? 'That spot is outside the Philippines. Move the pin onto land inside it.' : "We couldn't look up the address for this pin, so fill it in below.")
    }
  }

  async function save() {
    if (inFlight.current) return
    setTouched(ALL_TOUCHED)
    const invalid = TEXT_ORDER.find((field) => errors[field])
    if (invalid) return { recipientName: recipientNameRef, phone: phoneRef, label: labelRef, street: streetRef, postal: postalRef }[invalid].current?.focus()
    if (Object.keys(errors).length) return
    if (patch && !Object.keys(patch).length) return

    inFlight.current = true
    setPending(true)
    setFailure(null)
    Keyboard.dismiss()
    try {
      if (saved) await updateAddress(saved.address.id, patch!)
      else {
        const created = await createAddress(toNewAddress(values))
        if (fromCheckout && profile) rememberCreated(profile.id, created.id)
      }
      toast('Address saved')
      setFinished(true)
    } catch (reason) {
      inFlight.current = false
      setPending(false)
      // The backend can reject a token Supabase still holds: sign out so the sign-in prompt is truthful.
      if (reason instanceof ApiError && reason.status === 401) {
        toast('Your session has expired. Sign in again.')
        void signOut()
      } else setFailure(failureCopy(reason, !!saved))
    }
  }

  return (
    <KeyboardScreen style={styles.flex}>
      <ScrollView testID="addr-scroll" contentContainerStyle={[styles.content, { paddingBottom: space.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Text style={type.label}>(Delivery)</Text>
        {saved?.resolved.note && <Text testID="addr-resolve-note" style={styles.body}>{saved.resolved.note}</Text>}

        <FloatingField
          ref={recipientNameRef}
          testID="addr-name"
          label="Recipient name"
          {...text('recipientName', filterName)}
          helper={`${values.recipientName.length}/${ADDRESS_LIMITS.name}`}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          maxLength={ADDRESS_LIMITS.name}
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
        />
        <FloatingField
          ref={phoneRef}
          testID="addr-phone"
          label="Phone number"
          {...text('phone', filterPhone)}
          helper={`${values.phone.length}/${ADDRESS_LIMITS.phone}`}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={ADDRESS_LIMITS.phone * 2} // pasted spaces and dashes are removed, so the cap is on what is kept
          returnKeyType="next"
          onSubmitEditing={() => labelRef.current?.focus()}
        />

        <View style={styles.group}>
          <Text style={type.label}>(Label)</Text>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            {QUICK_LABELS.map((quick) => (
              <Chip key={quick} tall radio testID={`addr-label-${quick.toLowerCase()}`} label={quick} selected={values.label === quick} onPress={() => !pending && set({ label: values.label === quick ? '' : quick })} />
            ))}
          </View>
          <FloatingField
            ref={labelRef}
            testID="addr-label"
            label="Label (optional)"
            {...text('label', filterLabel)}
            helper={`${values.label.length}/${ADDRESS_LIMITS.label}`}
            maxLength={ADDRESS_LIMITS.label}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        <MapPicker value={values.pin} onChange={(lat, lon) => void onPin(lat, lon)} disabled={pending} error={shown('pin')} />
        <PinSearch onPick={(lat, lon) => void onPin(lat, lon)} disabled={pending} />
        {pinNote && <Text testID="addr-pin-note" accessibilityLiveRegion="polite" style={styles.body}>{pinNote}</Text>}

        <PlacePicker<Region>
          testID="addr-region"
          label="Region"
          value={values.region.name}
          error={shown('region')}
          disabled={pending}
          loadKey="regions"
          load={getRegions}
          onPick={pickRegion}
        />
        <PlacePicker<City>
          testID="addr-city"
          label="City or municipality"
          value={values.city.name}
          error={shown('city')}
          disabled={pending || !values.region.code}
          disabledHint="Choose a region first"
          loadKey={`cities:${values.region.code}`}
          load={(signal) => getCities(values.region.code!, signal)}
          onPick={pickCity}
        />
        {values.city.name !== '' && <Text testID="addr-province" style={styles.body}>{`Province: ${values.province || 'Not applicable'}`}</Text>}
        <PlacePicker<Barangay>
          testID="addr-barangay"
          label="Barangay"
          value={values.barangay.name}
          error={shown('barangay')}
          disabled={pending || !values.city.code}
          disabledHint="Choose a city first"
          loadKey={`barangays:${values.city.code}`}
          load={(signal) => getBarangays(values.city.code!, signal)}
          onPick={pickBarangay}
        />

        <FloatingField
          ref={streetRef}
          testID="addr-street"
          label="House number and street"
          {...text('street', filterStreet)}
          helper={`${values.street.length}/${ADDRESS_LIMITS.street}`}
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          maxLength={ADDRESS_LIMITS.street}
          returnKeyType="next"
          onSubmitEditing={() => postalRef.current?.focus()}
        />
        <FloatingField
          ref={postalRef}
          testID="addr-postal"
          label="Postal code"
          {...text('postal', filterPostal)}
          numeric
          keyboardType="number-pad"
          autoComplete="postal-code"
          textContentType="postalCode"
          maxLength={ADDRESS_LIMITS.postal}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <View style={styles.switchRow}>
          <View style={styles.grow}>
            <Text style={type.body}>Set as default address</Text>
            <Text style={type.small}>{saved?.address.isDefault ? 'This is your default address. Make another one the default to change it.' : 'Checkout starts with your default address.'}</Text>
          </View>
          <Switch
            testID="addr-default"
            accessibilityLabel="Set as default address"
            value={values.isDefault}
            disabled={pending || saved?.address.isDefault}
            onValueChange={(isDefault) => set({ isDefault })}
            trackColor={{ true: color.red, false: color.stonewash }}
            thumbColor={color.onRed}
          />
        </View>

        {failure && (
          <View testID="addr-banner" accessibilityRole="alert" style={styles.banner}>
            <Text style={type.body}>{failure}</Text>
          </View>
        )}
        {touched.pin && !failure && Object.keys(errors).length > 0 && <Text accessibilityRole="alert" style={[type.small, styles.invalid]}>Fix the fields marked in red, then save again.</Text>}

        {!!patch && !Object.keys(patch).length && <Text testID="addr-no-changes" style={type.small}>No changes to save.</Text>}
        <Button testID="addr-save" label="Save Address" pending={pending} disabled={!!patch && !Object.keys(patch).length} onPress={() => void save()} />
      </ScrollView>
    </KeyboardScreen>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  content: { flexGrow: 1, padding: space.lg, gap: space.md, backgroundColor: color.paper },
  group: { gap: space.sm },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  body: { ...type.body, color: color.graphite },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
  invalid: { color: color.redInk },
}))

// Matches the form's layout (title, fields, map, pickers, button) so nothing jumps when it loads.
export function FormSkeleton() {
  const styles = useStyles()
  return (
    <View testID="addr-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.content}>
      <Skeleton width="30%" height={20} />
      <Skeleton width="60%" height={32} />
      {[0, 1, 2].map((i) => <Skeleton key={i} height={56} />)}
      <Skeleton height={MAP_HEIGHT} />
      {[3, 4, 5, 6, 7].map((i) => <Skeleton key={i} height={56} />)}
      <Skeleton height={48} />
    </View>
  )
}
