import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, Linking, Platform, type AlertButton } from 'react-native'

import { ApiError } from '@/lib/api'
import { UploadError } from '@/lib/imageUpload'
import EditProfile from '../app/profile/edit'

jest.mock('@/api/me', () => ({ updateMe: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/imageUpload', () => ({ ...jest.requireActual('@/lib/imageUpload'), pickImages: jest.fn(), uploadPhoto: jest.fn(), deleteUploaded: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}` }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ isFocused: () => true }),
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, []),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const imageUpload = jest.requireMock('@/lib/imageUpload')
const mockPick: jest.Mock = imageUpload.pickImages
const mockUpload: jest.Mock = imageUpload.uploadPhoto
const mockDelete: jest.Mock = imageUpload.deleteUploaded
const mockUpdateMe: jest.Mock = jest.requireMock('@/api/me').updateMe
const mockUseSession: jest.Mock = jest.requireMock('@/auth/session').useSession
let alertSpy: jest.SpyInstance
const mockUpdate = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)

const me = { id: 'u1', email: 'ana@example.com', role: 'customer', firstName: 'Ana', middleName: null, lastName: 'Cruz', suffix: null, fullName: 'Ana Cruz', avatarUrl: null, birthday: null, gender: null, createdAt: null }
const withPhoto = { ...me, avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u1/old.jpg?v=1' }
const session = (profile: object = me) => mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } }, profile, loading: false, error: null, retry: jest.fn(), update: mockUpdate, signOut: mockSignOut })
const photo = (over = {}) => ({ uri: 'file:///c/new.jpg', name: 'new.jpg', ext: 'jpg', type: 'image/jpeg', size: 1000, ...over })

// The sheet's actions run once it has closed; on Android that is at once.
const choose = async (id: string) => {
  await fireEvent.press(screen.getByTestId('avatar-edit'))
  await fireEvent.press(screen.getByTestId(id))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350)) // Android waits for the sheet's fade before opening a picker
  })
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve() // the pick, the upload and the save are chained promises
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.replaceProperty(Platform, 'OS', 'android')
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  session()
  mockPick.mockResolvedValue({ status: 'picked', photos: [photo()] })
  mockUpload.mockResolvedValue('https://x.supabase.co/storage/v1/object/public/avatars/u1/new.jpg')
  mockUpdateMe.mockResolvedValue({ ...me, avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u1/new.jpg?v=1' })
})
afterEach(() => jest.restoreAllMocks())

it('labels the avatar by what tapping it does', async () => {
  await render(<EditProfile />)
  expect(screen.getByTestId('avatar-edit').props.accessibilityLabel).toBe('Add profile photo')
  await screen.unmount()
  session(withPhoto)
  await render(<EditProfile />)
  expect(screen.getByTestId('avatar-edit').props.accessibilityLabel).toBe('Change profile photo')
})

it('offers Take Photo, Choose From Library and Cancel, and Remove Photo only when there is a photo', async () => {
  await render(<EditProfile />)
  await fireEvent.press(screen.getByTestId('avatar-edit'))
  expect(screen.getByTestId('photo-camera')).toBeTruthy()
  expect(screen.getByTestId('photo-library')).toBeTruthy()
  expect(screen.getByTestId('sheet-cancel')).toBeTruthy()
  expect(screen.queryByTestId('photo-remove')).toBeNull()
  await screen.unmount()
  session(withPhoto)
  await render(<EditProfile />)
  await fireEvent.press(screen.getByTestId('avatar-edit'))
  expect(screen.getByTestId('photo-remove')).toBeTruthy()
})

it('uploads a picked photo to the avatars bucket, saves the versioned URL, refreshes the profile and cleans up', async () => {
  session(withPhoto)
  await render(<EditProfile />)
  await choose('photo-library')
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///c/new.jpg' }), expect.objectContaining({ userId: 'u1', bucket: 'avatars' }))
  expect(mockUpdateMe).toHaveBeenCalledWith({ avatarUrl: expect.stringMatching(/avatars\/u1\/new\.jpg\?v=\d+$/) }, expect.anything())
  expect(mockToast).toHaveBeenCalledWith('Profile photo updated')
  expect(mockDelete).toHaveBeenCalledWith(withPhoto.avatarUrl, 'u1', 'avatars')
})

it('rejects a wrong type and an oversize photo with a specific message and uploads nothing', async () => {
  await render(<EditProfile />)
  mockPick.mockResolvedValueOnce({ status: 'picked', photos: [photo({ name: 'a.gif', ext: 'gif', type: 'image/gif' })] })
  await choose('photo-library')
  expect(screen.getByTestId('avatar-problem')).toHaveTextContent("a.gif wasn't added. Only JPG, PNG or WebP photos work, so choose a different photo.")
  mockPick.mockResolvedValueOnce({ status: 'picked', photos: [photo({ size: 7 * 1024 * 1024 })] })
  await choose('photo-library')
  expect(screen.getByTestId('avatar-problem')).toHaveTextContent(/It is 7.0 MB and the limit is 5 MB, so choose a smaller photo./)
  expect(mockUpload).not.toHaveBeenCalled()
})

