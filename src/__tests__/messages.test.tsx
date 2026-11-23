import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo, StyleSheet } from 'react-native'

import { ApiError } from '@/lib/api'
import MessagesScreen from '../app/messages'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/chat', () => ({
  ...jest.requireActual('@/api/chat'),
  fetchMyConversation: jest.fn(),
  fetchMessages: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(),
  subscribeToConversation: jest.fn(),
}))
jest.mock('@/auth/session', () => ({ useSession: () => ({ profile: { role: 'customer' }, ...mockSession }) }))
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn((cb) => jest.requireActual('react').useEffect(cb, [cb])) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
const mockToast = jest.fn()
let mockSession: { session: { user: { id: string } } | null; loading: boolean; profile?: { role: string } } = { session: null, loading: false }
const api = jest.requireMock('@/api/chat')
const mockPush: jest.Mock = jest.requireMock('expo-router').router.push

const message = (id: string, over: Record<string, unknown> = {}) => ({ id, senderId: 'staff1', content: `Text ${id}`, createdAt: '2026-11-14T05:49:00.000Z', ...over })
const never = () => new Promise(() => {})
// The live channel as the screen sees it: the callbacks it passed to subscribeToConversation.
let live: { onMessage: (m: unknown) => void; onStatus: (s: string) => void }
const stop = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockSession = { session: { user: { id: 'u1' } }, loading: false }
  api.fetchMyConversation.mockResolvedValue({ id: 'c1', hasUnreadMessages: false, blocked: false, blockedReason: null })
  api.fetchMessages.mockResolvedValue([message('m1'), message('m2', { senderId: 'u1', content: 'My question' })])
  api.subscribeToConversation.mockImplementation((_id: string, onMessage: typeof live.onMessage, onStatus: typeof live.onStatus) => {
    live = { onMessage, onStatus }
    return stop
  })
})

const type = async (value: string) => fireEvent.changeText(await screen.findByTestId('messages-input'), value)

it('shows bubble skeletons while loading', async () => {
  api.fetchMyConversation.mockReturnValue(never())
  await render(<MessagesScreen />)
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('messages-input')).toBeNull()
})

it('lists staff messages as KRAL and my own with 12-hour times', async () => {
  await render(<MessagesScreen />)
  expect(await screen.findByTestId('message-m1')).toBeTruthy()
  expect(screen.getByText('KRAL')).toBeTruthy()
  expect(screen.getByText('Text m1')).toBeTruthy()
  expect(screen.getByText('My question')).toBeTruthy()
  expect(screen.getAllByText('Nov 14, 2026, 1:49 PM')).toHaveLength(2)
  expect(screen.getByTestId('message-m2').props.accessibilityLabel).toMatch(/^You,/)
  expect(api.fetchMessages).toHaveBeenCalledWith('c1', expect.any(AbortSignal))
})

it('shows the sign-in prompt when signed out and fetches nothing', async () => {
  mockSession = { session: null, loading: false }
  await render(<MessagesScreen />)
  expect(screen.getByText('Sign in to message the store')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('messages-sign-in'))
  expect(mockPush).toHaveBeenCalledWith('/sign-in')
  expect(api.fetchMyConversation).not.toHaveBeenCalled()
  expect(api.subscribeToConversation).not.toHaveBeenCalled()
  expect(screen.queryByTestId('messages-input')).toBeNull()
})

it('shows the error with a Retry that loads the messages', async () => {
  api.fetchMyConversation.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('messages-retry'))
  expect(await screen.findByTestId('message-m1')).toBeTruthy()
  expect(screen.queryByTestId('messages-retry')).toBeNull()
})

it('shows the empty state with a Write a Message action and the composer', async () => {
  api.fetchMessages.mockResolvedValue([])
  await render(<MessagesScreen />)
  expect(await screen.findByText('No messages yet')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('messages-empty-action'))
  expect(screen.getByTestId('messages-input')).toBeTruthy()
})

it('marks the conversation read when it opens', async () => {
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  expect(api.markRead).toHaveBeenCalledWith('c1')
})

it('sends a message, clears the input and shows it once', async () => {
  api.sendMessage.mockResolvedValue(message('m3', { senderId: 'u1', content: 'Hello' }))
  await render(<MessagesScreen />)
  expect(await screen.findByTestId('messages-send')).toBeDisabled()
  await type('  Hello  ')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(api.sendMessage).toHaveBeenCalledWith('Hello', expect.any(AbortSignal))
  expect(screen.getByTestId('messages-input').props.value).toBe('')
  expect(screen.queryByTestId('message-unsent')).toBeNull()
})

