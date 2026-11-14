import { act, renderHook, waitFor } from '@testing-library/react-native'

import { useRequest } from '../useRequest'

const never = () => new Promise<never>(() => {})

it('is loading until the request settles, then ready with the data', async () => {
  const loading = await renderHook(() => useRequest('a', never))
  expect(loading.result.current.status).toBe('loading')
  const { result } = await renderHook(() => useRequest('a', async () => 'data'))
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(result.current.data).toBe('data')
})

it('reports an error and retry loads again', async () => {
  const load = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok')
  const { result } = await renderHook(() => useRequest('a', load))
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toBeInstanceOf(Error)
  await act(async () => result.current.retry())
  await waitFor(() => expect(result.current.status).toBe('ready'))
  expect(load).toHaveBeenCalledTimes(2)
})

it('aborts on unmount', async () => {
  const signals: AbortSignal[] = []
  const { unmount } = await renderHook(() => useRequest('a', (signal) => (signals.push(signal), never())))
  expect(signals[0].aborted).toBe(false)
  await unmount()
  expect(signals[0].aborted).toBe(true)
})

it('aborts the old request on a key change and ignores its late answer', async () => {
  const signals: AbortSignal[] = []
  let resolveOld: (value: string) => void = () => {}
  const load = jest.fn((signal: AbortSignal) => {
    signals.push(signal)
    return signals.length === 1 ? new Promise<string>((resolve) => (resolveOld = resolve)) : Promise.resolve('new')
  })
  const { result, rerender } = await renderHook(({ k }: { k: string }) => useRequest(k, load), { initialProps: { k: 'a' } })
  await rerender({ k: 'b' })
  await waitFor(() => expect(result.current.data).toBe('new'))
  expect(signals[0].aborted).toBe(true)
  await act(async () => resolveOld('old'))
  expect(result.current.data).toBe('new')
})
