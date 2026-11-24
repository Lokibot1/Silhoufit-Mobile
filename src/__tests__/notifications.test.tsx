import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import NotificationsScreen from '../app/(tabs)/notifications'

jest.mock('@/api/notifications', () => ({
  ...jest.requireActual('@/api/notifications'),
  fetchNotifications: jest.fn(),
  fetchUnreadCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}))
jest.mock('@/lib/notificationPrefs', () => ({ popupsOn: () => true, soundOn: () => true }))
jest.mock('@/auth/session', () => ({ useSession: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual('react').useEffect(() => effect(), [effect]),
}))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const api = jest.requireMock('@/api/notifications')
const mockUseSession = jest.requireMock('@/auth/session').useSession
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router

const signedIn = { session: { user: { id: 'u1' } }, loading: false, signOut: jest.fn() }
const note = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'ORDER_PAID',
  title: `Title ${id}`,
  body: `Body ${id}`,
  data: { orderId: `order-${id}` },
  readAt: null,
  createdAt: '2026-11-14T05:49:00.000Z',
  ...over,
})
const pageOf = (items: ReturnType<typeof note>[], hasNextPage = false) => ({ items, total: items.length, page: 1, hasNextPage })

beforeEach(() => {
  jest.clearAllMocks() // not reset: that would wipe the AppState mock the live poll subscribes through
  for (const fn of [api.fetchNotifications, api.fetchUnreadCount, api.markNotificationRead, api.markAllNotificationsRead]) fn.mockReset()
  mockUseSession.mockReturnValue(signedIn)
  api.fetchUnreadCount.mockResolvedValue(1)
  api.markNotificationRead.mockResolvedValue(undefined)
  api.markAllNotificationsRead.mockResolvedValue(undefined)
})

it('shows the skeleton, then the rows with title, body and time, loading page 1 of all notifications', async () => {
  let resolve: (page: unknown) => void = () => {}
  api.fetchNotifications.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<NotificationsScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  await act(async () => resolve(pageOf([note('a')])))
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByText('Title a')).toBeTruthy()
  expect(screen.getByText('Body a')).toBeTruthy()
  expect(screen.getByText('Nov 14, 2026, 1:49 PM')).toBeTruthy()
  expect(api.fetchNotifications).toHaveBeenCalledWith({ page: 1, unreadOnly: false }, expect.any(AbortSignal))
})

it('shows the sign-in prompt when signed out, and reads nothing', async () => {
  mockUseSession.mockReturnValue({ ...signedIn, session: null })
  await render(<NotificationsScreen />)
  expect(screen.getByText('Sign in to see your order updates')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-sign-in'))
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchNotifications).not.toHaveBeenCalled()
  expect(api.fetchUnreadCount).not.toHaveBeenCalled()
})

it('marks unread rows with a dot and an Unread label, not read ones', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a'), note('b', { readAt: '2026-11-14T06:00:00.000Z' })]))
  await render(<NotificationsScreen />)
  expect((await screen.findByTestId('notification-row-a')).props.accessibilityLabel).toMatch(/^Unread, Title a, Body a, /)
  expect(screen.getByTestId('notification-row-b').props.accessibilityLabel).not.toMatch(/Unread/)
  expect(screen.getAllByTestId('notification-unread')).toHaveLength(1)
})

it('opens the order and marks the row read when it is tapped, once even on a double tap', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  await render(<NotificationsScreen />)
  const row = await screen.findByTestId('notification-row-a')
  await fireEvent.press(row)
  await fireEvent.press(row)
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'order-a' } })
  expect(api.markNotificationRead).toHaveBeenCalledWith('a')
  expect(screen.queryByTestId('notification-unread')).toBeNull()
})

it('rolls the row back and toasts when marking read fails', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  api.markNotificationRead.mockRejectedValue(new ApiError('network'))
  await render(<NotificationsScreen />)
  await fireEvent.press(await screen.findByTestId('notification-row-a'))
  expect(mockToast).toHaveBeenCalledWith("We couldn't mark that notification as read. Check your connection, then open it again.")
  expect(screen.getByTestId('notification-unread')).toBeTruthy()
  expect(screen.getByTestId('notifications-filter-unread').props.accessibilityLabel).toBe('Unread, 1 notification')
})

it('a row without an order only marks it read', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a', { data: null })]))
  await render(<NotificationsScreen />)
  await fireEvent.press(await screen.findByTestId('notification-row-a'))
  expect(api.markNotificationRead).toHaveBeenCalledWith('a')
  expect(mockPush).not.toHaveBeenCalled()
})

it('opens Messages and marks a messaging block read when tapped, once even on a double tap', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a', { type: 'MESSAGING_BLOCKED', data: { blocked: true, reason: 'Spam' } })]))
  await render(<NotificationsScreen />)
  const row = await screen.findByTestId('notification-row-a')
  await fireEvent.press(row)
  await fireEvent.press(row)
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith('/messages')
  expect(api.markNotificationRead).toHaveBeenCalledWith('a')
})

it('keeps a read messaging unblock tappable', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a', { type: 'MESSAGING_UNBLOCKED', data: null, readAt: '2026-11-14T06:00:00.000Z' })]))
  await render(<NotificationsScreen />)
  expect((await screen.findByTestId('notification-row-a')).props.accessibilityState?.disabled).toBeFalsy()
})

it('shows the unread count on the filter chip, and the unread filter asks for unreadOnly=true', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-a')
  expect(screen.getByText('Unread (1)')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-filter-unread'))
  await screen.findByTestId('notification-row-a')
  expect(api.fetchNotifications).toHaveBeenLastCalledWith({ page: 1, unreadOnly: true }, expect.any(AbortSignal))
  expect(screen.getByTestId('notifications-filter-unread').props.accessibilityState).toMatchObject({ selected: true })
})

