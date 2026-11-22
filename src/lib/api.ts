import { apiBaseUrl } from './apiBase'
import { supabase } from './supabase'

export type ApiErrorKind = 'network' | 'rate-limit' | 'not-found' | 'server' | 'validation' | 'conflict' | 'forbidden'

// Lets a screen pick accurate copy. `detail` is the server's own message when it sent one (a 400 on adding past the stock).
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly detail?: string,
    readonly status?: number,
    readonly code?: string,
    readonly retryAfterMs?: number,
    readonly retryable?: boolean,
  ) {
    super(`Request failed (${kind}).`)
  }
}

const STATUS_KIND: Record<number, ApiErrorKind> = { 400: 'validation', 401: 'forbidden', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 429: 'rate-limit' }

// A 429's wait from the Retry-After header (whole seconds): 15 s when it is missing or unusable, never more than 120 s.
const retryAfterMs = (r: Response) => {
  if (r.status !== 429) return undefined
  const s = Number(r.headers?.get('Retry-After'))
  return Math.min(s > 0 ? s : 15, 120) * 1000
}

async function errorBody(response: Response): Promise<{ detail?: string; code?: string; retryable?: boolean }> {
  try {
    const { message, code, retryable } = (await response.json()) as { message?: unknown; code?: unknown; retryable?: unknown }
    const text = Array.isArray(message) ? message.filter((m) => typeof m === 'string').join('; ') : message
    return { detail: typeof text === 'string' && text ? text.slice(0, 300) : undefined, code: typeof code === 'string' ? code : undefined, retryable: typeof retryable === 'boolean' ? retryable : undefined }
  } catch {
    return {}
  }
}

// Expo's global URL is spec-compliant (throws on "https://" or a relative address), so a parse plus a scheme check is enough.
export function isHttps(url: string) {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
export const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const str = (value: unknown) => (typeof value === 'string' && value ? value : null)
// Prisma decimals may travel as strings, so a numeric string counts as a number.
export const num = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Calls the SilhouFit API with the Supabase token (`auth: false` for public endpoints sends none). An abort rejects with the AbortError itself. */
export async function request(method: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, signal?: AbortSignal, { auth = true }: { auth?: boolean } = {}): Promise<unknown> {
  const token = auth ? (await supabase.auth.getSession()).data.session?.access_token : undefined
  signal?.throwIfAborted()

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (failure) {
    if (signal?.aborted) throw failure
    throw new ApiError('network')
  }
  if (!response.ok) {
    const { detail, code, retryable } = await errorBody(response)
    throw new ApiError(STATUS_KIND[response.status] ?? 'server', detail, response.status, code, retryAfterMs(response), retryable)
  }
  try {
    return await response.json()
  } catch {
    throw new ApiError('server')
  }
}

/** Friendly copy for a failed request: what happened and what to do next. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (error.kind === 'network') return "Can't reach the server. Check your connection and try again."
  if (error.kind === 'rate-limit') return 'Too many requests. Wait a moment and try again.'
  if (error.kind === 'forbidden') return 'Your session has expired. Sign in again.'
  if (error.kind === 'not-found') return "We couldn't find that."
  if (error.kind === 'validation' || error.kind === 'conflict') return error.detail ?? 'That change could not be made.'
  return 'The server had a problem. Please try again.'
}
