import { fireEvent, screen } from '@testing-library/react-native'

// Chooses a day in a BirthdayField the way a person does on iOS (jest-expo's default platform): open the calendar, pick the day, press Done.
export async function pickBirthday(testID: string, iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  await fireEvent.press(screen.getByTestId(`${testID}-open`))
  await fireEvent(screen.getByTestId(`${testID}-picker`), 'valueChange', {}, new Date(year, month - 1, day))
  await fireEvent.press(screen.getByTestId(`${testID}-done`))
}
