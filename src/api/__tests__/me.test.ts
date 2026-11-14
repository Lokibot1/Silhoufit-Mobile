import { ApiError } from '@/lib/api'
import { toMe, updateMe } from '../me'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest: jest.Mock = jest.requireMock('@/lib/api').request

const valid = { id: 'u1', email: 'a@b.co', role: 'customer', firstName: 'Ana', middleName: 'Maria', lastName: 'Cruz', suffix: 'Jr.', fullName: 'Ana Maria Cruz Jr.', avatarUrl: null, birthday: '1995-05-15', gender: 'female', createdAt: '2026-03-02T01:00:00.000Z' }

describe('toMe', () => {
  it('keeps the profile fields', () => expect(toMe(valid)).toEqual(valid))
  it('defaults missing optional fields to null', () => expect(toMe({ ...valid, fullName: undefined, avatarUrl: '', createdAt: undefined })).toMatchObject({ fullName: null, avatarUrl: null, createdAt: null }))
  it('defaults the new optional fields to null, and drops an unknown gender', () =>
    expect(toMe({ ...valid, middleName: undefined, suffix: '', birthday: undefined, gender: 'robot' })).toMatchObject({ middleName: null, suffix: null, birthday: null, gender: null }))
  it('keeps only the date of a full ISO birthday', () => expect(toMe({ ...valid, birthday: '1995-05-15T00:00:00.000Z' })?.birthday).toBe('1995-05-15'))
  it.each(['id', 'email', 'firstName', 'lastName', 'role'])('rejects a body without %s', (key) => expect(toMe({ ...valid, [key]: undefined })).toBeNull())
  it('rejects an unknown role (e.g. the JWT role)', () => expect(toMe({ ...valid, role: 'authenticated' })).toBeNull())
  it.each([null, 'x', 42])('rejects %p', (body) => expect(toMe(body)).toBeNull())
})

describe('updateMe', () => {
  beforeEach(() => mockRequest.mockReset())
  it('PATCHes only the given keys and returns the parsed profile', async () => {
    mockRequest.mockResolvedValue({ ...valid, firstName: 'Anna' })
    const signal = new AbortController().signal
    await expect(updateMe({ firstName: 'Anna', suffix: null }, signal)).resolves.toEqual({ ...valid, firstName: 'Anna' })
    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/users/me', { firstName: 'Anna', suffix: null }, signal)
  })
  it('throws a server error when the answer is not a profile', async () => {
    mockRequest.mockResolvedValue({ ok: true })
    await expect(updateMe({ firstName: 'Anna' })).rejects.toMatchObject({ kind: 'server' })
  })
  it('lets a request failure through', async () => {
    mockRequest.mockRejectedValue(new ApiError('validation', 'birthday must be a valid ISO 8601 date string', 400))
    await expect(updateMe({ birthday: 'x' })).rejects.toMatchObject({ kind: 'validation', detail: 'birthday must be a valid ISO 8601 date string' })
  })
})
