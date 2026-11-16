import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Pressable, Text } from 'react-native'

import { ToastProvider, useToast } from '../toast'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 30, bottom: 10 }) }))

function Trigger() {
  const toast = useToast()
  return <Pressable testID="go" onPress={() => toast('Hi')}><Text>go</Text></Pressable>
}

it('sits at the top, below the status bar', async () => {
  await render(<ToastProvider><Trigger /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('go'))
  expect(screen.getByTestId('toast-host')).toHaveStyle({ top: 38 })
})

it('announces the message to screen readers, since VoiceOver ignores live regions', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
  await render(<ToastProvider><Trigger /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('go'))
  expect(announce).toHaveBeenCalledWith('Hi')
  announce.mockRestore()
})

it('shows an action button that closes the toast and runs the action, and lets touches through otherwise', async () => {
  const onPress = jest.fn()
  function WithAction() {
    const toast = useToast()
    return <Pressable testID="go" onPress={() => toast('Removed', { action: { label: 'Undo', onPress } })}><Text>go</Text></Pressable>
  }
  await render(<ToastProvider><WithAction /></ToastProvider>)
  expect(screen.getByTestId('toast-host').props.pointerEvents).toBe('box-none')
  await fireEvent.press(screen.getByTestId('go'))
  expect(screen.getByTestId('toast').props.pointerEvents).toBe('auto')
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }))
  expect(onPress).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('toast')).toBeNull()
})

it('has no action button on a plain toast, which stays out of the way of touches', async () => {
  await render(<ToastProvider><Trigger /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('go'))
  expect(screen.queryByTestId('toast-action')).toBeNull()
  expect(screen.getByTestId('toast').props.pointerEvents).toBe('none')
})

it('keeps a toast with an action for 8 seconds and a plain one for 4.5', async () => {
  jest.useFakeTimers()
  function Both() {
    const toast = useToast()
    return (
      <>
        <Pressable testID="plain" onPress={() => toast('Hi')}><Text>plain</Text></Pressable>
        <Pressable testID="acted" onPress={() => toast('Removed', { action: { label: 'Undo', onPress: () => {} } })}><Text>acted</Text></Pressable>
      </>
    )
  }
  await render(<ToastProvider><Both /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('plain'))
  await act(async () => jest.advanceTimersByTime(2500))
  expect(screen.queryByTestId('toast')).toBeNull()
  await fireEvent.press(screen.getByTestId('acted'))
  await act(async () => jest.advanceTimersByTime(4999))
  expect(screen.getByTestId('toast')).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(1))
  expect(screen.queryByTestId('toast')).toBeNull()
  jest.useRealTimers()
})
