import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { pickBirthday } from '@/test/pickBirthday'
import SignUp from '../app/sign-up'

jest.mock('@/auth/email', () => ({ signUp: jest.fn() }))
jest.mock('@/auth/google', () => ({ signInWithGoogle: jest.fn() }))
jest.mock('@/lib/site', () => ({ openLegal: jest.fn(() => Promise.resolve()) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useNavigation: () => ({ isFocused: () => true }),
}))
const mockToast = jest.fn()
const signUp = jest.requireMock('@/auth/email').signUp as jest.Mock
const google = jest.requireMock('@/auth/google').signInWithGoogle as jest.Mock
const openLegal = jest.requireMock('@/lib/site').openLegal as jest.Mock
const { back, replace } = jest.requireMock('expo-router').router as Record<'back' | 'replace', jest.Mock>

const CONSENT = 'Please read and accept the Terms of Service and Privacy Policy to create an account.'
const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
const pick = (iso: string) => pickBirthday('sign-up-birthday', iso)
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState.disabled
async function fill(consent = true) {
  await type('sign-up-first-name', 'Ana')
  await type('sign-up-last-name', 'Cruz')
  await type('sign-up-email', 'ana@example.com')
  await pick('1995-05-15')
  await type('sign-up-password', 'Abcdefg1!')
  await type('sign-up-confirm', 'Abcdefg1!')
  if (consent) await fireEvent.press(screen.getByTestId('sign-up-consent'))
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('sanitizes every field on change, paste included', async () => {
  await render(<SignUp />)
  await type('sign-up-first-name', 'Ana1😀 Maria')
  await type('sign-up-suffix', 'J.r2😀')
  await type('sign-up-email', 'ana 😀@example.com')
  await type('sign-up-password', 'Abc😀def1!')
  expect(screen.getByTestId('sign-up-first-name').props.value).toBe('Ana Maria')
  expect(screen.getByTestId('sign-up-suffix').props.value).toBe('J.r')
  expect(screen.getByTestId('sign-up-email').props.value).toBe('ana@example.com')
  expect(screen.getByTestId('sign-up-password').props.value).toBe('Abcdef1!')
  expect(screen.getByText('9/40')).toBeTruthy()
})

it('configures the password field for password managers', async () => {
  await render(<SignUp />)
  const input = screen.getByTestId('sign-up-password')
  expect(input.props.autoComplete).toBe('new-password')
  expect(input.props.textContentType).toBe('newPassword')
  expect(input.props.secureTextEntry).toBe(true)
  await fireEvent.press(screen.getByTestId('sign-up-toggle-password'))
  expect(screen.getByTestId('sign-up-password').props.secureTextEntry).toBe(false)
})

it('shows every required message on an empty submit and sends nothing', async () => {
  await render(<SignUp />)
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  expect(await screen.findByText('First name is required.')).toBeTruthy()
  expect(screen.getByText('Last name is required.')).toBeTruthy()
  expect(screen.getByText('Email is required.')).toBeTruthy()
  expect(screen.getByText('Choose your birthday from the calendar. You must be 18 or older to sign up.')).toBeTruthy()
  expect(screen.getByText('Password is required.')).toBeTruthy()
  expect(screen.getByText('Confirm your password.')).toBeTruthy()
  expect(screen.getByText(CONSENT)).toBeTruthy()
  expect(signUp).not.toHaveBeenCalled()
})

it('shows specific messages: under 18 and mismatched passwords', async () => {
  await render(<SignUp />)
  await fill()
  await pick('2020-01-01')
  await type('sign-up-confirm', 'Different1!')
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  expect(await screen.findByText(/at least 18 years old/)).toBeTruthy()
  expect(screen.getByText("Passwords don't match.")).toBeTruthy()
  expect(signUp).not.toHaveBeenCalled()
})

it('requires the consent checkbox', async () => {
  await render(<SignUp />)
  await fill(false)
  expect(screen.getByTestId('sign-up-consent').props.accessibilityRole).toBe('checkbox')
  expect(screen.getByTestId('sign-up-consent').props.accessibilityState.checked).toBe(false)
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  expect(await screen.findByText(CONSENT)).toBeTruthy()
  expect(signUp).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('sign-up-consent'))
  expect(screen.getByTestId('sign-up-consent').props.accessibilityState.checked).toBe(true)
  expect(screen.queryByText(CONSENT)).toBeNull()
})

