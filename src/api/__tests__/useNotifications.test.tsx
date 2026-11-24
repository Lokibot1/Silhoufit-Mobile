import { act, render } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { useNotifications } from '../useNotifications'

jest.mock('../notifications', () => ({
  ...jest.requireActual('../notifications'),
  fetchNotifications: jest.fn(),
  fetchUnreadCount: jest.fn(),
  subscribeToNotifications: jest.fn(),
}))
jest.mock('@/lib/useLivePoll', () => ({ useLivePoll: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/notificationPrefs', () => ({ popupsOn: jest.fn(() => true), soundOn: jest.fn(() => true) }))
jest.mock('@/lib/sound', () => ({ playNotification: jest.fn() }))
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn() } }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('../notifications')
const { useLivePoll } = jest.requireMock('@/lib/useLivePoll')
const { playNotification } = jest.requireMock('@/lib/sound')
const prefs = jest.requireMock('@/lib/notificationPrefs') as Record<'popupsOn' | 'soundOn', jest.Mock>
const { push } = jest.requireMock('expo-router').router
const mockUseSession = jest.requireMock('@/auth/session').useSession

const note = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'ORDER_PAID', title: `Title ${id}`, body: `Body ${id}`, data: { orderId: `order-${id}` }, readAt: null, createdAt: '2026-11-14T05:49:00.000Z', ...over })
const pageOf = (items: ReturnType<typeof note>[]) => ({ items, total: items.length, page: 1, hasNextPage: false })

function Probe(options: Parameters<typeof useNotifications>[0]) {
  useNotifications(options)
  return null
}

// Every channel the hook joined: the tests play the server through the latest one.
let channels: { onNotification: (n: unknown) => void; onStatus: (s: string) => void; stop: jest.Mock }[]
let appState: (state: string) => void
const current = () => channels[channels.length - 1]
const pollEnabled = () => useLivePoll.mock.calls[useLivePoll.mock.calls.length - 1][1].enabled
const broadcast = (...ids: string[]) => act(async () => ids.forEach((id) => current().onNotification(note(id))))
const settle = () => act(async () => void (await jest.advanceTimersByTimeAsync(300)))
async function mount(options: Parameters<typeof useNotifications>[0] = { list: false, announce: true }) {
  const view = await render(<Probe {...options} />)
  await act(async () => {})
  return view
}
const signedInAs = (id: string | null) => mockUseSession.mockReturnValue({ session: id ? { user: { id } } : null, loading: false, signOut: jest.fn() })

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  channels = []
  api.fetchNotifications.mockReset().mockResolvedValue(pageOf([]))
  api.fetchUnreadCount.mockReset().mockResolvedValue(1)
  api.subscribeToNotifications.mockReset().mockImplementation((onNotification: never, onStatus: never) => {
    const entry = { onNotification, onStatus, stop: jest.fn() }
    channels.push(entry)
    return entry.stop
  })
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (state: string) => void) => {
    appState = handler
    return { remove: jest.fn() }
  }) as never)
  prefs.popupsOn.mockReturnValue(true)
  prefs.soundOn.mockReturnValue(true)
  signedInAs('u1')
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('toasts a broadcast once with title, tone and a View action, and chimes once', async () => {
  await mount()
  await broadcast('a')
  expect(mockToast).not.toHaveBeenCalled()
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Body a', { title: 'Title a', tone: 'success', action: { label: 'View', onPress: expect.any(Function) } })
  mockToast.mock.calls[0][1].action.onPress()
  expect(push).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'order-a' } })
  expect(playNotification).toHaveBeenCalledTimes(1)
})

it('announces the same id once, also when it comes again in a later burst', async () => {
  await mount()
  await broadcast('a', 'a')
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Body a', expect.anything())
  await broadcast('a')
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(playNotification).toHaveBeenCalledTimes(1)
})

