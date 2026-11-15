import { ApiError, request } from '@/lib/api'

import { createAddress, deleteAddress, fetchAddresses, setDefaultAddress, updateAddress } from '../addresses'
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), request: jest.fn() }))
const mockRequest = request as jest.Mock

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  userId: 'u1',
  label: 'Home',
  recipientName: 'Ana Cruz',
  phone: '09171234567',
  region: 'NCR',
  province: null,
  cityMunicipality: 'Makati',
  barangay: 'Brgy 1',
  streetAddress: '1 Main St',
  addressLine2: null,
  postalCode: '1200',
  latitude: '14.5547',
  longitude: 121.0244,
  country: 'Philippines',
  isDefault: false,
  ...over,
})

beforeEach(() => mockRequest.mockReset())

describe('fetchAddresses', () => {
  it('parses rows, coerces numeric strings and puts the default first', async () => {
    mockRequest.mockResolvedValue([raw(), raw({ id: 'a2', isDefault: true })])
    const list = await fetchAddresses()
    expect(mockRequest).toHaveBeenCalledWith('GET', '/users/me/addresses', undefined, undefined)
    expect(list.map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(list[1]).toEqual({ id: 'a1', label: 'Home', recipientName: 'Ana Cruz', phone: '09171234567', region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Brgy 1', streetAddress: '1 Main St', addressLine2: null, postalCode: '1200', latitude: 14.5547, longitude: 121.0244, isDefault: false })
  })
  it('keeps null coordinates null', async () => {
    mockRequest.mockResolvedValue([raw({ latitude: null, longitude: undefined })])
    const [a] = await fetchAddresses()
    expect(a.latitude).toBeNull()
    expect(a.longitude).toBeNull()
  })
  it('rejects a non-array or a malformed row', async () => {
    for (const body of [{}, null, [raw(), {}], [raw({ id: '' })], [raw({ postalCode: undefined })]]) {
      mockRequest.mockResolvedValueOnce(body)
      await expect(fetchAddresses()).rejects.toMatchObject({ kind: 'server' })
    }
  })
})

describe('createAddress', () => {
  const input = { recipientName: 'Ana Cruz', phone: '09171234567', region: 'NCR', cityMunicipality: 'Makati', barangay: 'Brgy 1', streetAddress: '1 Main St', postalCode: '1200', latitude: 14.5, longitude: 121 }
  it('sends only defined keys and parses the answer', async () => {
    mockRequest.mockResolvedValue(raw())
    const a = await createAddress({ ...input, province: undefined, addressLine2: undefined, isDefault: true })
    expect(mockRequest).toHaveBeenCalledWith('POST', '/users/me/addresses', { ...input, isDefault: true }, undefined)
    expect(a.id).toBe('a1')
  })
  it('rejects a malformed answer', async () => {
    mockRequest.mockResolvedValue({ id: 'a1' })
    await expect(createAddress(input)).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('setDefaultAddress', () => {
  it('PATCHes isDefault and parses the answer', async () => {
    mockRequest.mockResolvedValue(raw({ isDefault: true }))
    const a = await setDefaultAddress('a 1')
    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/users/me/addresses/a%201', { isDefault: true }, undefined)
    expect(a.isDefault).toBe(true)
  })
  it('rejects a malformed answer and passes failures through', async () => {
    mockRequest.mockResolvedValueOnce({})
    await expect(setDefaultAddress('a1')).rejects.toMatchObject({ kind: 'server' })
    mockRequest.mockRejectedValueOnce(new ApiError('not-found', undefined, 404))
    await expect(setDefaultAddress('a1')).rejects.toMatchObject({ kind: 'not-found' })
  })
})

describe('deleteAddress', () => {
  it('DELETEs the address', async () => {
    mockRequest.mockResolvedValue({ success: true })
    await deleteAddress('a1')
    expect(mockRequest).toHaveBeenCalledWith('DELETE', '/users/me/addresses/a1', undefined, undefined)
  })
  it('treats a 404 as already deleted', async () => {
    mockRequest.mockRejectedValue(new ApiError('not-found', undefined, 404))
    await expect(deleteAddress('a1')).resolves.toBeUndefined()
  })
  it('rethrows every other failure', async () => {
    for (const kind of ['network', 'forbidden', 'server', 'rate-limit'] as const) {
      mockRequest.mockRejectedValueOnce(new ApiError(kind))
      await expect(deleteAddress('a1')).rejects.toMatchObject({ kind })
    }
  })
})

describe('updateAddress', () => {
  it('PATCHes only the given fields, nulls included, and returns the saved address', async () => {
    mockRequest.mockResolvedValue(raw({ label: null, phone: '+639171234567' }))
    const saved = await updateAddress('a 1', { phone: '+639171234567', label: null })
    expect(mockRequest).toHaveBeenCalledWith('PATCH', '/users/me/addresses/a%201', { phone: '+639171234567', label: null }, undefined)
    expect(saved).toMatchObject({ id: 'a1', phone: '+639171234567', label: null })
  })
  it('fails a malformed answer and passes errors through', async () => {
    mockRequest.mockResolvedValueOnce({ id: 'a1' })
    await expect(updateAddress('a1', { phone: '+639171234567' })).rejects.toMatchObject({ kind: 'server' })
    mockRequest.mockRejectedValueOnce(new ApiError('validation', 'phone must be a valid Philippine phone number', 400))
    await expect(updateAddress('a1', { phone: '1' })).rejects.toMatchObject({ kind: 'validation' })
  })
})
