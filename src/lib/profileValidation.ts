import type { Gender } from '@/api/me'

// Ported from the web EditProfileForm. The backend allows 100 characters per name and 20 for the suffix.
export const NAME_MAX = 100
export const WORD_MAX = 30
export const SUFFIX_MAX = 20

export const GENDER_OPTIONS: { value: Gender | null; label: string }[] = [
  { value: null, label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unisex', label: 'Unisex' },
]

// An engine that rejects Unicode property escapes must not crash import: fall back to surrogate pairs (any emoji) and ASCII plus Latin letters.
export function buildPatterns(Ctor: RegExpConstructor = RegExp) {
  try {
    return {
      emoji: new Ctor('[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\u200D\\uFE0E\\uFE0F\\u20E3\\u{1F3FB}-\\u{1F3FF}\\u{1F1E6}-\\u{1F1FF}]', 'gu'),
      name: new Ctor("^[\\p{L}][\\p{L}\\p{M} '’-]*$", 'u'),
    }
  } catch {
    return { emoji: /[\uD800-\uDBFF][\uDC00-\uDFFF]|[‍︎️⃣☀-➿]/g, name: /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ̀-ͯ '’-]*$/ }
  }
}
const { emoji: EMOJI, name: NAME } = buildPatterns()
const EMOJI_ERROR = "Emoji aren't allowed in this field."

export const stripEmoji = (input: string) => input.replace(EMOJI, '')
const hasEmoji = (input: string) => stripEmoji(input) !== input
export const normalizeName = (input: string) => input.trim().replace(/\s+/g, ' ')

/** An optional name (middle) passes when blank. */
export function validateName(value: string, label: string, required: boolean): string | null {
  if (hasEmoji(value)) return EMOJI_ERROR
  const name = normalizeName(value)
  if (!name) return required ? `${label} is required.` : null
  if (!NAME.test(name)) return `${label} can only contain letters, spaces, hyphens and apostrophes.`
  if (name.length > NAME_MAX) return `${label} can be at most ${NAME_MAX} characters.`
  if (name.split(' ').some((word) => word.length > WORD_MAX)) return `Each word in ${label.toLowerCase()} can be at most ${WORD_MAX} letters.`
  return null
}

export function validateSuffix(value: string): string | null {
  if (hasEmoji(value)) return EMOJI_ERROR
  return value.trim().length > SUFFIX_MAX ? `Suffix can be at most ${SUFFIX_MAX} characters.` : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today as YYYY-MM-DD in the phone's own time zone. */
export const today = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

/** A real calendar day typed as YYYY-MM-DD, forgiving about the separator (- / . or spaces) and missing zeros: "1995/5/9" becomes "1995-05-09". Null when it is not a real date. */
export function normalizeBirthday(input: string): string | null {
  const match = /^(\d{4})[-/.\s]+(\d{1,2})[-/.\s]+(\d{1,2})$/.exec(input.trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? `${match[1]}-${pad(month)}-${pad(day)}` : null
}

/** A birthday is optional: blank is fine, anything else must be a real past date. */
export function validateBirthday(value: string, now = new Date()): string | null {
  if (!value.trim()) return null
  const date = normalizeBirthday(value)
  if (!date) return 'Enter your birthday as YYYY-MM-DD, like 1995-05-15.'
  if (date.slice(0, 4) < '1900') return 'Enter a birthday from 1900 or later.'
  if (date > today(now)) return "Birthday can't be in the future. Enter today or an earlier date."
  return null
}
