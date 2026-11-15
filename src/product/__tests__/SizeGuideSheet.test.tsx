import { fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError } from '@/lib/api'
import { SizeGuideSheet } from '../SizeGuideSheet'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/sizeMeasurements', () => ({ ...jest.requireActual('@/api/sizeMeasurements'), fetchCategoryMeasurements: jest.fn() }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/Skeleton', () => ({ Skeleton: () => null }))
const mockFetch: jest.Mock = jest.requireMock('@/api/sizeMeasurements').fetchCategoryMeasurements

const own = { chestWidthCm: 54, waistWidthCm: null, hipWidthCm: null, totalLengthCm: 70.5, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }
const none = { ...own, chestWidthCm: null, totalLengthCm: null }
const baseRow = { ...none, size: 'L', chestWidthCm: 58, totalLengthCm: 72 }
const onClose = jest.fn()
const open = (props: Partial<Parameters<typeof SizeGuideSheet>[0]> = {}) =>
  render(<SizeGuideSheet visible onClose={onClose} category="Shirt" selected="M" variants={[{ size: 'M', measurements: own }, { size: 'L', measurements: null }]} {...props} />)

beforeEach(() => jest.clearAllMocks())

it('fetches nothing while closed', async () => {
  await open({ visible: false })
  expect(mockFetch).not.toHaveBeenCalled()
})

it('shows a loading state while the standard rows load', async () => {
  mockFetch.mockReturnValue(new Promise(() => {}))
  await open()
  expect(screen.getByLabelText('Loading size guide')).toBeTruthy()
})

it('shows a card per size with the selected one marked and both sources', async () => {
  mockFetch.mockResolvedValue([baseRow])
  await open()
  expect(await screen.findByTestId('size-guide-row-M')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledWith('Shirt', expect.any(AbortSignal))
  const m = screen.getByTestId('size-guide-row-M')
  expect(m.props.accessibilityState).toMatchObject({ selected: true })
  expect(m.props.accessibilityLabel).toContain('Size M, selected')
  expect(m.props.accessibilityLabel).toContain('Chest width 54 cm')
  expect(m.props.accessibilityLabel).toContain('Total length 70.5 cm')
  expect(screen.getByTestId('size-guide-row-L').props.accessibilityState).toMatchObject({ selected: false })
  expect(screen.getByText('This piece')).toBeTruthy()
  expect(screen.getByText('Standard for Shirt')).toBeTruthy()
  expect(screen.getByText('58 cm')).toBeTruthy()
})

it('skips the request when every size has its own measurements', async () => {
  await open({ variants: [{ size: 'M', measurements: own }] })
  expect(await screen.findByTestId('size-guide-row-M')).toBeTruthy()
  expect(mockFetch).not.toHaveBeenCalled()
})

it('shows an error with Retry when the request fails and nothing else is known, and recovers', async () => {
  mockFetch.mockRejectedValueOnce(new ApiError('network')).mockResolvedValueOnce([baseRow])
  await open({ variants: [{ size: 'L', measurements: null }] })
  expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeTruthy()
  await fireEvent.press(screen.getByTestId('size-guide-retry'))
  expect(await screen.findByTestId('size-guide-row-L')).toBeTruthy()
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

it('keeps the pieces own rows and shows a Retry banner when only the standard rows fail', async () => {
  mockFetch.mockRejectedValue(new ApiError('server'))
  await open()
  expect(await screen.findByTestId('size-guide-failed')).toBeTruthy()
  expect(screen.getByTestId('size-guide-row-M')).toBeTruthy()
  expect(screen.getByText('Not available')).toBeTruthy()
})

it('shows the empty state with a Close action when there is nothing, and treats a 404 as empty', async () => {
  mockFetch.mockRejectedValue(new ApiError('not-found', undefined, 404))
  await open({ variants: [{ size: 'L', measurements: null }] })
  expect(await screen.findByText('No size guide yet')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('size-guide-empty-close'))
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('closes from the close button, the backdrop and the Android back button', async () => {
  await open({ variants: [{ size: 'M', measurements: own }] })
  await fireEvent.press(screen.getByTestId('size-guide-close'))
  await fireEvent.press(screen.getByTestId('size-guide-backdrop', { includeHiddenElements: true }))
  expect(onClose).toHaveBeenCalledTimes(2)
  screen.root?.props.onRequestClose()
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('button', { name: 'Close size guide' })).toBeTruthy()
})
