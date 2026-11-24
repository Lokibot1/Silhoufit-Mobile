import { ApiError, request } from '@/lib/api'

import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationOpensMessages, notificationOrderId, notificationTone, onNotificationsChanged, subscribeToNotifications, toNotification } from '../notifications'
const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = { on: jest.fn(), subscribe: jest.fn() }
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, realtime: { setAuth: jest.fn(() => Promise.resolve()) }, channel: jest.fn(() => mockChannel), removeChannel: jest.fn(() => Promise.resolve('ok')) },
}))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock
const supabase = jest.requireMock('@/lib/supabase').supabase
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

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
  it('opens Messages for a messaging block or unblock only', () => {
    expect(notificationOpensMessages(toNotification(raw({ type: 'MESSAGING_BLOCKED', data: null }))!)).toBe(true)
    expect(notificationOpensMessages(toNotification(raw({ type: 'MESSAGING_UNBLOCKED' }))!)).toBe(true)
    expect(notificationOpensMessages(toNotification(raw({ type: 'ORDER_PAID' }))!)).toBe(false)
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

describe('notificationTone', () => {
  it.each([
    ['ORDER_PAID', 'success'],
    ['REFUND_SUCCEEDED', 'success'],
    ['MESSAGING_UNBLOCKED', 'success'],
    ['PRODUCT_LOW_STOCK', 'warning'],
    ['REFUND_ACTION_REQUIRED', 'warning'],
    ['PAYMENT_FAILED', 'danger'],
    ['ORDER_CANCELLED', 'danger'],
    ['PRODUCT_SOLD_OUT', 'danger'],
    ['MESSAGING_BLOCKED', 'danger'],
    ['ORDER_SHIPPED', 'info'],
    ['SOMETHING_NEW', 'info'],
    ['', 'info'],
  ])('%s is %s', (type, tone) => {
    expect(notificationTone(type)).toBe(tone)
  })
})

describe('subscribeToNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-1', user: { id: 'u1' } } } })
    supabase.removeChannel.mockImplementation(() => Promise.resolve('ok'))
  })

  it('joins the private channel of the signed-in user once for two subscribers, and hands each the notification and the status', async () => {
    const first = jest.fn()
    const second = jest.fn()
    const onStatus = jest.fn()
    const stopFirst = subscribeToNotifications(first, onStatus)
    const stopSecond = subscribeToNotifications(second, jest.fn())
    await flush()
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(supabase.channel).toHaveBeenCalledWith('notifications:user:u1', { config: { private: true } })
    expect(supabase.realtime.setAuth).toHaveBeenCalledWith('tok-1')
    expect(supabase.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(mockChannel.subscribe.mock.invocationCallOrder[0])
    expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'notification.created' }, expect.any(Function))
    const handler = mockChannel.on.mock.calls[0][2]
    handler({ payload: raw() })
    expect(first).toHaveBeenCalledWith(raw())
    expect(second).toHaveBeenCalledWith(raw())
    mockChannel.subscribe.mock.calls[0][0]('SUBSCRIBED')
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED')
    stopFirst()
    stopSecond()
  })

  it('ignores a payload that is not a notification', async () => {
    const onNotification = jest.fn()
    const stop = subscribeToNotifications(onNotification, jest.fn())
    await flush()
    const handler = mockChannel.on.mock.calls[0][2]
    handler({ payload: { nope: true } })
    handler({ payload: null })
    expect(onNotification).not.toHaveBeenCalled()
    stop()
  })

  it('keeps the channel until the last subscriber leaves, then closes it, and tells a late subscriber the current status', async () => {
    const stopFirst = subscribeToNotifications(jest.fn(), jest.fn())
    const stopSecond = subscribeToNotifications(jest.fn(), jest.fn())
    await flush()
    mockChannel.subscribe.mock.calls[0][0]('SUBSCRIBED')
    stopFirst()
    expect(supabase.removeChannel).not.toHaveBeenCalled()
    const late = jest.fn()
    const stopLate = subscribeToNotifications(jest.fn(), late)
    expect(late).toHaveBeenCalledWith('SUBSCRIBED')
    stopSecond()
    stopLate()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
    await flush()
  })

  it('waits for the old channel to close before joining again', async () => {
    let finish: () => void = () => {}
    supabase.removeChannel.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
    const stopOld = subscribeToNotifications(jest.fn(), jest.fn())
    await flush()
    stopOld()
    const stop = subscribeToNotifications(jest.fn(), jest.fn())
    await flush()
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    finish()
    await flush()
    expect(supabase.channel).toHaveBeenCalledTimes(2)
    stop()
    await flush()
  })

  it('never opens a channel when stopped before it was ready', async () => {
    subscribeToNotifications(jest.fn(), jest.fn())()
    await flush()
    expect(supabase.channel).not.toHaveBeenCalled()
    expect(supabase.removeChannel).not.toHaveBeenCalled()
  })

  it('reports CHANNEL_ERROR without a session so the poll runs', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const onStatus = jest.fn()
    const stop = subscribeToNotifications(jest.fn(), onStatus)
    await flush()
    expect(onStatus).toHaveBeenCalledWith('CHANNEL_ERROR')
    expect(supabase.channel).not.toHaveBeenCalled()
    stop()
  })
})
