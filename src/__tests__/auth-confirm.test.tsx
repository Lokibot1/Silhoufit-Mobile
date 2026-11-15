import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import ConfirmEmail from '../app/auth/confirm'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-linking', () => ({ createURL: (path: string) => `silhoufitmobile://${path}`, useLinkingURL: () => mockUrl }))
jest.mock('@/auth/email', () => ({ CONFIRM_REDIRECT: 'silhoufitmobile://auth/confirm', openEmailLink: jest.fn() }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))
let mockUrl: string | null = 'silhoufitmobile://auth/confirm?code=abc'
const mockToast = jest.fn()
const open = jest.requireMock('@/auth/email').openEmailLink as jest.Mock
const replace = jest.requireMock('expo-router').router.replace as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockUrl = 'silhoufitmobile://auth/confirm?code=abc'
})

it('signs the user in, toasts once and opens Profile', async () => {
  open.mockResolvedValue('ok')
  await render(<ConfirmEmail />)
  expect(screen.getByTestId('confirm-checking')).toBeTruthy()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/(tabs)/profile'))
  expect(mockToast).toHaveBeenCalledTimes(1)
  expect(mockToast).toHaveBeenCalledWith('Email confirmed. Welcome to KRAL.')
  expect(open).toHaveBeenCalledWith('silhoufitmobile://auth/confirm?code=abc', 'silhoufitmobile://auth/confirm')
})

it.each([
  ['expired', 'silhoufitmobile://auth/confirm?error=access_denied&error_code=otp_expired'],
  ['missing', 'silhoufitmobile://auth/confirm'],
])('offers a new link for an %s link', async (outcome, url) => {
  mockUrl = url
  open.mockResolvedValue(outcome)
  await render(<ConfirmEmail />)
  expect(await screen.findByText('Link Expired')).toBeTruthy()
  expect(screen.getByText('This link has expired or was already used. Request a new link on this phone.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('confirm-expired'))
  expect(replace).toHaveBeenCalledWith('/check-email')
  expect(mockToast).not.toHaveBeenCalled()
})

it('retries after a network failure', async () => {
  open.mockResolvedValueOnce('network').mockResolvedValueOnce('ok')
  await render(<ConfirmEmail />)
  expect(screen.queryByTestId('confirm-signin')).toBeNull()
  await fireEvent.press(await screen.findByTestId('confirm-retry'))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/(tabs)/profile'))
  expect(open).toHaveBeenCalledTimes(2)
})

it('offers Retry on a rate limit and never calls it confirmed', async () => {
  open.mockResolvedValueOnce('rate-limit').mockResolvedValueOnce('ok')
  await render(<ConfirmEmail />)
  expect(await screen.findByText('Too many attempts. Try again in a few minutes.')).toBeTruthy()
  expect(screen.queryByTestId('confirm-signin')).toBeNull()
  await fireEvent.press(screen.getByTestId('confirm-retry'))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/(tabs)/profile'))
})

it('waits for a late launch URL before calling the link missing', async () => {
  jest.useFakeTimers()
  mockUrl = null
  open.mockResolvedValue('missing')
  await render(<ConfirmEmail />)
  await act(async () => void jest.advanceTimersByTime(1000))
  expect(open).not.toHaveBeenCalled()
  expect(screen.getByTestId('confirm-checking')).toBeTruthy()
  await act(async () => void jest.advanceTimersByTime(1000))
  expect(open).toHaveBeenCalledWith('', expect.any(String))
  expect(await screen.findByText('Link Expired')).toBeTruthy()
  jest.useRealTimers()
})

it('tells the user, without claiming the email is confirmed, when the exchange was refused', async () => {
  open.mockResolvedValue('expired') // code present, exchange refused (another device, or a forged code)
  await render(<ConfirmEmail />)
  expect(await screen.findByText('If your email was just confirmed, sign in to continue.')).toBeTruthy()
  expect(screen.queryByText(/Email Confirmed/i)).toBeNull()
  await fireEvent.press(screen.getByTestId('confirm-signin'))
  expect(replace).toHaveBeenCalledWith('/sign-in')
  expect(screen.queryByText('Link Expired')).toBeNull()
})
