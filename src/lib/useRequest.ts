import { useEffect, useRef, useState } from 'react'

type Settled<T> = { at: string; ok: true; data: T } | { at: string; ok: false; error: unknown }

/** Loads once per `key` and again on `retry()`. Aborts the old request on a key change or unmount, so a late answer is ignored. */
export function useRequest<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const at = `${key}#${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    loadRef.current(controller.signal).then(
      (data) => !controller.signal.aborted && setSettled({ at, ok: true, data }),
      (error) => !controller.signal.aborted && setSettled({ at, ok: false, error }),
    )
    return () => controller.abort()
  }, [at])

  const current = settled?.at === at ? settled : null
  return {
    status: !current ? ('loading' as const) : current.ok ? ('ready' as const) : ('error' as const),
    data: current?.ok ? current.data : undefined,
    error: current && !current.ok ? current.error : undefined,
    retry: () => setAttempt((n) => n + 1),
  }
}
