import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import TryOnScreen from '../app/product/try-on/[id]'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/products', () => ({ fetchProduct: jest.fn() }))
jest.mock('@/api/bodyProfile', () => ({ fetchBodyProfile: jest.fn() }))
jest.mock('@/api/sizeMeasurements', () => ({ ...jest.requireActual('@/api/sizeMeasurements'), fetchCategoryMeasurements: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/site', () => ({ openExternal: jest.fn() }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  Stack: { Screen: ({ options }: { options: { headerLeft?: () => unknown } }) => options.headerLeft?.() ?? null },
  useLocalSearchParams: jest.fn(),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

const mockToast = jest.fn()
const mockProduct: jest.Mock = jest.requireMock('@/api/products').fetchProduct
const mockProfile: jest.Mock = jest.requireMock('@/api/bodyProfile').fetchBodyProfile
const mockBase: jest.Mock = jest.requireMock('@/api/sizeMeasurements').fetchCategoryMeasurements
const mockSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const mockOpen: jest.Mock = jest.requireMock('@/lib/site').openExternal
const mockParams: jest.Mock = jest.requireMock('expo-router').useLocalSearchParams
const { router } = jest.requireMock('expo-router')
const mockSignOut = jest.fn().mockResolvedValue(undefined)

const chart = (chest: number | null, waist: number | null = 42) => ({ chestWidthCm: chest, waistWidthCm: waist, hipWidthCm: null, totalLengthCm: 70, inseamCm: null, shoulderWidthCm: 45, sleeveLengthCm: 22, neckCm: null, thighCm: null })
const variant = (size: string, color: string, hex: string, chest: number | null) => ({ id: `${size}-${color}`, size, color, colorHex: hex, price: 1500, stock: 5, imageUrl: `https://x.test/${color}.jpg`, measurements: chest === null ? null : chart(chest) })
const variants = ['Navy', 'Black'].flatMap((c) => {
  const hex = c === 'Navy' ? '#1B2A49' : '#111111'
  return [variant('S', c, hex, 49), variant('M', c, hex, 53), variant('L', c, hex, 57), variant('XL', c, hex, null)]
})
const product = { id: 'p1', name: 'Linen Shirt', category: 'Shirt', isArReady: true, images: [{ url: 'https://x.test/main.jpg', altText: null }], variants }
const body = { heightCm: 170, weightKg: null, shoulderWidthCm: null, chestCm: 90, bustCm: null, torsoLengthCm: null, waistCm: 80, hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: null, bodyModel: 'male', bodyBuild: null }
const never = () => new Promise(() => {})

beforeEach(() => {
  jest.clearAllMocks()
  router.canGoBack.mockReturnValue(true)
  mockParams.mockReturnValue({ id: 'p1' })
  mockSession.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false, signOut: mockSignOut })
  mockProduct.mockResolvedValue(product)
  mockProfile.mockResolvedValue(body)
  mockBase.mockResolvedValue([])
  mockOpen.mockResolvedValue(undefined)
})

it('shows a skeleton while the product loads', async () => {
  mockProduct.mockReturnValue(never())
  await render(<TryOnScreen />)
  expect(screen.getByTestId('try-on-loading')).toBeTruthy()
})

it('shows the product error with Retry and recovers', async () => {
  mockProduct.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(product)
  await render(<TryOnScreen />)
  expect(await screen.findByText(/Can't reach the server/)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('try-on-retry'))
  expect(await screen.findByText('Linen Shirt')).toBeTruthy()
})

it('says so when a piece cannot be tried on and goes back to the product', async () => {
  mockProduct.mockResolvedValue({ ...product, category: 'Hoodie' })
  await render(<TryOnScreen />)
  expect(await screen.findByText("AR try-on isn't available for this piece yet")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('try-on-unavailable'))
  expect(router.back).toHaveBeenCalled()
})

it('opened by deep link, back goes to the product page', async () => {
  router.canGoBack.mockReturnValue(false)
  await render(<TryOnScreen />)
  await screen.findByText('Linen Shirt')
  await fireEvent.press(screen.getByTestId('try-on-header-back'))
  await fireEvent.press(screen.getByTestId('try-on-back'))
  expect(router.replace).toHaveBeenCalledWith('/product/p1')
  expect(router.replace).toHaveBeenCalledTimes(2)
})

it('asks for measurements when none are saved', async () => {
  mockProfile.mockResolvedValue(null)
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-add'))
  expect(router.push).toHaveBeenCalledWith('/profile/body')
  expect(screen.getByTestId('try-on-measurements-empty')).toBeTruthy()
})

it('retries a failed measurements load', async () => {
  mockProfile.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(body)
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-profile-retry'))
  expect(await screen.findByTestId('try-on-fit-table')).toBeTruthy()
})

it('recommends a size and lists the fit rows for the saved body', async () => {
  await render(<TryOnScreen />)
  expect(await screen.findByText('Recommended size: S')).toBeTruthy()
  expect(screen.getByTestId('try-on-summary').props.accessibilityLiveRegion).toBe('polite')
  expect(screen.getByText('Size S in Navy: regular fit')).toBeTruthy()
  expect(screen.getByLabelText('Chest. Your body 90 centimetres. Garment 98 centimetres. Regular fit.')).toBeTruthy()
  expect(screen.getByLabelText('Waist. Your body 80 centimetres. Garment 84 centimetres. Fitted.')).toBeTruthy()
  expect(screen.queryByTestId('try-on-fit-shoulders')).toBeNull() // no saved shoulders, so no row
})

it('switching the size updates the fit', async () => {
  await render(<TryOnScreen />)
  await screen.findByTestId('try-on-fit-table')
  await fireEvent.press(screen.getByTestId('try-on-size-M'))
  expect(screen.getByText('Size M in Navy: loose fit')).toBeTruthy()
  expect(screen.getByLabelText('Chest. Your body 90 centimetres. Garment 106 centimetres. Loose fit.')).toBeTruthy()
  expect(screen.getByTestId('try-on-size-M').props.accessibilityState).toMatchObject({ checked: true })
})

it('preselects the colour from the link and swaps its photo', async () => {
  mockParams.mockReturnValue({ id: 'p1', color: 'black' })
  await render(<TryOnScreen />)
  expect(await screen.findByText('Size S in Black: regular fit')).toBeTruthy()
  expect(screen.getByTestId('try-on-colour-Black').props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.getByLabelText('Linen Shirt in Black')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('try-on-colour-Navy'))
  expect(screen.getByText('Size S in Navy: regular fit')).toBeTruthy()
})

it('disables a size with no measurements and says why', async () => {
  await render(<TryOnScreen />)
  await screen.findByTestId('try-on-fit-table')
  const xl = screen.getByTestId('try-on-size-XL')
  expect(xl.props.accessibilityLabel).toBe('Size XL, no measurements')
  expect(xl.props.accessibilityState).toMatchObject({ disabled: true })
  expect(screen.getByTestId('try-on-sizes-note')).toBeTruthy()
  expect(mockBase).toHaveBeenCalledWith('Shirt', expect.anything())
})

it('retries failed sizes and shows standard fit when the piece has none', async () => {
  mockProduct.mockResolvedValue({ ...product, variants: variants.map((v) => ({ ...v, measurements: null })) })
  mockBase.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce([])
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-sizes-retry'))
  expect(await screen.findByTestId('try-on-sizes-empty')).toBeTruthy()
})

it('lists the saved measurements with an Edit button', async () => {
  await render(<TryOnScreen />)
  expect(await screen.findByLabelText('Chest 90 centimetres')).toBeTruthy()
  expect(screen.getByLabelText('Sleeve length not set')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('try-on-edit'))
  expect(router.push).toHaveBeenCalledWith('/profile/body')
})

it('opens the three credit links', async () => {
  await render(<TryOnScreen />)
  await screen.findByText('Linen Shirt')
  await fireEvent.press(screen.getByTestId('try-on-credit-model'))
  await fireEvent.press(screen.getByTestId('try-on-credit-author'))
  await fireEvent.press(screen.getByTestId('try-on-credit-licence'))
  expect(mockOpen.mock.calls.map(([url]) => url)).toEqual(['https://skfb.ly/ozHJJ', 'https://sketchfab.com/funlab117', 'https://creativecommons.org/licenses/by/4.0/'])
})

it('toasts when a credit link cannot open', async () => {
  mockOpen.mockRejectedValue(new Error('no browser'))
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-credit-model'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't open the page. Check your connection and try again."))
})

it('shows Start Live Try-On only when ready, and the old note is gone', async () => {
  mockProduct.mockReturnValue(never())
  const { unmount } = await render(<TryOnScreen />)
  expect(screen.queryByTestId('try-on-live')).toBeNull()
  await unmount()
  mockProduct.mockResolvedValue({ ...product, category: 'Hoodie' })
  const second = await render(<TryOnScreen />)
  await screen.findByTestId('try-on-unavailable')
  expect(screen.queryByTestId('try-on-live')).toBeNull()
  await second.unmount()
  mockProduct.mockResolvedValue(product)
  await render(<TryOnScreen />)
  expect(await screen.findByTestId('try-on-live')).toBeTruthy()
  expect(screen.queryByTestId('try-on-camera-note')).toBeNull()
  expect(screen.queryByText('Live camera try-on is coming.')).toBeNull()
})

it('Start Live Try-On opens the live route with the selected colour', async () => {
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-colour-Black'))
  await fireEvent.press(screen.getByTestId('try-on-live'))
  expect(router.push).toHaveBeenCalledWith('/product/try-on/live/p1?color=Black')
})

it('Start Live Try-On opens the live route without a colour when the piece has none', async () => {
  mockProduct.mockResolvedValue({ ...product, variants: variants.map((v) => ({ ...v, color: null })) })
  await render(<TryOnScreen />)
  await fireEvent.press(await screen.findByTestId('try-on-live'))
  expect(router.push).toHaveBeenCalledWith('/product/try-on/live/p1')
})

it('signs out and goes to sign-in when the session has expired', async () => {
  mockProfile.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<TryOnScreen />)
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'))
  expect(router.replace).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
})

it('sends a signed-out visitor to sign-in', async () => {
  mockSession.mockReturnValue({ session: null, loading: false, signOut: mockSignOut })
  await render(<TryOnScreen />)
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'))
  expect(screen.queryByText('Linen Shirt')).toBeNull()
})
