import { ApiError, isRecord, request, str } from '@/lib/api'

export type Role = 'superadmin' | 'admin' | 'staff' | 'customer'
export type Gender = 'male' | 'female' | 'other' | 'unisex'
export type Me = {
  id: string
  email: string
  role: Role
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  fullName: string | null
  avatarUrl: string | null
  birthday: string | null
  gender: Gender | null
  createdAt: string | null
}
/** The fields PATCH /users/me accepts; a null clears an optional one. Send only what changed. */
export type MePatch = { firstName?: string; middleName?: string | null; lastName?: string; suffix?: string | null; birthday?: string | null; gender?: Gender | null }

const ROLES: unknown[] = ['superadmin', 'admin', 'staff', 'customer']
const GENDERS: unknown[] = ['male', 'female', 'other', 'unisex']

/** The profile from a /users/me body, or null when it lacks what the app cannot do without. */
export function toMe(body: unknown): Me | null {
  if (!isRecord(body)) return null
  const { id, email, firstName, lastName, role } = body
  if (!str(id) || !str(email) || !str(firstName) || !str(lastName) || !ROLES.includes(role)) return null
  return {
    id,
    email,
    role,
    firstName,
    middleName: str(body.middleName),
    lastName,
    suffix: str(body.suffix),
    fullName: str(body.fullName),
    avatarUrl: str(body.avatarUrl),
    birthday: str(body.birthday)?.slice(0, 10) ?? null,
    gender: GENDERS.includes(body.gender) ? body.gender : null,
    createdAt: str(body.createdAt),
  } as Me
}

// The role comes from here, never from the JWT (whose role is just "authenticated").
export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const me = toMe(await request('GET', '/users/me', undefined, signal))
  if (!me) throw new ApiError('server')
  return me
}

/** PATCH /users/me. The server answers the whole saved profile. */
export async function updateMe(patch: MePatch, signal?: AbortSignal): Promise<Me> {
  const me = toMe(await request('PATCH', '/users/me', patch, signal))
  if (!me) throw new ApiError('server')
  return me
}
