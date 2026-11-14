import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'

import { useReduceMotion } from '../useReduceMotion'

let emit: (on: boolean) => void = () => {}
const remove = jest.fn()

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_name: string, handler: (on: boolean) => void) => {
    emit = handler
    return { remove }
  }) as never)
})
afterEach(() => jest.restoreAllMocks())

it('defaults to false and follows the OS setting', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  const { result } = await renderHook(() => useReduceMotion())
  expect(result.current).toBe(false)
})

it('is true when Reduce Motion is already on', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
  const { result } = await renderHook(() => useReduceMotion())
  await waitFor(() => expect(result.current).toBe(true))
})

it('reacts to the change event and unsubscribes on unmount', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
  const { result, unmount } = await renderHook(() => useReduceMotion())
  await act(async () => emit(true))
  expect(result.current).toBe(true)
  await unmount()
  expect(remove).toHaveBeenCalled()
})
