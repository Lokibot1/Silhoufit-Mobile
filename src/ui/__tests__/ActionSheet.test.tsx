import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { ActionSheet } from '../ActionSheet'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))

const setup = async (visible = true) => {
  const onClose = jest.fn()
  const onPress = jest.fn()
  await render(<ActionSheet visible={visible} title="Profile photo" onClose={onClose} options={[{ label: 'Take Photo', testID: 'take', onPress }, { label: 'Remove Photo', testID: 'remove', destructive: true, onPress }]} />)
  return { onClose, onPress }
}

afterEach(() => jest.restoreAllMocks())

it('lists the options and a Cancel row under a header', async () => {
  await setup()
  expect(screen.getByRole('header', { name: 'Profile photo' })).toBeTruthy()
  expect(screen.getByText('Take Photo')).toBeTruthy()
  expect(screen.getByText('Remove Photo')).toBeTruthy()
  expect(screen.getByTestId('sheet-cancel')).toBeTruthy()
})

it('shows nothing while closed', async () => {
  await setup(false)
  expect(screen.queryByText('Take Photo')).toBeNull()
})

it('keeps the sheet open when its body is tapped: the backdrop is a sibling, not a parent', async () => {
  const { onClose } = await setup()
  await fireEvent.press(screen.getByText('Profile photo'))
  expect(onClose).not.toHaveBeenCalled()
})

it('closes on Cancel and on a tap outside', async () => {
  const { onClose, onPress } = await setup()
  await fireEvent.press(screen.getByTestId('sheet-cancel'))
  await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }))
  expect(onClose).toHaveBeenCalledTimes(2)
  expect(onPress).not.toHaveBeenCalled()
})

it('on Android runs the action only after the fade has finished', async () => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'android')
  const { onClose, onPress } = await setup()
  await fireEvent.press(screen.getByTestId('take'))
  expect(onClose).toHaveBeenCalled()
  expect(onPress).not.toHaveBeenCalled()
  await act(async () => jest.advanceTimersByTime(300))
  expect(onPress).toHaveBeenCalledTimes(1)
  jest.useRealTimers()
})

it('on iOS runs the action only once the sheet is dismissed, so the picker never opens over a closing modal', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios')
  const { onClose, onPress } = await setup()
  await fireEvent.press(screen.getByTestId('take'))
  expect(onClose).toHaveBeenCalled()
  expect(onPress).not.toHaveBeenCalled()
  const modal = screen.toJSON() as unknown as { props: { onDismiss: () => void } }
  await act(async () => modal.props.onDismiss())
  expect(onPress).toHaveBeenCalledTimes(1)
  await act(async () => modal.props.onDismiss())
  expect(onPress).toHaveBeenCalledTimes(1)
})
