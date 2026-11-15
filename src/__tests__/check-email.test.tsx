import { act, fireEvent, render, screen } from '@testing-library/react-native'

import CheckEmail from '../app/check-email'

jest.mock('@/auth/email', () => ({ resendConfirmation: jest.fn(), signedUpEmail: () => 'ana@example.com' }))
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
let mockParams: { email?: string } = { email: 'ana@example.com' }
const resend = jest.requireMock('@/auth/email').resendConfirmation as jest.Mock
const replace = jest.requireMock('expo-router').router.replace as jest.Mock

const GENERIC = 'If that address is waiting for confirmation, we sent a new link.'
const tick = (ms: number) => act(async () => void jest.advanceTimersByTime(ms))
const disabled = () => screen.getByTestId('check-email-resend').props.accessibilityState.disabled

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockParams = { email: 'ana@example.com' }
})
afterEach(() => jest.useRealTimers())

it('names the address and starts a 60 second cooldown on arrival', async () => {
  await render(<CheckEmail />)
  expect(screen.getByText('ana@example.com')).toBeTruthy()
  expect(disabled()).toBe(true)
  expect(screen.getByText('Resend in 1:00')).toBeTruthy()
  await tick(1000)
  expect(screen.getByText('Resend in 0:59')).toBeTruthy()
  await tick(58_000)
  expect(screen.getByText('Resend in 0:01')).toBeTruthy()
  await tick(1000)
  expect(screen.getByText('Resend Link')).toBeTruthy()
  expect(disabled()).toBe(false)
})

it('resends once the cooldown is over, shows the generic copy and restarts the cooldown', async () => {
  resend.mockResolvedValue({ ok: true })
  await render(<CheckEmail />)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(resend).not.toHaveBeenCalled()
  await tick(60_000)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(resend).toHaveBeenCalledWith('ana@example.com')
  expect(await screen.findByText(GENERIC)).toBeTruthy()
  expect(screen.getByText('Resend in 1:00')).toBeTruthy()
})

it('shows an error, not the sent copy, and no cooldown when the server fails', async () => {
  resend.mockResolvedValue({ ok: false, kind: 'server' })
  await render(<CheckEmail />)
  await tick(60_000)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(await screen.findByText("Couldn't send the email. Try again.")).toBeTruthy()
  expect(screen.getByTestId('check-email-error').props.accessibilityRole).toBe('alert')
  expect(screen.queryByText(GENERIC)).toBeNull()
  expect(disabled()).toBe(false)
})

it('ignores an address that did not come from sign-up in this session', async () => {
  mockParams = { email: 'victim@example.com' }
  await render(<CheckEmail />)
  expect(screen.queryByText('victim@example.com')).toBeNull()
  expect(screen.getByTestId('check-email-input')).toBeTruthy()
  expect(disabled()).toBe(false)
})

it('says so on a 429', async () => {
  resend.mockResolvedValue({ ok: false, kind: 'rate-limit' })
  await render(<CheckEmail />)
  await tick(60_000)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(await screen.findByText('Too many emails. Try again in a few minutes.')).toBeTruthy()
  expect(screen.getByTestId('check-email-error').props.accessibilityRole).toBe('alert')
  expect(screen.queryByText(GENERIC)).toBeNull()
})

it('shows a network banner and lets the user retry at once', async () => {
  resend.mockResolvedValueOnce({ ok: false, kind: 'network' })
  await render(<CheckEmail />)
  await tick(60_000)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(await screen.findByText(/The connection dropped/)).toBeTruthy()
  expect(disabled()).toBe(false)
  resend.mockResolvedValueOnce({ ok: true })
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(await screen.findByText(GENERIC)).toBeTruthy()
  expect(screen.queryByTestId('check-email-error')).toBeNull()
})

it('asks for the address, with no cooldown, when none was passed', async () => {
  mockParams = {}
  resend.mockResolvedValue({ ok: true })
  await render(<CheckEmail />)
  expect(disabled()).toBe(false)
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(await screen.findByText('Email is required.')).toBeTruthy()
  expect(resend).not.toHaveBeenCalled()
  await fireEvent.changeText(screen.getByTestId('check-email-input'), 'bo😀b@example.com')
  expect(screen.getByTestId('check-email-input').props.value).toBe('bob@example.com')
  await fireEvent.press(screen.getByTestId('check-email-resend'))
  expect(resend).toHaveBeenCalledWith('bob@example.com')
})

it('goes back to Sign In', async () => {
  await render(<CheckEmail />)
  await fireEvent.press(screen.getByTestId('check-email-back'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
})
