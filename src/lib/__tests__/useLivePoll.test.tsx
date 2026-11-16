import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { ApiError } from '../api'
import { MAX_POLL_MS, POLL_MS, useLivePoll } from '../useLivePoll'

jest.mock('../supabase', () => ({ supabase: {} }))

jest.mock('expo-router', () => ({ useIsFocused: () => jest.requireActual('react').useSyncExternalStore(mockFocus.subscribe, () => mockFocus.on) }))
const mockFocus = {
  on: true,
  subs: new Set<() => void>(),
  subscribe: (sub: () => void) => (mockFocus.subs.add(sub), () => void mockFocus.subs.delete(sub)),
}
const setFocus = (on: boolean) =>
  act(async () => {
    mockFocus.on = on
    mockFocus.subs.forEach((sub) => sub())
  })

let onChange: (state: string) => void = () => {}
const remove = jest.fn()
const setApp = (state: string) =>
  act(async () => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true })
    onChange(state)
  })
const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(Math, 'random').mockReturnValue(0.5) // jitter factor exactly 1
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, handler: (state: string) => void) => {
    onChange = handler
    return { remove }
  }) as never)
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
  mockFocus.on = true
  remove.mockClear()
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('waits one interval for the first read, then repeats every interval', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  await renderHook(() => useLivePoll(refresh))
  await tick(POLL_MS - 1)
  expect(refresh).not.toHaveBeenCalled()
  await tick(1)
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledWith(expect.any(AbortSignal))
  await tick(POLL_MS)
  await tick(POLL_MS)
  expect(refresh).toHaveBeenCalledTimes(3)
})

it('keeps the wait within +-10% of the interval', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  ;(Math.random as jest.Mock).mockReturnValue(0)
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(899)
  expect(refresh).not.toHaveBeenCalled()
  ;(Math.random as jest.Mock).mockReturnValue(0.999999) // used to schedule the read after this one
  await tick(1)
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(1098)
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(1)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('doubles the wait after each rejected read up to the cap, and resets after a success', async () => {
  const refresh = jest.fn().mockRejectedValue(new Error('down'))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 20_000 }))
  await tick(20_000) // read 1 fails: next wait 40 s
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(39_999)
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(1) // read 2 fails: next wait 80 s
  expect(refresh).toHaveBeenCalledTimes(2)
  await tick(80_000) // read 3 fails: capped at 120 s, not 160 s
  expect(refresh).toHaveBeenCalledTimes(3)
  await tick(MAX_POLL_MS)
  expect(refresh).toHaveBeenCalledTimes(4)
  await tick(MAX_POLL_MS)
  expect(refresh).toHaveBeenCalledTimes(5)
  refresh.mockResolvedValue(undefined) // read 6 succeeds: back to 20 s
  await tick(MAX_POLL_MS)
  expect(refresh).toHaveBeenCalledTimes(6)
  await tick(20_000)
  expect(refresh).toHaveBeenCalledTimes(7)
})

