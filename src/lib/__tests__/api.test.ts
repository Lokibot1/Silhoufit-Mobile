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

const failWith = (status: number, headers: Record<string, string>) =>
  fetchMock.mockResolvedValue({ ok: false, status, headers: new Headers(headers), json: async () => ({}) })

it.each([
  ['7', 7000],
  [undefined, 15000],
  ['', 15000],
  ['0', 15000],
  ['-3', 15000],
  ['abc', 15000],
  ['9999', 120000],
])('a 429 with Retry-After %p waits %p ms', async (header, expected) => {
  failWith(429, header === undefined ? {} : { 'Retry-After': header })
  await expect(request('GET', '/x')).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: expected })
})

it('leaves retryAfterMs undefined on other errors', async () => {
  failWith(500, { 'Retry-After': '7' })
  await expect(request('GET', '/x')).rejects.toMatchObject({ retryAfterMs: undefined })
})
