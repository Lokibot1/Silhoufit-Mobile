import { fireEvent, render, screen } from '@testing-library/react-native'

import { ErrorBoundary } from '../app/_layout'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, DefaultTheme: { colors: {} }, Stack: {}, ThemeProvider: {} }))
// The layout pulls in fonts, session and the intro loader; the boundary itself needs none of them.
jest.mock('@/auth/session', () => ({}))
jest.mock('@/auth/AgeGate', () => ({}))
jest.mock('@/ui/fonts', () => ({}))
jest.mock('@/ui/IntroLoader', () => ({}))
jest.mock('@/ui/KralLogo', () => ({}))
jest.mock('@/ui/toast', () => ({}))
jest.mock('@/ui/useReduceMotion', () => ({}))
jest.mock('expo-font', () => ({}))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn() }))
jest.mock('expo-status-bar', () => ({}))
const { replace } = jest.requireMock('expo-router').router as Record<string, jest.Mock>

const error = Object.assign(new Error('secret db password leaked'), { stack: 'at Secret.fn (src/private.ts:1)' })
const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
const retry = jest.fn().mockResolvedValue(undefined)

beforeEach(() => jest.clearAllMocks())

it('shows a friendly message and never the raw error or stack', async () => {
  await render(<ErrorBoundary error={error} retry={retry} />)
  expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy()
  expect(screen.queryByText(/secret/i)).toBeNull()
  expect(screen.queryByText(/private\.ts/)).toBeNull()
})

it('logs only the error name', async () => {
  await render(<ErrorBoundary error={error} retry={retry} />)
  expect(consoleSpy).toHaveBeenCalledWith('Error')
})

it('Try Again calls retry', async () => {
  await render(<ErrorBoundary error={error} retry={retry} />)
  await fireEvent.press(screen.getByTestId('error-retry'))
  expect(retry).toHaveBeenCalledTimes(1)
  expect(replace).not.toHaveBeenCalled()
})

it('Go to Shop opens the tabs and clears the error', async () => {
  await render(<ErrorBoundary error={error} retry={retry} />)
  await fireEvent.press(screen.getByTestId('error-shop'))
  expect(replace).toHaveBeenCalledWith('/(tabs)')
  expect(retry).toHaveBeenCalledTimes(1)
})
