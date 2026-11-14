import { fireEvent, render, screen } from '@testing-library/react-native'

import { StateMessage } from '../StateMessage'

const props = { title: 'Oops', message: 'It broke', actionLabel: 'Retry', testID: 'act' }

it('fires the action', async () => {
  const onAction = jest.fn()
  await render(<StateMessage {...props} onAction={onAction} />)
  await fireEvent.press(screen.getByTestId('act'))
  expect(onAction).toHaveBeenCalledTimes(1)
})

it('sets the alert role only when asked', async () => {
  const { rerender } = await render(<StateMessage {...props} onAction={jest.fn()} alert />)
  // getByRole needs an accessible element; the container must stay non-accessible so the button stays reachable.
  expect(screen.root?.props.accessibilityRole).toBe('alert')
  await rerender(<StateMessage {...props} onAction={jest.fn()} />)
  expect(screen.root?.props.accessibilityRole).toBeUndefined()
})