it('shows the masked-words notice when the saved text differs, and clears it when typing', async () => {
  api.sendMessage.mockResolvedValue(message('m3', { senderId: 'u1', content: 'What the ****' }))
  await render(<MessagesScreen />)
  await type('What the heck')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('messages-masked-note')).toBeTruthy()
  await type('a')
  expect(screen.queryByTestId('messages-masked-note')).toBeNull()
})

it('shows no masked-words notice when the saved text is identical', async () => {
  api.sendMessage.mockResolvedValue(message('m3', { senderId: 'u1', content: 'Hello' }))
  await render(<MessagesScreen />)
  await type('  Hello  ')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(screen.queryByTestId('messages-masked-note')).toBeNull()
})

it('keeps a failed message inline with "Not sent" and Retry sends it again', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(message('m3', { senderId: 'u1', content: 'Hello' }))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByText(/^Not sent\. We couldn't reach the server/)).toBeTruthy()
  expect(screen.getByText('Hello')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('message-failed-retry'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(screen.queryByTestId('message-failed-retry')).toBeNull()
  expect(api.sendMessage).toHaveBeenCalledTimes(2)
  expect(api.sendMessage).toHaveBeenLastCalledWith('Hello', expect.any(AbortSignal))
})

it('does not send twice while a send is pending', async () => {
  api.sendMessage.mockReturnValue(never())
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await type('Again')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(api.sendMessage).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('messages-send')).toBeDisabled()
})

it('shows the character count whenever the input is focused or has text, red in the last 100', async () => {
  await render(<MessagesScreen />)
  await type('')
  expect(screen.queryByText('0/2000')).toBeNull()
  await fireEvent(screen.getByTestId('messages-input'), 'focus')
  expect(screen.getByText('0/2000')).toBeTruthy()
  await type('a'.repeat(100))
  const count = screen.getByText('100/2000')
  expect(StyleSheet.flatten(count.props.style).color).toBe('#322D2F')
  await type('a'.repeat(1900))
  expect(StyleSheet.flatten(screen.getByText('1900/2000').props.style).color).toBe('#CB1C2B')
  await fireEvent(screen.getByTestId('messages-input'), 'blur')
  expect(screen.getByText('1900/2000')).toBeTruthy()
  expect(screen.getByTestId('messages-input').props.maxLength).toBe(2000)
})

it('blocks a new send while a message has failed and Discard clears it', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-failed-retry')
  expect(screen.getByLabelText('Not sent, Hello')).toBeTruthy()
  await type('Another')
  expect(screen.getByTestId('messages-send')).toBeDisabled()
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(api.sendMessage).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Hello')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('message-failed-discard'))
  expect(screen.queryByTestId('message-unsent')).toBeNull()
  expect(screen.getByTestId('messages-input').props.value).toBe('Another')
  expect(screen.getByTestId('messages-send')).toBeEnabled()
})

it('offers only Discard when the message was refused as invalid', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('validation'))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-failed-discard')).toBeTruthy()
  expect(screen.queryByTestId('message-failed-retry')).toBeNull()
})

it('disables the composer and explains the block, with the reason', async () => {
  api.fetchMyConversation.mockResolvedValue({ id: 'c1', hasUnreadMessages: false, blocked: true, blockedReason: 'Spam' })
  await render(<MessagesScreen />)
  expect((await screen.findByTestId('messages-input')).props.editable).toBe(false)
  expect(screen.getByPlaceholderText('Messaging is blocked')).toBeTruthy()
  expect(screen.getByText("Your messaging is blocked, so you can't send messages. You can still read replies. Reason: Spam")).toBeTruthy()
  expect(screen.getByTestId('messages-send')).toBeDisabled()
  expect(screen.getByText('Text m1')).toBeTruthy()
})

it('reloads the conversation after a refused send and then offers only Discard', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('forbidden'))
  await render(<MessagesScreen />)
  await type('Hello')
  api.fetchMyConversation.mockResolvedValue({ id: 'c1', hasUnreadMessages: false, blocked: true, blockedReason: null })
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('messages-blocked-note')).toBeTruthy()
  expect(screen.getByTestId('message-failed-discard')).toBeTruthy()
  expect(screen.queryByTestId('message-failed-retry')).toBeNull()
  expect(screen.getByText(/Your messaging is blocked, so this message can't be sent/)).toBeTruthy()
  expect(screen.queryByText(/sign-in expired/)).toBeNull()
})

it('clears the failed message when the same text from me arrives later, so Retry cannot post it twice', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-failed-retry')
  await act(async () => live.onMessage(message('m3', { senderId: 'u1', content: 'Hello' })))
  expect(screen.queryByTestId('message-unsent')).toBeNull()
  expect(screen.getAllByText('Hello')).toHaveLength(1)
  expect(api.sendMessage).toHaveBeenCalledTimes(1)
})

