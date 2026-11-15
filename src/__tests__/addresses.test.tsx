import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import Addresses from '../app/addresses'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/addresses', () => ({ fetchAddresses: jest.fn(), setDefaultAddress: jest.fn(), deleteAddress: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback
    jest.requireActual('react').useEffect(callback, [])
  },
}))
let mockFocus: () => void = () => {}
const refocus = () => act(async () => mockFocus())
const mockToast = jest.fn()
const api = jest.requireMock('@/api/addresses')
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')

const address = (id: string, over: Record<string, unknown> = {}) => ({
  id, label: 'Home', recipientName: `Name ${id}`, phone: '09171234567', region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Brgy 1',
  streetAddress: `${id} Main St`, addressLine2: null, postalCode: '1200', latitude: 14.5, longitude: 121, isDefault: false, ...over,
})
const list = () => [address('a1', { isDefault: true }), address('a2'), address('a3', { latitude: null, longitude: null })]
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false })
  api.fetchAddresses.mockResolvedValue(list())
  api.setDefaultAddress.mockResolvedValue({})
  api.deleteAddress.mockResolvedValue(undefined)
})

it('shows the skeleton while loading', async () => {
  api.fetchAddresses.mockReturnValue(never())
  await render(<Addresses />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
})

it('prompts sign-in when signed out, once on a double tap, without fetching', async () => {
  mockUseSession.mockReturnValue({ session: null, loading: false })
  await render(<Addresses />)
  await fireEvent.press(screen.getByTestId('addresses-sign-in'))
  await fireEvent.press(screen.getByTestId('addresses-sign-in'))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchAddresses).not.toHaveBeenCalled()
})

it('lists cards with badges, hides Set as Default on the default and flags a missing pin', async () => {
  await render(<Addresses />)
  expect(await screen.findByTestId('addresses-list')).toBeTruthy()
  expect(screen.getByText('Default')).toBeTruthy()
  expect(screen.getAllByText('Home')).toHaveLength(3)
  expect(screen.getAllByText('No map pin')).toHaveLength(1)
  expect(screen.getByText('Add a map pin on the web to use this address at checkout')).toBeTruthy()
  expect(screen.queryByTestId('address-default-a1')).toBeNull()
  expect(screen.getByTestId('address-default-a2')).toBeTruthy()
  expect(screen.getByTestId('addresses-add-hint')).toBeTruthy()
  expect(screen.queryByText('Edit')).toBeNull()
})

it('shows the error with Retry, then the list', async () => {
  api.fetchAddresses.mockRejectedValueOnce(new ApiError('network'))
  await render(<Addresses />)
  expect(await screen.findByText("Couldn't load your addresses")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('addresses-retry'))
  expect(await screen.findByTestId('addresses-list')).toBeTruthy()
})

it('shows the empty state with the website hint and no Add Address button', async () => {
  api.fetchAddresses.mockResolvedValue([])
  await render(<Addresses />)
  expect(await screen.findByText('No saved addresses yet')).toBeTruthy()
  expect(screen.queryByTestId('addresses-add')).toBeNull()
  expect(screen.getByText('Adding addresses from the app is coming soon. You can add one on the website.')).toBeTruthy()
})

it('sends a 401 to sign-in', async () => {
  api.fetchAddresses.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<Addresses />)
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sign-in'))
})

it('sets a default at once, once on a double tap, and toasts', async () => {
  let finish: (v: unknown) => void = () => {}
  api.setDefaultAddress.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-default-a2'))
  await fireEvent.press(screen.getByTestId('address-default-a3'))
  expect(api.setDefaultAddress).toHaveBeenCalledTimes(1)
  expect(api.setDefaultAddress).toHaveBeenCalledWith('a2')
  expect(screen.queryByTestId('address-default-a2')).toBeNull() // a2 is the default now, before the server answered
  expect(screen.getByTestId('address-default-a1')).toBeTruthy()
  await act(async () => finish({}))
  expect(mockToast).toHaveBeenCalledWith('Default address updated')
})

