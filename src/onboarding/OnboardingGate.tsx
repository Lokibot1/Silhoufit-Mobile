import { router, usePathname } from 'expo-router'
import { useEffect, useState } from 'react'

import { useSession } from '@/auth/session'
import { onboardingDone } from './status'

// Never interrupt sign-in, the age step, checkout or the tour itself.
const BUSY = /^\/(sign-in|sign-up|forgot-password|check-email|auth|checkout|onboarding)(\/|$)/

/**
 * Offers the first-run tour once to a signed-in customer who has not seen it. It waits for the profile (so the age step always
 * wins) and offers at most once per signed-in user per app run, so a failed save can never bring the tour back screen after screen.
 * `enabled` is false while the cold-start loader covers the app.
 */
export function OnboardingGate({ enabled }: { enabled: boolean }) {
  const { session, profile } = useSession()
  const pathname = usePathname()
  const [offered, setOffered] = useState<string | null>(null)
  const userId = session?.user.id
  const eligible = enabled && !!session && profile?.role === 'customer' && !BUSY.test(pathname) && offered !== userId

  useEffect(() => {
    if (!eligible || !session) return
    let live = true
    void onboardingDone(session.user).then((done) => {
      if (!live) return
      setOffered(session.user.id)
      if (!done) router.push('/onboarding')
    })
    return () => {
      live = false
    }
  }, [eligible, session])

  return null
}