it('clears the failed message when a resync brings the saved copy', async () => {
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-failed-retry')
  api.fetchMessages.mockResolvedValue([message('m1'), message('m2', { senderId: 'u1' }), message('m3', { senderId: 'u1', content: 'Hello' })])
  await act(async () => live.onStatus('SUBSCRIBED'))
  await waitFor(() => expect(screen.queryByTestId('message-unsent')).toBeNull())
  expect(screen.getByTestId('message-m3')).toBeTruthy()
})

it('keeps the failed message when an older message with the same text was already there', async () => {
  api.fetchMessages.mockResolvedValue([message('m1', { senderId: 'u1', content: 'Hello' })])
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-failed-retry')
  await act(async () => live.onStatus('SUBSCRIBED'))
  expect(screen.getByTestId('message-unsent')).toBeTruthy()
})

it('removes the Sending bubble as soon as the echo arrives before the POST answers', async () => {
  api.sendMessage.mockReturnValue(never())
  await render(<MessagesScreen />)
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-unsent')).toBeTruthy()
  await act(async () => live.onMessage(message('m3', { senderId: 'u1', content: 'Hello' })))
  expect(screen.queryByTestId('message-unsent')).toBeNull()
  expect(screen.getAllByText('Hello')).toHaveLength(1)
})

it('announces only live staff messages, never the initial load or my own', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  expect(announce).not.toHaveBeenCalled()
  await act(async () => live.onMessage(message('m9', { content: 'New reply' })))
  await act(async () => live.onMessage(message('m9', { content: 'New reply' })))
  await act(async () => live.onMessage(message('m10', { senderId: 'u1', content: 'Mine' })))
  expect(announce).toHaveBeenCalledTimes(1)
  expect(announce).toHaveBeenCalledWith('KRAL said: New reply')
  expect(screen.getByTestId('message-m9').props.accessibilityLiveRegion).toBe('polite')
  expect(screen.getByTestId('message-m1').props.accessibilityLiveRegion).toBe('none')
  announce.mockRestore()
})

it('shows the skeleton while the load error Retry is running', async () => {
  api.fetchMyConversation.mockRejectedValueOnce(new ApiError('network')).mockReturnValueOnce(never())
  await render(<MessagesScreen />)
  await fireEvent.press(await screen.findByTestId('messages-retry'))
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(screen.queryByTestId('messages-retry')).toBeNull()
})

it('joins the conversation channel and leaves it on unmount', async () => {
  const view = await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  expect(api.subscribeToConversation).toHaveBeenCalledWith('c1', expect.any(Function), expect.any(Function))
  await view.unmount()
  expect(stop).toHaveBeenCalled()
})

it('appends a realtime message once, even when it arrives twice, and marks read for staff', async () => {
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  api.markRead.mockClear()
  await act(async () => {
    live.onMessage(message('m9', { content: 'New reply' }))
    live.onMessage(message('m9', { content: 'New reply' }))
  })
  expect(screen.getAllByText('New reply')).toHaveLength(1)
  expect(api.markRead).toHaveBeenCalledWith('c1')
})

it('does not mark read for my own message and dedupes the echo of my POST', async () => {
  api.sendMessage.mockResolvedValue(message('m3', { senderId: 'u1', content: 'Hello' }))
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  api.markRead.mockClear()
  await type('Hello')
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-m3')
  await act(async () => live.onMessage(message('m3', { senderId: 'u1', content: 'Hello' })))
  expect(screen.getAllByTestId('message-m3')).toHaveLength(1)
  expect(api.markRead).not.toHaveBeenCalled()
})

it('refetches the newest messages on every SUBSCRIBED and ignores other statuses', async () => {
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  api.fetchMessages.mockClear()
  api.fetchMessages.mockResolvedValue([message('m1'), message('m2', { senderId: 'u1' }), message('m5', { content: 'Missed one' })])
  await act(async () => live.onStatus('CHANNEL_ERROR'))
  expect(api.fetchMessages).not.toHaveBeenCalled()
  await act(async () => live.onStatus('SUBSCRIBED'))
  expect(await screen.findByText('Missed one')).toBeTruthy()
  expect(api.fetchMessages).toHaveBeenCalledWith('c1', expect.any(AbortSignal))
})

it('still works when the channel never connects', async () => {
  await render(<MessagesScreen />)
  await act(async () => live.onStatus('CHANNEL_ERROR'))
  expect(screen.getByTestId('message-m1')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mockToast).not.toHaveBeenCalled()
})

it('drops the previous account’s messages when the account changes', async () => {
  const view = await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  api.fetchMyConversation.mockReturnValue(never())
  mockSession = { session: { user: { id: 'u2' } }, loading: false }
  await view.rerender(<MessagesScreen />)
  await waitFor(() => expect(screen.queryByTestId('message-m1')).toBeNull())
  expect(screen.getByRole('progressbar')).toBeTruthy()
})
