import { request } from '../api'

const mockGetSession = jest.fn()
jest.mock('../supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }))

const fetchMock = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  globalThis.fetch = fetchMock
})

const headers = () => fetchMock.mock.calls[0][1].headers

it('sends the session token by default', async () => {
  await request('GET', '/x')
  expect(headers()).toEqual({ Authorization: 'Bearer tok' })
})

it('omits Authorization when auth is false, even with a session', async () => {
  await request('GET', '/x', undefined, undefined, { auth: false })
  expect(headers().Authorization).toBeUndefined()
  expect(mockGetSession).not.toHaveBeenCalled()
})
