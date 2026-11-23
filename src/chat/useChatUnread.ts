import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'

import { fetchMyConversation } from '@/api/chat'
import { useSession } from '@/auth/session'

/** Whether the store has replied and the customer has not read it yet. Always false when signed out. */
export function useChatUnread() {
  const { session, profile } = useSession()
  const userId = session?.user.id ?? null
  const customer = profile?.role === 'customer'
  const [unread, setUnread] = useState(false)
  // A different account must not inherit the previous one's dot: reset while rendering, before the fetch effect runs.
  const [owner, setOwner] = useState(userId)
  if (owner !== userId) {
    setOwner(userId)
    setUnread(false)
  }
  // shortcut: badge refreshes on focus only; subscribe to chat:customer:{id} if staff replies must badge live
  // Staff accounts have no customer conversation (the API refuses them), so only customers ask. A failed load just leaves the dot as it was. (The API creates the conversation the first time it is asked, same as the web badge.)
  useFocusEffect(
    useCallback(() => {
      if (!userId || !customer) return
      const ctl = new AbortController()
      fetchMyConversation(ctl.signal).then((conversation) => setUnread(conversation.hasUnreadMessages), () => {})
      return () => ctl.abort()
    }, [userId, customer]),
  )
  return userId ? unread : false
}
