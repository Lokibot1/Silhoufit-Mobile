import * as Linking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'

import { openEmailLink, type LinkOutcome } from '@/auth/email'
import { readCallback } from '@/auth/google'

// On a cold start the launch URL can arrive a moment after the screen mounts.
const URL_GRACE_MS = 1500

/** Opens the emailed link this screen was launched with (the code works once, so a re-run of the effect reuses the same exchange). `retry` repeats it after a network failure. */
export function useEmailLink(base: string) {
  const url = Linking.useLinkingURL()
  const [attempt, setAttempt] = useState(0)
  const [done, setDone] = useState<{ key: string; outcome: LinkOutcome } | null>(null)
  const run = useRef<{ key: string; promise: Promise<LinkOutcome> } | null>(null)
  const [waited, setWaited] = useState(false)
  const key = `${attempt}|${url}`
  const ready = !!url || waited

  useEffect(() => {
    if (url) return
    const timer = setTimeout(() => setWaited(true), URL_GRACE_MS)
    return () => clearTimeout(timer)
  }, [url])

  useEffect(() => {
    if (!ready) return
    let live = true
    if (run.current?.key !== key) run.current = { key, promise: openEmailLink(url ?? '', base) }
    run.current.promise.then((outcome) => live && setDone({ key, outcome }))
    return () => {
      live = false
    }
  }, [key, url, base, ready])

  return { state: ready && done?.key === key ? done.outcome : ('checking' as const), callback: url ? readCallback(url, base) : null, retry: () => setAttempt((n) => n + 1) }
}
