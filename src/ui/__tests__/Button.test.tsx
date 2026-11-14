import { render, screen } from '@testing-library/react-native'

import { Button } from '../Button'
import { color } from '../theme'

it.each([
  ['primary', color.paper],
  ['secondary', color.obsidian],
] as const)('spins in a visible colour on the %s variant', async (variant, expected) => {
  await render(<Button label="Go" variant={variant} pending onPress={jest.fn()} />)
  expect((screen.root!.children[0] as unknown as { props: { color: string } }).props.color).toBe(expected)
})
