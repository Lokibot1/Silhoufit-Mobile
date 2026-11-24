import { act, render } from '@testing-library/react-native'

import { useNotifications } from '../useNotifications'

jest.mock('../notifications', () => ({
  ...jest.requireActual('../notifications'),
  fetchNotifications: jest.fn(),
  fetchUnreadCount: jest.fn(),
}))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/sound', () => ({ playNotification: jest.fn() }))
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn() } }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('../notifications')
const { playNotification } = jest.requireMock('@/lib/sound')
const { push } = jest.requireMock('expo-router').router
const mockUseSession = jest.requireMock('@/auth/session').useSession

const note = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'ORDER_PAID', title: `Title ${id}`, body: `Body ${id}`, data: { orderId: `order-${id}` }, readAt: null, createdAt: '2026-11-14T05:49:00.000Z', ...over })
const pageOf = (items: ReturnType<typeof note>[]) => ({ items, total: items.length, page: 1, hasNextPage: false })

function Probe(options: Parameters<typeof useNotifications>[0]) {
  useNotifications(options)
  return null
}
// The first count lands on mount; the second on the next poll.
async function poll(counts: number[], options: Parameters<typeof useNotifications>[0] = { list: false, announce: true }) {
  api.fetchUnreadCount.mockReset()
  for (const c of counts) api.fetchUnreadCount.mockResolvedValueOnce(c)
  api.fetchUnreadCount.mockResolvedValue(counts[counts.length - 1])
  await render(<Probe {...options} />)
  await act(async () => {})
  await act(async () => void (await jest.advanceTimersByTimeAsync(20_000)))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
  api.fetchNotifications.mockReset()
  mockUseSession.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false, signOut: jest.fn() })
})
afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

it('toasts the newest unread one with title, tone, the rest counted and a View action, then chimes once', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('b'), note('a')]))
  await poll([1, 3])
  expect(api.fetchNotifications).toHaveBeenCalledWith({ page: 1, unreadOnly: true }, expect.anything())
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Body b and 1 more', { title: 'Title b', tone: 'success', action: { label: 'View', onPress: expect.any(Function) } })
  mockToast.mock.calls[0][1].action.onPress()
  expect(push).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'order-b' } })
  expect(playNotification).toHaveBeenCalledTimes(1)
})

it('opens Messages for a messaging notice', async () => {
  api.fetchNotifications.mockResolvedValueOnce(pageOf([note('m', { type: 'MESSAGING_BLOCKED' })]))
  await poll([1, 2])
  expect(mockToast).toHaveBeenCalledWith('Body m', expect.objectContaining({ tone: 'danger' }))
  mockToast.mock.calls[0][1].action.onPress()
  expect(push).toHaveBeenCalledWith('/messages')
})

it('has no View action for a notification that names no order', async () => {
  api.fetchNotifications.mockResolvedValueOnce(pageOf([note('x', { type: 'SOMETHING', data: null })]))
  await poll([0, 1])
  expect(mockToast).toHaveBeenCalledWith('Body x', { title: 'Title x', tone: 'info', action: undefined })
})

it('stays quiet on the first read', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  api.fetchUnreadCount.mockResolvedValue(5)
  await render(<Probe list={false} announce />)
  await act(async () => {})
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})

it('stays quiet when the count drops', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  await poll([3, 1])
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})

it('shows nothing when the newest one cannot be fetched', async () => {
  api.fetchNotifications.mockRejectedValue(new Error('network'))
  await poll([1, 2])
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})

it('stays quiet for the Notifications screen list instance', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  await poll([1, 2], { list: true, announce: true })
  expect(mockToast).not.toHaveBeenCalled()
  expect(playNotification).not.toHaveBeenCalled()
})

it('stays quiet without the announce option', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  await poll([1, 2], { list: false })
  expect(mockToast).not.toHaveBeenCalled()
})
