import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo, Alert, Linking, Platform, StyleSheet } from 'react-native'

import { ApiError } from '@/lib/api'
import { UploadError } from '@/lib/imageUpload'
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
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn((cb) => jest.requireActual('react').useEffect(cb, [cb])),
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (prevent: boolean, callback: (e: unknown) => void) => {
    mockGuard.prevent = prevent
    mockGuard.callback = callback
  },
}))
jest.mock('@/lib/imageUpload', () => ({ ...jest.requireActual('@/lib/imageUpload'), pickImages: jest.fn(), uploadPhoto: jest.fn(), deleteUploaded: jest.fn() }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
jest.mock('expo-image', () => ({ Image: ({ onError }: { onError?: () => void }) => jest.requireActual('react').createElement('Image', { testID: 'tile-image', onError }) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
const mockToast = jest.fn()
const mockDispatch = jest.fn()
const mockGuard: { prevent: boolean; callback: ((e: unknown) => void) | null } = { prevent: false, callback: null }
let mockSession: { session: { user: { id: string } } | null; loading: boolean; profile?: { role: string } } = { session: null, loading: false }
const api = jest.requireMock('@/api/chat')
const imageUpload = jest.requireMock('@/lib/imageUpload')
const mockPush: jest.Mock = jest.requireMock('expo-router').router.push

const message = (id: string, over: Record<string, unknown> = {}) => ({ id, senderId: 'staff1', content: `Text ${id}`, createdAt: '2026-11-14T05:49:00.000Z', attachments: [], ...over })
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
  expect(api.sendMessage).toHaveBeenCalledWith('Hello', [], expect.any(AbortSignal))
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
  expect(api.sendMessage).toHaveBeenLastCalledWith('Hello', [], expect.any(AbortSignal))
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

it('shows an attachment-only message instead of failing the list', async () => {
  api.fetchMessages.mockResolvedValue([message('m1'), message('m5', { content: '', attachments: [{ id: 'a1', url: 'https://x/a.jpg', type: 'IMAGE', fileName: 'a.jpg' }] })])
  await render(<MessagesScreen />)
  expect(await screen.findByTestId('message-m5')).toBeTruthy()
  expect(screen.getByTestId('message-m5-photo-0')).toBeTruthy()
  expect(screen.getByTestId('message-m5').props.accessibilityLabel).toMatch(/^KRAL, Photo,/)
  expect(screen.queryByText("Couldn't load your messages")).toBeNull()
})

it('delivers an attachment-only message live', async () => {
  await render(<MessagesScreen />)
  await screen.findByTestId('message-m1')
  await act(async () => live.onMessage(message('m6', { content: '', attachments: [{ id: 'a1', url: 'https://x/v.mp4', type: 'VIDEO', fileName: null }] })))
  expect(screen.getByTestId('message-m6-video-0')).toBeTruthy()
})

const photo = (id: string) => ({ id, url: `https://x/${id}.jpg`, type: 'IMAGE', fileName: `${id}.jpg` })

it('shows photos as tiles that open a full-size viewer with a close button', async () => {
  api.fetchMessages.mockResolvedValue([message('m7', { content: 'Look', attachments: [photo('a1'), photo('a2')] })])
  await render(<MessagesScreen />)
  expect(await screen.findByText('Look')).toBeTruthy()
  expect(screen.getByTestId('message-m7-photo-1').props.accessibilityLabel).toBe('Photo 2 of 2, view full size')
  expect(screen.queryByTestId('photo-viewer')).toBeNull()
  await fireEvent.press(screen.getByTestId('message-m7-photo-1'))
  expect(screen.getByTestId('photo-viewer')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('photo-viewer-close'))
  expect(screen.queryByTestId('photo-viewer')).toBeNull()
})

it('swaps a photo that fails to load for a placeholder tile', async () => {
  api.fetchMessages.mockResolvedValue([message('m7', { content: '', attachments: [photo('a1')] })])
  await render(<MessagesScreen />)
  await fireEvent(await screen.findByTestId('tile-image'), 'error')
  expect(screen.queryByTestId('tile-image')).toBeNull()
  expect(screen.getByTestId('message-m7-photo-0').props.accessibilityLabel).toBe("Photo 1 of 1, couldn't be loaded")
})

it('opens a video in the phone player and toasts when it cannot', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce().mockRejectedValueOnce(new Error('no app'))
  api.fetchMessages.mockResolvedValue([message('m8', { content: '', attachments: [{ id: 'v1', url: 'https://x/v.mp4', type: 'VIDEO', fileName: null }] })])
  await render(<MessagesScreen />)
  const play = await screen.findByLabelText('Play video')
  await fireEvent.press(play)
  expect(open).toHaveBeenCalledWith('https://x/v.mp4')
  await fireEvent.press(play)
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't open this video. Check your connection and try again."))
})

// Photos in the composer.
const sheetGone = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) }) // Android waits for the sheet's fade before opening a picker
const pic = (n: number, over = {}) => ({ uri: `file:///c/${n}.jpg`, name: `${n}.jpg`, ext: 'jpg', type: 'image/jpeg', size: 1000 + n, ...over })
const attach = async (...photos: ReturnType<typeof pic>[]) => {
  imageUpload.pickImages.mockResolvedValueOnce({ status: 'picked', photos })
  const android = jest.replaceProperty(Platform, 'OS', 'android')
  await fireEvent.press(await screen.findByTestId('messages-attach'))
  await fireEvent.press(screen.getByTestId('photo-library'))
  await sheetGone()
  android.restore()
  await screen.findByTestId('messages-photo-remove-0')
}
const sent = (id = 'm3', over = {}) => message(id, { senderId: 'u1', content: '', attachments: [{ id: 'a1', url: 'https://x/1.jpg', type: 'IMAGE', fileName: '1.jpg' }], ...over })
const uploadsOk = () => imageUpload.uploadPhoto.mockImplementation(async (p: { name: string }) => `https://x/${p.name}`)

it('attaches photos from the library, lets one be removed, and sends them with no text', async () => {
  uploadsOk()
  api.sendMessage.mockResolvedValue(sent())
  await render(<MessagesScreen />)
  expect(await screen.findByTestId('messages-send')).toBeDisabled()
  await attach(pic(1), pic(2))
  expect(imageUpload.pickImages).toHaveBeenCalledWith('library', { square: undefined, limit: 5 })
  await fireEvent.press(screen.getByTestId('messages-photo-remove-0'))
  expect(screen.queryByTestId('messages-photo-remove-1')).toBeNull()
  expect(screen.getByTestId('messages-send')).toBeEnabled()
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(imageUpload.uploadPhoto).toHaveBeenCalledTimes(1)
  expect(imageUpload.uploadPhoto).toHaveBeenCalledWith(expect.objectContaining({ name: '2.jpg' }), expect.objectContaining({ userId: 'u1', bucket: 'attachments', signal: expect.any(AbortSignal) }))
  expect(api.sendMessage).toHaveBeenCalledWith('', [{ url: 'https://x/2.jpg', fileName: '2.jpg', mimeType: 'image/jpeg', sizeBytes: 1002 }], expect.any(AbortSignal))
  expect(screen.queryByTestId('messages-photo-remove-0')).toBeNull()
})

it('refuses a photo of the wrong type with what, why and next, and limits the picker to the room left', async () => {
  await render(<MessagesScreen />)
  await attach(pic(1), pic(2, { type: 'image/gif', ext: 'gif', name: '2.gif' }))
  expect(mockToast).toHaveBeenCalledWith("2.gif wasn't added. Only JPG, PNG or WebP photos work, so choose a different photo.")
  expect(screen.queryByTestId('messages-photo-remove-1')).toBeNull()
  imageUpload.pickImages.mockResolvedValueOnce({ status: 'cancelled' })
  const android = jest.replaceProperty(Platform, 'OS', 'android')
  await fireEvent.press(screen.getByTestId('messages-attach'))
  await fireEvent.press(screen.getByTestId('photo-library'))
  await sheetGone()
  android.restore()
  expect(imageUpload.pickImages).toHaveBeenLastCalledWith('library', { square: undefined, limit: 4 })
})

it('keeps at most five photos and disables Attach at the limit', async () => {
  await render(<MessagesScreen />)
  await attach(pic(1), pic(2), pic(3), pic(4), pic(5), pic(6))
  expect(screen.getByTestId('messages-photo-remove-4')).toBeTruthy()
  expect(screen.queryByTestId('messages-photo-remove-5')).toBeNull()
  expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/^Only 5 photos fit in one message/))
  expect(screen.getByTestId('messages-attach')).toBeDisabled()
})

