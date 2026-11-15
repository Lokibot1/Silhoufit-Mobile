import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import ForgotPassword from '../app/forgot-password'

jest.mock('@/auth/email', () => ({ requestPasswordReset: jest.fn() }))
jest.mock('expo-router', () => ({ router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() } }))
const reset = jest.requireMock('@/auth/email').requestPasswordReset as jest.Mock
const { canGoBack, back, replace } = jest.requireMock('expo-router').router as Record<'canGoBack' | 'back' | 'replace', jest.Mock>

const GENERIC = 'If an account exists for that address, we sent a link to reset your password. The link expires in 30 minutes.'
const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const type = (email: string) => fireEvent.changeText(screen.getByTestId('forgot-email'), email)
const disabled = (id: string) => screen.getByTestId(id).props.accessibilityState.disabled

beforeEach(() => {
  jest.clearAllMocks()
  canGoBack.mockReturnValue(true)
})

it.each(['ana@example.com', 'unknown-123@example.invalid'])('shows the same generic copy for %s', async (email) => {
  reset.mockResolvedValue({ ok: true })
  await render(<ForgotPassword />)
  await type(email)
  await fireEvent.press(screen.getByTestId('forgot-submit'))
  expect(await screen.findByText(GENERIC)).toBeTruthy()
  expect(screen.getByTestId('forgot-sent')).toBeTruthy()
  expect(screen.queryByText(email)).toBeNull()
  expect(reset).toHaveBeenCalledWith(email)
})

it('shows an inline error and sends nothing for an invalid email', async () => {
  await render(<ForgotPassword />)
  await type('not-an-email')
  await fireEvent.press(screen.getByTestId('forgot-submit'))
  expect(await screen.findByText('Enter a valid email like name@example.com.')).toBeTruthy()
  expect(reset).not.toHaveBeenCalled()
})

it('strips emoji from the email field', async () => {
  await render(<ForgotPassword />)
  await type('ana😀@example.com')
  expect(screen.getByTestId('forgot-email').props.value).toBe('ana@example.com')
})

it('sends one request for a same-tick double press and disables the button meanwhile', async () => {
  const d = deferred()
  reset.mockReturnValue(d.promise)
  await render(<ForgotPassword />)
  await type('ana@example.com')
  const button = screen.getByTestId('forgot-submit')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(reset).toHaveBeenCalledTimes(1)
  expect(disabled('forgot-submit')).toBe(true)
  await act(async () => d.resolve({ ok: true }))
  expect(await screen.findByTestId('forgot-sent')).toBeTruthy()
})

it.each([
  ['rate-limit', 'Too many reset requests.'],
  ['network', 'The connection dropped'],
  ['server', 'Something went wrong on our side.'],
])('shows an alert banner for %s and retries', async (kind, text) => {
  reset.mockResolvedValueOnce({ ok: false, kind })
  await render(<ForgotPassword />)
  await type('ana@example.com')
  await fireEvent.press(screen.getByTestId('forgot-submit'))
  const banner = await screen.findByTestId('forgot-error')
  expect(banner.props.accessibilityRole).toBe('alert')
  expect(screen.getByText(new RegExp(text))).toBeTruthy()
  expect(disabled('forgot-submit')).toBe(false)
  expect(screen.queryByTestId('forgot-sent')).toBeNull()

  reset.mockResolvedValueOnce({ ok: true })
  await fireEvent.press(screen.getByLabelText('Try Again'))
  expect(await screen.findByText(GENERIC)).toBeTruthy()
  expect(screen.queryByTestId('forgot-error')).toBeNull()
})

it('goes back to Sign In from the form and from the sent view', async () => {
  reset.mockResolvedValue({ ok: true })
  await render(<ForgotPassword />)
  await fireEvent.press(screen.getByTestId('forgot-back'))
  expect(back).toHaveBeenCalledTimes(1)
  await type('ana@example.com')
  await fireEvent.press(screen.getByTestId('forgot-submit'))
  await waitFor(() => expect(screen.getByTestId('forgot-sent')).toBeTruthy())
  await fireEvent.press(screen.getByTestId('forgot-back'))
  expect(back).toHaveBeenCalledTimes(2)
})

it('opens Sign In when there is nothing to go back to', async () => {
  canGoBack.mockReturnValue(false)
  await render(<ForgotPassword />)
  await fireEvent.press(screen.getByTestId('forgot-back'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
})
