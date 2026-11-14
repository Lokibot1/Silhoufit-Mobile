import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { Button } from '../Button'
import { color } from '../theme'

it.each([
  ['primary', color.paper],
  ['secondary', color.obsidian],
] as const)('spins in a visible colour on the %s variant', async (variant, expected) => {
  await render(<Button label="Go" variant={variant} pending onPress={jest.fn()} />)
  expect((screen.root!.children[0] as unknown as { props: { color: string } }).props.color).toBe(expected)
})

it('renders the icon next to the label', async () => {
  await render(<Button label="Go" icon={<Text testID="icon">i</Text>} onPress={jest.fn()} />)
  expect(screen.getByTestId('icon')).toBeTruthy()
  expect(screen.getByText('Go')).toBeTruthy()
})
