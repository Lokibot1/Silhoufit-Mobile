import { inPhilippines } from '@/lib/addressValidation'

// Turns a map position into address parts, and a typed place name into positions, with OpenStreetMap's Nominatim. Called only when a pin is placed (never while
// panning), at most once a second, and the same spot is answered from memory. Policy: https://operations.osmfoundation.org/policies/nominatim/
const URL_BASE = 'https://nominatim.openstreetmap.org'
const MIN_GAP_MS = 1000
const TIMEOUT_MS = 8000
// The policy asks for a User-Agent that identifies the app (a stock fetch one is blocked).
const HEADERS = { 'User-Agent': 'SilhouFit-Mobile/1.0', Accept: 'application/json' }

export type ReverseResult = {
  street: string
  postal: string
  /** OpenStreetMap's state/region name; matched against PSGC by the caller. */
  region: string
  city: string
  /** Candidates, best first: OpenStreetMap is loose about which tag holds the barangay. */
  barangays: string[]
}

export type ReverseErrorKind = 'network' | 'timeout' | 'server' | 'outside'
export class ReverseGeocodeError extends Error {
  constructor(readonly kind: ReverseErrorKind) {
    super(`Reverse geocoding failed: ${kind}`)
  }
}

const cache = new Map<string, ReverseResult>()
let lastRequestAt = 0
// Lookups queue behind one another so the 1 s gap holds even when two start together.
let queue: Promise<unknown> = Promise.resolve()

/** Forgets the cache and the throttle (tests). */
export function resetReverseGeocode() {
  cache.clear()
  searches.clear()
  lastRequestAt = 0
  queue = Promise.resolve()
}

const aborted = () => Object.assign(new Error('The request was aborted.'), { name: 'AbortError' })

export function mapAddress(address: Record<string, string | undefined>): ReverseResult {
  const pick = (...keys: string[]) => keys.map((key) => address[key]?.trim()).filter((v): v is string => !!v)
  return {
    street: pick('house_number', 'road').join(' '),
    postal: address.postcode?.replace(/\D/g, '').slice(0, 4) ?? '',
    // `region` is the PSGC-style region ("Calabarzon"); `state` can be the province ("Batangas"), so it is the fallback.
    region: pick('region', 'state')[0] ?? '',
    city: pick('city', 'town', 'municipality')[0] ?? '',
    barangays: [...new Set(pick('quarter', 'suburb', 'village', 'neighbourhood'))],
  }
}

/** One GET to Nominatim. The caller's signal is passed on to fetch, so an abandoned request is cancelled and frees the queue. */
async function get(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const stop = () => controller.abort()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const response = await fetch(`${URL_BASE}/${path}?${new URLSearchParams(params)}`, { headers: HEADERS, signal: controller.signal })
    if (!response.ok) throw new ReverseGeocodeError('server')
    return await response.json()
  } catch (error) {
    if (signal?.aborted) throw aborted()
    if (error instanceof ReverseGeocodeError) throw error
    throw new ReverseGeocodeError(controller.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

// Runs `work` once its turn comes and a second has passed since the last request; an abort while waiting never reaches the network.
function throttled<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    if (signal?.aborted) throw aborted()
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal?.aborted) throw aborted()
    lastRequestAt = Date.now()
    return work()
  })
  queue = run.catch(() => undefined)
  return run
}

/** The address parts at a position. An abort rejects with an AbortError; any other failure is a ReverseGeocodeError the form can ignore. */
export function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<ReverseResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)

  return throttled(signal, async () => {
    const params = { format: 'jsonv2', lat: lat.toFixed(5), lon: lon.toFixed(5), zoom: '18', addressdetails: '1', 'accept-language': 'en' }
    const body = (await get('reverse', params, signal)) as { address?: Record<string, string | undefined>; error?: string } | null
    if (!body?.address) throw new ReverseGeocodeError(body?.error ? 'outside' : 'server')
    if (body.address.country_code && body.address.country_code !== 'ph') throw new ReverseGeocodeError('outside')
    const result = mapAddress(body.address)
    cache.set(key, result)
    return result
  })
}

export type PlaceHit = { label: string; lat: number; lon: number }
const SEARCH_LIMIT = 5
const searches = new Map<string, PlaceHit[]>()

/** Places in the Philippines matching a typed name (up to 5, anything outside the country dropped). Same throttle, headers and abort rules as reverseGeocode. */
export function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const q = query.trim().replace(/\s+/g, ' ')
  const key = q.toLowerCase()
  const hit = searches.get(key)
  if (hit) return Promise.resolve(hit)

  return throttled(signal, async () => {
    const params = { format: 'jsonv2', q, countrycodes: 'ph', limit: String(SEARCH_LIMIT), addressdetails: '1', 'accept-language': 'en' }
    const body = await get('search', params, signal)
    if (!Array.isArray(body)) throw new ReverseGeocodeError('server')
    const places = body.flatMap((row: { display_name?: unknown; lat?: unknown; lon?: unknown; address?: { country_code?: string } } | null): PlaceHit[] => {
      const lat = Number(row?.lat)
      const lon = Number(row?.lon)
      const label = typeof row?.display_name === 'string' ? row.display_name.trim() : ''
      const abroad = !!row?.address?.country_code && row.address.country_code !== 'ph'
      return label && !abroad && inPhilippines(lat, lon) ? [{ label, lat, lon }] : []
    })
    searches.set(key, places.slice(0, SEARCH_LIMIT))
    return places.slice(0, SEARCH_LIMIT)
  })
}
