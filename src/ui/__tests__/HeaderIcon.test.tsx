import { fireEvent, render, screen } from '@testing-library/react-native'

import { HeaderIcon } from '../HeaderIcon'

jest.mock('../PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))

const base = { testID: 'hi', name: 'bag-outline' as const, label: 'Cart', onPress: jest.fn() }

it('shows a plain button with just the label', async () => {
  await render(<HeaderIcon {...base} />)
  expect(screen.getByLabelText('Cart')).toBeTruthy()
  expect(screen.queryByTestId('hi-badge')).toBeNull()
})

it('adds the status to the label and shows the count', async () => {
  await render(<HeaderIcon {...base} count={3} status="3 items" />)
  expect(screen.getByLabelText('Cart, 3 items')).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
})

it('caps the count at 99+', async () => {
  await render(<HeaderIcon {...base} count={120} />)
  expect(screen.getByText('99+')).toBeTruthy()
})

it('shows a dot with no number, and a count wins over the dot', async () => {
  const view = await render(<HeaderIcon {...base} dot status="unread messages" />)
  expect(screen.getByLabelText('Cart, unread messages')).toBeTruthy()
  expect(screen.getByTestId('hi-badge')).toBeTruthy()
  expect(screen.queryByText(/\d/)).toBeNull()
  await view.rerender(<HeaderIcon {...base} dot count={2} />)
  expect(screen.getByText('2')).toBeTruthy()
})

it('calls onPress', async () => {
  await render(<HeaderIcon {...base} />)
  await fireEvent.press(screen.getByTestId('hi'))
  expect(base.onPress).toHaveBeenCalledTimes(1)
})