it('never overlaps: a slow read is not joined by a second one', async () => {
  let finish: () => void = () => {}
  const refresh = jest.fn().mockReturnValue(new Promise<void>((r) => (finish = r)))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000)
  await tick(10_000)
  expect(refresh).toHaveBeenCalledTimes(1)
  refresh.mockResolvedValue(undefined)
  await act(async () => finish())
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('aborts the read in flight on unmount, removes the AppState listener and reads no more', async () => {
  let signal: AbortSignal | undefined
  const refresh = jest.fn((s: AbortSignal) => ((signal = s), new Promise(() => {})))
  const view = await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000)
  expect(signal?.aborted).toBe(false)
  await view.unmount()
  expect(signal?.aborted).toBe(true)
  expect(remove).toHaveBeenCalledTimes(1)
  await tick(10_000)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('an aborted read is not a failure', async () => {
  const refresh = jest.fn((signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000)
  await setApp('background') // aborts the read
  await setApp('active') // resumes at once: the wait was not doubled
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('pauses in the background (no timer, in-flight read aborted) and reads once on return, then continues', async () => {
  let signal: AbortSignal | undefined
  const refresh = jest.fn((s: AbortSignal) => ((signal = s), Promise.resolve()))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(1)
  await setApp('background')
  await tick(10_000)
  expect(refresh).toHaveBeenCalledTimes(1)
  await setApp('active')
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(signal?.aborted).toBe(false)
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(3)
})

it('pauses while the screen is not focused and reads once on focus', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await setFocus(false)
  await tick(10_000)
  expect(refresh).not.toHaveBeenCalled()
  await setFocus(true)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('with readOnFocus false, focus restarts the timer instead of reading (the screen reloads itself)', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000, readOnFocus: false }))
  await setFocus(false)
  await setFocus(true)
  expect(refresh).not.toHaveBeenCalled()
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('does not read while backgrounded even if a pause is missed', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true })
  await tick(5000)
  expect(refresh).not.toHaveBeenCalled()
})

it('done stops polling for good, even after a return to the foreground', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  const view = await renderHook((props: { done: boolean }) => useLivePoll(refresh, { intervalMs: 1000, done: props.done }), { initialProps: { done: false } })
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(1)
  await view.rerender({ done: true })
  await tick(10_000)
  await setApp('active')
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('enabled false does nothing until it turns true', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  const view = await renderHook((props: { enabled: boolean }) => useLivePoll(refresh, { intervalMs: 1000, enabled: props.enabled }), { initialProps: { enabled: false } })
  await tick(10_000)
  await setApp('active')
  expect(refresh).not.toHaveBeenCalled()
  await view.rerender({ enabled: true })
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('a new resetKey restarts the wait and aborts the old read', async () => {
  let signal: AbortSignal | undefined
  const refresh = jest.fn((s: AbortSignal) => ((signal = s), new Promise(() => {})))
  const view = await renderHook((props: { key: string }) => useLivePoll(refresh, { intervalMs: 1000, resetKey: props.key }), { initialProps: { key: 'u1' } })
  await tick(1000)
  await view.rerender({ key: 'u2' })
  expect(signal?.aborted).toBe(true)
  await tick(1000)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('applies the jitter before the cap, so a wait never exceeds MAX_POLL_MS', async () => {
  const refresh = jest.fn().mockRejectedValue(new Error('down'))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 20_000 }))
  ;(Math.random as jest.Mock).mockReturnValue(0.999999) // +10%
  await tick(22_000)
  await tick(44_000)
  await tick(88_000) // three failures: the next wait would be 160 s +10%, capped at 120 s
  expect(refresh).toHaveBeenCalledTimes(3)
  await tick(MAX_POLL_MS)
  expect(refresh).toHaveBeenCalledTimes(4)
})

it('keeps the failure count when the read was aborted', async () => {
  let abort = false
  const refresh = jest.fn((signal: AbortSignal) =>
    abort ? new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve())) : Promise.reject(new Error('down')),
  )
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000) // read 1 fails: failures 1, next wait 2 s
  abort = true
  await tick(2000) // read 2 hangs
  await setApp('background') // aborted, and resolving must not reset the count
  abort = false
  await tick(10_000)
  await setApp('active') // read 3 fails: failures 2, next wait 4 s (it would be 2 s if the abort had reset it)
  expect(refresh).toHaveBeenCalledTimes(3)
  await tick(2000)
  expect(refresh).toHaveBeenCalledTimes(3)
  await tick(2000)
  expect(refresh).toHaveBeenCalledTimes(4)
})

it('reads once for a burst of active events (iOS inactive/active flicker)', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined)
  await renderHook(() => useLivePoll(refresh, { intervalMs: 10_000 }))
  await setApp('background')
  await setApp('active')
  expect(refresh).toHaveBeenCalledTimes(1)
  await setApp('inactive')
  await setApp('active')
  await setApp('inactive')
  await setApp('active')
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(3001)
  await setApp('inactive')
  await setApp('active')
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('waits at least the Retry-After of a 429 before the next read', async () => {
  const refresh = jest.fn().mockRejectedValue(new ApiError('rate-limit', undefined, 429, undefined, 90_000))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 1000 }))
  await tick(1000)
  await tick(89_999)
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(1)
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('a short Retry-After still waits the normal backoff', async () => {
  const refresh = jest.fn().mockRejectedValue(new ApiError('rate-limit', undefined, 429, undefined, 5000))
  await renderHook(() => useLivePoll(refresh, { intervalMs: 20_000 }))
  await tick(20_000) // failed: normal wait 40 s beats 5 s
  await tick(39_999)
  expect(refresh).toHaveBeenCalledTimes(1)
  await tick(1)
  expect(refresh).toHaveBeenCalledTimes(2)
})
