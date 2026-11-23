import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'

import { useChatUnread } from '../useChatUnread'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/chat', () => ({ fetchMyConversation: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: () => ({ profile: { role: 'customer' }, ...mockSession }) }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn((cb) => jest.requireActual('react').useEffect(cb, [cb])) }))
let mockSession: { session: { user: { id: string } } | null; profile?: { role: string } } = { session: null }
const mockFetch: jest.Mock = jest.requireMock('@/api/chat').fetchMyConversation

function Probe() {
  return <Text testID="unread">{String(useChatUnread())}</Text>
}
const shown = () => screen.getByTestId('unread').children[0]

beforeEach(() => {
  jest.clearAllMocks()
  mockSession = { session: null }
})

it('is false and fetches nothing when signed out', async () => {
  await render(<Probe />)
  expect(shown()).toBe('false')
  expect(mockFetch).not.toHaveBeenCalled()
})

it('fetches nothing for a staff account', async () => {
  mockSession = { session: { user: { id: 's1' } }, profile: { role: 'admin' } }
  await render(<Probe />)
  expect(shown()).toBe('false')
  expect(mockFetch).not.toHaveBeenCalled()
})

it('turns true when the store has an unread reply', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockFetch.mockResolvedValue({ id: 'c1', hasUnreadMessages: true })
  await render(<Probe />)
  await waitFor(() => expect(shown()).toBe('true'))
})

it('stays false when the load fails', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockFetch.mockRejectedValue(new Error('x'))
  await render(<Probe />)
  await waitFor(() => expect(mockFetch).toHaveBeenCalled())
  expect(shown()).toBe('false')
})

it('drops the dot when the account changes', async () => {
  mockSession = { session: { user: { id: 'u1' } } }
  mockFetch.mockResolvedValueOnce({ id: 'c1', hasUnreadMessages: true })
  const view = await render(<Probe />)
  await waitFor(() => expect(shown()).toBe('true'))
  mockFetch.mockReturnValue(new Promise(() => {}))
  mockSession = { session: { user: { id: 'u2' } } }
  await view.rerender(<Probe />)
  await waitFor(() => expect(shown()).toBe('false'))
})
