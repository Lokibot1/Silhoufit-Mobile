import { MEASUREMENT_FIELDS, type MeasurementKey, type Measurements, type SizeRow } from '@/api/sizeMeasurements'

export type GuideSource = 'product' | 'base' | 'none'
export type GuideRow = { size: string; source: GuideSource; values: Measurements }
export type SizeGuide = { columns: MeasurementKey[]; rows: GuideRow[] }
export type GuideVariant = { size: string | null; measurements?: Measurements | null }

// The columns a category's guide always shows (same as the web); a category not listed shows the columns its rows fill.
const COLUMNS: Record<string, MeasurementKey[]> = {
  Hoodie: ['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'],
  Shirt: ['chestWidthCm', 'totalLengthCm', 'shoulderWidthCm', 'sleeveLengthCm', 'neckCm'],
  Pants: ['waistWidthCm', 'hipWidthCm', 'inseamCm', 'thighCm', 'totalLengthCm'],
  Shorts: ['waistWidthCm', 'hipWidthCm', 'inseamCm', 'thighCm', 'totalLengthCm'],
  Headwear: ['neckCm'],
}
const NAMED = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
const EMPTY = Object.fromEntries(MEASUREMENT_FIELDS.map(({ key }) => [key, null])) as Measurements
const KEYS = MEASUREMENT_FIELDS.map(({ key }) => key)

export const norm = (size: string) => size.trim().toLowerCase()
const hasValue = (m: Measurements | null | undefined): m is Measurements => !!m && KEYS.some((key) => m[key] !== null)

/** Smallest first: named sizes in garment order, waist numbers by value, anything else (One size) last by name. */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string) => {
    const named = NAMED.indexOf(size.toUpperCase())
    if (named >= 0) return [0, named] as const
    return /^\d+(\.\d+)?$/.test(size) ? ([1, Number(size)] as const) : ([2, 0] as const)
  }
  const [ga, va] = rank(a)
  const [gb, vb] = rank(b)
  return ga - gb || va - vb || a.localeCompare(b)
}

const sizesOf = (variants: GuideVariant[]) => {
  const labels = new Map<string, string>()
  for (const v of variants) if (v.size && !labels.has(norm(v.size))) labels.set(norm(v.size), v.size.trim())
  return [...labels.values()].sort(compareSizes)
}
const ownOf = (variants: GuideVariant[], size: string) => variants.find((v) => v.size !== null && norm(v.size) === norm(size) && hasValue(v.measurements))?.measurements ?? null

/** True when some size has no measurements of its own, so the category's standard rows are worth fetching. */
export const needsBaseRows = (variants: GuideVariant[]) => sizesOf(variants).some((size) => !ownOf(variants, size))

/**
 * One row per real variant size, smallest first. A size takes the first variant of that size with any measurement (the whole row, never
 * mixed field by field with the standard one); otherwise the category's standard row; otherwise it has no values.
 */
export function buildSizeGuide(category: string | null, variants: GuideVariant[], baseRows: SizeRow[]): SizeGuide {
  const rows = sizesOf(variants).map((size): GuideRow => {
    const own = ownOf(variants, size)
    if (own) return { size, source: 'product', values: own }
    const base = baseRows.find((r) => norm(r.size) === norm(size) && hasValue(r))
    return base ? { size, source: 'base', values: base } : { size, source: 'none', values: EMPTY }
  })
  const defaults = (category && COLUMNS[category]) || KEYS.filter((key) => baseRows.some((r) => r[key] !== null))
  const columns = KEYS.filter((key) => defaults.includes(key) || rows.some((r) => r.source === 'product' && r.values[key] !== null))
  return { columns, rows }
}
