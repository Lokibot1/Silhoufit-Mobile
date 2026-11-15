import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

import { supabase } from '@/lib/supabase'

export type GoogleResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled?: false; message: string }

export const GOOGLE_REDIRECT = Linking.createURL('auth/callback')

const copy = {
  network: "Can't reach Google sign-in. The connection dropped before it finished. Check your connection and try again.",
  server: "We couldn't start Google sign-in. Something went wrong on our side. Try again in a moment.",
  unfinished: "Google sign-in didn't finish. The sign-in expired or was already used, so you're not signed in. Tap Continue with Google to try again.",
  // Mirrors signInMessage in session.tsx.
  deactivated: 'This account has been deactivated. Contact the store for help.',
}
const fail = (message: string): GoogleResult => ({ ok: false, message })
const cancelled: GoogleResult = { ok: false, cancelled: true }

/** Reads the redirect back from the browser (the email links reuse it with their own `base`). Supabase puts the result in the query (PKCE) or the # fragment (errors). Null for any other address. */
export function readCallback(url: string, base = GOOGLE_REDIRECT) {
  if (!url.startsWith(base)) return null
  const [path, hash = ''] = url.slice(base.length).split('#')
  if (path && !path.startsWith('?')) return null
  const params = new URLSearchParams(`${path.slice(1)}&${hash}`)
  return {
    code: params.get('code'),
    error: params.get('error'),
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  }
}

const REDIRECT_GRACE_MS = 1000

/** Only ever open our own Supabase authorize address, never whatever address came back. Fails closed on any parse error. */
function isAuthorizeUrl(raw: string | null | undefined) {
  try {
    const base = process.env.EXPO_PUBLIC_SUPABASE_URL
    if (!raw || !base) return false
    const url = new URL(raw)
    return url.protocol === 'https:' && url.origin === new URL(base).origin && url.pathname === '/auth/v1/authorize'
  } catch {
    return false
  }
}

const banned =(code?: string | null, description?: string | null) => code === 'user_banned' || /banned/i.test(description ?? '')

/** Opens Google in the system browser, then trades the returned code for a session (SessionProvider picks it up from onAuthStateChange). */
export async function signInWithGoogle(): Promise<GoogleResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: GOOGLE_REDIRECT, skipBrowserRedirect: true } })
  if (error) return fail(error.status === 0 ? copy.network : copy.server)
  const url = data.url
  if (!isAuthorizeUrl(url)) return fail(copy.server)

  // Android can report 'dismiss' while the redirect link is still arriving, so listen for it from before the browser opens.
  let seen: string | null = null
  let wake: (() => void) | undefined
  const subscription = Linking.addEventListener('url', (event) => {
    if (!event.url.startsWith(GOOGLE_REDIRECT)) return
    seen ??= event.url
    wake?.()
  })
  let redirect: string | null
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, GOOGLE_REDIRECT)
    redirect = result.type === 'success' ? result.url : seen
    if (!redirect) {
      const initial = await Linking.getInitialURL()
      if (initial?.startsWith(GOOGLE_REDIRECT)) seen ??= initial
      redirect = seen ?? (await new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(seen), REDIRECT_GRACE_MS)
        wake = () => {
          clearTimeout(timer)
          resolve(seen)
        }
      }))
    }
  } finally {
    subscription.remove()
  }
  if (!redirect) return cancelled
  const callback = readCallback(redirect)
  if (!callback) return fail(copy.unfinished)
  if (banned(callback.errorCode, callback.errorDescription)) return fail(copy.deactivated)
  if (callback.error === 'access_denied') return cancelled
  // error_description is never shown: it is provider text, not copy we wrote.
  if (callback.error || !callback.code) return fail(copy.unfinished)

  const { error: exchange } = await supabase.auth.exchangeCodeForSession(callback.code)
  if (!exchange) return { ok: true }
  if (exchange.status === 0) return fail(copy.network)
  return fail(exchange.code === 'user_banned' ? copy.deactivated : copy.unfinished)
}
