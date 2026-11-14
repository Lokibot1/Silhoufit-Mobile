import { percentLabel } from '../format'

it('zero-pads the loader percent to three digits', () => {
  expect(percentLabel(0)).toBe('000%')
  expect(percentLabel(6.6)).toBe('007%')
  expect(percentLabel(100)).toBe('100%')
})
