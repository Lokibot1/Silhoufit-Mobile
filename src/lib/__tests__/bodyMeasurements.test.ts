import { toBodyProfile } from '@/api/bodyProfile'
import { changedFields, fieldsFor, readTexts, sameValue, sanitizeInput, toPayload, toTexts, validateField, warnings } from '../bodyMeasurements'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))

describe('sanitizeInput', () => {
  it.each([
    ['72.5', '72.5'],
    ['7a2', '72'],
    ['72,5', '72.5'],
    ['1.2.3', '1.23'],
    ['-5e3', '53'],
    ['1,234.5', '1234.5'],
    ['72,5', '72.5'],
    ['1234567.89', '123456'],
  ])('%s -> %s', (input, out) => expect(sanitizeInput(input)).toBe(out))
})

describe('validateField', () => {
  it('accepts a value in range, including the edges', () => {
    expect(validateField('height', '170')).toEqual({ ok: true, value: 170 })
    expect(validateField('chest', '60')).toEqual({ ok: true, value: 60 })
    expect(validateField('chest', '180')).toEqual({ ok: true, value: 180 })
  })
  it('rejects out of range with the range in the message', () => {
    const result = validateField('height', '20')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('between 100 and 230 cm')
  })
  it.each(['', 'abc', '1.2.3', '-3'])('rejects %p', (text) => expect(validateField('waist', text).ok).toBe(false))
  it('uses kg for weight', () => {
    const result = validateField('weight', '5')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('kg')
  })
})

describe('readTexts', () => {
  const blank = toTexts(null)
  it('needs only a height; blank optional fields are skipped', () => {
    expect(readTexts({ ...blank, height: '170' }, null, blank)).toEqual({ entered: { height: 170 }, errors: {}, notes: [] })
    expect(readTexts(blank, null, blank).errors.height).toContain('required')
  })
  it('reports a bad optional field and ignores bust for the male model', () => {
    expect(readTexts({ ...blank, height: '170', chest: '10', bust: '5' }, 'male', blank).errors).toEqual({ chest: expect.any(String) })
    expect(readTexts({ ...blank, height: '170', bust: '5' }, 'female', blank).errors.bust).toBeDefined()
  })
  it('lists bust for female only', () => {
    expect(fieldsFor('female')).toContain('bust')
    expect(fieldsFor('male')).not.toContain('bust')
    expect(fieldsFor(null)).not.toContain('bust')
  })
})

describe('saved values outside the form range', () => {
  const saved = toBodyProfile({ heightCm: 240, weightKg: 70 })!
  const base = toTexts(saved)
  it('does not block editing another field, and notes the saved value', () => {
    const result = readTexts({ ...base, weight: '72' }, null, base)
    expect(result.errors).toEqual({})
    expect(result.entered).toEqual({ height: 240, weight: 72 })
    expect(result.notes[0]).toContain('240')
  })
  it('still validates a field the user changed', () => expect(readTexts({ ...base, height: '250' }, null, base).errors.height).toBeDefined())
  it('compares numbers, not text: 72.50 is not a change', () => {
    expect(sameValue('72.50', '72.5')).toBe(true)
    expect(sameValue('', '')).toBe(true)
    expect(sameValue('', '0')).toBe(false)
  })
})

describe('warnings', () => {
  it('is quiet for plausible numbers', () => expect(warnings({ height: 170, inseam: 78, outseam: 102, shoulders: 44, chest: 95, thigh: 55, hips: 98, torso: 50 })).toEqual([]))
  it('flags each odd pair without blocking', () => {
    expect(warnings({ height: 170, inseam: 110 })).toHaveLength(1)
    expect(warnings({ inseam: 80, outseam: 80 })).toHaveLength(1)
    expect(warnings({ shoulders: 70, chest: 95 })).toHaveLength(1)
    expect(warnings({ thigh: 90, hips: 100 })).toHaveLength(1)
    expect(warnings({ height: 160, torso: 80 })).toHaveLength(1)
  })
})

describe('payload', () => {
  it('is null without a height, else rounds and nulls what is missing', () => {
    expect(toPayload({}, null, null)).toBeNull()
    expect(toPayload({ height: 170.04, chest: 90.26 }, 'male', 'lean')).toMatchObject({ heightCm: 170, chestCm: 90.3, waistCm: null, bustCm: null, bodyModel: 'male', bodyBuild: 'lean' })
  })
  it('drops bust unless female', () => {
    expect(toPayload({ height: 170, bust: 90 }, 'male', null)?.bustCm).toBeNull()
    expect(toPayload({ height: 170, bust: 90 }, 'female', null)?.bustCm).toBe(90)
  })
  it('keeps a saved bust the form hides, and a saved 72.25 untouched', () => {
    const saved = toBodyProfile({ heightCm: 170, bustCm: 90, waistCm: 72.25, bodyModel: 'male' })!
    const payload = toPayload({ height: 170, waist: 72.25 }, 'male', null, saved)!
    expect(payload.bustCm).toBe(90)
    expect(changedFields(payload, saved)).toEqual({})
  })
  it('does not touch a model the app maps to null (other/unisex)', () => {
    const saved = toBodyProfile({ heightCm: 170, bodyModel: 'unisex', waistCm: 70 })!
    expect(changedFields(toPayload({ height: 170, waist: 71 }, saved.bodyModel, saved.bodyBuild, saved)!, saved)).toEqual({ waistCm: 71 })
  })
  it('changedFields keeps only differences, a cleared field as null', () => {
    const saved = toBodyProfile({ heightCm: 170, chestCm: 90 })!
    expect(changedFields(toPayload({ height: 170 }, null, null)!, saved)).toEqual({ chestCm: null })
    expect(changedFields(toPayload({ height: 171, chest: 90 }, null, null)!, saved)).toEqual({ heightCm: 171 })
  })
  it('toTexts round-trips a saved profile', () => {
    const saved = toBodyProfile({ heightCm: 170.5, chestCm: 90 })!
    expect(toTexts(saved)).toMatchObject({ height: '170.5', chest: '90', waist: '' })
    expect(toTexts(toBodyProfile({ heightCm: 170, waistCm: 72.25 }))).toMatchObject({ waist: '72.25' })
  })
})
