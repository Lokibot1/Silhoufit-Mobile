import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ReverseGeocodeError } from '@/api/reverseGeocode'
import { ApiError } from '@/lib/api'
import { AddressForm } from '../address/AddressForm'

jest.mock('@/api/addresses', () => ({ createAddress: jest.fn(), updateAddress: jest.fn() }))
jest.mock('@/api/psgc', () => ({ getRegions: jest.fn(), getCities: jest.fn(), getBarangays: jest.fn(), getProvinces: jest.fn(), PsgcError: class extends Error {} }))
jest.mock('@/api/reverseGeocode', () => ({ ...jest.requireActual('@/api/reverseGeocode'), reverseGeocode: jest.fn(), searchPlaces: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/checkout/newAddress', () => ({ rememberCreated: jest.fn() }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (prevent: boolean, callback: (e: unknown) => void) => {
    mockGuard.prevent = prevent
    mockGuard.callback = callback
  },
}))
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native')
  return { WebView: (props: object) => <View testID="map" {...props} /> }
})
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockDispatch = jest.fn()
const mockGuard: { prevent: boolean; callback: ((e: unknown) => void) | null } = { prevent: false, callback: null }
const api = jest.requireMock('@/api/addresses')
const psgc = jest.requireMock('@/api/psgc')
const geo = jest.requireMock('@/api/reverseGeocode')
const location = jest.requireMock('expo-location')
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')
const { rememberCreated } = jest.requireMock('@/checkout/newAddress')

const mockSignOut = jest.fn().mockResolvedValue(undefined)
const me = { id: 'u1', firstName: 'Ana', lastName: 'Cruz' }
const REGION = { code: 'r1', name: 'NCR', regionName: 'NCR' }
const CITY = { code: 'c1', name: 'Makati', provinceCode: false }
const BARANGAY = { code: 'b1', name: 'Poblacion' }
const OTHER = { code: 'b2', name: 'Bel-Air' }
const FOUND = { street: '5 Ayala Ave', postal: '1226', region: 'NCR', city: 'Makati', barangays: ['Poblacion'] }
const created = { id: 'new1' }

beforeEach(() => {
  jest.clearAllMocks()
  mockGuard.prevent = false
  mockUseSession.mockReturnValue({ profile: me, signOut: mockSignOut })
  psgc.getRegions.mockResolvedValue([REGION])
  psgc.getCities.mockResolvedValue([CITY])
  psgc.getBarangays.mockResolvedValue([BARANGAY])
  psgc.getProvinces.mockResolvedValue([])
  geo.reverseGeocode.mockRejectedValue(new Error('offline'))
  api.createAddress.mockResolvedValue(created)
  api.updateAddress.mockResolvedValue({})
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true })
})

