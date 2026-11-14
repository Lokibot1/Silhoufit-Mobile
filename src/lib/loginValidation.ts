const EMAIL_MAX = 254
const PASSWORD_MAX = 64

// shortcut: \p{Extended_Pictographic} needs Hermes support, verify on a device; fall back to a surrogate-range check if it throws.
const EMOJI = new RegExp('[\\p{Extended_Pictographic}\\p{Emoji_Presentation}\\u200D\\uFE0E\\uFE0F\\u20E3\\u{1F3FB}-\\u{1F3FF}\\u{1F1E6}-\\u{1F1FF}]', 'u')

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Email is required.'
  if (EMOJI.test(email)) return "Email can't contain emoji."
  if (email.length > EMAIL_MAX) return `Email can be at most ${EMAIL_MAX} characters.`
  const invalid = 'Enter a valid email like name@example.com.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.includes('..')) return invalid
  const [local, domain] = email.split('@')
  if (local.startsWith('.') || local.endsWith('.')) return invalid
  if (domain.split('.').some((label) => label.startsWith('-') || label.endsWith('-'))) return invalid
  return null
}

// Sign-in checks the shape only. Strength rules belong to sign-up; an old, weak password must still be typeable.
export function validateLoginPassword(value: string): string | null {
  if (!value) return 'Password is required.'
  if (EMOJI.test(value)) return "Password can't contain emoji."
  if (value.length > PASSWORD_MAX) return `Password can be at most ${PASSWORD_MAX} characters.`
  return null
}
