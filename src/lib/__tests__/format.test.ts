import { dateOnly, dateTime, percentLabel } from '../format'

it('zero-pads the loader percent to three digits', () => {
  expect(percentLabel(0)).toBe('000%')
  expect(percentLabel(6.6)).toBe('007%')
  expect(percentLabel(100)).toBe('100%')
})

describe('dateTime and dateOnly (Manila time, 12-hour)', () => {
  it('shifts UTC to Manila and uses AM/PM', () => {
    expect(dateTime('2026-11-14T05:49:00.000Z')).toBe('Nov 14, 2026, 1:49 PM')
    expect(dateOnly('2026-11-14T05:49:00.000Z')).toBe('Nov 14, 2026')
  })
  it('rolls over to the next Manila day and reads midnight and noon as 12', () => {
    expect(dateTime('2026-12-31T16:05:00Z')).toBe('Jan 1, 2027, 12:05 AM')
    expect(dateTime('2026-11-14T04:00:00Z')).toBe('Nov 14, 2026, 12:00 PM')
  })
  it('returns a dash for a missing or invalid date', () => {
    for (const bad of [null, undefined, '', 'not a date']) {
      expect(dateTime(bad)).toBe('—')
      expect(dateOnly(bad)).toBe('—')
    }
  })
})
