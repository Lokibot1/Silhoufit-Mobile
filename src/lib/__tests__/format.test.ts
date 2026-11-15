import { dateOnly, dateTime, deliveryLabel, percentLabel, soldLabel } from '../format'

it('formats units sold', () => {
  expect([1, 371, 999, 1000, 1250, 1999, 9999, 10_000, 12_400].map(soldLabel)).toEqual(['1 sold', '371 sold', '999 sold', '1k sold', '1.2k sold', '1.9k sold', '9.9k sold', '10k sold', '12k sold'])
})

it('formats the average delivery time', () => {
  expect([20, 45, 60, 89, 120, 1439, 1440, 2880, 4000].map((m) => deliveryLabel(m))).toEqual(['Avg 20 min', 'Avg 45 min', 'Avg 1 hr', 'Avg 1 hr', 'Avg 2 hrs', 'Avg 24 hrs', 'Avg 1 day', 'Avg 2 days', 'Avg 3 days'])
  expect(deliveryLabel(120, true)).toBe('average delivery 2 hours')
  expect(deliveryLabel(1, true)).toBe('average delivery 1 minute')
})

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
