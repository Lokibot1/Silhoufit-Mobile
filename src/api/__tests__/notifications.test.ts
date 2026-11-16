import { ApiError, request } from '@/lib/api'

import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationOrderId, onNotificationsChanged, toNotification } from '../notifications'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  type: 'ORDER_PAID',
  title: 'Payment received',
  body: 'Your order SHF-1 was paid.',
  data: { orderId: 'o1' },
  readAt: null,
  createdAt: '2026-11-14T05:49:00.000Z',
  ...over,
})

describe('toNotification', () => {
  it('parses a valid notification', () => {
    expect(toNotification(raw())).toEqual(raw())
  })
  it('coerces missing optional fields', () => {
    expect(toNotification(raw({ type: undefined, body: undefined, data: [1], readAt: undefined }))).toMatchObject({ type: '', body: null, data: null, readAt: null })
  })
  it.each([['null', null], ['a string', 'x'], ['no id', raw({ id: undefined })], ['no title', raw({ title: '' })], ['no time', raw({ createdAt: 5 })]])('drops %s', (_, value) => {
    expect(toNotification(value)).toBeNull()
  })
  it('finds the order a notification names', () => {
    expect(notificationOrderId(toNotification(raw())!)).toBe('o1')
    expect(notificationOrderId(toNotification(raw({ data: null }))!)).toBeNull()
    expect(notificationOrderId(toNotification(raw({ data: { orderId: 7 } }))!)).toBeNull()
  })
})

describe('requests', () => {
  beforeEach(() => mockRequest.mockReset())

  it('GETs a page of 20 and drops a bad entry', async () => {
    mockRequest.mockResolvedValue({ data: [raw(), { id: 'x' }], meta: { total: 2, hasNextPage: true } })
    const signal = new AbortController().signal
    expect(await fetchNotifications({ page: 2, unreadOnly: false }, signal)).toEqual({ items: [raw()], total: 2, page: 2, hasNextPage: true })
    expect(mockRequest).toHaveBeenCalledWith('GET', '/notifications?page=2&limit=20', undefined, signal)
  })
  it('asks for unread only with unreadOnly=true', async () => {
    mockRequest.mockResolvedValue({ data: [] })
    await fetchNotifications({ page: 1, unreadOnly: true })
    expect(mockRequest).toHaveBeenCalledWith('GET', '/notifications?page=1&limit=20&unreadOnly=true', undefined, undefined)
  })
  it('throws a server error on a body without a data array', async () => {
    mockRequest.mockResolvedValue({ meta: {} })
    await expect(fetchNotifications({ page: 1, unreadOnly: false })).rejects.toMatchObject({ kind: 'server' })
  })
  it('lets a 429 through with its Retry-After', async () => {
    mockRequest.mockRejectedValue(new ApiError('rate-limit', undefined, 429, undefined, 30_000))
    await expect(fetchNotifications({ page: 1, unreadOnly: false })).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 30_000 })
  })
  it('reads the unread count', async () => {
    mockRequest.mockResolvedValue({ count: 4 })
    expect(await fetchUnreadCount()).toBe(4)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/notifications/unread-count', undefined, undefined)
  })
  it.each([[{}], [{ count: '4' }], [{ count: NaN }], [null]])('rejects the count body %j', async (body) => {
    mockRequest.mockResolvedValue(body)
    await expect(fetchUnreadCount()).rejects.toMatchObject({ kind: 'server' })
  })
  it('POSTs read and read-all, and tells the listeners only on success', async () => {
    const run = jest.fn()
    const off = onNotificationsChanged(run)
    mockRequest.mockResolvedValue({})
    await markNotificationRead('a/b')
    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/notifications/a%2Fb/read')
    await markAllNotificationsRead()
    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/notifications/read-all')
    expect(run).toHaveBeenCalledTimes(2)
    mockRequest.mockRejectedValue(new ApiError('network'))
    await expect(markNotificationRead('a')).rejects.toBeInstanceOf(ApiError)
    expect(run).toHaveBeenCalledTimes(2)
    off()
    mockRequest.mockResolvedValue({})
    await markAllNotificationsRead()
    expect(run).toHaveBeenCalledTimes(2)
  })
})
