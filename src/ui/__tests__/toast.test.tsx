import { fireEvent, render, screen } from '@testing-library/react-native'
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
