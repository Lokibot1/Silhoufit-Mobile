import { validateEmail as validateLoginEmail } from '@/lib/loginValidation'
import { normalizeName, stripEmoji } from '@/lib/profileValidation'

// Ported from the web signUpValidation + age. No phone or gender here: the mobile sign-up does not ask for them.
export const LIMITS = {
  nameMaxLength: 40,
  nameWordMaxLength: 20,
  suffixMaxLength: 5,
  emailMaxLength: 254,
  passwordMinLength: 8,
  passwordMaxLength: 64,
} as const

// An engine without Unicode property escapes must not crash on import: fall back to ASCII plus Latin letters (same idea as profileValidation).
const FALLBACK: [string, string][] = [['\\p{Lu}', 'A-ZÀ-Þ'], ['\\p{Ll}', 'a-zß-ÿ'], ['\\p{L}', 'A-Za-zÀ-ɏ'], ['\\p{M}', '̀-ͯ'], ['\\p{N}', '0-9']]
function re(source: string, flags = '') {
  try {
    return new RegExp(source, `${flags}u`)
  } catch {
    return new RegExp(FALLBACK.reduce((text, [from, to]) => text.replaceAll(from, to), source), flags)
  }
}

const NAME_INVALID = re("[^\\p{L}\\p{M} '’-]")
const NAME_INVALID_ALL = re("[^\\p{L}\\p{M} '’-]", 'g')
const NAME_MISPLACED = /^[-'’]|[-'’]$|[-'’]{2}/
const HAS_LETTER = re('\\p{L}')
const SUFFIX_OK = re('^[\\p{L}.]+$')
const SUFFIX_INVALID_ALL = re('[^\\p{L}.]', 'g')
const UPPER = re('\\p{Lu}')
const LOWER = re('\\p{Ll}')
const SPECIAL = re('[^\\p{L}\\p{M}\\p{N}\\s]')

export const sanitizeName = (input: string) => input.replace(NAME_INVALID_ALL, '').replace(/ {2,}/g, ' ').slice(0, LIMITS.nameMaxLength)
export const sanitizeSuffix = (input: string) => input.replace(SUFFIX_INVALID_ALL, '').slice(0, LIMITS.suffixMaxLength)

export function validateName(value: string, label: 'First name' | 'Middle name' | 'Last name' = 'First name'): string | null {
  const name = normalizeName(value)
  if (!name) return `${label} is required.`
  if (NAME_INVALID.test(name)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`
  if (!HAS_LETTER.test(name)) return `${label} is required.`
  const words = name.split(' ')
  if (words.some((word) => NAME_MISPLACED.test(word))) return `${label} has misplaced punctuation.`
  if (words.some((word) => word.length > LIMITS.nameWordMaxLength)) return `Each word in ${label} can be at most ${LIMITS.nameWordMaxLength} letters.`
  if (name.length > LIMITS.nameMaxLength) return `${label} can be at most ${LIMITS.nameMaxLength} characters.`
  return null
}

export const validateMiddleName = (value: string) => (normalizeName(value) ? validateName(value, 'Middle name') : null)

export function validateSuffix(value: string): string | null {
  const suffix = value.trim()
  if (!suffix) return null
  if (!SUFFIX_OK.test(suffix) || !HAS_LETTER.test(suffix)) return 'Suffix can only contain letters and periods.'
  if (suffix.length > LIMITS.suffixMaxLength) return `Suffix can be at most ${LIMITS.suffixMaxLength} characters.`
  return null
}

export const validateEmail = validateLoginEmail

export type PasswordRequirement = { id: 'length' | 'upper' | 'lower' | 'number' | 'special'; label: string; met: boolean }

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: 'length', label: 'At least 8 characters', met: password.length >= LIMITS.passwordMinLength },
    { id: 'upper', label: 'One uppercase letter', met: UPPER.test(password) },
    { id: 'lower', label: 'One lowercase letter', met: LOWER.test(password) },
    { id: 'number', label: 'One number', met: /\d/.test(password) },
    { id: 'special', label: 'One special character', met: SPECIAL.test(stripEmoji(password)) },
  ]
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required.'
  if (stripEmoji(value) !== value) return "Password can't contain emoji."
  if (value.length < LIMITS.passwordMinLength) return `Use at least ${LIMITS.passwordMinLength} characters.`
  if (value.length > LIMITS.passwordMaxLength) return `Use at most ${LIMITS.passwordMaxLength} characters.`
  const [, upper, lower, number, special] = getPasswordRequirements(value)
  if (!upper.met) return 'Add an uppercase letter.'
  if (!lower.met) return 'Add a lowercase letter.'
  if (!number.met) return 'Add a number.'
  if (!special.met) return 'Add a special character, like ! or #.'
  return null
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Confirm your password.'
  if (confirm !== password) return "Passwords don't match."
  return null
}

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4
const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const
const COMMON_WORDS = /password|qwerty|letmein|welcome|admin|12345/i

// Heuristic: character classes plus length steps. Not a substitute for a breached-password check.
export function getPasswordStrength(password: string, context: { email?: string; firstName?: string } = {}): { level: PasswordStrengthLevel; label: (typeof STRENGTH_LABELS)[number] } {
  if (!password) return { level: 0, label: 'Too weak' }
  const [, upper, lower, number, special] = getPasswordRequirements(password)
  const classes = [upper, lower, number, special].filter((r) => r.met).length
  const lengthSteps = [8, 12, 16].filter((n) => password.length >= n).length
  let level = Math.max(0, Math.min(4, classes + lengthSteps - 3))
  if (password.length < LIMITS.passwordMinLength || COMMON_WORDS.test(password)) level = Math.min(level, 1)

  const lowered = password.toLowerCase()
  const personal = [context.email?.split('@')[0], context.firstName].map((part) => part?.trim().toLowerCase() ?? '').filter((part) => part.length >= 3)
  if (personal.some((part) => lowered.includes(part))) level -= 1

  const final = Math.max(0, level) as PasswordStrengthLevel
  return { level: final, label: STRENGTH_LABELS[final] }
}

