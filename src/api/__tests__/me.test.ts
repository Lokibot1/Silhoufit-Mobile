import { toMe } from '../me'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

const valid = { id: 'u1', email: 'a@b.co', role: 'customer', firstName: 'Ana', lastName: 'Cruz', fullName: 'Ana Cruz', avatarUrl: null, createdAt: '2026-03-02T01:00:00.000Z' }

describe('toMe', () => {
  it('keeps the profile fields', () => expect(toMe(valid)).toEqual(valid))
  it('defaults missing optional fields to null', () => expect(toMe({ ...valid, fullName: undefined, avatarUrl: '', createdAt: undefined })).toMatchObject({ fullName: null, avatarUrl: null, createdAt: null }))
  it.each(['id', 'email', 'firstName', 'lastName', 'role'])('rejects a body without %s', (key) => expect(toMe({ ...valid, [key]: undefined })).toBeNull())
  it('rejects an unknown role (e.g. the JWT role)', () => expect(toMe({ ...valid, role: 'authenticated' })).toBeNull())
  it.each([null, 'x', 42])('rejects %p', (body) => expect(toMe(body)).toBeNull())
})