it('folds a burst into one toast for the newest, with the rest counted, and one chime', async () => {
  await mount()
  await act(async () => {
    current().onNotification(note('a', { createdAt: '2026-11-14T05:49:00.000Z' }))
    current().onNotification(note('b', { createdAt: '2026-11-14T05:50:00.000Z' }))
  })
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Body b and 1 more', expect.objectContaining({ title: 'Title b' }))
  expect(playNotification).toHaveBeenCalledTimes(1)
})

it('still chimes but shows no toast when pop-up alerts are off', async () => {
  prefs.popupsOn.mockReturnValue(false)
  await mount()
  await broadcast('a')
  await settle()
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).toHaveBeenCalledTimes(1)
})

it('toasts without a chime when the notification sound is off', async () => {
  prefs.soundOn.mockReturnValue(false)
  await mount()
  await broadcast('a')
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(playNotification).not.toHaveBeenCalled()
})

it('opens Messages for a messaging notice', async () => {
  await mount()
  await act(async () => current().onNotification(note('m', { type: 'MESSAGING_BLOCKED' })))
  await settle()
  expect(mockToast).toHaveBeenCalledWith('Body m', expect.objectContaining({ tone: 'danger' }))
  mockToast.mock.calls[0][1].action.onPress()
  expect(push).toHaveBeenCalledWith('/messages')
})

it('has no View action for a notification that names no order', async () => {
  await mount()
  await act(async () => current().onNotification(note('x', { type: 'SOMETHING', data: null })))
  await settle()
  expect(mockToast).toHaveBeenCalledWith('Body x', { title: 'Title x', tone: 'info', action: undefined })
})

it('stays quiet for the Notifications screen list instance and without the announce option, but still counts', async () => {
  await mount({ list: true, announce: true })
  await broadcast('a')
  await settle()
  await mount({ list: false })
  await broadcast('b')
  await settle()
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
  expect(api.fetchUnreadCount.mock.calls.length).toBeGreaterThan(2)
})

it('reads the count silently on every SUBSCRIBED, not on other statuses', async () => {
  await mount()
  const before = api.fetchUnreadCount.mock.calls.length
  await act(async () => current().onStatus('SUBSCRIBED'))
  await act(async () => current().onStatus('SUBSCRIBED'))
  expect(api.fetchUnreadCount).toHaveBeenCalledTimes(before + 2)
  await act(async () => current().onStatus('CHANNEL_ERROR'))
  expect(api.fetchUnreadCount).toHaveBeenCalledTimes(before + 2)
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})

it('polls only while the channel is not SUBSCRIBED', async () => {
  await mount()
  expect(pollEnabled()).toBe(true)
  await act(async () => current().onStatus('SUBSCRIBED'))
  expect(pollEnabled()).toBe(false)
  await act(async () => current().onStatus('TIMED_OUT'))
  expect(pollEnabled()).toBe(true)
})

it('closes the channel in the background and joins again when the app is active', async () => {
  await mount()
  await act(async () => current().onStatus('SUBSCRIBED'))
  await act(async () => appState('background'))
  expect(channels[0].stop).toHaveBeenCalledTimes(1)
  expect(pollEnabled()).toBe(true)
  await act(async () => appState('active'))
  expect(channels).toHaveLength(2)
})

it("joins the new user's channel after an account change and forgets what it announced", async () => {
  const view = await mount()
  await broadcast('a')
  await settle()
  signedInAs('u2')
  await view.rerender(<Probe list={false} announce />)
  await act(async () => {})
  expect(channels[0].stop).toHaveBeenCalledTimes(1)
  expect(channels).toHaveLength(2)
  await broadcast('a')
  await settle()
  expect(mockToast).toHaveBeenCalledTimes(2)
})

it('does not join while signed out', async () => {
  signedInAs(null)
  await mount()
  expect(api.subscribeToNotifications).not.toHaveBeenCalled()
  expect(pollEnabled()).toBe(false)
})

it('leaves the channel and drops a pending toast on unmount', async () => {
  const view = await mount()
  await broadcast('a')
  await view.unmount()
  expect(channels[0].stop).toHaveBeenCalledTimes(1)
  await settle()
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})