it('shows the upload progress on the unsent message', async () => {
  imageUpload.uploadPhoto.mockImplementation((_p: unknown, o: { onProgress: (n: number) => void }) => {
    o.onProgress(40)
    return never()
  })
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByLabelText('Uploading photos')).toBeTruthy()
  expect(screen.getByText('40%')).toBeTruthy()
  expect(api.sendMessage).not.toHaveBeenCalled()
})

it('retries from the photo that failed without uploading the finished ones again', async () => {
  imageUpload.uploadPhoto.mockResolvedValueOnce('https://x/1.jpg').mockRejectedValueOnce(new UploadError('network')).mockResolvedValueOnce('https://x/2.jpg')
  api.sendMessage.mockResolvedValue(sent())
  await render(<MessagesScreen />)
  await attach(pic(1), pic(2))
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByText(/^Not sent\. We couldn't upload your photo\. The connection dropped/)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('message-failed-retry'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(imageUpload.uploadPhoto).toHaveBeenCalledTimes(3)
  expect(imageUpload.uploadPhoto.mock.calls[2][0].name).toBe('2.jpg')
  expect(api.sendMessage).toHaveBeenCalledWith('', [expect.objectContaining({ url: 'https://x/1.jpg' }), expect.objectContaining({ url: 'https://x/2.jpg' })], expect.any(AbortSignal))
  expect(imageUpload.deleteUploaded).not.toHaveBeenCalled()
})

it('keeps the uploads when the send fails on the network, so Retry posts without uploading again', async () => {
  uploadsOk()
  api.sendMessage.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce(sent())
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  await fireEvent.press(await screen.findByTestId('message-failed-retry'))
  expect(await screen.findByTestId('message-m3')).toBeTruthy()
  expect(imageUpload.uploadPhoto).toHaveBeenCalledTimes(1)
  expect(imageUpload.deleteUploaded).not.toHaveBeenCalled()
})

it('deletes the uploads when the server refuses the message, with no Retry', async () => {
  uploadsOk()
  api.sendMessage.mockRejectedValueOnce(new ApiError('validation'))
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByTestId('message-failed-discard')).toBeTruthy()
  expect(screen.queryByTestId('message-failed-retry')).toBeNull()
  expect(imageUpload.deleteUploaded).toHaveBeenCalledWith('https://x/1.jpg', 'u1', 'attachments')
})

