import { ApiError, isRecord, request, str } from '@/lib/api'

export type Role = 'superadmin' | 'admin' | 'staff' | 'customer'
export type Me = { id: string; email: string; role: Role; firstName: string; lastName: string; fullName: string | null; avatarUrl: string | null }

const ROLES: unknown[] = ['superadmin', 'admin', 'staff', 'customer']

/** The profile from a /users/me body, or null when it lacks what the app cannot do without. */
export function toMe(body: unknown): Me | null {
  if (!isRecord(body)) return null
  const { id, email, firstName, lastName, role } = body
  if (!str(id) || !str(email) || !str(firstName) || !str(lastName) || !ROLES.includes(role)) return null
  return { id, email, firstName, lastName, role, fullName: str(body.fullName), avatarUrl: str(body.avatarUrl) } as Me
}

// The role comes from here, never from the JWT (whose role is just "authenticated").
export async function fetchMe(signal?: AbortSignal): Promise<Me> {
  const me = toMe(await request('GET', '/users/me', undefined, signal))
  if (!me) throw new ApiError('server')
  return me
}
