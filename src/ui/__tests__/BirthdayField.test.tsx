import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { pickBirthday } from '@/test/pickBirthday'
import { BirthdayField } from '../BirthdayField'

const open = DateTimePickerAndroid.open as jest.Mock
const onChange = jest.fn()
const onClose = jest.fn()
const field = (value = '') => <BirthdayField testID="bd" value={value} onChange={onChange} onClose={onClose} />

beforeEach(() => jest.clearAllMocks())

it('shows nothing until a day is chosen, then the date', async () => {
  const view = await render(field())
  expect(screen.getByTestId('bd-open').props.accessibilityLabel).toBe('Birthday, not set')
  await view.rerender(field('1995-05-15'))
  expect(screen.getByTestId('bd', { includeHiddenElements: true }).props.value).toBe('May 15, 1995')
  expect(screen.getByTestId('bd-open').props.accessibilityLabel).toBe('Birthday, May 15, 1995')
})

it('on iOS, picks a day in the sheet and reports it as YYYY-MM-DD on Done', async () => {
  await render(field())
  await pickBirthday('bd', '1996-05-09')
  expect(onChange).toHaveBeenCalledWith('1996-05-09')
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('on iOS, Cancel keeps the old value and still reports the sheet closing', async () => {
  await render(field('1995-05-15'))
  await fireEvent.press(screen.getByTestId('bd-open'))
  await fireEvent(screen.getByTestId('bd-picker'), 'valueChange', {}, new Date(2001, 0, 1))
  await fireEvent.press(screen.getByTestId('bd-cancel'))
  expect(onChange).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('limits the calendar to 1900 through today', async () => {
  await render(field())
  await fireEvent.press(screen.getByTestId('bd-open'))
  const picker = screen.getByTestId('bd-picker')
  expect(picker.props.minimumDate).toEqual(new Date(1900, 0, 1))
  expect(picker.props.maximumDate.getTime()).toBeLessThanOrEqual(Date.now())
})

describe('on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'))
  afterEach(() => jest.restoreAllMocks())

  it('opens the calendar dialog on the saved day and reports the chosen one', async () => {
    await render(field('1995-05-15'))
    await fireEvent.press(screen.getByTestId('bd-open'))
    const options = open.mock.calls[0][0]
    expect(options).toMatchObject({ mode: 'date', display: 'calendar', value: new Date(1995, 4, 15), minimumDate: new Date(1900, 0, 1) })
    options.onValueChange({}, new Date(1990, 11, 31))
    expect(onChange).toHaveBeenCalledWith('1990-12-31')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reports a dismissed dialog without changing the value', async () => {
    await render(field())
    await fireEvent.press(screen.getByTestId('bd-open'))
    open.mock.calls[0][0].onDismiss()
    expect(onChange).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