it('marks all read with a toast, and rolls back with a toast on failure', async () => {
  api.fetchNotifications.mockResolvedValue(pageOf([note('a')]))
  api.markAllNotificationsRead.mockRejectedValueOnce(new ApiError('network'))
  await render(<NotificationsScreen />)
  await fireEvent.press(await screen.findByTestId('notifications-mark-all'))
  expect(mockToast).toHaveBeenCalledWith("We couldn't mark your notifications as read. Check your connection, then try again.")
  expect(screen.getByTestId('notification-unread')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-mark-all'))
  expect(mockToast).toHaveBeenLastCalledWith('All notifications marked as read.')
  expect(screen.queryByTestId('notification-unread')).toBeNull()
  expect(screen.queryByTestId('notifications-mark-all')).toBeNull()
})

it('shows the empty state, whose action goes to the Shop', async () => {
  api.fetchUnreadCount.mockResolvedValue(0)
  api.fetchNotifications.mockResolvedValue(pageOf([]))
  await render(<NotificationsScreen />)
  expect(await screen.findByText('No notifications yet')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-empty-action'))
  expect(mockNavigate).toHaveBeenCalledWith('/')
})

it('shows "You\'re all caught up" for an empty unread filter, and Show All goes back', async () => {
  api.fetchUnreadCount.mockResolvedValue(0)
  api.fetchNotifications.mockResolvedValueOnce(pageOf([note('a', { readAt: '2026-11-14T06:00:00.000Z' })])).mockResolvedValueOnce(pageOf([])).mockResolvedValue(pageOf([note('a')]))
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-a')
  await fireEvent.press(screen.getByTestId('notifications-filter-unread'))
  expect(await screen.findByText("You're all caught up")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-show-all'))
  expect(await screen.findByTestId('notification-row-a')).toBeTruthy()
})

it('shows the error with Try again, and retrying loads the notifications', async () => {
  api.fetchNotifications.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(pageOf([note('a')]))
  await render(<NotificationsScreen />)
  expect(await screen.findByText('The connection dropped before the notifications loaded. Check your connection, then try again.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('notifications-retry'))
  expect(await screen.findByTestId('notifications-list')).toBeTruthy()
})

it('tells a 401 to sign in again', async () => {
  api.fetchNotifications.mockRejectedValue(new ApiError('forbidden', undefined, 401))
  await render(<NotificationsScreen />)
  expect(await screen.findByText(/Sign in again, then come back/)).toBeTruthy()
})

it('after a 429 the retry counts down the Retry-After before it can be pressed', async () => {
  jest.useFakeTimers()
  try {
    api.fetchNotifications.mockRejectedValueOnce(new ApiError('rate-limit', undefined, 429, undefined, 3000)).mockResolvedValue(pageOf([note('a')]))
    await render(<NotificationsScreen />)
    await act(async () => {})
    expect(screen.getByText('Try again in 3s')).toBeTruthy()
    expect(screen.getByTestId('notifications-retry').props.accessibilityState).toMatchObject({ disabled: true })
    for (let i = 0; i < 3; i++) await act(async () => void (await jest.advanceTimersByTimeAsync(1000)))
    expect(screen.getByText('Try again')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('notifications-retry'))
    await act(async () => {})
    expect(screen.getByTestId('notifications-list')).toBeTruthy()
  } finally {
    jest.useRealTimers()
  }
})

it('Show More loads the next page and appends it', async () => {
  api.fetchNotifications.mockResolvedValueOnce(pageOf([note('a')], true)).mockResolvedValueOnce(pageOf([note('b')]))
  await render(<NotificationsScreen />)
  await fireEvent.press(await screen.findByTestId('notifications-more'))
  expect(await screen.findByTestId('notification-row-b')).toBeTruthy()
  expect(screen.getByTestId('notification-row-a')).toBeTruthy()
  expect(api.fetchNotifications).toHaveBeenLastCalledWith({ page: 2, unreadOnly: false }, expect.any(AbortSignal))
  expect(screen.queryByTestId('notifications-more')).toBeNull()
})

it('a failed pull to refresh keeps the rows and toasts', async () => {
  api.fetchNotifications.mockResolvedValueOnce(pageOf([note('a')])).mockRejectedValueOnce(new ApiError('network'))
  await render(<NotificationsScreen />)
  await screen.findByTestId('notification-row-a')
  await act(async () => screen.getByTestId('notifications-list').props.onRefresh())
  expect(mockToast).toHaveBeenCalledWith("Can't reach the server. Check your connection and try again.")
  expect(screen.getByTestId('notification-row-a')).toBeTruthy()
  expect(screen.getByTestId('notifications-list').props.refreshing).toBe(false)
})

it('reads the first page again when the polled count changes', async () => {
  jest.useFakeTimers()
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
  try {
    api.fetchUnreadCount.mockResolvedValueOnce(1).mockResolvedValue(2)
    api.fetchNotifications.mockResolvedValueOnce(pageOf([note('a')])).mockResolvedValue(pageOf([note('b'), note('a')]))
    await render(<NotificationsScreen />)
    await act(async () => {})
    expect(screen.queryByTestId('notification-row-b')).toBeNull()
    await act(async () => void (await jest.advanceTimersByTimeAsync(20_000)))
    expect(screen.getByTestId('notification-row-b')).toBeTruthy()
    expect(screen.getByText('Unread (2)')).toBeTruthy()
  } finally {
    jest.restoreAllMocks()
    jest.useRealTimers()
  }
})
