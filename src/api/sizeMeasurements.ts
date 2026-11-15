import { ApiError, isRecord, num, request, str } from '@/lib/api'

export const MEASUREMENT_FIELDS = [
  { key: 'chestWidthCm', label: 'Chest width' },
  { key: 'waistWidthCm', label: 'Waist width' },
  { key: 'hipWidthCm', label: 'Hip width' },
  { key: 'totalLengthCm', label: 'Total length' },
  { key: 'inseamCm', label: 'Inseam' },
  { key: 'shoulderWidthCm', label: 'Shoulder width' },
  { key: 'sleeveLengthCm', label: 'Sleeve length' },
  { key: 'neckCm', label: 'Neck' },
  { key: 'thighCm', label: 'Thigh' },
] as const
export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]['key']
/** Garment measurements in cm; one never filled in is null. */
export type Measurements = Record<MeasurementKey, number | null>
export type SizeRow = Measurements & { size: string }

/** A measurements object from the API; a value that is not a positive number is null. Null when the value is not an object. */
export function toMeasurements(value: unknown): Measurements | null {
  if (!isRecord(value)) return null
  return Object.fromEntries(
    MEASUREMENT_FIELDS.map(({ key }) => {
      const n = num(value[key])
      return [key, n !== null && n > 0 ? n : null]
    }),
  ) as Measurements
}

/** The category's base rows from a GET /size-measurements body (an array, or `{ data: [...] }`); a row without a size is dropped. */
export function toSizeRows(body: unknown): SizeRow[] {
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.data) ? body.data : null
  if (!rows) throw new ApiError('server')
  return rows.flatMap((row) => {
    const size = isRecord(row) ? str(row.size) : null
    const measurements = toMeasurements(row)
    return size && measurements ? [{ ...measurements, size }] : []
  })
}

/** GET /size-measurements?category= (public: no sign-in needed). An abort rejects with the AbortError itself. */
export async function fetchCategoryMeasurements(category: string, signal?: AbortSignal): Promise<SizeRow[]> {
  return toSizeRows(await request('GET', `/size-measurements?category=${encodeURIComponent(category)}`, undefined, signal, { auth: false }))
}
