import { ApiError, request } from '@/lib/api'

import { fetchMessages, fetchMyConversation, markRead, sendFailureCopy, sendMessage, subscribeToConversation, toMessage } from '../chat'

const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = { on: jest.fn(), subscribe: jest.fn() }
jest.mock('@/lib/supabase', () => ({ supabase: { channel: jest.fn(() => mockChannel), removeChannel: jest.fn(() => Promise.resolve('ok')) } }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock
const supabase = jest.requireMock('@/lib/supabase').supabase

const raw = (over: Record<string, unknown> = {}) => ({ id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'Hi', createdAt: '2026-11-14T05:00:00.000Z', ...over })

beforeEach(() => {
  jest.clearAllMocks()
  mockChannel.on.mockReturnValue(mockChannel)
  mockChannel.subscribe.mockReturnValue(mockChannel)
})

describe('toMessage', () => {
  it('keeps the fields the screen needs', () => expect(toMessage(raw())).toEqual({ id: 'm1', senderId: 'u1', content: 'Hi', createdAt: '2026-11-14T05:00:00.000Z', attachments: [] }))
  it.each(['id', 'senderId', 'content', 'createdAt'])('rejects a message without %s', (key) => expect(() => toMessage(raw({ [key]: undefined }))).toThrow(ApiError))
  it('rejects an unreadable time', () => expect(() => toMessage(raw({ createdAt: 'later' }))).toThrow(ApiError))
  it('accepts an attachment-only message and reads its attachments in order', () => {
    const attachments = [{ id: 'a1', url: 'https://x/a.jpg', type: 'IMAGE', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 5, displayOrder: 0 }, { id: 'a2', url: 'https://x/b.mp4', type: 'VIDEO', fileName: null }]
    expect(toMessage(raw({ content: '', attachments })).attachments).toEqual([{ id: 'a1', url: 'https://x/a.jpg', type: 'IMAGE', fileName: 'a.jpg' }, { id: 'a2', url: 'https://x/b.mp4', type: 'VIDEO', fileName: null }])
  })
  it('rejects an empty message without attachments, even when its attachments are garbage', () => {
    expect(() => toMessage(raw({ content: '' }))).toThrow(ApiError)
    expect(() => toMessage(raw({ content: '', attachments: [{ id: 'a', type: 'IMAGE' }, { id: 'b', url: 'u', type: 'PDF' }, 7] }))).toThrow(ApiError)
  })
  it.each([undefined, null, 'x', {}])('treats attachments %p as none', (attachments) => expect(toMessage(raw({ attachments })).attachments).toEqual([]))
  it.each([null, 'x', 42])('rejects %p', (body) => expect(() => toMessage(body)).toThrow(ApiError))
})

describe('requests', () => {
  it('reads the conversation id and the unread flag', async () => {
    mockRequest.mockResolvedValue({ id: 'c1', hasUnreadMessages: true })
    expect(await fetchMyConversation()).toEqual({ id: 'c1', hasUnreadMessages: true, blocked: false, blockedReason: null })
    expect(mockRequest).toHaveBeenCalledWith('GET', '/chat/my-conversation', undefined, undefined)
  })
  it('treats a missing flag as read and rejects a conversation without an id', async () => {
    mockRequest.mockResolvedValueOnce({ id: 'c1' })
    expect((await fetchMyConversation()).hasUnreadMessages).toBe(false)
    mockRequest.mockResolvedValueOnce({ hasUnreadMessages: true })
    await expect(fetchMyConversation()).rejects.toBeInstanceOf(ApiError)
  })
  it('reads the messaging block of the customer', async () => {
    mockRequest.mockResolvedValueOnce({ id: 'c1', customer: { messagingBlockedAt: '2026-11-04T02:00:00Z', messagingBlockedReason: 'Spam' } })
    expect(await fetchMyConversation()).toMatchObject({ blocked: true, blockedReason: 'Spam' })
    mockRequest.mockResolvedValueOnce({ id: 'c1', customer: { messagingBlockedAt: null, messagingBlockedReason: null } })
    expect(await fetchMyConversation()).toMatchObject({ blocked: false, blockedReason: null })
  })
  it('loads the newest 50 messages and rejects a wrong shape', async () => {
    mockRequest.mockResolvedValueOnce({ data: [raw()], meta: { hasMore: false } })
    expect(await fetchMessages('c 1')).toHaveLength(1)
    expect(mockRequest).toHaveBeenCalledWith('GET', '/chat/conversations/c%201/messages?limit=50', undefined, undefined)
    mockRequest.mockResolvedValueOnce({ data: 'x' })
    await expect(fetchMessages('c1')).rejects.toBeInstanceOf(ApiError)
  })
  it('sends to my-conversation', async () => {
    mockRequest.mockResolvedValue(raw())
    expect((await sendMessage('Hi')).id).toBe('m1')
    expect(mockRequest).toHaveBeenCalledWith('POST', '/chat/my-conversation/messages', { content: 'Hi' }, undefined)
  })
  it('sends attachments with the text, or alone without a content field', async () => {
    mockRequest.mockResolvedValue(raw({ content: '', attachments: [{ id: 'a1', url: 'https://x/a.jpg', type: 'IMAGE' }] }))
    const file = { url: 'https://x/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 9 }
    await sendMessage('', [file])
    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/chat/my-conversation/messages', { attachments: [file] }, undefined)
    await sendMessage('Hi', [file])
    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/chat/my-conversation/messages', { content: 'Hi', attachments: [file] }, undefined)
  })
  it('marks read without surfacing a failure', async () => {
    mockRequest.mockRejectedValue(new ApiError('network'))
    expect(() => markRead('c1')).not.toThrow()
    await Promise.resolve()
    expect(mockRequest).toHaveBeenCalledWith('POST', '/chat/conversations/c1/read', {})
  })
})

describe('sendFailureCopy', () => {
  it('starts with Not sent and never shows the server text', () => {
    for (const kind of ['network', 'validation', 'forbidden', 'rate-limit', 'not-found', 'conflict', 'server'] as const) {
      expect(sendFailureCopy(new ApiError(kind, 'secret detail'))).toMatch(/^Not sent\./)
      expect(sendFailureCopy(new ApiError(kind, 'secret detail'))).not.toContain('secret')
    }
    expect(sendFailureCopy(new Error('x'))).toMatch(/^Not sent\./)
  })
})

describe('subscribeToConversation', () => {
  it('joins one private channel per conversation and passes valid messages on', async () => {
    const onMessage = jest.fn()
    const onStatus = jest.fn()
    subscribeToConversation('c1', onMessage, onStatus)
    await Promise.resolve()
    expect(supabase.channel).toHaveBeenCalledWith('chat:conversation:c1', { config: { private: true } })
    expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'message' }, expect.any(Function))
    const handler = mockChannel.on.mock.calls[0][2]
    handler({ payload: raw() })
    handler({ payload: { nope: true } })
    expect(onMessage).toHaveBeenCalledTimes(1)
    mockChannel.subscribe.mock.calls[0][0]('SUBSCRIBED')
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED')
  })
  it('removes the channel on cleanup and ignores later statuses', async () => {
    const onStatus = jest.fn()
    const stop = subscribeToConversation('c1', jest.fn(), onStatus)
    await Promise.resolve()
    stop()
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
    mockChannel.subscribe.mock.calls[0][0]('CLOSED')
    expect(onStatus).not.toHaveBeenCalled()
  })
  it('never opens a channel when stopped before it was ready', async () => {
    subscribeToConversation('c1', jest.fn(), jest.fn())()
    await Promise.resolve()
    expect(supabase.channel).not.toHaveBeenCalled()
    expect(supabase.removeChannel).not.toHaveBeenCalled()
  })
})