it('rolls back and toasts when setting the default fails', async () => {
  api.setDefaultAddress.mockRejectedValue(new ApiError('network'))
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-default-a2'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't change your default address.")))
  expect(screen.queryByTestId('address-default-a1')).toBeNull()
  expect(screen.getByTestId('address-default-a2')).toBeTruthy()
})

it('cancel leaves the address alone; Delete Address confirms, removes it and toasts', async () => {
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-delete-a2'))
  expect(screen.getByText('Are you sure?')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('addresses-confirm-cancel'))
  expect(api.deleteAddress).not.toHaveBeenCalled()
  expect(screen.getByTestId('address-a2')).toBeTruthy()

  await fireEvent.press(screen.getByTestId('address-delete-a2'))
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  await waitFor(() => expect(screen.queryByTestId('address-a2')).toBeNull())
  expect(api.deleteAddress).toHaveBeenCalledWith('a2')
  expect(mockToast).toHaveBeenCalledWith('Address deleted')
})

it('explains what happens when the default is deleted and reloads to learn the new one', async () => {
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-delete-a1'))
  expect(screen.getByText(/newest remaining address becomes the default/)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  await waitFor(() => expect(api.fetchAddresses).toHaveBeenCalledTimes(2))
})

it('keeps the card and toasts when delete fails', async () => {
  api.deleteAddress.mockRejectedValue(new ApiError('server'))
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-delete-a2'))
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't delete the address.")))
  expect(screen.getByTestId('address-a2')).toBeTruthy()
})

it('refetches quietly on focus and keeps the list when that fails', async () => {
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  api.fetchAddresses.mockRejectedValue(new ApiError('network'))
  await refocus()
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.stringContaining("Couldn't refresh your addresses.")))
  expect(screen.getByTestId('addresses-list')).toBeTruthy()
})

it('drops a card whose default change finds it already deleted, toasts and reloads', async () => {
  api.setDefaultAddress.mockRejectedValue(new ApiError('not-found'))
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  api.fetchAddresses.mockResolvedValue([address('a1', { isDefault: true }), address('a3')])
  await fireEvent.press(screen.getByTestId('address-default-a2'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('That address no longer exists.'))
  await waitFor(() => expect(api.fetchAddresses).toHaveBeenCalledTimes(2))
  expect(screen.queryByTestId('address-a2')).toBeNull()
  expect(screen.getByTestId('address-a1')).toBeTruthy()
})

it('shows the new default after deleting the default', async () => {
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  api.fetchAddresses.mockResolvedValue([address('a2', { isDefault: true }), address('a3')])
  await fireEvent.press(screen.getByTestId('address-delete-a1'))
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  await waitFor(() => expect(screen.queryByTestId('address-default-a2')).toBeNull())
  expect(screen.getByTestId('address-default-a3')).toBeTruthy()
  expect(screen.queryByTestId('address-a1')).toBeNull()
})

it('sends one delete request on a double tap of Delete Address', async () => {
  let finish: (v: unknown) => void = () => {}
  api.deleteAddress.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  await render(<Addresses />)
  await screen.findByTestId('addresses-list')
  await fireEvent.press(screen.getByTestId('address-delete-a2'))
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  await fireEvent.press(screen.getByTestId('addresses-confirm-delete'))
  expect(api.deleteAddress).toHaveBeenCalledTimes(1)
  await act(async () => finish(undefined))
})

it('starts from a clean list when the account switches', async () => {
  const { rerender } = await render(<Addresses />)
  await screen.findByTestId('address-a1')
  api.fetchAddresses.mockReturnValue(never())
  mockUseSession.mockReturnValue({ session: { user: { id: 'u2' } }, loading: false })
  await rerender(<Addresses />)
  expect(screen.queryByTestId('address-a1')).toBeNull()
  expect(screen.getByRole('progressbar')).toBeTruthy()
  api.fetchAddresses.mockResolvedValue([address('b1', { isDefault: true })])
  mockUseSession.mockReturnValue({ session: { user: { id: 'u3' } }, loading: false })
  await rerender(<Addresses />)
  expect(await screen.findByTestId('address-b1')).toBeTruthy()
})