const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
const pickFrom = async (field: string, code: string) => {
  await fireEvent.press(screen.getByTestId(field))
  await fireEvent.press(await screen.findByTestId(`${field}-option-${code}`))
}
const dropPin = (lat = 14.5547, lng = 121.0244) => act(async () => screen.getByTestId('map').props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pin', lat, lng }) } }))
const fillAll = async () => {
  await type('addr-phone', '0917 123 4567')
  await type('addr-street', '12 Main Street')
  await type('addr-postal', '1200')
  await pickFrom('addr-region', 'r1')
  await pickFrom('addr-city', 'c1')
  await pickFrom('addr-barangay', 'b1')
  await dropPin()
}

describe('create', () => {
  it('pre-fills the recipient name from the profile', async () => {
    await render(<AddressForm />)
    expect(screen.getByTestId('addr-name').props.value).toBe('Ana Cruz')
  })

  it('Save on an empty form shows every error, saves nothing, and does not need a pin to say so', async () => {
    mockUseSession.mockReturnValue({ profile: null, signOut: mockSignOut })
    await render(<AddressForm />)
    await fireEvent.press(screen.getByTestId('addr-save'))
    for (const message of ['Recipient name is required.', 'Phone number is required.', 'Street address is required.', 'Postal code is required.', 'Choose your region.', 'Choose your city or municipality.', 'Choose your barangay.']) {
      expect(screen.getByText(message)).toBeTruthy()
    }
    expect(screen.getByText(/Drop a pin on the map/)).toBeTruthy()
    expect(api.createAddress).not.toHaveBeenCalled()
  })

  it('validates on blur, then live as the user types', async () => {
    await render(<AddressForm />)
    await type('addr-phone', '12345')
    expect(screen.queryByText(/Enter a Philippine mobile number/)).toBeNull()
    await fireEvent(screen.getByTestId('addr-phone'), 'blur')
    expect(screen.getByText(/Enter a Philippine mobile number/)).toBeTruthy()
    await type('addr-phone', '09171234567')
    expect(screen.queryByText(/Enter a Philippine mobile number/)).toBeNull()
  })

  it('filters the phone to digits and a plus, shows the count, and filters names and emoji', async () => {
    await render(<AddressForm />)
    await type('addr-phone', '(0917) 123-4567')
    expect(screen.getByTestId('addr-phone').props.value).toBe('09171234567')
    expect(screen.getByText('11/13')).toBeTruthy()
    await type('addr-name', 'Ana 3 😀 Cruz!')
    expect(screen.getByTestId('addr-name').props.value).toBe('Ana Cruz')
    await type('addr-street', '12 Main 🏠')
    expect(screen.getByTestId('addr-street').props.value).toBe('12 Main ')
    await type('addr-postal', '12ab345')
    expect(screen.getByTestId('addr-postal').props.value).toBe('1234')
  })

  it('the city and barangay wait for their parent, and changing the region resets them', async () => {
    await render(<AddressForm />)
    expect(screen.getByTestId('addr-city').props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('addr-barangay').props.accessibilityState.disabled).toBe(true)
    await pickFrom('addr-region', 'r1')
    await pickFrom('addr-city', 'c1')
    await pickFrom('addr-barangay', 'b1')
    expect(screen.getByText('Province: Not applicable')).toBeTruthy()
    psgc.getRegions.mockResolvedValue([REGION, { code: 'r2', name: 'CALABARZON', regionName: 'Region IV-A' }])
    await pickFrom('addr-region', 'r2')
    expect(screen.getByTestId('addr-city').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('addr-barangay').props.accessibilityState.disabled).toBe(true)
    expect(screen.queryByText(/^Province:/)).toBeNull()
  })

  it('a picker list that fails shows the error with Retry; a search with no match offers to clear it', async () => {
    psgc.getRegions.mockRejectedValueOnce(new Error('offline'))
    await render(<AddressForm />)
    await fireEvent.press(screen.getByTestId('addr-region'))
    expect(await screen.findByText("Couldn't load the list")).toBeTruthy()
    await fireEvent.press(screen.getByTestId('addr-region-retry'))
    await screen.findByTestId('addr-region-option-r1')
    await type('addr-region-search', 'zzz')
    expect(screen.getByTestId('addr-region-no-match')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('addr-region-clear'))
    expect(screen.getByTestId('addr-region-option-r1')).toBeTruthy()
  })

  it('needs the map pin: everything else filled, Save still refuses and explains', async () => {
    await render(<AddressForm />)
    await type('addr-phone', '0917 123 4567')
    await type('addr-street', '12 Main Street')
    await type('addr-postal', '1200')
    await pickFrom('addr-region', 'r1')
    await pickFrom('addr-city', 'c1')
    await pickFrom('addr-barangay', 'b1')
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(screen.getByText(/Drop a pin on the map/)).toBeTruthy()
    expect(api.createAddress).not.toHaveBeenCalled()
  })

  it('a pin fills the area, street and postal code; a failed lookup only leaves a note', async () => {
    geo.reverseGeocode.mockResolvedValue({ street: '5 Ayala Ave', postal: '1226', region: 'NCR', city: 'Makati', barangays: ['Poblacion'] })
    await render(<AddressForm />)
    await dropPin()
    await waitFor(() => expect(screen.getByTestId('addr-street').props.value).toBe('5 Ayala Ave'))
    expect(screen.getByTestId('addr-postal').props.value).toBe('1226')
    expect(screen.getByText('Poblacion')).toBeTruthy()
    expect(screen.getByTestId('addr-pin-note').props.children).toMatch(/We filled in the area/)
    geo.reverseGeocode.mockRejectedValue(new Error('offline'))
    await dropPin(14.6, 121.1)
    await waitFor(() => expect(screen.getByTestId('addr-pin-note').props.children).toMatch(/couldn't look up/))
    expect(screen.getByTestId('addr-street').props.value).toBe('5 Ayala Ave') // the form is untouched and still usable
  })

  it('a street the user typed survives a pin; so does a barangay they picked, and a lookup that finds no barangay blanks nothing', async () => {
    psgc.getBarangays.mockResolvedValue([BARANGAY, OTHER])
    await render(<AddressForm />)
    await pickFrom('addr-region', 'r1')
    await pickFrom('addr-city', 'c1')
    await pickFrom('addr-barangay', 'b2')
    await type('addr-street', '12 My Own Street')
    geo.reverseGeocode.mockResolvedValue(FOUND)
    await dropPin()
    await waitFor(() => expect(screen.getByTestId('addr-postal').props.value).toBe('1226')) // untouched fields are still filled
    expect(screen.getByTestId('addr-street').props.value).toBe('12 My Own Street')
    expect(screen.getByText('Bel-Air')).toBeTruthy()
    // Still protected on a second drop, and a lookup without a barangay blanks nothing.
    geo.reverseGeocode.mockResolvedValue({ ...FOUND, street: '7 New St', postal: '1300', barangays: ['Nowhere'] })
    await dropPin(14.6, 121.1)
    await waitFor(() => expect(screen.getByTestId('addr-postal').props.value).toBe('1300'))
    expect(screen.getByTestId('addr-street').props.value).toBe('12 My Own Street')
    expect(screen.getByText('Bel-Air')).toBeTruthy()
  })

  it('a street filled by a pin is refreshed by the next pin', async () => {
    geo.reverseGeocode.mockResolvedValueOnce(FOUND).mockResolvedValueOnce({ ...FOUND, street: '7 New St' })
    await render(<AddressForm />)
    await dropPin()
    await waitFor(() => expect(screen.getByTestId('addr-street').props.value).toBe('5 Ayala Ave'))
    await dropPin(14.6, 121.1)
    await waitFor(() => expect(screen.getByTestId('addr-street').props.value).toBe('7 New St'))
  })

  it('editing a field clears the note about the last fill', async () => {
    geo.reverseGeocode.mockResolvedValue(FOUND)
    await render(<AddressForm />)
    await dropPin()
    await waitFor(() => expect(screen.getByTestId('addr-pin-note').props.children).toMatch(/We filled in/))
    await type('addr-street', '9 Edited Street')
    expect(screen.queryByTestId('addr-pin-note')).toBeNull()
  })

  it('an answer that arrives after a newer pin is ignored', async () => {
    let first: (v: unknown) => void = () => {}
    geo.reverseGeocode.mockReturnValueOnce(new Promise((resolve) => (first = resolve))).mockResolvedValueOnce({ ...FOUND, street: '2 Second St' })
    await render(<AddressForm />)
    await dropPin(14.5, 121)
    await dropPin(14.6, 121.1)
    await waitFor(() => expect(screen.getByTestId('addr-street').props.value).toBe('2 Second St'))
    await act(async () => first({ ...FOUND, street: '1 First St' }))
    expect(screen.getByTestId('addr-street').props.value).toBe('2 Second St')
    expect(screen.getByTestId('addr-pin-note').props.children).toMatch(/We filled in/)
  })

  it('opened to edit, the first pin move keeps the saved street, postal code and area', async () => {
    const address = { id: 'a1', label: null, recipientName: 'Ana Cruz', phone: '09171234567', region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Poblacion', streetAddress: 'Unit 5, 12 Main Street', addressLine2: null, postalCode: '1200', latitude: 14.5, longitude: 121, isDefault: false }
    const resolved = { region: { code: 'r1', name: 'NCR' }, city: { code: 'c1', name: 'Makati' }, barangay: { code: 'b1', name: 'Poblacion' }, province: '', note: null }
    geo.reverseGeocode.mockResolvedValue({ ...FOUND, street: '99 Other St', postal: '9999' })
    await render(<AddressForm saved={{ address, resolved } as never} />)
    await dropPin(14.6, 121.1)
    await waitFor(() => expect(screen.getByTestId('addr-pin-note')).toBeTruthy())
    expect(screen.getByTestId('addr-street').props.value).toBe('Unit 5, 12 Main Street')
    expect(screen.getByTestId('addr-postal').props.value).toBe('1200')
    expect(screen.getByText('Poblacion')).toBeTruthy()
  })

  it('a pin outside the Philippines says so instead of the generic note', async () => {
    geo.reverseGeocode.mockRejectedValue(new ReverseGeocodeError('outside'))
    await render(<AddressForm />)
    await dropPin()
    await waitFor(() => expect(screen.getByTestId('addr-pin-note').props.children).toMatch(/That spot is outside the Philippines/))
  })

  it('Find on map: choosing a result sets the pin and fills the form by the same rules', async () => {
    geo.searchPlaces.mockResolvedValue([{ label: 'Ayala Avenue, Makati, Philippines', lat: 14.5547, lon: 121.0244 }])
    geo.reverseGeocode.mockResolvedValue(FOUND)
    await render(<AddressForm />)
    expect(screen.getByTestId('pin-search-go').props.accessibilityState.disabled).toBe(true) // too short to search
    await type('pin-search', 'ayala')
    await fireEvent.press(screen.getByTestId('pin-search-go'))
    await fireEvent.press(await screen.findByTestId('pin-search-result-0'))
    await waitFor(() => expect(screen.getByTestId('addr-street').props.value).toBe('5 Ayala Ave'))
    expect(screen.getByTestId('map-picker-status').props.children).toBe('Pinned at 14.55470, 121.02440')
    expect(screen.getByTestId('pin-search-chosen')).toBeTruthy()
    expect(screen.getByText('Poblacion')).toBeTruthy()
  })

  it('Find on map: no results and a failure each say what to do, and Retry searches again', async () => {
    geo.searchPlaces.mockResolvedValueOnce([]).mockRejectedValueOnce(new ReverseGeocodeError('network')).mockResolvedValueOnce([{ label: 'Ayala', lat: 14.5, lon: 121 }])
    await render(<AddressForm />)
    await type('pin-search', 'zzzz')
    await fireEvent.press(screen.getByTestId('pin-search-go'))
    expect(await screen.findByTestId('pin-search-empty')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('pin-search-go'))
    expect(await screen.findByText(/Can't reach the place search/)).toBeTruthy()
    await fireEvent.press(screen.getByTestId('pin-search-retry'))
    expect(await screen.findByTestId('pin-search-result-0')).toBeTruthy()
  })

  it('the Home and Work chips are a radio group', async () => {
    await render(<AddressForm />)
    await fireEvent.press(screen.getByTestId('addr-label-work'))
    expect(screen.getByTestId('addr-label-work').props.accessibilityRole).toBe('radio')
    expect(screen.getByTestId('addr-label-work').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByTestId('addr-label-home').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('location permission denied explains how to continue and the pin stays required', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false })
    await render(<AddressForm />)
    await fireEvent.press(screen.getByTestId('map-picker-locate'))
    expect(await screen.findByText(/Location is turned off for SilhouFit/)).toBeTruthy()
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(screen.getByText(/Drop a pin on the map/)).toBeTruthy()
  })

  it('saves the normalized payload once on a double tap, toasts, and leaves', async () => {
    let finish: (v: unknown) => void = () => {}
    api.createAddress.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await render(<AddressForm />)
    await fillAll()
    await type('addr-label', 'Home')
    await fireEvent.press(screen.getByTestId('addr-save'))
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(api.createAddress).toHaveBeenCalledTimes(1)
    expect(api.createAddress).toHaveBeenCalledWith({
      label: 'Home',
      recipientName: 'Ana Cruz',
      phone: '+639171234567',
      region: 'NCR',
      cityMunicipality: 'Makati',
      barangay: 'Poblacion',
      streetAddress: '12 Main Street',
      postalCode: '1200',
      latitude: 14.5547,
      longitude: 121.0244,
    })
    expect(screen.getByTestId('addr-save').props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    await act(async () => finish(created))
    expect(mockToast).toHaveBeenCalledWith('Address saved')
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1))
    expect(rememberCreated).not.toHaveBeenCalled()
  })

  it('opened from checkout it hands the new address back', async () => {
    await render(<AddressForm fromCheckout />)
    await fillAll()
    await fireEvent.press(screen.getByTestId('addr-save'))
    await waitFor(() => expect(rememberCreated).toHaveBeenCalledWith('u1', 'new1'))
  })

  it('a server rejection says what happened and what to do, and the form can be saved again', async () => {
    api.createAddress.mockRejectedValueOnce(new ApiError('validation', 'phone must be a valid Philippine phone number', 400))
    await render(<AddressForm />)
    await fillAll()
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(await screen.findByText(/The server said: phone must be a valid Philippine phone number/)).toBeTruthy()
    expect(screen.getByTestId('addr-save').props.accessibilityState.disabled).toBe(false)
    await fireEvent.press(screen.getByTestId('addr-save'))
    await waitFor(() => expect(api.createAddress).toHaveBeenCalledTimes(2))
  })

  it('an expired session toasts and signs out', async () => {
    api.createAddress.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<AddressForm />)
    await fillAll()
    await fireEvent.press(screen.getByTestId('addr-save'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  })

  it('guards unsaved changes with a confirmation, and lets a clean or saved form go', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await render(<AddressForm />)
    expect(mockGuard.prevent).toBe(false) // only the pre-filled name
    await type('addr-street', '12 Main Street')
    expect(mockGuard.prevent).toBe(true)
    const action = { type: 'GO_BACK' }
    await act(async () => mockGuard.callback!({ data: { action } }))
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array))
    const buttons = alert.mock.calls[0][2]!
    expect(buttons.map((b) => b.text)).toEqual(['Keep Editing', 'Discard Changes'])
    buttons[1].onPress!()
    expect(mockDispatch).toHaveBeenCalledWith(action)
    alert.mockRestore()
  })
})

describe('edit', () => {
  const address = { id: 'a1', label: 'Home', recipientName: 'Ana Cruz', phone: '09171234567', region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Poblacion', streetAddress: '12 Main Street', addressLine2: null, postalCode: '1200', latitude: 14.5, longitude: 121, isDefault: false }
  const resolved = { region: { code: 'r1', name: 'NCR' }, city: { code: 'c1', name: 'Makati' }, barangay: { code: 'b1', name: 'Poblacion' }, province: '', note: null }
  const saved = { address, resolved } as never

  it('opens pre-filled with the pickers chosen, and Save is disabled until something changes', async () => {
    await render(<AddressForm saved={saved} />)
    expect(screen.getByTestId('addr-phone').props.value).toBe('09171234567')
    expect(screen.getByTestId('addr-label-home').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByText('Makati')).toBeTruthy()
    expect(screen.getByTestId('addr-save').props.accessibilityState.disabled).toBe(true)
    expect(screen.getByText('No changes to save.')).toBeTruthy()
    expect(mockGuard.prevent).toBe(false)
    await type('addr-postal', '1300')
    expect(screen.queryByText('No changes to save.')).toBeNull()
  })

  it('PATCHes only the changed fields', async () => {
    await render(<AddressForm saved={saved} />)
    await type('addr-phone', '0918 000 1111')
    await type('addr-label', '')
    expect(screen.getByTestId('addr-save').props.accessibilityState.disabled).toBe(false)
    expect(mockGuard.prevent).toBe(true)
    await fireEvent.press(screen.getByTestId('addr-save'))
    await waitFor(() => expect(api.updateAddress).toHaveBeenCalledWith('a1', { phone: '+639180001111', label: null }))
    expect(api.createAddress).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Address saved')
  })

  it('an address saved without a pin must be given one before it can be saved', async () => {
    const pinless = { address: { ...address, latitude: null, longitude: null }, resolved } as never
    await render(<AddressForm saved={pinless} />)
    await type('addr-street', '14 Main Street')
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(screen.getByText(/Drop a pin on the map/)).toBeTruthy()
    expect(api.updateAddress).not.toHaveBeenCalled()
    await dropPin(14.6, 121.1)
    await fireEvent.press(screen.getByTestId('addr-save'))
    await waitFor(() => expect(api.updateAddress).toHaveBeenCalledWith('a1', expect.objectContaining({ latitude: 14.6, longitude: 121.1, streetAddress: '14 Main Street' })))
  })

  it('a deleted address says so on save', async () => {
    api.updateAddress.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await render(<AddressForm saved={saved} />)
    await type('addr-postal', '1300')
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(await screen.findByText(/no longer exists/)).toBeTruthy()
  })

  it('shows the note when a saved place could not be matched', async () => {
    await render(<AddressForm saved={{ address, resolved: { ...resolved, barangay: { code: null, name: '' }, note: "We couldn't match your barangay to our list. Pick it again." } } as never} />)
    expect(screen.getByTestId('addr-resolve-note')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('addr-save'))
    expect(screen.getByText('Choose your barangay.')).toBeTruthy()
  })
})
