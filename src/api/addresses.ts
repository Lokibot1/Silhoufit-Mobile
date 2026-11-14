import { ApiError, isRecord, num, request, str } from '@/lib/api'

export type Address = {
  id: string
  label: string | null
  recipientName: string
  phone: string
  region: string
  province: string | null
  cityMunicipality: string
  barangay: string
  streetAddress: string
  addressLine2: string | null
  postalCode: string
  latitude: number | null
  longitude: number | null
  isDefault: boolean
}

export type NewAddress = Pick<Address, 'recipientName' | 'phone' | 'region' | 'cityMunicipality' | 'barangay' | 'streetAddress' | 'postalCode'> & {
  province?: string
  addressLine2?: string
  latitude: number
  longitude: number
  isDefault?: boolean
}

function toAddress(raw: unknown): Address {
  if (!isRecord(raw)) throw new ApiError('server')
  const id = str(raw.id)
  const recipientName = str(raw.recipientName)
  const phone = str(raw.phone)
  const region = str(raw.region)
  const cityMunicipality = str(raw.cityMunicipality)
  const barangay = str(raw.barangay)
  const streetAddress = str(raw.streetAddress)
  const postalCode = str(raw.postalCode)
  if (!id || !recipientName || !phone || !region || !cityMunicipality || !barangay || !streetAddress || !postalCode) throw new ApiError('server')
  return {
    id,
    label: str(raw.label),
    recipientName,
    phone,
    region,
    province: str(raw.province),
    cityMunicipality,
    barangay,
    streetAddress,
    addressLine2: str(raw.addressLine2),
    postalCode,
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    isDefault: raw.isDefault === true,
  }
}

/** GET /users/me/addresses, default first. One malformed row fails the list, like the cart and orders. */
export async function fetchAddresses(signal?: AbortSignal): Promise<Address[]> {
  const body = await request('GET', '/users/me/addresses', undefined, signal)
  if (!Array.isArray(body)) throw new ApiError('server')
  return body.map(toAddress).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}

/** POST /users/me/addresses. Undefined keys are dropped (the API rejects unknown or empty ones). */
export async function createAddress(input: NewAddress, signal?: AbortSignal): Promise<Address> {
  const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
  return toAddress(await request('POST', '/users/me/addresses', body, signal))
}
