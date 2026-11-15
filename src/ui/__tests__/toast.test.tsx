import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

import { ToastProvider, useToast } from '../toast'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 10 }) }))

function Trigger({ bottom }: { bottom?: number }) {
  const toast = useToast()
  return <Pressable testID="go" onPress={() => toast('Hi', bottom === undefined ? undefined : { bottom })}><Text>go</Text></Pressable>
}

const hostBottom = () => screen.getByTestId('toast-host')

it('sits above the safe area by default and lifts by the given offset', async () => {
  await render(<ToastProvider><Trigger /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('go'))
  expect(hostBottom()).toHaveStyle({ bottom: 26 })
  await screen.unmount()
  await render(<ToastProvider><Trigger bottom={100} /></ToastProvider>)
  await fireEvent.press(screen.getByTestId('go'))
  expect(hostBottom()).toHaveStyle({ bottom: 126 })
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
  await act(async () => jest.advanceTimersByTime(4500))
  expect(screen.queryByTestId('toast')).toBeNull()
  await fireEvent.press(screen.getByTestId('acted'))
  await act(async () => jest.advanceTimersByTime(7999))
  expect(screen.getByTestId('toast')).toBeTruthy()
  await act(async () => jest.advanceTimersByTime(1))
  expect(screen.queryByTestId('toast')).toBeNull()
  jest.useRealTimers()
})
