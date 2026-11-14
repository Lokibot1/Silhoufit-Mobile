import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import { fetchCart } from '@/api/cart'
import { useSession } from '@/auth/session'

/** The signed-in account's cart item count for a cart badge (always 0 signed out). `refresh()` reloads it, e.g. after an add. */
export function useCartCount() {
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const [count, setCount] = useState(0)
  const [reloads, setReloads] = useState(0)
  // A different account must not inherit the previous one's count: reset while rendering, before the fetch effect runs.
  const [countUser, setCountUser] = useState(userId)
  if (countUser !== userId) {
    setCountUser(userId)
    setCount(0)
  }
  // The badge is a nicety: it needs a session, and a failed load just leaves it as it was.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return
      const ctl = new AbortController()
      fetchCart(ctl.signal).then((cart) => setCount(cart.totalItems), () => {})
      return () => ctl.abort()
    // `reloads` only re-runs this load when refresh() is called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, reloads]),
  )
  const refresh = useCallback(() => setReloads((n) => n + 1), [])
  return { count: userId ? count : 0, refresh }
}
