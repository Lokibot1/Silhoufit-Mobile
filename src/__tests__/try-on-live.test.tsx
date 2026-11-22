import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'

import LiveTryOn from '../app/product/try-on/live/[id]'

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdref.supabase.co'

jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native')
  const { useImperativeHandle } = jest.requireActual('react')
  return {
    WebView: ({ ref, ...props }: { ref?: never }) => {
      useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }))
      return <View {...props} />
    },
  }
})
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { refreshSession: jest.fn() } } }))
jest.mock('@/lib/site', () => ({ SITE: 'https://site.test', openExternal: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/ui/ThemeProvider', () => ({ useScheme: () => 'dark' }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}))

const mockToast = jest.fn()
const mockInject = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockPermission: jest.Mock = jest.requireMock('expo-image-picker').requestCameraPermissionsAsync
const mockRefresh: jest.Mock = jest.requireMock('@/lib/supabase').supabase.auth.refreshSession
const mockOpen: jest.Mock = jest.requireMock('@/lib/site').openExternal
const mockSession: jest.Mock = jest.requireMock('@/auth/session').useSession
const mockParams: jest.Mock = jest.requireMock('expo-router').useLocalSearchParams
const { router } = jest.requireMock('expo-router')

const REFRESH_TOKEN = 'REAL-REFRESH-TOKEN'
const fresh = { access_token: 'ACCESS', refresh_token: REFRESH_TOKEN, user: { id: 'u1', email: 'a@b.test' } }
const profile = { email: 'a@b.test', fullName: 'Ana Cruz', firstName: 'Ana', lastName: 'Cruz', avatarUrl: null }
const web = () => screen.getByTestId('live-web')
const consent = async () => {
  await render(<LiveTryOn />)
  await fireEvent.press(screen.getByTestId('live-start'))
}
const openPage = async () => {
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true })
  await consent()
  await waitFor(() => web())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.mockReturnValue({ id: 'p1', color: 'Navy Blue' })
  mockSession.mockReturnValue({ session: { user: { id: 'u1' } }, profile, loading: false, signOut: mockSignOut })
  mockRefresh.mockResolvedValue({ data: { session: fresh }, error: null })
  mockOpen.mockResolvedValue(undefined)
})

it('mounts nothing and asks for nothing before consent, and Not Now closes', async () => {
  await render(<LiveTryOn />)
  expect(screen.getByText(/never uploaded or recorded/)).toBeTruthy()
  expect(mockPermission).not.toHaveBeenCalled()
  expect(mockRefresh).not.toHaveBeenCalled()
  expect(screen.queryByTestId('live-web')).toBeNull()
  await fireEvent.press(screen.getByTestId('live-not-now'))
  expect(router.back).toHaveBeenCalled()
})

it('the Close button is labelled and goes back', async () => {
  await render(<LiveTryOn />)
  await fireEvent.press(screen.getByLabelText('Close live try-on'))
  expect(router.back).toHaveBeenCalled()
})

it('sends a signed-out visitor to sign-in', async () => {
  mockSession.mockReturnValue({ session: null, profile: null, loading: false, signOut: mockSignOut })
  await render(<LiveTryOn />)
  expect(router.replace).toHaveBeenCalledWith('/sign-in')
})

it('denied but can ask again offers Allow Camera, which asks again', async () => {
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: true })
  await consent()
  expect(await screen.findByText('Camera access is off')).toBeTruthy()
  expect(screen.queryByText('Open Settings')).toBeNull()
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true })
  await fireEvent.press(screen.getByTestId('live-allow'))
  await waitFor(() => web())
  expect(mockPermission).toHaveBeenCalledTimes(2)
})

it('blocked offers Open Settings, and Try On Without Camera still opens the page', async () => {
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
  mockPermission.mockResolvedValue({ granted: false, canAskAgain: false })
  await consent()
  await fireEvent.press(await screen.findByTestId('live-settings'))
  expect(settings).toHaveBeenCalled()
  expect(screen.queryByText('Allow Camera')).toBeNull()
  await fireEvent.press(screen.getByTestId('live-no-camera'))
  await waitFor(() => web())
})

it('a refused session refresh toasts, signs out and goes to sign-in', async () => {
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true })
  mockRefresh.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', message: 'bad' } })
  mockOpen.mockResolvedValue(undefined)
  await consent()
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/sign-in'))
  expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
  expect(mockSignOut).toHaveBeenCalled()
  expect(screen.queryByTestId('live-web')).toBeNull()
})

it('being offline during the refresh keeps the user signed in and offers Retry', async () => {
  mockPermission.mockResolvedValue({ granted: true, canAskAgain: true })
  mockRefresh.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'x' } })
  await consent()
  expect(await screen.findByText("Couldn't load the try-on")).toBeTruthy()
  expect(mockSignOut).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('live-retry'))
  await waitFor(() => web())
})

