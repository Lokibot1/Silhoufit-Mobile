import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Pressable, Text } from 'react-native'

import { ThemeContext, themes } from '../theme'
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

describe('title and tone', () => {
  function Toned({ tone, title }: { tone?: 'success' | 'warning' | 'danger' | 'info'; title?: string }) {
    const toast = useToast()
    return <Pressable testID="go" onPress={() => toast('Body', { tone, title })}><Text>go</Text></Pressable>
  }

  it.each([['success', '#1F6F4A'], ['warning', '#B45309'], ['danger', '#CB1C2B'], ['info', '#1D5FD1']] as const)('colours the %s edge the same in light and dark', async (tone, hex) => {
    for (const theme of [themes.light, themes.dark]) {
      const view = await render(<ThemeContext.Provider value={theme}><ToastProvider><Toned tone={tone} /></ToastProvider></ThemeContext.Provider>)
      await fireEvent.press(screen.getByTestId('go'))
      expect(screen.getByTestId('toast')).toHaveStyle({ borderLeftColor: hex })
      await view.unmount()
    }
  })

  it('keeps the red edge without a tone', async () => {
    await render(<ToastProvider><Toned /></ToastProvider>)
    await fireEvent.press(screen.getByTestId('go'))
    expect(screen.getByTestId('toast')).toHaveStyle({ borderLeftColor: '#CB1C2B' })
  })

  it('shows the title above the message and speaks the title first', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
    await render(<ToastProvider><Toned title="Payment received" /></ToastProvider>)
    await fireEvent.press(screen.getByTestId('go'))
    expect(screen.getByText('Payment received')).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
    expect(announce).toHaveBeenCalledWith('Payment received. Body')
    announce.mockRestore()
  })

  it('still shows a toast that has a title and an empty message', async () => {
    function TitleOnly() {
      const toast = useToast()
      return <Pressable testID="go" onPress={() => toast('', { title: 'Order shipped', tone: 'info' })}><Text>go</Text></Pressable>
    }
    await render(<ToastProvider><TitleOnly /></ToastProvider>)
    await fireEvent.press(screen.getByTestId('go'))
    expect(screen.getByTestId('toast')).toBeTruthy()
    expect(screen.getByText('Order shipped')).toBeTruthy()
  })

  it('keeps a toned toast for 5 seconds', async () => {
    jest.useFakeTimers()
    await render(<ToastProvider><Toned tone="success" /></ToastProvider>)
    await fireEvent.press(screen.getByTestId('go'))
    await act(async () => jest.advanceTimersByTime(4999))
    expect(screen.getByTestId('toast')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(1))
    expect(screen.queryByTestId('toast')).toBeNull()
    jest.useRealTimers()
  })
})
