import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import Profile from '../app/(tabs)/profile'

jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockUseSession = jest.requireMock('@/auth/session').useSession
const mockPush = jest.requireMock('expo-router').router.push

beforeEach(() => jest.clearAllMocks())

const base = { session: null, profile: null, loading: false, error: null, retry: jest.fn(), signOut: jest.fn().mockResolvedValue(undefined) }
const me = { id: 'u1', email: 'ana@example.com', role: 'customer', firstName: 'Ana', lastName: 'Cruz', fullName: null, avatarUrl: null }

it('shows the skeleton, not the prompt, while loading', async () => {
  mockUseSession.mockReturnValue({ ...base, loading: true })
  await render(<Profile />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('profile-sign-in')).toBeNull()
})

it('prompts sign-in when signed out', async () => {
  mockUseSession.mockReturnValue(base)
  await render(<Profile />)
  expect(screen.getByText('Sign in to see your profile')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('profile-sign-in'))
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
})

it('shows the profile and signs out with a toast', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me })
  await render(<Profile />)
  expect(screen.getByTestId('profile-name').props.children).toBe('Ana Cruz')
  expect(screen.getByText('ana@example.com')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed out'))
  expect(base.signOut).toHaveBeenCalledTimes(1)
})

it('falls back to first and last name when fullName is blank', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: { ...me, fullName: '   ' } })
  await render(<Profile />)
  expect(screen.getByTestId('profile-name').props.children).toBe('Ana Cruz')
})

it('prefers a trimmed fullName and shows the photo when avatarUrl is set', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: { ...me, fullName: ' Ana M. Cruz ', avatarUrl: 'https://x.test/a.png' } })
  await render(<Profile />)
  expect(screen.getByTestId('profile-name').props.children).toBe('Ana M. Cruz')
  expect(screen.getByLabelText('Profile photo of Ana M. Cruz')).toBeTruthy()
})

it('toasts a failure when sign out rejects', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me, signOut: jest.fn().mockRejectedValue(new Error('x')) })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't sign out. Try again."))
  expect(mockToast).not.toHaveBeenCalledWith('Signed out')
})

it('runs sign out once on a double tap', async () => {
  let finish: () => void = () => {}
  const signOut = jest.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me, signOut })
  await render(<Profile />)
  const button = screen.getByTestId('profile-sign-out')
  // Both taps land before React re-renders, so only the in-flight guard can stop the second.
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  await act(async () => finish())
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed out'))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(mockToast.mock.calls.filter(([m]) => m === 'Signed out')).toHaveLength(1)
})

it('offers Sign Out in the error state', async () => {
  const signOut = jest.fn().mockResolvedValue(undefined)
  mockUseSession.mockReturnValue({ ...base, session: {}, error: 'Server is down', signOut })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
})

it('pushes sign-in once on a double tap', async () => {
  mockUseSession.mockReturnValue(base)
  await render(<Profile />)
  const button = screen.getByTestId('profile-sign-in')
  await fireEvent.press(button)
  await fireEvent.press(button)
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('shows the error with a working Retry', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, error: 'Server is down' })
  await render(<Profile />)
  expect(screen.getByText('Server is down')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('profile-retry'))
  expect(base.retry).toHaveBeenCalled()
})
