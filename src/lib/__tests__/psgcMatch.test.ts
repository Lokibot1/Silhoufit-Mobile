import { findByName, findRegion, matchPlace, matchRegion, normalizePlace, resolveAddressCodes, resolveReverse } from '../psgcMatch'

jest.mock('@/api/psgc', () => ({ getRegions: jest.fn(), getCities: jest.fn(), getBarangays: jest.fn(), getProvinces: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
const psgc = jest.requireMock('@/api/psgc')

const regions = [
  { code: '130000000', name: 'NCR', regionName: 'National Capital Region' },
  { code: '040000000', name: 'CALABARZON', regionName: 'Region IV-A' },
]
const cities = [
  { code: 'c1', name: 'City of Makati', provinceCode: false },
  { code: 'c2', name: 'Lipa City', provinceCode: 'p1' },
  { code: 'c3', name: 'San Pablo City', provinceCode: 'p2' },
  { code: 'c4', name: 'San Pedro', provinceCode: 'p2' },
]
const barangays = [{ code: 'b1', name: 'Poblacion' }, { code: 'b2', name: 'Barangay 17' }, { code: 'b3', name: 'Barangay 117' }]

beforeEach(() => {
  jest.resetAllMocks()
  psgc.getRegions.mockResolvedValue(regions)
  psgc.getCities.mockResolvedValue(cities)
  psgc.getBarangays.mockResolvedValue(barangays)
  psgc.getProvinces.mockResolvedValue([{ code: 'p1', name: 'Batangas' }])
})

describe('matching', () => {
  it('normalizes accents, labels, qualifiers and punctuation', () => {
    expect(normalizePlace('City of Parañaque (Dr. A. Santos)')).toBe('paranaque')
    expect(normalizePlace('Brgy. 176-A')).toBe('176 a')
  })
  it('matches exact, then a single prefix, then a single substring, and never guesses', () => {
    expect(matchPlace(cities, 'Makati')?.code).toBe('c1')
    expect(matchPlace(cities, 'Lipa')?.code).toBe('c2')
    expect(matchPlace(cities, 'San')).toBeNull() // two prefixes
    expect(matchPlace(barangays, '17')?.code).toBe('b2') // exact, not inside 117
    expect(matchPlace(barangays, '1')).toBeNull()
    expect(matchPlace(cities, '')).toBeNull()
  })
  it('matches a region by either name and OpenStreetMap aliases', () => {
    expect(matchRegion(regions, 'Metro Manila')?.code).toBe('130000000')
    expect(matchRegion(regions, 'Region IV-A')?.code).toBe('040000000')
    expect(matchRegion(regions, 'Southern Tagalog')?.code).toBe('040000000')
    expect(matchRegion(regions, 'Atlantis')).toBeNull()
  })
  it('finds a saved name exactly first, then fuzzily', () => {
    expect(findByName(cities, 'lipa city')?.code).toBe('c2')
    expect(findByName(cities, 'Makati')?.code).toBe('c1')
    expect(findRegion(regions, 'national capital region')?.code).toBe('130000000')
  })
})

const saved = { region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Poblacion' } as never
const signal = () => new AbortController().signal

describe('resolveAddressCodes', () => {
  it('puts a saved address back on the lists', async () => {
    const r = await resolveAddressCodes(saved, signal())
    expect(r).toMatchObject({ region: { code: '130000000', name: 'NCR' }, city: { code: 'c1', name: 'City of Makati' }, barangay: { code: 'b1', name: 'Poblacion' }, note: null })
  })
  it('leaves a level that does not match, and everything below it, empty with a note', async () => {
    const r = await resolveAddressCodes({ ...(saved as object), cityMunicipality: 'Narnia' } as never, signal())
    expect(r.region.code).toBe('130000000')
    expect(r.city).toEqual({ code: null, name: '' })
    expect(r.barangay).toEqual({ code: null, name: '' })
    expect(r.note).toMatch(/city or municipality/)
  })
  it('keeps the saved names as text when the lists cannot load, so editing is not blocked', async () => {
    psgc.getRegions.mockRejectedValue(new Error('offline'))
    const r = await resolveAddressCodes({ ...(saved as object), province: 'Metro Manila' } as never, signal())
    expect(r).toMatchObject({ region: { code: null, name: 'NCR' }, city: { code: null, name: 'Makati' }, barangay: { code: null, name: 'Poblacion' }, province: 'Metro Manila' })
    expect(r.note).toMatch(/couldn't load/)
  })
  it('rejects when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    psgc.getRegions.mockRejectedValue(new Error('aborted'))
    await expect(resolveAddressCodes(saved, controller.signal)).rejects.toThrow()
  })
})

describe('resolveReverse', () => {
  it('maps a reverse-geocoded place to PSGC codes, trying each barangay candidate and reading the province off the city', async () => {
    const r = await resolveReverse({ street: '1 A St', postal: '4217', region: 'Calabarzon', city: 'Lipa', barangays: ['Nowhere', 'Poblacion'] }, signal())
    expect(r).toMatchObject({ region: { code: '040000000' }, city: { code: 'c2' }, province: 'Batangas', barangay: { code: 'b1' }, note: null })
  })
  it('stops at the first level it cannot match and says which', async () => {
    const r = await resolveReverse({ street: '', postal: '', region: 'Metro Manila', city: 'Narnia', barangays: [] }, signal())
    expect(r.region.code).toBe('130000000')
    expect(r.city.code).toBeNull()
    expect(r.note).toBe('The map says "Narnia", but it isn\'t in the list. Pick it below.')
    const none = await resolveReverse({ street: '', postal: '', region: '', city: '', barangays: [] }, signal())
    expect(none.note).toBe("The map didn't name a region. Pick it below.")
  })
  it('a failing list leaves a note instead of throwing', async () => {
    psgc.getCities.mockRejectedValue(new Error('offline'))
    const r = await resolveReverse({ street: '', postal: '', region: 'NCR', city: 'Makati', barangays: [] }, signal())
    expect(r.note).toMatch(/couldn't load/)
  })
})
