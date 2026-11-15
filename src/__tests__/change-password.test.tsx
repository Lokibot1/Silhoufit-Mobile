import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { supabase } from '@/lib/supabase'
import ChangePassword from '../app/profile/password'

jest.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword: jest.fn(), updateUser: jest.fn(), getSession: jest.fn(), signOut: jest.fn() } } }))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}` }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const auth = supabase.auth as unknown as Record<'signInWithPassword' | 'updateUser' | 'signOut', jest.Mock>
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')

const user = { id: 'u1', email: 'ana@example.com', identities: [{ provider: 'email' }], app_metadata: { providers: ['email'] } }
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
const fill = async (current = 'OldPass1!', next = 'NewPass2@', confirm = next) => {
  await type('password-current', current)
  await type('password-new', next)
  await type('password-confirm', confirm)
}
const submit = () => fireEvent.press(screen.getByTestId('password-submit'))

beforeEach(() => {
  jest.clearAllMocks()
  mockUseSession.mockReturnValue({ session: { user }, loading: false })
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })
  auth.updateUser.mockResolvedValue({ data: {}, error: null })
  auth.signOut.mockResolvedValue({ error: null })
})

it('asks signed-out visitors to sign in', async () => {
  mockUseSession.mockReturnValue({ session: null, loading: false })
  await render(<ChangePassword />)
  await fireEvent.press(screen.getByTestId('password-sign-in'))
  expect(router.push).toHaveBeenCalledWith('/sign-in')
})

it('shows the skeleton while the session restores', async () => {
  mockUseSession.mockReturnValue({ session: null, loading: true })
  await render(<ChangePassword />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
})

it('tells a Google-only account to use Forgot password instead of showing the form', async () => {
  mockUseSession.mockReturnValue({ session: { user: { ...user, identities: [{ provider: 'google' }], app_metadata: { providers: ['google'] } } }, loading: false })
  await render(<ChangePassword />)
  expect(screen.getByText('You signed in with Google. Set a password via Forgot password.')).toBeTruthy()
  expect(screen.queryByTestId('password-current')).toBeNull()
  await fireEvent.press(screen.getByTestId('password-forgot'))
  expect(router.push).toHaveBeenCalledWith('/forgot-password')
})

it('validates before calling the server', async () => {
  await render(<ChangePassword />)
  await submit()
  expect(screen.getByText('Enter your current password.')).toBeTruthy()
  expect(screen.getByText('Password is required.')).toBeTruthy()
  await fill('OldPass1!', 'NewPass2@', 'Different3#')
  await submit()
  expect(screen.getByText("Passwords don't match.")).toBeTruthy()
  await fill('Same-Pass1!', 'Same-Pass1!')
  expect(screen.getByText('Choose a password different from your current one.')).toBeTruthy()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
})

it('strips emoji and sets the new-password autofill hints', async () => {
  await render(<ChangePassword />)
  await type('password-new', 'Ab1!😀x')
  expect(screen.getByTestId('password-new').props.value).toBe('Ab1!x')
  expect(screen.getByTestId('password-current').props.autoComplete).toBe('current-password')
  expect(screen.getByTestId('password-new').props.autoComplete).toBe('new-password')
})

it('re-checks the current password, updates, toasts and clears the fields', async () => {
  await render(<ChangePassword />)
  await fill()
  await submit()
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Password updated.'))
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'OldPass1!' })
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'NewPass2@' })
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  expect(screen.getByTestId('password-current').props.value).toBe('')
  expect(screen.getByTestId('password-new').props.value).toBe('')
})

it('says the current password is incorrect without updating', async () => {
  auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', status: 400 } })
  await render(<ChangePassword />)
  await fill()
  await submit()
  expect(await screen.findByText('Current password is incorrect.')).toBeTruthy()
  expect(auth.updateUser).not.toHaveBeenCalled()
})

it.each([
  ['same_password', 422, 'This is already your password. Choose a different one.'],
  ['weak_password', 422, 'found the new password too weak'],
  ['over_request_rate_limit', 429, 'Too many attempts.'],
  ['unexpected', 500, 'Something went wrong on our side.'],
  ['session_not_found', 401, 'Your session has expired.'],
])('shows the %s failure', async (code, status, text) => {
  auth.updateUser.mockResolvedValue({ data: {}, error: { code, status } })
  await render(<ChangePassword />)
  await fill()
  await submit()
  expect(await screen.findByText(new RegExp(text))).toBeTruthy()
  expect(mockToast).not.toHaveBeenCalled()
})

it('reports a dropped connection and keeps the fields', async () => {
  auth.signInWithPassword.mockRejectedValue(new TypeError('Network request failed'))
  await render(<ChangePassword />)
  await fill()
  await submit()
  expect(await screen.findByText(/connection dropped/)).toBeTruthy()
  expect(screen.getByTestId('password-new').props.value).toBe('NewPass2@')
})

it('sends one request on a double tap and disables the button meanwhile', async () => {
  let finish: (v: unknown) => void = () => {}
  auth.signInWithPassword.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  await render(<ChangePassword />)
  await fill()
  await submit()
  await submit()
  expect(auth.signInWithPassword).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('password-submit').props.accessibilityState).toMatchObject({ disabled: true })
  await act(async () => finish({ data: {}, error: null }))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Password updated.'))
})

it('still succeeds, with no error toast, when signing out the other sessions fails', async () => {
  auth.signOut.mockRejectedValue(new TypeError('Network request failed'))
  await render(<ChangePassword />)
  await fill()
  await submit()
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Password updated.'))
  expect(mockToast).toHaveBeenCalledTimes(1)
})

it('says an account without an email address cannot be verified, and does not call the server', async () => {
  mockUseSession.mockReturnValue({ session: { user: { ...user, email: undefined } }, loading: false })
  await render(<ChangePassword />)
  await fill()
  await submit()
  expect(await screen.findByText('This account has no email address to verify.')).toBeTruthy()
  expect(auth.signInWithPassword).not.toHaveBeenCalled()
})

it('keeps emoji out of the new fields but not the current one', async () => {
  await render(<ChangePassword />)
  await type('password-current', 'Ab1!😀x')
  expect(screen.getByTestId('password-current').props.value).toBe('Ab1!😀x')
})

it('toasts a failure once when the user left the screen while it was sending', async () => {
  let finish: (v: unknown) => void = () => {}
  auth.signInWithPassword.mockReturnValue(new Promise((resolve) => (finish = resolve)))
  const { unmount } = await render(<ChangePassword />)
  await fill()
  await submit()
  await unmount()
  await act(async () => finish({ data: {}, error: { status: 0 } }))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('connection dropped'))
})
