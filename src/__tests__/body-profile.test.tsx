import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ApiError } from '@/lib/api'
import BodyProfileScreen from '../app/profile/body'

jest.mock('@/api/bodyProfile', () => ({ fetchBodyProfile: jest.fn(), saveBodyProfile: jest.fn(), updateBodyProfile: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ dispatch: jest.fn() }),
  usePreventRemove: (prevent: boolean, callback: (e: unknown) => void) => { mockGuard.prevent = prevent; mockGuard.callback = callback },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockGuard: { prevent: boolean; callback: ((e: unknown) => void) | null } = { prevent: false, callback: null }
const api = jest.requireMock('@/api/bodyProfile') as Record<'fetchBodyProfile' | 'saveBodyProfile' | 'updateBodyProfile', jest.Mock>
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')
const mockSignOut = jest.fn().mockResolvedValue(undefined)

const saved = { heightCm: 170, weightKg: null, shoulderWidthCm: null, chestCm: 90, bustCm: null, torsoLengthCm: null, waistCm: null, hipsCm: null, inseamCm: null, outseamCm: null, thighCm: null, armLengthCm: null, bodyModel: 'male', bodyBuild: null }
const base = { session: { user: { id: 'u1' } }, profile: { id: 'u1' }, loading: false, error: null, signOut: mockSignOut }

beforeEach(() => {
  jest.clearAllMocks()
  mockGuard.prevent = false
  mockUseSession.mockReturnValue(base)
  api.fetchBodyProfile.mockResolvedValue(saved)
})

const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
const saveDisabled = () => screen.getByTestId('body-save').props.accessibilityState.disabled

it('shows the skeleton while the profile loads', async () => {
  api.fetchBodyProfile.mockReturnValue(new Promise(() => {}))
  await render(<BodyProfileScreen />)
  expect(screen.getByTestId('body-loading')).toBeTruthy()
})

it('prefills from the saved profile with Save disabled', async () => {
  await render(<BodyProfileScreen />)
  expect((await screen.findByTestId('body-height')).props.value).toBe('170')
  expect(screen.getByTestId('body-chest').props.value).toBe('90')
  expect(screen.getByTestId('body-model-male').props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.queryByTestId('body-bust')).toBeNull()
  expect(saveDisabled()).toBe(true)
  expect(screen.getByTestId('body-privacy')).toBeTruthy()
})

it('shows the first-time form with the explanation when nothing is saved (404)', async () => {
  api.fetchBodyProfile.mockResolvedValue(null)
  await render(<BodyProfileScreen />)
  expect(await screen.findByText('Your measurements help us suggest the right size and power AR try-on.')).toBeTruthy()
  expect(screen.getByTestId('body-height').props.value).toBe('')
})

it('shows the error with a working Retry', async () => {
  api.fetchBodyProfile.mockRejectedValueOnce(new ApiError('network'))
  await render(<BodyProfileScreen />)
  await fireEvent.press(await screen.findByTestId('body-retry'))
  expect(await screen.findByTestId('body-height')).toBeTruthy()
  expect(api.fetchBodyProfile).toHaveBeenCalledTimes(2)
})

it('sends a 401 on load to sign-in', async () => {
  api.fetchBodyProfile.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<BodyProfileScreen />)
  await fireEvent.press(await screen.findByTestId('body-sign-in'))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/sign-in'))
})

it('prompts sign-in when signed out, once on a double tap', async () => {
  mockUseSession.mockReturnValue({ ...base, session: null })
  await render(<BodyProfileScreen />)
  await fireEvent.press(screen.getByTestId('body-signed-out'))
  await fireEvent.press(screen.getByTestId('body-signed-out'))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(api.fetchBodyProfile).not.toHaveBeenCalled()
})

it('validates on blur then live, and filters letters', async () => {
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '5a')
  expect(screen.getByTestId('body-waist').props.value).toBe('5')
  expect(screen.queryByText(/Waist must be between/)).toBeNull()
  await fireEvent(screen.getByTestId('body-waist'), 'blur')
  expect(screen.getByText(/Waist must be between 40 and 200 cm/)).toBeTruthy()
  await type('body-waist', '70')
  expect(screen.queryByText(/Waist must be between/)).toBeNull()
})