describe('the page', () => {
  it('is locked down and loads the try-on URL with the colour', async () => {
    await openPage()
    expect(web().props.source).toEqual({ uri: 'https://site.test/shop/p1/try-on?color=Navy%20Blue' })
    expect(web().props.originWhitelist).toEqual(['https://site.test'])
    expect(web().props.mediaCapturePermissionGrantType).toBe('grantIfSameHostElsePrompt')
    expect(web().props.allowFileAccess).toBe(false)
    expect(web().props.mixedContentMode).toBe('never')
    expect(web().props.incognito).toBeUndefined()
  })

  it('omits the colour when there is none', async () => {
    mockParams.mockReturnValue({ id: 'p1' })
    await openPage()
    expect(web().props.source.uri).toBe('https://site.test/shop/p1/try-on')
  })

  it('hands the login in with a blank refresh token, only on the site origin', async () => {
    await openPage()
    const script: string = web().props.injectedJavaScriptBeforeContentLoaded
    expect(script).not.toContain(REFRESH_TOKEN)
    expect(script).not.toContain('silhoufit-cookie-consent')
    const run = (origin: string) => {
      const store: Record<string, string> = {}
      new Function('location', 'localStorage', script)({ origin }, { setItem: (k: string, v: string) => (store[k] = v) })
      return store
    }
    expect(run('https://evil.test')).toEqual({})
    const store = run('https://site.test')
    expect(Object.keys(store).sort()).toEqual(['sb-abcdref-auth-token', 'silhoufit-session', 'silhoufit-theme'])
    const auth = JSON.parse(store['sb-abcdref-auth-token'])
    expect(auth.access_token).toBe('ACCESS')
    expect(auth.refresh_token).toBe('')
    expect(JSON.parse(store['silhoufit-session'])).toEqual({ name: 'Ana Cruz', email: 'a@b.test', role: 'customer' })
    expect(store['silhoufit-theme']).toBe('dark')
  })

  it.each([
    ['https://site.test/shop/p1/try-on', true],
    ['https://other.test/x', false],
    ['http://other.test/x', false],
    ['intent://scan#Intent;scheme=zxing;end', false],
    ['market://details?id=x', false],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
  ])('navigation to %s allowed: %s', async (url, ok) => {
    await openPage()
    expect(web().props.onShouldStartLoadWithRequest({ url })).toBe(ok)
  })

  it('opens another https site in the system browser, and nothing else', async () => {
    mockOpen.mockResolvedValue(undefined)
    await openPage()
    web().props.onShouldStartLoadWithRequest({ url: 'https://other.test/x' })
    web().props.onShouldStartLoadWithRequest({ url: 'http://other.test/x' })
    web().props.onShouldStartLoadWithRequest({ url: 'javascript:alert(1)' })
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledWith('https://other.test/x')
  })

  it('a /login page shows the timed-out card and Reopen loads it again', async () => {
    await openPage()
    await act(async () => web().props.onNavigationStateChange({ url: 'https://site.test/login' }))
    expect(screen.getByText('Your try-on session timed out')).toBeTruthy()
    expect(screen.queryByTestId('live-web')).toBeNull()
    await fireEvent.press(screen.getByTestId('live-reopen'))
    await waitFor(() => web())
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it('the shop page closes it', async () => {
    await openPage()
    await act(async () => web().props.onNavigationStateChange({ url: 'https://site.test/shop/p1' }))
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it('the measurements page closes it and opens the body profile', async () => {
    await openPage()
    await act(async () => web().props.onNavigationStateChange({ url: 'https://site.test/profile/measurements' }))
    expect(router.back).toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledWith('/profile/body')
  })

  it('leaves other pages alone', async () => {
    await openPage()
    await act(async () => web().props.onNavigationStateChange({ url: 'https://site.test/shop/p1/try-on?color=Navy' }))
    expect(router.back).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('shows the loading overlay until the load ends', async () => {
    await openPage()
    expect(screen.getByText('Loading live try-on…')).toBeTruthy()
    await act(async () => web().props.onLoadEnd())
    expect(screen.queryByText('Loading live try-on…')).toBeNull()
  })

  it.each(['onError', 'onHttpError'])('%s shows the error, and Retry loads again', async (handler) => {
    await openPage()
    await act(async () => web().props[handler]())
    expect(screen.getByText("Couldn't load the try-on")).toBeTruthy()
    await fireEvent.press(screen.getByTestId('live-retry'))
    await waitFor(() => expect(screen.queryByText("Couldn't load the try-on")).toBeNull())
    expect(mockRefresh).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Loading live try-on…')).toBeTruthy()
  })

  it('shows the error when nothing loads within 20 seconds', async () => {
    jest.useFakeTimers()
    await openPage()
    await act(async () => void (await jest.advanceTimersByTimeAsync(20_000)))
    expect(screen.getByText("Couldn't load the try-on")).toBeTruthy()
    jest.useRealTimers()
  })

  it('signing out while open wipes the page login and goes to sign-in', async () => {
    await openPage()
    mockSession.mockReturnValue({ session: null, profile: null, loading: false, signOut: mockSignOut })
    await screen.rerender(<LiveTryOn />)
    expect(router.replace).toHaveBeenCalledWith('/sign-in')
    expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('silhoufit-session'))
  })
})