it('opens the Terms and Privacy pages from the consent links', async () => {
  await render(<SignUp />)
  await fireEvent.press(screen.getByTestId('sign-up-terms'))
  await fireEvent.press(screen.getByTestId('sign-up-privacy'))
  expect(openLegal.mock.calls).toEqual([['terms'], ['privacy']])
})

it('shows a weak password inline on the field, not as a banner', async () => {
  signUp.mockResolvedValue({ ok: false, kind: 'weak-password' })
  await render(<SignUp />)
  await fill()
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  expect(await screen.findByText(/That password was rejected/)).toBeTruthy()
  expect(screen.queryByTestId('sign-up-error')).toBeNull()
  await type('sign-up-password', 'Abcdefg2!')
  expect(screen.queryByText(/That password was rejected/)).toBeNull()
})

it('shows an alert banner for other failures and relabels the button', async () => {
  signUp.mockResolvedValueOnce({ ok: false, kind: 'network' })
  await render(<SignUp />)
  await fill()
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  const banner = await screen.findByTestId('sign-up-error')
  expect(banner.props.accessibilityRole).toBe('alert')
  expect(screen.getByText(/The connection dropped/)).toBeTruthy()
  expect(screen.getByLabelText('Try Again')).toBeTruthy()
  signUp.mockResolvedValueOnce({ ok: true, signedIn: false })
  await fireEvent.press(screen.getByLabelText('Try Again'))
  await waitFor(() => expect(replace).toHaveBeenCalled())
})

it('sends one request for a same-tick double press and disables the button meanwhile', async () => {
  const d = deferred()
  signUp.mockReturnValue(d.promise)
  await render(<SignUp />)
  await fill()
  const button = screen.getByTestId('sign-up-submit')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(signUp).toHaveBeenCalledTimes(1)
  expect(disabled('sign-up-submit')).toBe(true)
  expect(disabled('sign-up-google')).toBe(true)
  await act(async () => d.resolve({ ok: true, signedIn: false }))
})

it('sends the cleaned profile and opens Check Email', async () => {
  signUp.mockResolvedValue({ ok: true, signedIn: false })
  await render(<SignUp />)
  await fill()
  await type('sign-up-middle-name', 'de   la')
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  await waitFor(() => expect(replace).toHaveBeenCalledWith({ pathname: '/check-email', params: { email: 'ana@example.com' } }))
  expect(signUp).toHaveBeenCalledWith({ firstName: 'Ana', middleName: 'de la', lastName: 'Cruz', suffix: null, email: 'ana@example.com', birthday: '1995-05-15', password: 'Abcdefg1!' })
  expect(mockToast).toHaveBeenCalledWith('Account created. Check your email to finish setting up.')
})

it('leaves the screen when sign-up already signed the user in', async () => {
  signUp.mockResolvedValue({ ok: true, signedIn: true })
  await render(<SignUp />)
  await fill()
  await fireEvent.press(screen.getByTestId('sign-up-submit'))
  await waitFor(() => expect(back).toHaveBeenCalled())
  expect(mockToast).toHaveBeenCalledWith('Account created. Welcome to KRAL.')
  expect(replace).not.toHaveBeenCalled()
})

describe('Continue with Google', () => {
  it('does nothing but show the consent error until the box is ticked', async () => {
    await render(<SignUp />)
    await fireEvent.press(screen.getByTestId('sign-up-google'))
    expect(await screen.findByText(CONSENT)).toBeTruthy()
    expect(google).not.toHaveBeenCalled()
  })

  it('signs in once consent is given', async () => {
    google.mockResolvedValue({ ok: true })
    await render(<SignUp />)
    await fireEvent.press(screen.getByTestId('sign-up-consent'))
    await fireEvent.press(screen.getByTestId('sign-up-google'))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(mockToast).toHaveBeenCalledWith('Signed in with Google')
  })
})

it('switches to Sign In', async () => {
  await render(<SignUp />)
  await fireEvent.press(screen.getByTestId('sign-up-signin'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
})
