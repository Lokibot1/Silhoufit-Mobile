import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import Age from '../app/auth/age'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/me', () => ({ updateMe: jest.fn() }))
jest.mock('@/auth/session', () => ({ useSession: () => mockSession }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ isFocused: () => true }),
}))
const mockToast = jest.fn()
const mockSignOut = jest.fn()
const mockUpdate = jest.fn()
let mockSession: Record<string, unknown>
const updateMe = jest.requireMock('@/api/me').updateMe as jest.Mock
const { back, replace } = jest.requireMock('expo-router').router as Record<'back' | 'replace', jest.Mock>

const type = (text: string) => fireEvent.changeText(screen.getByTestId('age-birthday'), text)

beforeEach(() => {
  jest.clearAllMocks()
  mockSignOut.mockResolvedValue(undefined)
  mockSession = { session: {}, loading: false, signOut: mockSignOut, update: mockUpdate }
})

it('saves an adult birthday, toasts and goes back', async () => {
  const me = { id: '1' }
  updateMe.mockResolvedValue(me)
  await render(<Age />)
  await type('1995/5/15')
  await fireEvent.press(screen.getByTestId('age-submit'))
  await waitFor(() => expect(back).toHaveBeenCalled())
  expect(updateMe).toHaveBeenCalledWith({ birthday: '1995-05-15' })
  expect(mockUpdate).toHaveBeenCalledWith(me)
  expect(mockToast).toHaveBeenCalledWith('Birthday saved. Welcome to KRAL.')
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('signs out and explains when the user is under 18', async () => {
  await render(<Age />)
  await type('2020-01-01')
  await fireEvent.press(screen.getByTestId('age-submit'))
  expect(await screen.findByText(/at least 18 years old/)).toBeTruthy()
  expect(mockSignOut).toHaveBeenCalledTimes(1)
  expect(updateMe).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByTestId('age-underage'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
})

it('shows an inline error for an invalid date and saves nothing', async () => {
  await render(<Age />)
  await type('1995-02-31')
  await fireEvent.press(screen.getByTestId('age-submit'))
  expect(await screen.findByText('Enter your birthday as YYYY-MM-DD, like 1995-05-15.')).toBeTruthy()
  expect(updateMe).not.toHaveBeenCalled()
  expect(mockSignOut).not.toHaveBeenCalled()
})

it('shows the required message for a blank birthday', async () => {
  await render(<Age />)
  await fireEvent.press(screen.getByTestId('age-submit'))
  expect(await screen.findByText('Enter your birthday. You must be 18 or older to sign up.')).toBeTruthy()
})

it('shows a retryable banner when saving fails', async () => {
  updateMe.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ id: '1' })
  await render(<Age />)
  await type('1995-05-15')
  await fireEvent.press(screen.getByTestId('age-submit'))
  expect((await screen.findByTestId('age-error')).props.accessibilityRole).toBe('alert')
  expect(back).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByLabelText('Try Again'))
  await waitFor(() => expect(back).toHaveBeenCalled())
})

it('saves once for a same-tick double press', async () => {
  let resolve!: (value: unknown) => void
  updateMe.mockReturnValue(new Promise((r) => (resolve = r)))
  await render(<Age />)
  await type('1995-05-15')
  const button = screen.getByTestId('age-submit')
  await act(async () => {
    button.props.onClick({})
    button.props.onClick({})
  })
  expect(updateMe).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ id: '1' }))
})

it('signs out from Back to Sign In', async () => {
  await render(<Age />)
  await fireEvent.press(screen.getByTestId('age-back'))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'))
  expect(mockSignOut).toHaveBeenCalledTimes(1)
})

it('shows a spinner while the session loads and a sign-in prompt without one', async () => {
  mockSession = { ...mockSession, loading: true }
  const { unmount } = await render(<Age />)
  expect(screen.getByTestId('age-loading')).toBeTruthy()
  unmount()
  mockSession = { ...mockSession, loading: false, session: null }
  await render(<Age />)
  await fireEvent.press(screen.getByTestId('age-signin'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
})
