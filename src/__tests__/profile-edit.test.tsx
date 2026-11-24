import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

import { ApiError } from '@/lib/api'
import { pickBirthday } from '@/test/pickBirthday'
import EditProfile from '../app/profile/edit'

jest.mock('@/api/me', () => ({ updateMe: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}` }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ isFocused: () => mockFocused.value, dispatch: jest.fn() }),
  usePreventRemove: (prevent: boolean, callback: (e: unknown) => void) => { mockGuard.prevent = prevent; mockGuard.callback = callback },
  useFocusEffect: (callback: () => void) => {
    mockRefocus = callback
    jest.requireActual('react').useEffect(callback, [])
  },
}))
let mockRefocus: () => void = () => {}
const mockGuard: { prevent: boolean; callback: ((e: unknown) => void) | null } = { prevent: false, callback: null }
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockFocused = { value: true }
const mockUpdateMe: jest.Mock = jest.requireMock('@/api/me').updateMe
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const { router } = jest.requireMock('expo-router')

const mockUpdate = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const me = { id: 'u1', email: 'ana@example.com', role: 'customer', firstName: 'Ana', middleName: 'Maria', lastName: 'Cruz', suffix: null, fullName: 'Ana Maria Cruz', avatarUrl: null, birthday: '1995-05-15', gender: 'female', createdAt: null }
const base = { session: { user: { id: 'u1' } }, profile: me, loading: false, error: null, retry: jest.fn(), update: mockUpdate, signOut: mockSignOut }

beforeEach(() => {
  jest.clearAllMocks()
  mockFocused.value = true
  mockGuard.prevent = false
  mockUseSession.mockReturnValue(base)
})

const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text)
const saveDisabled = () => screen.getByTestId('edit-save').props.accessibilityState.disabled

it('pre-fills every field from the profile', async () => {
  await render(<EditProfile />)
  expect(screen.getByTestId('edit-first-name').props.value).toBe('Ana')
  expect(screen.getByTestId('edit-middle-name').props.value).toBe('Maria')
  expect(screen.getByTestId('edit-last-name').props.value).toBe('Cruz')
  expect(screen.getByTestId('edit-suffix').props.value).toBe('')
  expect(screen.getByTestId('edit-birthday', { includeHiddenElements: true }).props.value).toBe('May 15, 1995')
  expect(screen.getByTestId('edit-gender-female').props.accessibilityState).toMatchObject({ checked: true })
  expect(screen.getByTestId('edit-gender-male').props.accessibilityState).toMatchObject({ checked: false })
})

it('is clean on open when the saved name has stray spaces, and spacing alone is not a change', async () => {
  mockUseSession.mockReturnValue({ ...base, profile: { ...me, firstName: ' Ana  ', lastName: 'De   Cruz' } })
  await render(<EditProfile />)
  expect(saveDisabled()).toBe(true)
  await type('edit-last-name', 'De Cruz')
  expect(saveDisabled()).toBe(true)
  await type('edit-last-name', 'De Cruzz')
  expect(saveDisabled()).toBe(false)
})

it('shows the skeleton while loading', async () => {
  mockUseSession.mockReturnValue({ ...base, loading: true, profile: null })
  await render(<EditProfile />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('edit-save')).toBeNull()
})

it('prompts sign-in when signed out, once on a double tap', async () => {
  mockUseSession.mockReturnValue({ ...base, session: null, profile: null })
  await render(<EditProfile />)
  expect(screen.getByText('Sign in to edit your profile')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('edit-sign-in'))
  await fireEvent.press(screen.getByTestId('edit-sign-in'))
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith('/sign-in')
})

it('shows the profile error with a working Retry', async () => {
  mockUseSession.mockReturnValue({ ...base, profile: null, error: 'Server is down' })
  await render(<EditProfile />)
  expect(screen.getByText('Server is down')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('edit-retry'))
  expect(base.retry).toHaveBeenCalled()
})

describe('validation', () => {
  it('waits for blur, then validates live', async () => {
    await render(<EditProfile />)
    await type('edit-first-name', '')
    expect(screen.queryByText('First name is required.')).toBeNull()
    await fireEvent(screen.getByTestId('edit-first-name'), 'blur')
    expect(screen.getByText('First name is required.')).toBeTruthy()
    await type('edit-first-name', 'Ana2')
    expect(screen.getByText('First name can only contain letters, spaces, hyphens and apostrophes.')).toBeTruthy()
    await type('edit-first-name', 'Anna')
    expect(screen.queryByText(/can only contain/)).toBeNull()
  })

  it('rejects emoji in a name and a word over 30 letters', async () => {
    await render(<EditProfile />)
    await type('edit-last-name', 'Cruz😀')
    await fireEvent(screen.getByTestId('edit-last-name'), 'blur')
    expect(screen.getByText("Emoji aren't allowed in this field.")).toBeTruthy()
    await type('edit-last-name', 'a'.repeat(31))
    expect(screen.getByText('Each word in last name can be at most 30 letters.')).toBeTruthy()
  })

  it('counts the suffix', async () => {
    await render(<EditProfile />)
    expect(screen.getByText('0/20')).toBeTruthy()
    await type('edit-suffix', 'Jr.')
    expect(screen.getByText('3/20')).toBeTruthy()
  })

  it('picks the birthday from a calendar, shows it as a date and cannot be typed into', async () => {
    await render(<EditProfile />)
    expect(screen.getByTestId('edit-birthday', { includeHiddenElements: true }).props.readOnly).toBe(true)
    await pickBirthday('edit-birthday', '1996-05-09')
    expect(screen.getByTestId('edit-birthday', { includeHiddenElements: true }).props.value).toBe('May 9, 1996')
  })

  it('does not require a birthday: an account with none can save without one', async () => {
    mockUseSession.mockReturnValue({ ...base, profile: { ...me, birthday: null } })
    mockUpdateMe.mockResolvedValue(me)
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(mockUpdateMe).toHaveBeenCalledWith({ firstName: 'Anna' })
  })

  it('does not send while a field is invalid', async () => {
    await render(<EditProfile />)
    await type('edit-first-name', '')
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(screen.getByText('First name is required.')).toBeTruthy()
    expect(mockUpdateMe).not.toHaveBeenCalled()
  })
})

describe('unsaved changes', () => {
  it('guards leaving only while something is changed, and asks before discarding', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await render(<EditProfile />)
    expect(mockGuard.prevent).toBe(false)
    await type('edit-first-name', 'Anna')
    expect(mockGuard.prevent).toBe(true)
    mockGuard.callback?.({ data: { action: {} } })
    expect(alert).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array))
    await type('edit-first-name', 'Ana')
    expect(mockGuard.prevent).toBe(false)
    alert.mockRestore()
  })

  it('lets a successful save leave past the guard', async () => {
    mockUpdateMe.mockResolvedValue({ ...me, firstName: 'Anna' })
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    await waitFor(() => expect(router.back).toHaveBeenCalled())
    expect(mockGuard.prevent).toBe(false)
  })
})

describe('saving', () => {
  it('is disabled until something changed, and again when the change is undone', async () => {
    await render(<EditProfile />)
    expect(saveDisabled()).toBe(true)
    await type('edit-first-name', 'Anna')
    expect(saveDisabled()).toBe(false)
    await type('edit-first-name', 'Ana')
    expect(saveDisabled()).toBe(true)
    await type('edit-first-name', '  Ana  ') // spacing alone is not a change
    expect(saveDisabled()).toBe(true)
  })

  it('sends only the changed fields, clearing blanked optional ones with null', async () => {
    const saved = { ...me, firstName: 'Anna', middleName: null, gender: 'other' }
    mockUpdateMe.mockResolvedValue(saved)
    await render(<EditProfile />)
    await type('edit-first-name', ' Anna ')
    await type('edit-middle-name', '  ')
    await fireEvent.press(screen.getByTestId('edit-gender-other'))
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(mockUpdateMe).toHaveBeenCalledWith({ firstName: 'Anna', middleName: null, gender: 'other' })
  })

  it('sends Not specified as a null gender', async () => {
    mockUpdateMe.mockResolvedValue(me)
    await render(<EditProfile />)
    await fireEvent.press(screen.getByTestId('edit-gender-none'))
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(mockUpdateMe).toHaveBeenCalledWith({ gender: null })
  })

  it('on success toasts, updates the session and goes back', async () => {
    const saved = { ...me, firstName: 'Anna' }
    mockUpdateMe.mockResolvedValue(saved)
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('Profile updated')
    expect(mockUpdate).toHaveBeenCalledWith(saved)
  })

  it('goes to Profile when there is nothing to go back to', async () => {
    router.canGoBack.mockReturnValueOnce(false)
    mockUpdateMe.mockResolvedValue(me)
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/profile'))
  })

  it('clears the spinner when the save finishes while the screen is not focused', async () => {
    let finish: (value: unknown) => void = () => {}
    mockUpdateMe.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await act(async () => { fireEvent.press(screen.getByTestId('edit-save')) })
    mockFocused.value = false
    await act(async () => finish({ ...me, firstName: 'Anna' }))
    expect(router.back).not.toHaveBeenCalled()
    expect(screen.getByTestId('edit-save').props.accessibilityState.busy).toBeFalsy()
    expect(screen.getByTestId('edit-first-name').props.editable).toBe(true)
  })

  it('sends one request on a double tap', async () => {
    let finish: (value: unknown) => void = () => {}
    mockUpdateMe.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    const save = screen.getByTestId('edit-save')
    await act(async () => {
      fireEvent.press(save)
      fireEvent.press(save)
    })
    expect(screen.getByTestId('edit-save').props.accessibilityState).toMatchObject({ busy: true, disabled: true })
    await act(async () => finish({ ...me, firstName: 'Anna' }))
    expect(mockUpdateMe).toHaveBeenCalledTimes(1)
    expect(mockToast.mock.calls.filter(([m]) => m === 'Profile updated')).toHaveLength(1)
  })

  it('shows the server detail on a 400 and lets the user save again', async () => {
    mockUpdateMe.mockRejectedValueOnce(new ApiError('validation', 'suffix must be shorter than or equal to 20 characters', 400))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(await screen.findByTestId('edit-banner')).toBeTruthy()
    expect(screen.getByText("We couldn't save your profile. The server said: suffix must be shorter than or equal to 20 characters. Check each field, then save again.")).toBeTruthy()
    expect(router.back).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(saveDisabled()).toBe(false)
    mockUpdateMe.mockResolvedValueOnce({ ...me, firstName: 'Anna' })
    await fireEvent.press(screen.getByTestId('edit-save'))
    await waitFor(() => expect(router.back).toHaveBeenCalled())
  })

  it('explains a network failure and clears the banner on the next edit', async () => {
    mockUpdateMe.mockRejectedValue(new ApiError('network'))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(await screen.findByText("We couldn't save your profile. Can't reach the server. Check your connection and try again.")).toBeTruthy()
    await type('edit-first-name', 'Annabel')
    expect(screen.queryByTestId('edit-banner')).toBeNull()
  })

  it('signs out on a 401', async () => {
    mockUpdateMe.mockRejectedValue(new ApiError('forbidden', undefined, 401))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
    expect(screen.queryByTestId('edit-banner')).toBeNull()
    expect(router.back).not.toHaveBeenCalled()
  })

  it('shows a banner, not a sign-out, on a 403', async () => {
    mockUpdateMe.mockRejectedValue(new ApiError('forbidden', undefined, 403))
    await render(<EditProfile />)
    await type('edit-first-name', 'Anna')
    await fireEvent.press(screen.getByTestId('edit-save'))
    expect(await screen.findByTestId('edit-banner')).toBeTruthy()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})

describe('Change Password button', () => {
  it('opens the password screen once on a double tap, and again after the screen regains focus', async () => {
    await render(<EditProfile />)
    await fireEvent.press(screen.getByTestId('edit-change-password'))
    await fireEvent.press(screen.getByTestId('edit-change-password'))
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/profile/password')
    await act(async () => mockRefocus())
    await fireEvent.press(screen.getByTestId('edit-change-password'))
    expect(router.push).toHaveBeenCalledTimes(2)
  })

  it('is hidden for a Google-only account and shown when email is one of the providers', async () => {
    mockUseSession.mockReturnValue({ ...base, session: { user: { id: 'u1', identities: [{ provider: 'google' }] } } })
    const { unmount } = await render(<EditProfile />)
    expect(screen.queryByTestId('edit-change-password')).toBeNull()
    await unmount()
    mockUseSession.mockReturnValue({ ...base, session: { user: { id: 'u1', identities: [{ provider: 'google' }, { provider: 'email' }] } } })
    await render(<EditProfile />)
    expect(screen.getByTestId('edit-change-password')).toBeTruthy()
  })
})
