import { toSizeRows, type Measurements, type SizeRow } from '@/api/sizeMeasurements'

import { buildSizeGuide, compareSizes, needsBaseRows } from '../sizeGuide'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))

const empty: Measurements = { chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, totalLengthCm: null, inseamCm: null, shoulderWidthCm: null, sleeveLengthCm: null, neckCm: null, thighCm: null }
const m = (over: Partial<Measurements>): Measurements => ({ ...empty, ...over })
const base = (size: string, over: Partial<Measurements>): SizeRow => ({ ...m(over), size })

describe('compareSizes', () => {
  it('orders named sizes, then numbers, then the rest', () => {
    expect(['One size', '32', 'XL', 'S', '30', 'XS'].sort(compareSizes)).toEqual(['XS', 'S', 'XL', '30', '32', 'One size'])
  })
})

describe('buildSizeGuide', () => {
  const variants = [
    { size: 'M', measurements: m({ chestWidthCm: 54 }) },
    { size: 'm ', measurements: null },
    { size: 'L', measurements: null },
    { size: 'S', measurements: undefined },
  ]
  it('takes the product row first, the standard row next, else none; one row per size, smallest first', () => {
    const guide = buildSizeGuide('Shirt', variants, [base('L', { chestWidthCm: 58 }), base('M', { chestWidthCm: 99 })])
    expect(guide.rows.map((r) => [r.size, r.source, r.values.chestWidthCm])).toEqual([['S', 'none', null], ['M', 'product', 54], ['L', 'base', 58]])
  })
  it('uses the category columns, plus any other measurement a product row has', () => {
    const guide = buildSizeGuide('Shirt', [{ size: 'M', measurements: m({ thighCm: 30 }) }], [])
    expect(guide.columns).toEqual(['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm', 'thighCm'])
  })
  it('falls back to the columns the standard rows fill for a category with no default set', () => {
    expect(buildSizeGuide(null, [{ size: 'M' }], [base('M', { neckCm: 40 })]).columns).toEqual(['neckCm'])
  })
  it('has no rows for a product with no sizes', () => expect(buildSizeGuide('Shirt', [{ size: null }], []).rows).toEqual([]))
})

describe('needsBaseRows', () => {
  it('is false when every size has its own measurements, true when one lacks them', () => {
    expect(needsBaseRows([{ size: 'S', measurements: m({ chestWidthCm: 50 }) }, { size: 'M', measurements: m({ chestWidthCm: 54 }) }])).toBe(false)
    expect(needsBaseRows([{ size: 'S', measurements: m({ chestWidthCm: 50 }) }, { size: 'M', measurements: empty }])).toBe(true)
  })
})

describe('toSizeRows', () => {
  it('reads an array or { data } and drops a row without a size', () => {
    const row = { id: 'x', category: 'Shirt', size: 'M', chestWidthCm: 54, neckCm: '38.5', waistWidthCm: 0 }
    expect(toSizeRows([row, { ...row, size: undefined }])).toEqual([base('M', { chestWidthCm: 54, neckCm: 38.5 })])
    expect(toSizeRows({ data: [row] })).toHaveLength(1)
  })
  it.each([null, 'x', {}, { data: {} }])('rejects the bad shape %p', (bad) => expect(() => toSizeRows(bad)).toThrow(expect.objectContaining({ kind: 'server' })))
})
