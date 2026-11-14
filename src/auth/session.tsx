import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'

import { fetchMe, type Me } from '@/api/me'
import { ApiError, errorMessage } from '@/lib/api'
import { supabase } from '@/lib/supabase'

export type SignInResult = { ok: true } | { ok: false; message: string }
export type SessionValue = {
  session: Session | null
  profile: Me | null
  loading: boolean
  error: string | null
  retry(): void
  signIn(email: string, password: string): Promise<SignInResult>
  signOut(): Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

function signInMessage(error: { code?: string; status?: number }): string {
  if (error.code === 'invalid_credentials' || error.code === 'email_not_confirmed') return 'Email or password is incorrect. Check both and try again.'
  if (error.code === 'user_banned') return 'This account has been deactivated. Contact the store for help.'
  if (error.status === 429) return 'Too many sign-in attempts. Wait a minute and try again.'
  if (error.status === 0) return "Can't reach the sign-in service. Check your connection and try again."
  return 'Sign-in failed on our side. Please try again.'
}

async function endSession() {
  const { error } = await supabase.auth.signOut()
  if (error) await supabase.auth.signOut({ scope: 'local' })
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [loaded, setLoaded] = useState<Me | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const userId = session?.user.id
  const error = failed && failed.id === userId ? failed.message : null

  // INITIAL_SESSION replays the stored session. Keep this callback synchronous: supabase calls inside it can deadlock.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) setLoaded(null)
      setRestoring(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Keyed on the user id, so a token refresh for the same user does not refetch.
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetchMe(controller.signal).then(
      (me) => {
        setLoaded(me)
        setFailed(null)
      },
      (failure) => {
        if (controller.signal.aborted) return
        if (failure instanceof ApiError && failure.kind === 'forbidden') endSession().catch(() => {})
        else setFailed({ id: userId, message: errorMessage(failure) })
      },
    )
    return () => controller.abort()
  }, [userId, attempt])

  useEffect(() => {
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })
    return () => sub.remove()
  }, [])

  const profile = loaded && loaded.id === userId ? loaded : null
  const value: SessionValue = {
    session,
    profile,
    loading: restoring || (!!session && !profile && !error),
    error,
    retry() {
      setFailed(null)
      setAttempt((n) => n + 1)
    },
    async signIn(email, password) {
      const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return failure ? { ok: false, message: signInMessage(failure) } : { ok: true }
    },
    async signOut() {
      setFailed(null)
      await endSession()
    },
  }
  return <SessionContext value={value}>{children}</SessionContext>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