it('shows a non-blocking cross-check warning', async () => {
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-inseam', '110')
  expect(screen.getByTestId('body-warnings')).toBeTruthy()
  expect(saveDisabled()).toBe(false)
})

it('does not save an invalid form', async () => {
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '5')
  await fireEvent.press(screen.getByTestId('body-save'))
  expect(api.updateBodyProfile).not.toHaveBeenCalled()
})

it('PATCHes only what changed, once on a double tap, then toasts and leaves', async () => {
  api.updateBodyProfile.mockResolvedValue({ ...saved, waistCm: 70 })
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '70')
  await fireEvent.press(screen.getByTestId('body-save'))
  await fireEvent.press(screen.getByTestId('body-save'))
  expect(api.updateBodyProfile).toHaveBeenCalledTimes(1)
  expect(api.updateBodyProfile).toHaveBeenCalledWith({ waistCm: 70 })
  expect(mockToast).toHaveBeenCalledWith('Measurements saved')
  expect(router.back).toHaveBeenCalled()
})

it('creates the profile with PUT on the first save', async () => {
  api.fetchBodyProfile.mockResolvedValue(null)
  api.saveBodyProfile.mockResolvedValue(saved)
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-height', '170')
  await fireEvent.press(screen.getByTestId('body-save'))
  await waitFor(() => expect(api.saveBodyProfile).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 170, chestCm: null })))
})

it('saves another field while a saved height of 240 is outside the form range, and notes it', async () => {
  api.fetchBodyProfile.mockResolvedValue({ ...saved, heightCm: 240 })
  api.updateBodyProfile.mockResolvedValue({ ...saved, heightCm: 240, weightKg: 72 })
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  expect(screen.getByTestId('body-warnings')).toBeTruthy()
  await type('body-weight', '72')
  await fireEvent.press(screen.getByTestId('body-save'))
  await waitFor(() => expect(api.updateBodyProfile).toHaveBeenCalledWith({ weightKg: 72 }))
})

it('a male user with a saved bust keeps it when saving', async () => {
  api.fetchBodyProfile.mockResolvedValue({ ...saved, bustCm: 90 })
  api.updateBodyProfile.mockResolvedValue(saved)
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '70')
  await fireEvent.press(screen.getByTestId('body-save'))
  await waitFor(() => expect(api.updateBodyProfile).toHaveBeenCalledWith({ waistCm: 70 }))
})

it('falls back to PUT when the profile was deleted elsewhere (PATCH 404)', async () => {
  api.updateBodyProfile.mockRejectedValue(new ApiError('not-found', undefined, 404))
  api.saveBodyProfile.mockResolvedValue(saved)
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '70')
  await fireEvent.press(screen.getByTestId('body-save'))
  await waitFor(() => expect(api.saveBodyProfile).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 170, waistCm: 70 })))
  expect(mockToast).toHaveBeenCalledWith('Measurements saved')
})

it('"72.50" typed over a saved 72.5 is not a change', async () => {
  api.fetchBodyProfile.mockResolvedValue({ ...saved, weightKg: 72.5 })
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-weight', '72.50')
  expect(saveDisabled()).toBe(true)
})

it('keeps the form and shows the server message when the save fails', async () => {
  api.updateBodyProfile.mockRejectedValue(new ApiError('validation', 'waistCm must not be less than 20', 400))
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '70')
  await fireEvent.press(screen.getByTestId('body-save'))
  expect(await screen.findByTestId('body-banner')).toBeTruthy()
  expect(screen.getByText(/waistCm must not be less than 20/)).toBeTruthy()
  expect(router.back).not.toHaveBeenCalled()
  expect(saveDisabled()).toBe(false)
})

it('signs out on a 401 while saving', async () => {
  api.updateBodyProfile.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<BodyProfileScreen />)
  await screen.findByTestId('body-height')
  await type('body-waist', '70')
  await fireEvent.press(screen.getByTestId('body-save'))
  await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
})

describe('unsaved changes guard', () => {
  it('lets a clean form go and asks before leaving a dirty one', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await render(<BodyProfileScreen />)
    await screen.findByTestId('body-height')
    expect(mockGuard.prevent).toBe(false)
    await type('body-waist', '70')
    expect(mockGuard.prevent).toBe(true)
    mockGuard.callback!({ data: { action: {} } })
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array))
    alert.mockRestore()
  })
})
