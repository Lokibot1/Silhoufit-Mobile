import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { Alert, Linking } from 'react-native'

import Profile from '../app/(tabs)/profile'

jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/lib/site', () => ({ CONTACT_EMAIL: 'team@silhoufit.dev', openLegal: jest.fn(() => Promise.resolve()) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router
const mockOpenLegal = jest.requireMock('@/lib/site').openLegal as jest.Mock
const openUrlSpy = jest.spyOn(Linking, 'openURL')
const alertSpy = jest.spyOn(Alert, 'alert')
const pressAlert = async (text: string) => {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? []
  await act(async () => buttons.find((b) => b.text === text)?.onPress?.())
}

beforeEach(() => {
  jest.clearAllMocks()
  alertSpy.mockImplementation(() => {})
  openUrlSpy.mockResolvedValue(undefined)
  mockOpenLegal.mockResolvedValue(undefined)
})

const base = { session: null, profile: null, loading: false, error: null, retry: jest.fn(), signOut: jest.fn().mockResolvedValue(undefined) }
const me = { id: 'u1', email: 'ana@example.com', role: 'customer', firstName: 'Ana', lastName: 'Cruz', fullName: null, avatarUrl: null, createdAt: '2026-03-02T01:00:00.000Z' }

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
  expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual(['Are you sure?', expect.any(String)])
  expect(base.signOut).not.toHaveBeenCalled()
  await pressAlert('Sign Out')
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Signed out'))
  expect(base.signOut).toHaveBeenCalledTimes(1)
})

it('does not sign out when the confirmation is cancelled', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  await pressAlert('Cancel')
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  expect(alertSpy).toHaveBeenCalledTimes(2)
  expect(base.signOut).not.toHaveBeenCalled()
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
  await pressAlert('Sign Out')
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't sign out. Try again."))
  expect(mockToast).not.toHaveBeenCalledWith('Signed out')
})

it('runs sign out once on a double tap', async () => {
  let finish: () => void = () => {}
  const signOut = jest.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me, signOut })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-sign-out'))
  const confirm = alertSpy.mock.calls[0][2]?.find((b) => b.text === 'Sign Out')
  // Both taps land before React re-renders, so only the in-flight guard can stop the second.
  await act(async () => {
    confirm?.onPress?.()
    confirm?.onPress?.()
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
  await pressAlert('Sign Out')
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

describe('signed-in layout', () => {
  beforeEach(() => mockUseSession.mockReturnValue({ ...base, session: {}, profile: me }))

  it('shows the member since date', async () => {
    await render(<Profile />)
    expect(screen.getByText('Member since Mar 2, 2026')).toBeTruthy()
  })

  it('hides member since when the date is unknown', async () => {
    mockUseSession.mockReturnValue({ ...base, session: {}, profile: { ...me, createdAt: null } })
    await render(<Profile />)
    expect(screen.queryByTestId('profile-member-since')).toBeNull()
  })

  it.each([['to-pay'], ['to-ship'], ['to-receive'], ['completed']])('opens the %s orders tab', async (id) => {
    await render(<Profile />)
    await fireEvent.press(screen.getByTestId(`profile-orders-${id}`))
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/orders', params: { tab: id, nav: expect.stringMatching(/^\d+$/) } })
  })

  it('View all opens Orders on All with a fresh nav', async () => {
    await render(<Profile />)
    await fireEvent.press(screen.getByTestId('profile-orders-all'))
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/orders', params: { tab: 'all', nav: expect.stringMatching(/^\d+$/) } })
  })

  it('shows the unbuilt rows as disabled and captioned, and Edit Profile as enabled', async () => {
    await render(<Profile />)
    expect(screen.getByTestId('profile-menu-edit').props.accessibilityState).toMatchObject({ disabled: false })
    for (const id of ['profile-menu-addresses', 'profile-menu-body']) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({ disabled: true })
      await fireEvent.press(screen.getByTestId(id))
    }
    expect(screen.getAllByText('Coming soon')).toHaveLength(2)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('opens Edit Profile from the row', async () => {
    await render(<Profile />)
    await fireEvent.press(screen.getByTestId('profile-menu-edit'))
    expect(mockPush).toHaveBeenCalledWith('/profile/edit')
  })

  it('opens Edit Profile from the edit icon, once on a double tap', async () => {
    await render(<Profile />)
    const icon = screen.getByTestId('profile-edit', { includeHiddenElements: true })
    expect(icon.props.accessibilityState).toMatchObject({ disabled: false })
    await fireEvent.press(icon)
    await fireEvent.press(icon)
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/profile/edit')
  })

  it('hides the duplicate edit icon from screen readers; the row announces it', async () => {
    await render(<Profile />)
    expect(screen.queryByTestId('profile-edit')).toBeNull() // default queries skip hidden elements
    expect(screen.getByLabelText('Edit Profile')).toBe(screen.getByTestId('profile-menu-edit'))
  })
})

it('opens About, Privacy and Terms in the browser from the About KRAL group', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me })
  await render(<Profile />)
  expect(screen.getByText('About KRAL')).toBeTruthy()
  for (const id of ['about', 'privacy', 'terms']) await fireEvent.press(screen.getByTestId(`profile-menu-${id}`))
  expect(mockOpenLegal.mock.calls).toEqual([['about'], ['privacy'], ['terms']])
  expect(screen.getByTestId('profile-menu-privacy').props.accessibilityHint).toBe('Opens in your browser')
})

it('toasts when the browser cannot open', async () => {
  mockOpenLegal.mockRejectedValue(new Error('no browser'))
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-menu-terms'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't open the page. Check your connection and try again."))
})

it('opens the email app for Contact Us, and toasts the address when there is none', async () => {
  mockUseSession.mockReturnValue({ ...base, session: {}, profile: me })
  await render(<Profile />)
  await fireEvent.press(screen.getByTestId('profile-menu-contact'))
  expect(openUrlSpy).toHaveBeenCalledWith('mailto:team@silhoufit.dev')
  expect(mockToast).not.toHaveBeenCalled()
  openUrlSpy.mockRejectedValue(new Error('no app'))
  await fireEvent.press(screen.getByTestId('profile-menu-contact'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('No email app found. Write to team@silhoufit.dev.'))
})

it('shows the About KRAL rows signed out too, but not while loading', async () => {
  mockUseSession.mockReturnValue(base)
  const view = await render(<Profile />)
  expect(screen.getByTestId('profile-menu-contact')).toBeTruthy()
  mockUseSession.mockReturnValue({ ...base, loading: true })
  await view.rerender(<Profile />)
  expect(screen.queryByTestId('profile-menu-contact')).toBeNull()
})
