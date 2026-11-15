// Maps a place name from another source (OpenStreetMap, or a saved address) onto a PSGC list. It never guesses:
// no match, or an ambiguous one, is null and the form asks the user to pick. Ported from the web utils/psgcMatch.ts.
import type { Address } from '@/api/addresses'
import { getBarangays, getCities, getProvinces, getRegions } from '@/api/psgc'
import type { ReverseResult } from '@/api/reverseGeocode'

/** Lowercase, no accents, no "City of"/"Barangay" labels, no "(...)" qualifiers or punctuation. */
export function normalizePlace(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(city of|municipality of|barangay|brgy|bgy)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Exact match first, then a single startsWith, then (for real words only) a single includes. */
export function matchPlace<T extends { name: string }>(list: T[], name: string): T | null {
  const wanted = normalizePlace(name)
  if (!wanted) return null
  const keyed = list.map((item) => ({ item, key: normalizePlace(item.name) }))
  const only = (hits: typeof keyed) => (hits.length === 1 ? hits[0].item : null)
  const exact = keyed.filter((k) => k.key === wanted)
  if (exact.length) return only(exact)
  const starts = keyed.filter((k) => k.key.startsWith(wanted))
  if (starts.length) return only(starts)
  // A bare number or a short word would match unrelated names ("17" in "117"), so it must match whole.
  if (wanted.length < 4 || !/[a-z]/.test(wanted)) return null
  return only(keyed.filter((k) => k.key.includes(wanted)))
}

// What OpenStreetMap calls a region, by its PSGC name.
const REGION_ALIASES: Record<string, string> = {
  'metro manila': 'ncr',
  'national capital region': 'ncr',
  'manila metropolitan area': 'ncr',
  mimaropa: 'mimaropa region',
  'southern tagalog': 'calabarzon',
  'cordillera administrative region': 'car',
  'bangsamoro autonomous region in muslim mindanao': 'barmm',
  'bangsamoro autonomous region': 'barmm',
  armm: 'barmm',
  'caraga region': 'caraga',
  davao: 'davao region',
  bicol: 'bicol region',
  ilocos: 'ilocos region',
}

/** Regions carry two names ("CALABARZON" and "Region IV-A"); either one matches. */
export function matchRegion<T extends { name: string; regionName: string }>(regions: T[], name: string): T | null {
  const wanted = normalizePlace(name)
  const target = REGION_ALIASES[wanted] ?? wanted
  const hits = regions.filter((r) => normalizePlace(r.name) === target || normalizePlace(r.regionName) === target)
  if (hits.length === 1) return hits[0]
  return hits.length ? null : matchPlace(regions, target)
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A saved name back onto its list: the exact name first, then the fuzzy match. Null when none or more than one fit. */
export function findByName<T extends { name: string }>(list: T[], name: string): T | null {
  const exact = list.filter((item) => same(item.name, name))
  return exact.length ? (exact.length === 1 ? exact[0] : null) : matchPlace(list, name)
}

/** Like findByName for regions, which answer to either of their two names. */
export function findRegion<T extends { name: string; regionName: string }>(regions: T[], name: string): T | null {
  const exact = regions.filter((r) => same(r.name, name) || same(r.regionName, name))
  return exact.length ? (exact.length === 1 ? exact[0] : null) : matchRegion(regions, name)
}

export type Place = { code: string | null; name: string }
export const NONE: Place = { code: null, name: '' }

export type ResolvedAddress = {
  region: Place
  city: Place
  barangay: Place
  /** The province's name, '' when there is none. */
  province: string
  /** What did not match, for the form to say. */
  note: string | null
}

const unmatched = (level: string) => `We couldn't match your ${level} to our list. Pick it again.`

/**
 * Puts a saved address's place names back onto the PSGC lists so the form can offer them as pickers. A level that does
 * not match is left empty (with everything below it) for the user to pick again. A list that cannot load keeps the saved
 * names as plain text (code null), so editing is never blocked. An abort rejects.
 */
export async function resolveAddressCodes(address: Address, signal: AbortSignal): Promise<ResolvedAddress> {
  const text: ResolvedAddress = {
    region: { code: null, name: address.region },
    city: { code: null, name: address.cityMunicipality },
    barangay: { code: null, name: address.barangay },
    province: address.province ?? '',
    note: null,
  }
  try {
    const region = findRegion(await getRegions(signal), address.region)
    if (!region) return { ...text, note: "We couldn't match your region to our list. Pick it again to change the area." }
    const picked: ResolvedAddress = { ...text, region: { code: region.code, name: region.name } }

    const city = findByName(await getCities(region.code, signal), address.cityMunicipality)
    if (!city) return { ...picked, city: NONE, barangay: NONE, note: unmatched('city or municipality') }
    picked.city = { code: city.code, name: city.name }

    const barangay = findByName(await getBarangays(city.code, signal), address.barangay)
    if (!barangay) return { ...picked, barangay: NONE, note: unmatched('barangay') }
    return { ...picked, barangay: { code: barangay.code, name: barangay.name } }
  } catch (error) {
    if (signal.aborted) throw error
    return { ...text, note: "We couldn't load the address lists, so your saved places are shown as they were saved." }
  }
}

/** The province's name for a city: '' for NCR and independent cities, or when the list cannot say. */
export async function provinceNameOf(regionCode: string, provinceCode: string | false, signal?: AbortSignal): Promise<string> {
  if (provinceCode === false) return ''
  try {
    return (await getProvinces(regionCode, signal)).find((p) => p.code === provinceCode)?.name ?? ''
  } catch (error) {
    if (signal?.aborted) throw error
    return ''
  }
}

/** A reverse-geocoded place onto the lists, level by level; a level that does not match stays empty (and so does everything below it). */
export async function resolveReverse(found: ReverseResult, signal: AbortSignal): Promise<ResolvedAddress> {
  const out: ResolvedAddress = { region: NONE, city: NONE, barangay: NONE, province: '', note: null }
  const miss = (name: string, level: string) => (name ? `The map says "${name}", but it isn't in the list. Pick it below.` : `The map didn't name a ${level}. Pick it below.`)
  try {
    const region = matchRegion(await getRegions(signal), found.region)
    if (!region) return { ...out, note: miss(found.region, 'region') }
    out.region = { code: region.code, name: region.name }

    const city = found.city ? matchPlace(await getCities(region.code, signal), found.city) : null
    if (!city) return { ...out, note: miss(found.city, 'city') }
    out.city = { code: city.code, name: city.name }
    out.province = await provinceNameOf(region.code, city.provinceCode, signal)

    const list = await getBarangays(city.code, signal)
    const hit = found.barangays.map((name) => matchPlace(list, name)).find(Boolean)
    if (!hit) return { ...out, note: miss(found.barangays[0] ?? '', 'barangay') }
    return { ...out, barangay: { code: hit.code, name: hit.name } }
  } catch (error) {
    if (signal.aborted) throw error
    return { ...out, note: "We couldn't load the address lists to fill the area from your pin. Pick it below." }
  }
}
