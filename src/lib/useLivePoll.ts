import { useIsFocused } from 'expo-router'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

export const POLL_MS = 20_000
/** After each failed read the wait doubles, up to this, so an outage does not spend the API's request budget. */
export const MAX_POLL_MS = 120_000
const JITTER = 0.1
/** Repeated 'active' events inside this window (iOS inactive/active flicker) read once, not each time. */
const BURST_MS = 3000

type LivePollOptions = {
  /** The wait between reads; +-10% so devices do not hit the API in step. */
  intervalMs?: number
  /** False reads nothing, e.g. before there is anything to keep fresh. */
  enabled?: boolean
  /** True once the data can no longer change: polling stops for good. */
  done?: boolean
  /** Reading again when the screen regains focus. A screen that already reloads on focus sets false, so focus costs one request, not two. */
  readOnFocus?: boolean
  /** A new value restarts the poll (a different account). */
  resetKey?: string | null
}

/**
 * Calls `refresh` every `intervalMs`, never two at once, while the app is active and the screen is focused. Leaving either aborts the
 * request in flight and stops the timer; the app becoming active reads once straight away (not again within 3 s; so does focus, unless `readOnFocus` is false).
 * A rejected `refresh` doubles the wait (up to MAX_POLL_MS); a resolved one resets it. `refresh` gets an AbortSignal that fires on
 * pause, disable and unmount; an abort is not a failure. The first read comes one interval after start: the caller loads the data itself.
 * shortcut: polling; replace with a Supabase Realtime channel when the backend broadcasts order changes
 */
export function useLivePoll(
  refresh: (signal: AbortSignal) => Promise<unknown>,
  { intervalMs = POLL_MS, enabled = true, done = false, readOnFocus = true, resetKey = null }: LivePollOptions = {},
) {
  const latest = useRef(refresh)
  const focused = useIsFocused()
  const focusRef = useRef(focused)
  const onFocus = useRef(readOnFocus)
  const control = useRef<{ pause: () => void; resume: (now: boolean) => void } | null>(null)
  const mounted = useRef(false)
  const lastResume = useRef(0)
  useEffect(() => {
    latest.current = refresh
    onFocus.current = readOnFocus
  })

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return control.current?.pause()
      const now = Date.now()
      control.current?.resume(now - lastResume.current > BURST_MS)
      lastResume.current = now
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    focusRef.current = focused
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (focused) control.current?.resume(onFocus.current)
    else control.current?.pause()
  }, [focused])

  useEffect(() => {
    if (!enabled || done) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0
    let flight: AbortController | null = null
    const canRun = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive' && focusRef.current // 'unknown' counts as active

    const schedule = () => {
      clearTimeout(timer)
      const wait = intervalMs * 2 ** failures * (1 - JITTER + 2 * JITTER * Math.random())
      timer = setTimeout(run, Math.min(wait, MAX_POLL_MS))
    }
    async function run() {
      clearTimeout(timer)
      // Paused: stay quiet; resume() starts it again.
      if (flight || !canRun()) return
      const mine = (flight = new AbortController())
      try {
        await latest.current(mine.signal)
        if (!mine.signal.aborted) failures = 0
      } catch {
        if (!mine.signal.aborted) failures += 1
      }
      if (mine.signal.aborted) return
      flight = null
      schedule()
    }
    control.current = {
      pause: () => {
        clearTimeout(timer)
        flight?.abort()
        flight = null
      },
      resume: (now) => {
        if (!canRun() || flight) return
        if (now) void run()
        else schedule()
      },
    }
    schedule()
    return () => {
      clearTimeout(timer)
      flight?.abort()
      control.current = null
    }
  }, [enabled, done, intervalMs, resetKey])
}
