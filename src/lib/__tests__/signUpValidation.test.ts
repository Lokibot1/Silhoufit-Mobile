import {
  getPasswordRequirements,
  getPasswordStrength,
  LIMITS,
  sanitizeName,
  sanitizeSuffix,
  validateConfirmPassword,
  validateMiddleName,
  validateName,
  validatePassword,
  validateSuffix,
} from '../signUpValidation'

describe('names', () => {
  it('requires a first name and accepts letters, hyphens and apostrophes', () => {
    expect(validateName('')).toBe('First name is required.')
    expect(validateName("Mary-Anne O'Neil")).toBeNull()
    expect(validateName('José Peña', 'Last name')).toBeNull()
  })
  it('rejects digits, symbols and emoji', () => {
    expect(validateName('Ana2')).toBe('First name can only contain letters, spaces, hyphens and apostrophes.')
    expect(validateName('Ana 😀')).toContain('can only contain letters')
  })
  it('rejects misplaced punctuation', () => {
    for (const bad of ['-Ana', 'Ana-', "'Ana", 'An--a', "An''a"]) expect(validateName(bad)).toBe('First name has misplaced punctuation.')
  })
  it('enforces the word and total limits', () => {
    expect(validateName('a'.repeat(LIMITS.nameWordMaxLength + 1))).toBe(`Each word in First name can be at most ${LIMITS.nameWordMaxLength} letters.`)
    expect(validateName(`${'a'.repeat(20)} ${'b'.repeat(20)}`)).toBe(`First name can be at most ${LIMITS.nameMaxLength} characters.`)
    expect(validateName('a'.repeat(LIMITS.nameWordMaxLength))).toBeNull()
  })
  it('lets the middle name stay blank but validates it when filled', () => {
    expect(validateMiddleName('  ')).toBeNull()
    expect(validateMiddleName('R2')).toBe('Middle name can only contain letters, spaces, hyphens and apostrophes.')
  })
  it('sanitizes typed and pasted names', () => {
    expect(sanitizeName("An4a  Ma$ria-O'N 😀")).toBe("Ana Maria-O'N ")
    expect(sanitizeName('a'.repeat(60))).toHaveLength(LIMITS.nameMaxLength)
  })
})

describe('suffix', () => {
  it('allows letters and periods up to five characters', () => {
    expect(validateSuffix('')).toBeNull()
    expect(validateSuffix('Jr.')).toBeNull()
    expect(validateSuffix('III1')).toBe('Suffix can only contain letters and periods.')
    expect(validateSuffix('...')).toBe('Suffix can only contain letters and periods.')
    expect(validateSuffix('Junior')).toBe('Suffix can be at most 5 characters.')
  })
  it('sanitizes and caps it', () => {
    expect(sanitizeSuffix('J r.1x')).toBe('Jr.x')
    expect(sanitizeSuffix('abcdefgh')).toBe('abcde')
  })
})

describe('password', () => {
  it('reports each requirement', () => {
    const met = (password: string) => getPasswordRequirements(password).filter((r) => r.met).map((r) => r.id)
    expect(met('')).toEqual([])
    expect(met('Abcdefg1!')).toEqual(['length', 'upper', 'lower', 'number', 'special'])
    expect(met('abc')).toEqual(['lower'])
  })
  it('does not count emoji as a special character', () => {
    expect(getPasswordRequirements('Abcdefg1😀').find((r) => r.id === 'special')?.met).toBe(false)
  })
  it('returns the first unmet rule as the message', () => {
    expect(validatePassword('')).toBe('Password is required.')
    expect(validatePassword('Ab1!')).toBe('Use at least 8 characters.')
    expect(validatePassword('a'.repeat(65))).toBe('Use at most 64 characters.')
    expect(validatePassword('abcdefg1!')).toBe('Add an uppercase letter.')
    expect(validatePassword('ABCDEFG1!')).toBe('Add a lowercase letter.')
    expect(validatePassword('Abcdefgh!')).toBe('Add a number.')
    expect(validatePassword('Abcdefg12')).toBe('Add a special character, like ! or #.')
    expect(validatePassword('Abcdefg1!😀')).toBe("Password can't contain emoji.")
    expect(validatePassword('Abcdefg1!')).toBeNull()
  })
  it('checks the confirmation', () => {
    expect(validateConfirmPassword('Abcdefg1!', '')).toBe('Confirm your password.')
    expect(validateConfirmPassword('Abcdefg1!', 'abcdefg1!')).toBe("Passwords don't match.")
    expect(validateConfirmPassword('Abcdefg1!', 'Abcdefg1!')).toBeNull()
  })
})

describe('strength', () => {
  it('runs from Too weak to Strong', () => {
    expect(getPasswordStrength('')).toEqual({ level: 0, label: 'Too weak' })
    expect(getPasswordStrength('abc').label).toBe('Too weak')
    expect(getPasswordStrength('Abcdefg1').label).toBe('Weak')
    expect(getPasswordStrength('Abcdefg1!').level).toBe(2)
    expect(getPasswordStrength('Abcdefg1!xyz').label).toBe('Good')
    expect(getPasswordStrength('Tr0ub4dor&3xKq9!z')).toEqual({ level: 4, label: 'Strong' })
  })
  it('caps common words at Weak', () => {
    expect(getPasswordStrength('Password1!xyzxyz').level).toBe(1)
  })
  it('drops a level when it contains the email name or first name', () => {
    const plain = getPasswordStrength('Zq9!kLm2#Rt5').level
    expect(getPasswordStrength('Zq9!kLm2#Rt5', { email: 'ana@example.com' }).level).toBe(plain)
    expect(getPasswordStrength('Anabel9!kLm2#Rt5', { email: 'anabel@example.com' }).level).toBe(getPasswordStrength('Anabel9!kLm2#Rt5').level - 1)
    expect(getPasswordStrength('Mi9!kLm2#Rt5xyz', { firstName: 'Mika' }).level).toBe(getPasswordStrength('Mi9!kLm2#Rt5xyz').level)
    expect(getPasswordStrength('Mika9!kLm2#Rt5', { firstName: ' MIKA ' }).level).toBe(getPasswordStrength('Mika9!kLm2#Rt5').level - 1)
  })
})
