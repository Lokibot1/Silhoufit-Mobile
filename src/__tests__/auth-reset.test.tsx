import { act, fireEvent, render, screen } from '@testing-library/react-native'

import ResetPassword from '../app/auth/reset'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}`, useLinkingURL: () => mockUrl }))
jest.mock('@/auth/email', () => ({ RESET_REDIRECT: 'silhoufitmobile://auth/reset', openEmailLink: jest.fn(), setPassword: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: () => ({ session: { user: { email: 'ana@example.com' } }, profile: null, signOut: mockSignOut }) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
let mockUrl: string | null = 'silhoufitmobile://auth/reset?code=abc'
const mockToast = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const open = jest.requireMock('@/auth/email').openEmailLink as jest.Mock
const setPassword = jest.requireMock('@/auth/email').setPassword as jest.Mock
const replace = jest.requireMock('expo-router').router.replace as jest.Mock

const EXPIRED = 'This link has expired or was already used. Request a new link on this phone.'
const deferred = () => {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
async function openForm() {
  open.mockResolvedValue('ok')
  await render(<ResetPassword />)
  await screen.findByTestId('reset-submit')
}
async function openFormAndGetUnmount() {
  open.mockResolvedValue('ok')
  const { unmount } = await render(<ResetPassword />)
  await screen.findByTestId('reset-submit')
  return unmount
}
async function fillAndSubmit(password = 'Abcdefg1!', confirm = password) {
  await type('reset-password', password)
  await type('reset-confirm', confirm)
  await fireEvent.press(screen.getByTestId('reset-submit'))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUrl = 'silhoufitmobile://auth/reset?code=abc'
})

it('shows a spinner while the link is exchanged, then the form', async () => {
  const d = deferred()
  open.mockReturnValue(d.promise)
  await render(<ResetPassword />)
  expect(screen.getByTestId('reset-checking')).toBeTruthy()
  expect(open).toHaveBeenCalledWith('silhoufitmobile://auth/reset?code=abc', 'silhoufitmobile://auth/reset')
  await act(async () => d.resolve('ok'))
  expect(await screen.findByTestId('reset-password')).toBeTruthy()
})

it.each(['expired', 'missing'])('shows the expired state for %s with both exits', async (outcome) => {
  open.mockResolvedValue(outcome)
  await render(<ResetPassword />)
  expect(await screen.findByText(EXPIRED)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('reset-expired'))
  expect(replace).toHaveBeenCalledWith('/forgot-password')
  await fireEvent.press(screen.getByTestId('reset-shop'))
  expect(replace).toHaveBeenCalledWith('/(tabs)')
})

it('opens the expired state when no link came in, after a short wait for a late launch URL', async () => {
  jest.useFakeTimers()
  mockUrl = null
  open.mockResolvedValue('missing')
  await render(<ResetPassword />)
  expect(screen.getByTestId('reset-checking')).toBeTruthy()
  expect(open).not.toHaveBeenCalled()
  await act(async () => void jest.advanceTimersByTime(1500))
  expect(await screen.findByText(EXPIRED)).toBeTruthy()
  expect(open).toHaveBeenCalledWith('', expect.any(String))
  jest.useRealTimers()
})

it('offers Retry on a rate limit', async () => {
  open.mockResolvedValueOnce('rate-limit').mockResolvedValueOnce('ok')
  await render(<ResetPassword />)
  expect(await screen.findByText('Too many attempts. Try again in a few minutes.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('reset-retry'))
  expect(await screen.findByTestId('reset-submit')).toBeTruthy()
})

it('signs out when the user leaves before setting a password, but not after saving', async () => {
  const first = await openFormAndGetUnmount()
  await first()
  expect(mockSignOut).toHaveBeenCalledTimes(1)
  mockSignOut.mockClear()
  const second = await openFormAndGetUnmount()
  setPassword.mockResolvedValue({ ok: true })
  await fillAndSubmit()
  await second()
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('retries after a network failure', async () => {
  open.mockResolvedValueOnce('network').mockResolvedValueOnce('ok')
  await render(<ResetPassword />)
  await fireEvent.press(await screen.findByTestId('reset-retry'))
  expect(await screen.findByTestId('reset-submit')).toBeTruthy()
  expect(open).toHaveBeenCalledTimes(2)
})

it('does not exchange the same link twice on a re-render', async () => {
  await openForm()
  await type('reset-password', 'a')
  expect(open).toHaveBeenCalledTimes(1)
})

it('validates and shows the live checklist', async () => {
  await openForm()
  await type('reset-password', 'abc')
  expect(screen.getByTestId('reset-checklist-label').props.children).toBe('Too weak')
  await fireEvent.press(screen.getByTestId('reset-submit'))
  expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
  expect(setPassword).not.toHaveBeenCalled()
  await type('reset-password', 'Abcdefg1!')
  await type('reset-confirm', 'Other1!aa')
  await fireEvent.press(screen.getByTestId('reset-submit'))
  expect(await screen.findByText("Passwords don't match.")).toBeTruthy()
})

it('saves, toasts and opens Profile', async () => {
  await openForm()
  setPassword.mockResolvedValue({ ok: true })
  await fillAndSubmit()
  expect(setPassword).toHaveBeenCalledWith('Abcdefg1!')
  expect(mockToast).toHaveBeenCalledWith('Password updated.')
  expect(replace).toHaveBeenCalledWith('/(tabs)/profile')
})

it('says on the field that the password is unchanged', async () => {
  await openForm()
  setPassword.mockResolvedValue({ ok: false, kind: 'same' })
  await fillAndSubmit()
  expect(await screen.findByText('This is already your password. Choose a different one.')).toBeTruthy()
  expect(replace).not.toHaveBeenCalled()
})

it('shows the provider detail for a weak password', async () => {
  await openForm()
  setPassword.mockResolvedValue({ ok: false, kind: 'weak', detail: 'Password is known to be weak and easy to guess.' })
  await fillAndSubmit()
  expect(await screen.findByText(/Password is known to be weak and easy to guess\. Choose a longer/)).toBeTruthy()
  expect(screen.getByTestId('reset-error').props.accessibilityRole).toBe('alert')
  expect(screen.getByLabelText('Try Again')).toBeTruthy()
})

it.each([
  ['rate-limit', 'Wait a few minutes'],
  ['network', 'The connection dropped'],
  ['server', 'Something went wrong on our side'],
])('shows a banner for %s', async (kind, text) => {
  await openForm()
  setPassword.mockResolvedValue({ ok: false, kind })
  await fillAndSubmit()
  expect(await screen.findByText(new RegExp(text))).toBeTruthy()
})

it('swaps to the expired state when the session is gone', async () => {
  await openForm()
  setPassword.mockResolvedValue({ ok: false, kind: 'expired' })
  await fillAndSubmit()
  expect(await screen.findByText(EXPIRED)).toBeTruthy()
})

it('saves once for a same-tick double press', async () => {
  await openForm()
  const d = deferred()
  setPassword.mockReturnValue(d.promise)
  await type('reset-password', 'Abcdefg1!')
  await type('reset-confirm', 'Abcdefg1!')
  const button = screen.getByTestId('reset-submit')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(setPassword).toHaveBeenCalledTimes(1)
  await act(async () => d.resolve({ ok: true }))
})