it('shows the percent while uploading, holds the form still, and cancels on request', async () => {
  let report: (percent: number) => void = () => {}
  let abort: () => void = () => {}
  mockUpload.mockImplementation((_photo, { onProgress, signal }) => {
    report = onProgress
    return new Promise((_resolve, reject) => {
      abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      signal.addEventListener('abort', abort)
    })
  })
  await render(<EditProfile />)
  await choose('photo-library')
  await act(async () => report(42))
  expect(screen.getByTestId('avatar-progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 })
  expect(screen.getByText('42%')).toBeTruthy()
  expect(screen.getByTestId('edit-first-name').props.editable).toBe(false)
  expect(screen.getByTestId('avatar-edit').props.accessibilityState.disabled).toBe(true)
  expect(screen.getByTestId('edit-save').props.accessibilityState.disabled).toBe(true)
  await fireEvent.press(screen.getByTestId('avatar-cancel'))
  expect(mockToast).toHaveBeenCalledWith('Photo upload cancelled')
  expect(mockUpdateMe).not.toHaveBeenCalled()
  expect(screen.getByTestId('edit-first-name').props.editable).toBe(true)
})

it('a failed upload toasts what happened with a Retry that uploads again', async () => {
  mockUpload.mockRejectedValueOnce(new UploadError('network'))
  await render(<EditProfile />)
  await choose('photo-library')
  const [message, options] = mockToast.mock.calls.at(-1)
  expect(message).toMatch(/connection dropped.*Check your connection/)
  expect(options.action.label).toBe('Retry')
  await act(async () => options.action.onPress())
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  expect(mockUpload).toHaveBeenCalledTimes(2)
})

it('a failed save after a good upload retries the save without uploading twice', async () => {
  mockUpdateMe.mockRejectedValueOnce(new ApiError('server'))
  await render(<EditProfile />)
  await choose('photo-library')
  const [message, options] = mockToast.mock.calls.at(-1)
  expect(message).toMatch(/We couldn't save your photo/)
  await act(async () => options.action.onPress())
  await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
  expect(mockUpload).toHaveBeenCalledTimes(1)
})

it('signs out when the session is no longer valid', async () => {
  mockUpload.mockRejectedValueOnce(new UploadError('unauthorized'))
  await render(<EditProfile />)
  await choose('photo-library')
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  expect(mockSignOut).toHaveBeenCalled()
})

it('explains a refused camera permission and offers Open Settings', async () => {
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
  mockPick.mockResolvedValueOnce({ status: 'denied' })
  await render(<EditProfile />)
  await choose('photo-camera')
  expect(alertSpy).toHaveBeenCalledWith('Camera access is off', expect.stringMatching(/Turn on camera access in Settings/), expect.any(Array))
  const buttons: AlertButton[] = alertSpy.mock.calls.at(-1)?.[2] ?? []
  await act(async () => buttons.find((b) => b.text === 'Open Settings')?.onPress?.())
  expect(open).toHaveBeenCalled()
  expect(mockUpload).not.toHaveBeenCalled()
})

it('says so when the picker cannot open, and does nothing on a cancel', async () => {
  await render(<EditProfile />)
  mockPick.mockResolvedValueOnce({ status: 'failed' })
  await choose('photo-library')
  expect(mockToast).toHaveBeenCalledWith("Couldn't open your photo library. Try again.")
  mockPick.mockResolvedValueOnce({ status: 'cancelled' })
  await choose('photo-library')
  expect(mockUpload).not.toHaveBeenCalled()
})

it('removes the photo only after the confirmation', async () => {
  session(withPhoto)
  mockUpdateMe.mockResolvedValue({ ...me })
  await render(<EditProfile />)
  await choose('photo-remove')
  expect(alertSpy).toHaveBeenCalledWith('Are you sure?', expect.any(String), expect.any(Array))
  expect(mockUpdateMe).not.toHaveBeenCalled()
  const buttons: AlertButton[] = alertSpy.mock.calls.at(-1)?.[2] ?? []
  expect(buttons.find((b) => b.text === 'Remove Photo')?.style).toBe('destructive')
  await act(async () => buttons.find((b) => b.text === 'Remove Photo')?.onPress?.())
  expect(mockUpdateMe).toHaveBeenCalledWith({ avatarUrl: null }, expect.anything())
  expect(mockToast).toHaveBeenCalledWith('Profile photo removed')
  expect(mockDelete).toHaveBeenCalledWith(withPhoto.avatarUrl, 'u1', 'avatars')
})
