import { render } from '@testing-library/react-native'

import GoogleCallback from '../app/auth/callback'

jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ isFocused: mockIsFocused }),
}))
const mockIsFocused = jest.fn(() => true)
const { canGoBack, back, replace } = jest.requireMock('expo-router').router as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  mockIsFocused.mockReturnValue(true)
  canGoBack.mockReturnValue(true)
})

it('renders nothing', async () => {
  const view = await render(<GoogleCallback />)
  expect(view.toJSON()).toBeNull()
})

it('pops itself once when it is the focused route', async () => {
  await render(<GoogleCallback />)
  expect(back).toHaveBeenCalledTimes(1)
  expect(replace).not.toHaveBeenCalled()
})

it('goes to the tabs when there is nothing to go back to', async () => {
  canGoBack.mockReturnValue(false)
  await render(<GoogleCallback />)
  expect(replace).toHaveBeenCalledWith('/(tabs)')
  expect(back).not.toHaveBeenCalled()
})

it('does nothing when it is not the top route, so no screen underneath is popped', async () => {
  mockIsFocused.mockReturnValue(false)
  await render(<GoogleCallback />)
  expect(back).not.toHaveBeenCalled()
  expect(replace).not.toHaveBeenCalled()
})
