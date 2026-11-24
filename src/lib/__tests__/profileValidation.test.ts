import { GENDER_OPTIONS, buildPatterns, normalizeBirthday, normalizeName, stripEmoji, today, validateBirthday, validateName, validateSuffix } from '../profileValidation'

describe('names', () => {
  it('normalizes spacing', () => expect(normalizeName('  Ana   Maria ')).toBe('Ana Maria'))
  it('strips emoji', () => expect(stripEmoji('Ana😀')).toBe('Ana'))
  it.each(['Ana', 'Mary-Ann', "O'Brien", 'Dela Cruz', 'Zoë', 'D’Souza'])('accepts %s', (name) => expect(validateName(name, 'First name', true)).toBeNull())
  it('requires first and last name', () => {
    expect(validateName('  ', 'First name', true)).toBe('First name is required.')
    expect(validateName('', 'Last name', true)).toBe('Last name is required.')
  })
  it('lets the middle name be blank', () => expect(validateName('  ', 'Middle name', false)).toBeNull())
  it.each(['Ana2', 'Ana!', '-Ana', "'x", '12'])('rejects %s', (name) => expect(validateName(name, 'First name', true)).toBe('First name can only contain letters, spaces, hyphens and apostrophes.'))
  it('rejects emoji with its own message', () => expect(validateName('Ana😀', 'First name', true)).toBe("Emoji aren't allowed in this field."))
  it('limits a word to 30 letters', () => {
    expect(validateName('a'.repeat(30), 'Last name', true)).toBeNull()
    expect(validateName('a'.repeat(31), 'Last name', true)).toBe('Each word in last name can be at most 30 letters.')
  })
  it('limits the whole name to 100 characters', () => expect(validateName(Array(20).fill('abcdef').join(' '), 'Last name', true)).toBe('Last name can be at most 100 characters.'))
})

describe('suffix', () => {
  it('is optional', () => expect(validateSuffix('  ')).toBeNull())
  it('allows 20 characters, not 21', () => {
    expect(validateSuffix('x'.repeat(20))).toBeNull()
    expect(validateSuffix('x'.repeat(21))).toBe('Suffix can be at most 20 characters.')
  })
  it('rejects emoji', () => expect(validateSuffix('Jr😀')).toBe("Emoji aren't allowed in this field."))
})

describe('birthday', () => {
  const now = new Date(2026, 10, 15)
  it('formats today in local time', () => expect(today(now)).toBe('2026-11-15'))
  it.each([['1995-05-15', '1995-05-15'], ['1995/5/9', '1995-05-09'], ['1995.05.09', '1995-05-09'], [' 1995 5 9 ', '1995-05-09'], ['2024-02-29', '2024-02-29']])('normalizes %s', (input, out) => expect(normalizeBirthday(input)).toBe(out))
  it.each(['2023-02-31', '2023-13-01', '95-05-15', '15-05-1995', 'abcd', '1995-05'])('rejects %s as not a real date', (input) => expect(normalizeBirthday(input)).toBeNull())
  it('does not require a birthday', () => expect(validateBirthday('  ', now)).toBeNull())
  it('accepts today and earlier', () => {
    expect(validateBirthday('2026-11-15', now)).toBeNull()
    expect(validateBirthday('1995-05-15', now)).toBeNull()
  })
  it('rejects a future date', () => expect(validateBirthday('2026-11-16', now)).toBe("Birthday can't be in the future. Enter today or an earlier date."))
  it('rejects an impossible date', () => expect(validateBirthday('2023-02-31', now)).toBe('Enter your birthday as YYYY-MM-DD, like 1995-05-15.'))
  it('rejects before 1900', () => expect(validateBirthday('1899-12-31', now)).toBe('Enter a birthday from 1900 or later.'))
})

describe('gender options', () => {
  it('match the backend enum, Not specified first', () => expect(GENDER_OPTIONS.map((o) => o.value)).toEqual([null, 'male', 'female', 'other', 'unisex']))
})

describe('pattern fallback', () => {
  const Throwing = (() => { throw new SyntaxError('Invalid property name') }) as unknown as RegExpConstructor
  const { emoji, name } = buildPatterns(Throwing)
  it('does not throw and still catches emoji', () => expect('Ana😀'.replace(emoji, '')).toBe('Ana'))
  it('accepts Latin names and rejects digits', () => {
    expect(name.test('Zoë')).toBe(true)
    expect(name.test("O'Brien")).toBe(true)
    expect(name.test('Ana2')).toBe(false)
  })
})
