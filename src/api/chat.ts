import { ApiError, isRecord, request, str } from '@/lib/api'
import { supabase } from '@/lib/supabase'

export type ChatMessage = { id: string; senderId: string; content: string; createdAt: string }
/** blocked: staff stopped this customer from sending; they can still read. blockedReason is the staff's note, if any. */
export type Conversation = { id: string; hasUnreadMessages: boolean; blocked: boolean; blockedReason: string | null }

export const MAX_MESSAGE_LENGTH = 2000

/** One message from the API or a Realtime broadcast; throws ApiError('server') on a wrong shape. */
export function toMessage(raw: unknown): ChatMessage {
  if (!isRecord(raw)) throw new ApiError('server')
  const id = str(raw.id)
  const senderId = str(raw.senderId)
  const content = str(raw.content)
  const createdAt = str(raw.createdAt)
  if (!id || !senderId || !content || !createdAt || Number.isNaN(Date.parse(createdAt))) throw new ApiError('server')
  return { id, senderId, content, createdAt }
}

/** GET /chat/my-conversation. The customer's one thread; the server creates it the first time it is asked for. */
export async function fetchMyConversation(signal?: AbortSignal): Promise<Conversation> {
  const body = await request('GET', '/chat/my-conversation', undefined, signal)
  const id = isRecord(body) ? str(body.id) : null
  if (!isRecord(body) || !id) throw new ApiError('server')
  const customer = isRecord(body.customer) ? body.customer : {}
  return { id, hasUnreadMessages: body.hasUnreadMessages === true, blocked: str(customer.messagingBlockedAt) !== null, blockedReason: str(customer.messagingBlockedReason) }
}

// shortcut: only the newest 50 messages, add `?before=` paging if conversations grow long
/** GET /chat/conversations/:id/messages: the newest 50, oldest first. */
export async function fetchMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const body = await request('GET', `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, undefined, signal)
  if (!isRecord(body) || !Array.isArray(body.data)) throw new ApiError('server')
  return body.data.map(toMessage)
}

/** POST /chat/my-conversation/messages. The API trims the text and refuses an empty one or more than 2000 characters. */
export async function sendMessage(content: string, signal?: AbortSignal): Promise<ChatMessage> {
  return toMessage(await request('POST', '/chat/my-conversation/messages', { content }, signal))
}

/** POST /chat/conversations/:id/read. Fire and forget: a missed read only leaves the unread dot a little longer. */
export function markRead(conversationId: string) {
  request('POST', `/chat/conversations/${encodeURIComponent(conversationId)}/read`, {}).catch(() => {})
}

/** Why a message was not sent, for the copy under it. Never includes the server's own text. */
export function sendFailureCopy(failure: unknown): string {
  switch (failure instanceof ApiError ? failure.kind : 'server') {
    case 'network':
      return "Not sent. We couldn't reach the server, so check your connection and tap Retry."
    case 'validation':
      return 'Not sent. The message was refused as invalid. Write a new one, up to 2,000 characters.'
    case 'forbidden':
      return 'Not sent. Your messaging may be blocked, or your sign-in expired. Sign in again, then write it again; if it keeps failing, contact support.'
    case 'rate-limit':
      return "Not sent. You're sending too fast. Wait a moment, then tap Retry."
    case 'not-found':
    case 'conflict':
      return 'Not sent. This conversation is no longer available. Go back and open Messages again.'
    default:
      return 'Not sent. Something went wrong on our side. Tap Retry in a minute.'
  }
}

// removeChannel answers asynchronously and the old channel stays registered under its topic until it does. Subscribing to the same topic
// meanwhile would be handed that dying channel and never hear a message, so a new subscription waits for the last close.
let closing: Promise<unknown> = Promise.resolve()

/**
 * Listens for the `message` broadcasts the API sends on the private topic `chat:conversation:{id}` after it stores one. `onStatus` gets the
 * channel status (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). supabase-js gives the session token to Realtime by itself. Returns the cleanup.
 */
export function subscribeToConversation(conversationId: string, onMessage: (message: ChatMessage) => void, onStatus: (status: string) => void) {
  let stopped = false
  let channel: ReturnType<typeof supabase.channel> | undefined
  void closing.then(() => {
    if (stopped) return
    channel = supabase
      .channel(`chat:conversation:${conversationId}`, { config: { private: true } })
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        try {
          onMessage(toMessage(payload))
        } catch {
          // Not a message: skipped, the next refetch gets the real thing.
        }
      })
      .subscribe((status) => !stopped && onStatus(status))
  })
  return () => {
    stopped = true
    if (channel) closing = supabase.removeChannel(channel).catch(() => {})
  }
}
