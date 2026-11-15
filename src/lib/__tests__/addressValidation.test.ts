import {
  filterLabel,
  filterName,
  filterPhone,
  filterPostal,
  filterStreet,
  fromAddress,
  inPhilippines,
  normalizePhone,
  toNewAddress,
  toPatch,
  validateLabel,
  validatePhone,
  validatePostal,
  validateStreet,
  type AddressValues,
} from '../addressValidation'

describe('phone', () => {
  it('keeps digits and a leading plus only, capped at 13', () => {
    expect(filterPhone('(0917) 123-4567')).toBe('09171234567')
    expect(filterPhone('+63 917 123 4567')).toBe('+639171234567')
    expect(filterPhone('09171234567890123')).toBe('0917123456789')
    expect(filterPhone('91+7')).toBe('917')
  })
  it.each([
    ['0917 123 4567', '+639171234567'],
    ['+63 917-123-4567', '+639171234567'],
    ['639171234567', '+639171234567'],
    ['9171234567', '+639171234567'],
    ['(02) 8123-4567', '+63281234567'],
  ])('normalizes %s to %s', (input, saved) => {
    expect(normalizePhone(input)).toBe(saved)
  })
  it('accepts what the backend regex accepts and says what to do otherwise', () => {
    expect(validatePhone('0917 123 4567')).toBeNull()
    expect(validatePhone('+639171234567')).toBeNull()
    expect(validatePhone('(02) 8123-4567')).toBeNull()
    expect(validatePhone('')).toBe('Phone number is required.')
    expect(validatePhone('12345')).toMatch(/Philippine number/)
    expect(validatePhone('01171234567')).toMatch(/Philippine number/)
  })
})

describe('text fields', () => {
  it('names keep letters, spaces, hyphens and apostrophes only', () => {
    expect(filterName("Ana-Marie O'Neil 3 😀  Cruz!")).toBe("Ana-Marie O'Neil Cruz")
    expect(filterName('a'.repeat(150))).toHaveLength(100)
  })
  it('label and street strip emoji and control characters and respect the backend caps', () => {
    expect(filterLabel('Home 😀\n')).toBe('Home ')
    expect(filterLabel('x'.repeat(80))).toHaveLength(50)
    expect(filterStreet('12 Main St 🏠')).toBe('12 Main St ')
    expect(filterStreet('x'.repeat(300))).toHaveLength(255)
    expect(validateLabel('Home 😀')).toBe("Emoji aren't allowed in this field.")
    expect(validateLabel('Home')).toBeNull()
  })
  it('street only needs to be filled in (the server has no minimum), postal exactly 4 digits', () => {
    expect(validateStreet('  ')).toBe('Street address is required.')
    expect(validateStreet('1 St')).toBeNull()
    expect(validateStreet('12 Main St')).toBeNull()
    expect(filterPostal('12a345')).toBe('1234')
    expect(validatePostal('')).toBe('Postal code is required.')
    expect(validatePostal('123')).toBe('Postal code is 4 digits, like 1100.')
    expect(validatePostal('1100')).toBeNull()
  })
})

describe('pin bounds', () => {
  it('accepts the country and rejects the rest, NaN and Infinity included', () => {
    expect(inPhilippines(14.6, 121)).toBe(true)
    expect(inPhilippines(0, 0)).toBe(false)
    expect(inPhilippines(35, 139)).toBe(false)
    expect(inPhilippines(NaN, 121)).toBe(false)
    expect(inPhilippines(14, Infinity)).toBe(false)
  })
})

const place = (code: string, name: string) => ({ code, name })
const values: AddressValues = {
  recipientName: '  Ana   Cruz ',
  phone: '0917 123 4567',
  label: 'Home',
  street: '12  Main St',
  postal: '1200',
  region: place('r', 'NCR'),
  city: place('c', 'Makati'),
  barangay: place('b', 'Poblacion'),
  province: '',
  pin: { lat: 14.5, lon: 121 },
  isDefault: false,
}

describe('payload', () => {
  it('builds the POST body: normalized, no empty optionals, pin required', () => {
    expect(toNewAddress(values)).toEqual({
      label: 'Home',
      recipientName: 'Ana Cruz',
      phone: '+639171234567',
      region: 'NCR',
      cityMunicipality: 'Makati',
      barangay: 'Poblacion',
      streetAddress: '12 Main St',
      postalCode: '1200',
      latitude: 14.5,
      longitude: 121,
    })
    expect(toNewAddress({ ...values, label: '', province: 'Batangas', isDefault: true })).toMatchObject({ province: 'Batangas', isDefault: true })
    expect(toNewAddress({ ...values, label: '' })).not.toHaveProperty('label')
    expect(() => toNewAddress({ ...values, pin: null })).toThrow()
  })
  const saved = { id: 'a1', label: 'Home', recipientName: 'Ana Cruz', phone: '09171234567', region: 'NCR', province: null, cityMunicipality: 'Makati', barangay: 'Poblacion', streetAddress: '12 Main St', addressLine2: null, postalCode: '1200', latitude: 14.5, longitude: 121, isDefault: false }
  const same = fromAddress(saved, { region: place('r', 'NCR'), city: place('c', 'Makati'), barangay: place('b', 'Poblacion'), province: '' })
  it('an untouched edit form has an empty patch, however the saved phone was written', () => {
    expect(toPatch(same, saved)).toEqual({})
    expect(toPatch({ ...same, phone: '+63 917 123 4567' }, saved)).toEqual({})
  })
  it('patches only what changed; a cleared optional becomes null; a moved pin sends both coordinates', () => {
    expect(toPatch({ ...same, label: '', postal: '1300', pin: { lat: 14.6, lon: 121 }, isDefault: true }, saved)).toEqual({ label: null, postalCode: '1300', latitude: 14.6, longitude: 121, isDefault: true })
    expect(toPatch({ ...same, phone: '0918 000 1111', province: 'Metro Manila' }, saved)).toEqual({ phone: '+639180001111', province: 'Metro Manila' })
  })
})
