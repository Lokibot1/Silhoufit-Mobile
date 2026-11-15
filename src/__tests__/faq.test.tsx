import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { FAQ } from '@/faq/faqData'
import Faq from '../app/faq'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@/lib/site', () => ({ openLegal: jest.fn(() => Promise.resolve()) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const { push: mockPush, navigate: mockNavigate } = jest.requireMock('expo-router').router
const mockOpenLegal: jest.Mock = jest.requireMock('@/lib/site').openLegal

beforeEach(() => jest.clearAllMocks())

it('lists every question collapsed, with the count', async () => {
  await render(<Faq />)
  expect(screen.getByText(`${FAQ.length} questions`)).toBeTruthy()
  expect(screen.getByTestId('faq-item-track-order').props.accessibilityState).toMatchObject({ expanded: false })
  expect(screen.queryByText(/Open the Orders tab to see/)).toBeNull()
})

it('expands and collapses an answer', async () => {
  await render(<Faq />)
  await fireEvent.press(screen.getByTestId('faq-item-track-order'))
  expect(screen.getByTestId('faq-item-track-order').props.accessibilityState).toMatchObject({ expanded: true })
  expect(screen.getByText(/Open the Orders tab to see/)).toBeTruthy()
  await fireEvent.press(screen.getByTestId('faq-item-track-order'))
  expect(screen.queryByText(/Open the Orders tab to see/)).toBeNull()
})

it('filters by search and shows the result count', async () => {
  await render(<Faq />)
  await fireEvent.changeText(screen.getByTestId('faq-search'), '  PASSWORD ')
  expect(screen.getByText(`1 of ${FAQ.length} questions`)).toBeTruthy()
  expect(screen.getByTestId('faq-item-reset-password')).toBeTruthy()
  expect(screen.queryByTestId('faq-item-track-order')).toBeNull()
})

it('shows the empty state for no match and Clear Search restores the list', async () => {
  await render(<Faq />)
  await fireEvent.changeText(screen.getByTestId('faq-search'), 'zzzz')
  expect(screen.getByText('No questions match "zzzz"')).toBeTruthy()
  expect(screen.getByText('Check the spelling or try a shorter word.')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('faq-empty-action'))
  expect(screen.getByTestId('faq-search').props.value).toBe('')
  expect(screen.getByText(`${FAQ.length} questions`)).toBeTruthy()
  expect(screen.queryByTestId('faq-empty')).toBeNull()
})

it('clears with the x button in the search field', async () => {
  await render(<Faq />)
  await fireEvent.changeText(screen.getByTestId('faq-search'), 'refund')
  await fireEvent.press(screen.getByTestId('faq-search-clear'))
  expect(screen.getByTestId('faq-search').props.value).toBe('')
  expect(screen.queryByTestId('faq-search-clear')).toBeNull()
})

it.each([
  ['enter-measurements', mockPush, '/profile/body'],
  ['track-order', mockNavigate, '/orders'],
  ['need-account', mockPush, '/sign-up'],
  ['ask-refund', mockOpenLegal, 'refund'],
])('opens the screen behind the %s answer link', async (id, spy, target) => {
  await render(<Faq />)
  await fireEvent.press(screen.getByTestId(`faq-item-${id}`))
  await fireEvent.press(screen.getByTestId(`faq-link-${id}`))
  expect(spy).toHaveBeenCalledWith(target)
})

it('toasts when the policy page cannot open', async () => {
  mockOpenLegal.mockRejectedValueOnce(new Error('no browser'))
  await render(<Faq />)
  await fireEvent.press(screen.getByTestId('faq-item-ask-refund'))
  await fireEvent.press(screen.getByTestId('faq-link-ask-refund'))
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Couldn't open the page. Check your connection and try again."))
})
