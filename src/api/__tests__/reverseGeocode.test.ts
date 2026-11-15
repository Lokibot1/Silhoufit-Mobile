import { mapAddress, resetReverseGeocode, reverseGeocode, searchPlaces } from '../reverseGeocode'

const answer = (address: object | undefined, extra: object = {}) => Promise.resolve({ ok: true, json: () => Promise.resolve({ address, ...extra }) })
const fetchMock = jest.fn()
const found = { house_number: '12', road: 'Ayala Ave', postcode: '1226-A', region: 'NCR', city: 'Makati', suburb: 'Poblacion', country_code: 'ph' }

beforeEach(() => {
  jest.useFakeTimers()
  resetReverseGeocode()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => jest.useRealTimers())

describe('reverseGeocode', () => {
  it('asks Nominatim with an identifying User-Agent and maps the address', async () => {
    fetchMock.mockImplementation(() => answer(found))
    await expect(reverseGeocode(14.55471, 121.02445)).resolves.toEqual({ street: '12 Ayala Ave', postal: '1226', region: 'NCR', city: 'Makati', barangays: ['Poblacion'] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://nominatim.openstreetmap.org/reverse?')
    expect(url).toContain('lat=14.55471')
    expect(init.headers['User-Agent']).toMatch(/SilhouFit/)
  })

  it('answers the same spot from memory', async () => {
    fetchMock.mockImplementation(() => answer(found))
    await reverseGeocode(14.5, 121)
    await reverseGeocode(14.5, 121)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('spaces requests at least one second apart, even when started together', async () => {
    fetchMock.mockImplementation(() => answer(found))
    const both = Promise.all([reverseGeocode(14.1, 121), reverseGeocode(14.2, 121)])
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    await both
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an aborted lookup never reaches the network', async () => {
    fetchMock.mockImplementation(() => answer(found))
    await reverseGeocode(14.1, 121)
    const controller = new AbortController()
    const waiting = reverseGeocode(14.2, 121, controller.signal)
    controller.abort()
    const check = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    await jest.advanceTimersByTimeAsync(1000)
    await check
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('an abort while the request is in flight cancels the fetch itself and frees the queue at once', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    fetchMock.mockImplementation(() => answer(found))
    const controller = new AbortController()
    const stale = reverseGeocode(14.1, 121, controller.signal)
    const check = expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    controller.abort()
    await check
    const next = reverseGeocode(14.2, 121)
    await jest.advanceTimersByTimeAsync(1000) // the 1 s gap only, not the 8 s the stale request would have held
    await expect(next).resolves.toMatchObject({ city: 'Makati' })
  })

  it.each([
    ['a non-OK answer', () => Promise.resolve({ ok: false }), 'server'],
    ['no address', () => answer(undefined), 'server'],
    ['no address and an error (the sea)', () => answer(undefined, { error: 'Unable to geocode' }), 'outside'],
    ['another country', () => answer({ ...found, country_code: 'id' }), 'outside'],
    ['a network failure', () => Promise.reject(new Error('offline')), 'network'],
  ])('%s fails with a ReverseGeocodeError the form can ignore', async (_name, reply, kind) => {
    fetchMock.mockImplementation(reply)
    await expect(reverseGeocode(1, 100)).rejects.toMatchObject({ kind })
  })

  it('falls back to the state when there is no region', () => {
    expect(mapAddress({ state: 'Batangas', town: 'Lipa', village: 'Sabang', quarter: 'Sabang' })).toEqual({ street: '', postal: '', region: 'Batangas', city: 'Lipa', barangays: ['Sabang'] })
  })
})

describe('searchPlaces', () => {
  const row = (name: string, lat: string, lon: string, country = 'ph') => ({ display_name: name, lat, lon, address: { country_code: country } })
  const rows = [row('Ayala Avenue, Makati, Philippines', '14.5547', '121.0244'), row('Ayala, Jakarta, Indonesia', '-6.2', '106.8', 'id'), row('Nowhere, Philippines', '40', '121'), row('Ayala Mall, Cebu, Philippines', '10.3', '123.9')]
  const reply = (body: unknown) => () => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })

  it('asks for Philippine places with the identifying User-Agent, maps the rows and drops anything outside the country', async () => {
    fetchMock.mockImplementation(reply(rows))
    await expect(searchPlaces('  Ayala   Avenue ')).resolves.toEqual([
      { label: 'Ayala Avenue, Makati, Philippines', lat: 14.5547, lon: 121.0244 },
      { label: 'Ayala Mall, Cebu, Philippines', lat: 10.3, lon: 123.9 },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://nominatim.openstreetmap.org/search?')
    expect(url).toContain('countrycodes=ph')
    expect(url).toContain('limit=5')
    expect(url).toContain('q=Ayala+Avenue')
    expect(init.headers['User-Agent']).toMatch(/SilhouFit/)
  })

  it('keeps at most 5 and answers the same query from memory', async () => {
    fetchMock.mockImplementation(reply(Array.from({ length: 8 }, (_, i) => row(`Place ${i}`, '14.5', '121'))))
    expect(await searchPlaces('place')).toHaveLength(5)
    await searchPlaces('PLACE ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shares the one-second gap with reverse lookups', async () => {
    fetchMock.mockImplementation((url: string) => (url.includes('/search') ? reply(rows)() : answer(found)))
    const both = Promise.all([reverseGeocode(14.1, 121), searchPlaces('ayala')])
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1000)
    await both
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an aborted search never reaches the network', async () => {
    fetchMock.mockImplementation(reply(rows))
    await searchPlaces('first')
    const controller = new AbortController()
    const waiting = searchPlaces('second', controller.signal)
    controller.abort()
    const check = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    await jest.advanceTimersByTimeAsync(1000)
    await check
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a non-OK answer', () => Promise.resolve({ ok: false }), 'server'],
    ['a body that is not a list', reply({ error: 'x' }), 'server'],
    ['a network failure', () => Promise.reject(new Error('offline')), 'network'],
  ])('%s fails with a ReverseGeocodeError', async (_name, answerWith, kind) => {
    fetchMock.mockImplementation(answerWith)
    await expect(searchPlaces('ayala')).rejects.toMatchObject({ kind })
  })
})
