import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { StyleSheet } from 'react-native'

import SignIn from '../app/sign-in'

jest.mock('@/auth/google', () => ({ signInWithGoogle: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: () => ({ signIn: mockSignIn }) }))
jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useNavigation: () => ({ isFocused: mockIsFocused }),
}))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockSignIn = jest.fn()
const mockToast = jest.fn()
const mockIsFocused = jest.fn(() => true)
const google = jest.requireMock('@/auth/google').signInWithGoogle as jest.Mock
const back = jest.requireMock('expo-router').router.back as jest.Mock
const replace = jest.requireMock('expo-router').router.replace as jest.Mock
const push = jest.requireMock('expo-router').router.push as jest.Mock
const isFocused = mockIsFocused

beforeEach(() => {
  jest.clearAllMocks()
  isFocused.mockReturnValue(true)
})
afterEach(() => jest.restoreAllMocks())

const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState.disabled

it('shows the divider and the Google button', async () => {
  await render(<SignIn />)
  expect(screen.getByTestId('sign-in-divider', { includeHiddenElements: true })).toBeTruthy()
  expect(screen.getByLabelText('Continue with Google')).toBeTruthy()
})

it('resolves the field testIDs to the real inputs', async () => {
  await render(<SignIn />)
  expect(screen.getByTestId('sign-in-email').props.accessibilityLabel).toBe('Email')
  expect(screen.getByTestId('sign-in-email').props.keyboardType).toBe('email-address')
  expect(screen.getByTestId('sign-in-password').props.secureTextEntry).toBe(true)
})

it('disables Google while the password sign-in is pending', async () => {
  const d = deferred()
  mockSignIn.mockReturnValue(d.promise)
  await render(<SignIn />)
  await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'ana@example.com')
  await fireEvent.changeText(screen.getByTestId('sign-in-password'), 'Secret-123!')
  const press = fireEvent.press(screen.getByTestId('sign-in-submit'))
  await waitFor(() => expect(disabled('sign-in-google')).toBe(true))
  await act(async () => d.resolve({ ok: false, message: 'nope' }))
  await press
})

it('shows nothing when the user cancels', async () => {
  google.mockResolvedValue({ ok: false, cancelled: true })
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  await waitFor(() => expect(disabled('sign-in-google')).toBe(false))
  expect(screen.queryByTestId('sign-in-banner')).toBeNull()
  expect(mockToast).not.toHaveBeenCalled()
})

it('shows a failure in the banner', async () => {
  google.mockResolvedValue({ ok: false, message: 'Try again later.' })
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  expect(await screen.findByText('Try again later.')).toBeTruthy()
  expect(screen.getByTestId('sign-in-banner')).toBeTruthy()
})

it('toasts and goes back on success', async () => {
  google.mockResolvedValue({ ok: true })
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed in with Google'))
  expect(back).toHaveBeenCalledTimes(1)
})

it('shows the generic copy when it throws, and resets pending', async () => {
  google.mockRejectedValue(new Error('boom'))
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  expect(await screen.findByText('Sign-in failed on our side. Please try again.')).toBeTruthy()
  expect(disabled('sign-in-google')).toBe(false)
})

it('does not go back when the screen is no longer focused', async () => {
  isFocused.mockReturnValue(false)
  google.mockResolvedValue({ ok: true })
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed in with Google'))
  expect(back).not.toHaveBeenCalled()
  expect(replace).not.toHaveBeenCalled()
})

it('does not go back after a password sign-in finishes on an unfocused screen', async () => {
  isFocused.mockReturnValue(false)
  mockSignIn.mockResolvedValue({ ok: true })
  await render(<SignIn />)
  await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'ana@example.com')
  await fireEvent.changeText(screen.getByTestId('sign-in-password'), 'Secret-123!')
  await fireEvent.press(screen.getByTestId('sign-in-submit'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed in as ana@example.com'))
  expect(back).not.toHaveBeenCalled()
})

it('makes one call for a same-tick double press and disables Sign In meanwhile', async () => {
  const d = deferred()
  google.mockReturnValue(d.promise)
  await render(<SignIn />)
  const button = screen.getByTestId('sign-in-google')
  // Fire the same-tick presses through the host onClick in one act: fireEvent.press would open overlapping act() calls.
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(disabled('sign-in-submit')).toBe(true)
  expect(google).toHaveBeenCalledTimes(1)
  await act(async () => d.resolve({ ok: false, cancelled: true }))
  await waitFor(() => expect(disabled('sign-in-submit')).toBe(false))
})

it('opens Forgot Password from a 44px link under the password field', async () => {
  await render(<SignIn />)
  const link = screen.getByTestId('sign-in-forgot')
  expect(link.props.accessibilityLabel).toBe('Forgot password?')
  expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44)
  await fireEvent.press(link)
  expect(push).toHaveBeenCalledWith('/forgot-password')
})

it('opens Create Account from a 44px link', async () => {
  await render(<SignIn />)
  const link = screen.getByTestId('sign-in-create-account')
  expect(link.props.accessibilityLabel).toBe('New to KRAL? Create Account')
  expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44)
  await fireEvent.press(link)
  expect(replace).toHaveBeenCalledWith('/sign-up')
})

it('opens Check Your Email from a link under the form', async () => {
  await render(<SignIn />)
  const link = screen.getByTestId('sign-in-no-email')
  expect(link.props.accessibilityLabel).toBe("Didn't get a confirmation email?")
  expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44)
  await fireEvent.press(link)
  expect(push).toHaveBeenCalledWith('/check-email')
})

it('leaves after Google sign-in and never routes to the age step itself (the root gate does)', async () => {
  google.mockResolvedValue({ ok: true })
  await render(<SignIn />)
  await fireEvent.press(screen.getByTestId('sign-in-google'))
  await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
  expect(replace).not.toHaveBeenCalled()
})
