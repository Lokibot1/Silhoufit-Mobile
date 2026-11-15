import { fireEvent, render, screen } from '@testing-library/react-native'

import Onboarding from '../../app/onboarding'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/auth/session', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) }, useLocalSearchParams: () => mockParams }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('../status', () => ({ saveOnboarding: jest.fn(() => Promise.resolve(false)) }))
const save: jest.Mock = jest.requireMock('../status').saveOnboarding
const { router } = jest.requireMock('expo-router')
let mockParams: Record<string, string> = {}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
})

it('starts on step 1 with Skip, Next and a disabled Back', async () => {
  await render(<Onboarding />)
  expect(screen.getByText('(Step 1 of 3)')).toBeTruthy()
  expect(screen.getByTestId('onboarding-skip')).toBeTruthy()
  expect(screen.getByTestId('onboarding-back').props.accessibilityState.disabled).toBe(true)
  expect(screen.queryByTestId('onboarding-finish')).toBeNull()
})

it('Next and Back move through the steps; the last step offers Get Started', async () => {
  await render(<Onboarding />)
  await fireEvent.press(screen.getByTestId('onboarding-next'))
  expect(screen.getByText('(Step 2 of 3)')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('onboarding-back'))
  expect(screen.getByText('(Step 1 of 3)')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('onboarding-next'))
  await fireEvent.press(screen.getByTestId('onboarding-next'))
  expect(screen.getByTestId('onboarding-finish')).toBeTruthy()
  expect(screen.queryByTestId('onboarding-next')).toBeNull()
})

it('Skip on any step persists "skipped" once and closes, even when the save fails', async () => {
  await render(<Onboarding />)
  await fireEvent.press(screen.getByTestId('onboarding-skip'))
  await fireEvent.press(screen.getByTestId('onboarding-skip'))
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith('u1', 'skipped')
  expect(router.back).toHaveBeenCalledTimes(1)
})

it('Get Started persists "completed"', async () => {
  await render(<Onboarding />)
  await fireEvent.press(screen.getByTestId('onboarding-next'))
  await fireEvent.press(screen.getByTestId('onboarding-next'))
  await fireEvent.press(screen.getByTestId('onboarding-finish'))
  expect(save).toHaveBeenCalledWith('u1', 'completed')
})

it('a replay closes without saving anything', async () => {
  mockParams = { replay: '1' }
  await render(<Onboarding />)
  await fireEvent.press(screen.getByTestId('onboarding-skip'))
  expect(save).not.toHaveBeenCalled()
  expect(router.back).toHaveBeenCalled()
})
