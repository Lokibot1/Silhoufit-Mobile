import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Modal, Platform, StyleSheet, Text, View } from 'react-native'

import { dateOnly } from '@/lib/format'
import { today } from '@/lib/profileValidation'
import { Button } from './Button'
import { FloatingField } from './FloatingField'
import { color, radius, space, type } from './theme'

const EARLIEST = new Date(1900, 0, 1)
const ADULT_AGE = 18

// "YYYY-MM-DD" as that day at local midnight, which is what the native pickers expect.
const parse = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}
// Where the calendar opens when nothing is chosen yet: 18 years ago today, so an adult is a few taps away.
const startDate = (value: string) => {
  if (value) return parse(value)
  const now = new Date()
  return new Date(now.getFullYear() - ADULT_AGE, now.getMonth(), now.getDate())
}

type Props = {
  value: string
  /** The chosen day as "YYYY-MM-DD". */
  onChange: (iso: string) => void
  /** Called when the calendar closes, chosen or not, so the screen can start showing errors. */
  onClose?: () => void
  label?: string
  error?: string
  helper?: string
  testID: string
  editable?: boolean
}

// A birthday is picked from a calendar, never typed: a dialog on Android, a sheet with an inline calendar on iOS. The input keeps `testID`; the button over it is `<testID>-open`.
export function BirthdayField({ value, onChange, onClose, label = 'Birthday', error, helper, testID, editable = true }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() => startDate(value))

  function show() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: startDate(value),
        mode: 'date',
        display: 'calendar',
        minimumDate: EARLIEST,
        maximumDate: new Date(),
        onValueChange: (_event, date) => {
          onChange(today(date))
          onClose?.()
        },
        onDismiss: () => onClose?.(),
      })
      return
    }
    setDraft(startDate(value))
    setOpen(true)
  }

  function close(save: boolean) {
    setOpen(false)
    if (save) onChange(today(draft))
    onClose?.()
  }

  return (
    <>
      <FloatingField testID={testID} label={label} value={value ? dateOnly(value) : ''} onChangeText={() => {}} error={error} helper={helper} editable={editable} onPress={show} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => close(false)}>
        <View style={styles.scrim}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text accessibilityRole="header" style={type.h2}>{label}</Text>
            <DateTimePicker testID={`${testID}-picker`} value={draft} mode="date" display="inline" minimumDate={EARLIEST} maximumDate={new Date()} onValueChange={(_event, date) => setDraft(date)} />
            <View style={styles.actions}>
              <View style={styles.grow}>
                <Button testID={`${testID}-cancel`} variant="secondary" label="Cancel" onPress={() => close(false)} />
              </View>
              <View style={styles.grow}>
                <Button testID={`${testID}-done`} label="Done" onPress={() => close(true)} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: color.scrim },
  dialog: { backgroundColor: color.paper, borderRadius: radius.soft, padding: space.lg, gap: space.md },
  actions: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
})
