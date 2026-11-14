import type { Address } from '@/api/addresses'

/** The street line and the area line of an address, empty parts left out. */
export const addressLines = (a: Address) => ({
  street: [a.streetAddress, a.addressLine2].filter(Boolean).join(', '),
  area: [a.barangay, a.cityMunicipality, a.province, a.postalCode].filter(Boolean).join(', '),
})