it('explains a refused file and offers no Retry', async () => {
  imageUpload.uploadPhoto.mockRejectedValueOnce(new UploadError('invalid'))
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  expect(await screen.findByText(/^Not sent\. We couldn't upload your photo\. The server didn't accept this file\. Choose a JPG, PNG or WebP photo under 5 MB/)).toBeTruthy()
  expect(screen.queryByTestId('message-failed-retry')).toBeNull()
  expect(api.sendMessage).not.toHaveBeenCalled()
})

it('deletes the uploads of a discarded message', async () => {
  uploadsOk()
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  await fireEvent.press(await screen.findByTestId('message-failed-discard'))
  expect(imageUpload.deleteUploaded).toHaveBeenCalledWith('https://x/1.jpg', 'u1', 'attachments')
  expect(screen.queryByTestId('message-unsent')).toBeNull()
})

it('drops the unsent photo message when its echo arrives (matched by text and photo count)', async () => {
  uploadsOk()
  api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
  await render(<MessagesScreen />)
  await attach(pic(1))
  await fireEvent.press(screen.getByTestId('messages-send'))
  await screen.findByTestId('message-failed-retry')
  await act(async () => live.onMessage(sent('m9', { attachments: [] })))
  expect(screen.getByTestId('message-unsent')).toBeTruthy()
  await act(async () => live.onMessage(sent('m10')))
  expect(screen.queryByTestId('message-unsent')).toBeNull()
})

