import { fireEvent, render, screen } from '@testing-library/react-native'

import NotFoundRoute from '../app/+not-found'

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) } }))
const { replace, back, canGoBack } = jest.requireMock('expo-router').router as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  canGoBack.mockReturnValue(true)
})

it('shows a friendly not-found message with a header', async () => {
  await render(<NotFoundRoute />)
  expect(screen.getByRole('header', { name: 'Page not found' })).toBeTruthy()
  expect(screen.queryByText(/Unmatched/i)).toBeNull()
})

it('Go to Shop replaces the route with the tabs', async () => {
  await render(<NotFoundRoute />)
  await fireEvent.press(screen.getByTestId('not-found-shop'))
  expect(replace).toHaveBeenCalledWith('/(tabs)')
})

it('offers Go Back only when there is somewhere to go back to', async () => {
  const view = await render(<NotFoundRoute />)
  await fireEvent.press(screen.getByTestId('not-found-back'))
  expect(back).toHaveBeenCalledTimes(1)
  canGoBack.mockReturnValue(false)
  await view.rerender(<NotFoundRoute />)
  expect(screen.queryByTestId('not-found-back')).toBeNull()
})
