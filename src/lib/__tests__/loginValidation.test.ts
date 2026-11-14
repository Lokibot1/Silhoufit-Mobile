import { validateEmail, validateLoginPassword } from '../loginValidation'

describe('validateEmail', () => {
  it('accepts a normal address, trimmed', () => expect(validateEmail('  name@example.com ')).toBeNull())
  it('requires a value', () => expect(validateEmail('   ')).toBe('Email is required.'))
  it.each(['name', 'name@', 'a@b', 'a..b@example.com', '.a@example.com', 'a@-x.com', 'a b@example.com'])('rejects %s', (value) =>
    expect(validateEmail(value)).toBe('Enter a valid email like name@example.com.'),
  )
  it('rejects emoji', () => expect(validateEmail('na😀me@example.com')).toBe("Email can't contain emoji."))
  it('caps at 254 characters', () => expect(validateEmail(`${'a'.repeat(250)}@b.co`)).toBe('Email can be at most 254 characters.'))
})

describe('validateLoginPassword', () => {
  it('requires a value', () => expect(validateLoginPassword('')).toBe('Password is required.'))
  it('accepts a weak old password', () => expect(validateLoginPassword('abc')).toBeNull())
  it('rejects emoji', () => expect(validateLoginPassword('pass😀word')).toBe("Password can't contain emoji."))
  it('caps at 64 characters', () => expect(validateLoginPassword('a'.repeat(65))).toBe('Password can be at most 64 characters.'))
})