describe('leaving with unsent photos', () => {
  const action = { type: 'GO_BACK' }
  const leave = async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    await act(async () => mockGuard.callback!({ data: { action } }))
    return alert
  }
  const failedWithUpload = async () => {
    uploadsOk()
    api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
    await render(<MessagesScreen />)
    await attach(pic(1))
    await fireEvent.press(screen.getByTestId('messages-send'))
    await screen.findByTestId('message-failed-retry')
  }
  afterEach(() => jest.restoreAllMocks())

  it('asks first when a failed message holds uploaded photos, and Stay keeps everything', async () => {
    await failedWithUpload()
    expect(mockGuard.prevent).toBe(true)
    const alert = await leave()
    expect(alert).toHaveBeenCalledWith('Discard unsent photos?', "Your message with photos hasn't been sent. If you leave now, the photos are discarded.", expect.any(Array), { cancelable: true })
    const buttons = alert.mock.calls[0][2]!
    expect(buttons.map((b) => b.text)).toEqual(['Stay', 'Discard and leave'])
    expect(buttons[0].style).toBe('cancel')
    expect(imageUpload.deleteUploaded).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(screen.getByTestId('message-unsent')).toBeTruthy()
  })

  it('Discard and leave deletes the uploaded photos, drops the message and continues the navigation', async () => {
    await failedWithUpload()
    const alert = await leave()
    await act(async () => alert.mock.calls[0][2]![1].onPress!())
    expect(imageUpload.deleteUploaded).toHaveBeenCalledWith('https://x/1.jpg', 'u1', 'attachments')
    expect(mockDispatch).toHaveBeenCalledWith(action)
    expect(screen.queryByTestId('message-unsent')).toBeNull()
  })

  it('asks while photos are uploading, and Discard and leave stops the upload', async () => {
    let signal: AbortSignal | undefined
    imageUpload.uploadPhoto.mockImplementation((_p: unknown, o: { signal: AbortSignal }) => {
      signal = o.signal
      return never()
    })
    await render(<MessagesScreen />)
    await attach(pic(1))
    await fireEvent.press(screen.getByTestId('messages-send'))
    await screen.findByLabelText('Uploading photos')
    expect(mockGuard.prevent).toBe(true)
    const alert = await leave()
    await act(async () => alert.mock.calls[0][2]![1].onPress!())
    expect(signal!.aborted).toBe(true)
    expect(mockDispatch).toHaveBeenCalledWith(action)
  })

  // All photos uploaded, the message request out and unanswered; settle() ends it.
  const inFlight = async () => {
    uploadsOk()
    let settle!: { resolve: (m: unknown) => void; reject: (e: unknown) => void }
    api.sendMessage.mockReturnValue(new Promise((resolve, reject) => (settle = { resolve, reject })))
    const view = await render(<MessagesScreen />)
    await attach(pic(1))
    await fireEvent.press(screen.getByTestId('messages-send'))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalled())
    return { view, settle }
  }

  it('does not intercept leaving once the message is in flight, and the send is not aborted', async () => {
    const { view } = await inFlight()
    expect(mockGuard.prevent).toBe(false)
    await act(async () => view.unmount())
    expect(api.sendMessage.mock.calls[0][2].aborted).toBe(false)
    expect(imageUpload.deleteUploaded).not.toHaveBeenCalled()
  })

  it('deletes the uploads when the send fails after the user left, without touching the unmounted screen', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { view, settle } = await inFlight()
    await act(async () => view.unmount())
    await act(async () => settle.reject(new ApiError('network')))
    expect(imageUpload.deleteUploaded).toHaveBeenCalledWith('https://x/1.jpg', 'u1', 'attachments')
    expect(error).not.toHaveBeenCalled()
  })

  it('leaves nothing to clean up when the send succeeds after the user left', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { view, settle } = await inFlight()
    await act(async () => view.unmount())
    await act(async () => settle.resolve(sent()))
    expect(imageUpload.deleteUploaded).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('lets a clean screen go', async () => {
    await render(<MessagesScreen />)
    await screen.findByTestId('message-m1')
    expect(mockGuard.prevent).toBe(false)
  })

  it('lets a failed text-only message go', async () => {
    api.sendMessage.mockRejectedValueOnce(new ApiError('network'))
    await render(<MessagesScreen />)
    await type('Hello')
    await fireEvent.press(screen.getByTestId('messages-send'))
    await screen.findByTestId('message-failed-retry')
    expect(mockGuard.prevent).toBe(false)
  })
})
