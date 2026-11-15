import type { Address, AddressPatch, NewAddress } from '@/api/addresses'

import type { Place } from './psgcMatch'
import { normalizeName, stripEmoji } from './profileValidation'

// Limits mirror the backend DTO (silhoufit-api/src/addresses/dto/create-address.dto.ts); the phone cap is CLAUDE.md's 13.
export const ADDRESS_LIMITS = { name: 100, label: 50, street: 255, postal: 4, phone: 13 } as const
// The server is the authority: this is a copy of PH_PHONE_REGEX (silhoufit-api/src/addresses/dto/address.constants.ts).
const PH_PHONE_REGEX = /^(?:(?:\+63|0)[\s.-]?9(?:[\s.-]?\d){9}|(?:\+63|0)[\s.-]?[2-8]\d{0,2}(?:[\s.-]?\d{3,4}){2}|\(0[2-8]\d{0,2}\)[\s.-]?(?:\d{3,4}[\s.-]?){1,2}\d{4})$/
// A rough box around the country, so a pin cannot land in the ocean or abroad by accident or by a bad message.
export const PH_BOUNDS = { minLat: 4, maxLat: 22, minLon: 116, maxLon: 127 }
export const MANILA = { lat: 14.5995, lon: 120.9842 }
export const QUICK_LABELS = ['Home', 'Work']

export const inPhilippines = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= PH_BOUNDS.minLat && lat <= PH_BOUNDS.maxLat && lon >= PH_BOUNDS.minLon && lon <= PH_BOUNDS.maxLon

const CONTROL = /[\u0000-\u001F\u007F]/g
const tidy = (input: string) => stripEmoji(input.replace(CONTROL, '')).replace(/ {2,}/g, ' ')

export const filterName = (input: string) => stripEmoji(input).replace(/[^\p{L}\p{M} '’-]/gu, '').replace(/ {2,}/g, ' ').slice(0, ADDRESS_LIMITS.name)
export const filterLabel = (input: string) => tidy(input).slice(0, ADDRESS_LIMITS.label)
export const filterStreet = (input: string) => tidy(input).slice(0, ADDRESS_LIMITS.street)
export const filterPostal = (input: string) => input.replace(/\D/g, '').slice(0, ADDRESS_LIMITS.postal)
/** Digits and a leading "+" only, so spaces, dashes and brackets typed or pasted are dropped. */
export function filterPhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  return ((input.trim().startsWith('+') ? '+' : '') + digits).slice(0, ADDRESS_LIMITS.phone)
}

/** What is saved: "+63" and the number, whichever way it was typed (0917..., 63917..., +63 917..., (02) 8123-4567). */
export function normalizePhone(input: string): string {
  const typed = filterPhone(input)
  if (typed.startsWith('+')) return typed
  if (typed.startsWith('0')) return `+63${typed.slice(1)}`
  return typed.startsWith('63') && typed.length >= 12 ? `+${typed}` : `+63${typed}`
}

export function validatePhone(input: string): string | null {
  if (!filterPhone(input)) return 'Phone number is required.'
  return PH_PHONE_REGEX.test(normalizePhone(input)) ? null : 'Enter a Philippine number like 0917 123 4567 or +63 917 123 4567.'
}

export function validateStreet(input: string): string | null {
  const street = normalizeName(input)
  if (!street) return 'Street address is required.'
  return street.length > ADDRESS_LIMITS.street ? `Street address can be at most ${ADDRESS_LIMITS.street} characters.` : null
}

/** Optional. */
export function validateLabel(input: string): string | null {
  if (stripEmoji(input) !== input) return "Emoji aren't allowed in this field."
  return normalizeName(input).length > ADDRESS_LIMITS.label ? `Label can be at most ${ADDRESS_LIMITS.label} characters.` : null
}

export function validatePostal(input: string): string | null {
  if (!input) return 'Postal code is required.'
  return /^\d{4}$/.test(input) ? null : 'Postal code is 4 digits, like 1100.'
}

export type AddressValues = {
  recipientName: string
  phone: string
  label: string
  street: string
  postal: string
  region: Place
  city: Place
  barangay: Place
  province: string
  pin: { lat: number; lon: number } | null
  isDefault: boolean
}

/** The POST body. The caller has validated, so the pin is there. */
export function toNewAddress(v: AddressValues): NewAddress {
  if (!v.pin) throw new Error('A map pin is required.')
  return {
    ...(normalizeName(v.label) && { label: normalizeName(v.label) }),
    recipientName: normalizeName(v.recipientName),
    phone: normalizePhone(v.phone),
    region: v.region.name,
    ...(v.province && { province: v.province }),
    cityMunicipality: v.city.name,
    barangay: v.barangay.name,
    streetAddress: normalizeName(v.street),
    postalCode: v.postal,
    latitude: v.pin.lat,
    longitude: v.pin.lon,
    ...(v.isDefault && { isDefault: true }),
  }
}

/** The values a saved address starts the form with. */
export const fromAddress = (a: Address, places: { region: Place; city: Place; barangay: Place; province: string }): AddressValues => ({
  recipientName: a.recipientName,
  phone: a.phone,
  label: a.label ?? '',
  street: a.streetAddress,
  postal: a.postalCode,
  ...places,
  pin: a.latitude !== null && a.longitude !== null ? { lat: a.latitude, lon: a.longitude } : null,
  isDefault: a.isDefault,
})

/** Only what differs from the saved address (compared the way it would be saved); a blank optional field becomes null, which clears it. */
export function toPatch(v: AddressValues, saved: Address): AddressPatch {
  const patch: AddressPatch = {}
  if (normalizeName(v.recipientName) !== normalizeName(saved.recipientName)) patch.recipientName = normalizeName(v.recipientName)
  if (normalizePhone(v.phone) !== normalizePhone(saved.phone)) patch.phone = normalizePhone(v.phone)
  if (normalizeName(v.label) !== normalizeName(saved.label ?? '')) patch.label = normalizeName(v.label) || null
  if (v.region.name !== saved.region) patch.region = v.region.name
  if (v.province !== (saved.province ?? '')) patch.province = v.province || null
  if (v.city.name !== saved.cityMunicipality) patch.cityMunicipality = v.city.name
  if (v.barangay.name !== saved.barangay) patch.barangay = v.barangay.name
  if (normalizeName(v.street) !== normalizeName(saved.streetAddress)) patch.streetAddress = normalizeName(v.street)
  if (v.postal !== saved.postalCode) patch.postalCode = v.postal
  if (v.pin && (v.pin.lat !== saved.latitude || v.pin.lon !== saved.longitude)) {
    patch.latitude = v.pin.lat
    patch.longitude = v.pin.lon
  }
  if (v.isDefault !== saved.isDefault) patch.isDefault = v.isDefault
  return patch
}
