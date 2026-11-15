import { getBarangays, getCities, getProvinces, getRegions, PsgcError, resetPsgcCache } from '../psgc'

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
const fetchMock = jest.fn()

beforeEach(() => {
  jest.useFakeTimers()
  resetPsgcCache()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => jest.useRealTimers())

describe('psgc', () => {
  it('loads each list from the PSGC Cloud URL (cities by region) and sorts by name', async () => {
    fetchMock.mockImplementation(() => ok([{ code: '2', name: 'Zamora' }, { code: '1', name: 'Alabat' }]))
    expect((await getCities('130000000')).map((c) => c.name)).toEqual(['Alabat', 'Zamora'])
    await getProvinces('040000000')
    await getBarangays('1380100000')
    await getRegions()
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://psgc.gitlab.io/api/regions/130000000/cities-municipalities/',
      'https://psgc.gitlab.io/api/regions/040000000/provinces/',
      'https://psgc.gitlab.io/api/cities-municipalities/1380100000/barangays/',
      'https://psgc.gitlab.io/api/regions/',
    ])
  })

  it('caches in memory and shares one in-flight request', async () => {
    fetchMock.mockImplementation(() => ok([{ code: '1', name: 'NCR', regionName: 'NCR' }]))
    await Promise.all([getRegions(), getRegions()])
    await getRegions()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries with backoff and then succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => ok([]))
    const list = getRegions()
    await jest.advanceTimersByTimeAsync(500)
    await expect(list).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after three attempts with the failure kind, and a retry starts fresh', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const check = expect(getRegions()).rejects.toMatchObject({ kind: 'network' })
    await jest.advanceTimersByTimeAsync(1500)
    await check
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fetchMock.mockImplementation(() => ok([]))
    await expect(getRegions()).resolves.toEqual([])
  })

  it('treats a non-OK answer or a non-list body as a server error', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, json: () => Promise.resolve([]) }))
    const first = expect(getRegions()).rejects.toBeInstanceOf(PsgcError)
    await jest.advanceTimersByTimeAsync(1500)
    await first
    resetPsgcCache()
    fetchMock.mockImplementation(() => ok({ not: 'a list' }))
    const second = expect(getRegions()).rejects.toMatchObject({ kind: 'server' })
    await jest.advanceTimersByTimeAsync(1500)
    await second
  })

  it('an aborted caller stops waiting but the shared request is kept for the next one', async () => {
    fetchMock.mockImplementation(() => ok([]))
    const controller = new AbortController()
    const waiting = getRegions(controller.signal)
    controller.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    await getRegions()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
