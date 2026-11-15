import type { BodyBuildId, BodyModelId, BodyProfile } from '@/api/bodyProfile'

// Ported from the web body setup (components/body-setup/measurements.ts), cm and kg only. The ranges sit inside the API's own.
export const FIELDS = ['height', 'weight', 'shoulders', 'sleeve', 'bust', 'chest', 'torso', 'waist', 'hips', 'thigh', 'inseam', 'outseam'] as const
export type Field = (typeof FIELDS)[number]
export type Entered = Partial<Record<Field, number>>
export type Texts = Record<Field, string>

type Spec = { label: string; min: number; max: number; what: string }

export const SPECS: Record<Field, Spec> = {
  height: { label: 'Height', min: 100, max: 230, what: 'Full standing height, barefoot.' },
  weight: { label: 'Weight', min: 30, max: 250, what: 'Optional. It never replaces your tape measurements.' },
  shoulders: { label: 'Shoulder width', min: 25, max: 70, what: 'Across your back, edge to edge of the shoulders.' },
  sleeve: { label: 'Sleeve length', min: 35, max: 100, what: 'Shoulder edge to wrist bone.' },
  bust: { label: 'Bust', min: 60, max: 180, what: 'Around the fullest part of your bust.' },
  chest: { label: 'Chest', min: 60, max: 180, what: 'Around your chest, level across your back.' },
  torso: { label: 'Torso length', min: 30, max: 80, what: 'Neck-shoulder point to natural waist.' },
  waist: { label: 'Waist', min: 40, max: 200, what: 'Around the narrowest part of your torso.' },
  hips: { label: 'Hips', min: 60, max: 200, what: 'Around the fullest part of your hips.' },
  thigh: { label: 'Thigh', min: 30, max: 100, what: 'Around the fullest part of one upper thigh.' },
  inseam: { label: 'Inseam', min: 40, max: 110, what: 'Crotch to ankle bone, inside of the leg.' },
  outseam: { label: 'Outseam', min: 60, max: 140, what: 'Natural waist to ankle bone, outside of the leg.' },
}

export const unitOf = (field: Field) => (field === 'weight' ? 'kg' : 'cm')
export const rangeOf = (field: Field) => `${SPECS[field].min}-${SPECS[field].max} ${unitOf(field)}`

/** Only the height is required by the API; the rest are optional. */
export const REQUIRED: Field = 'height'

/** Bust is for the female model only. */
export const fieldsFor = (model: BodyModelId | null) => FIELDS.filter((field) => field !== 'bust' || model === 'female')

const MAX_LENGTH = 6

/** Keeps digits and the first decimal point. A comma before exactly three digits is a thousands separator ("1,234.5" is 1234.5), any other comma is the point. Letters, emoji and signs never reach the field; the length is capped after cleaning. */
export function sanitizeInput(text: string) {
  const [whole, ...rest] = text.replace(/,(?=\d{3}(?!\d))/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '').split('.')
  return (rest.length ? `${whole}.${rest.join('')}` : whole).slice(0, MAX_LENGTH)
}

/** Same number, not the same characters: "72.50" equals "72.5"; two blanks are equal, a blank and a number are not. */
export const sameValue = (a: string, b: string) => (!a.trim() || !b.trim() ? a.trim() === b.trim() : Number(a) === Number(b))

export type Parsed = { ok: true; value: number } | { ok: false; error: string }

/** Validates one typed value. Blank is an error here; readTexts skips blank optional fields. */
export function validateField(field: Field, text: string): Parsed {
  const { label, min, max } = SPECS[field]
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: `${label} is required. Enter it in ${unitOf(field)}, for example 170.` }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { ok: false, error: 'Use digits and one decimal point only, for example 72.5.' }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max} ${unitOf(field)}, but ${trimmed} was entered. Check your tape reading, then enter it again.` }
  }
  return { ok: true, value }
}

/**
 * What was typed, as numbers, a message per bad field, and non-blocking notes. Only fields the user changed are range-checked: a saved
 * value the API accepted but this form's range rejects stays as saved (a note, not an error). A blank optional field is not entered.
 */
export function readTexts(texts: Texts, model: BodyModelId | null, base: Texts): { entered: Entered; errors: Partial<Record<Field, string>>; notes: string[] } {
  const entered: Entered = {}
  const errors: Partial<Record<Field, string>> = {}
  const notes: string[] = []
  for (const field of fieldsFor(model)) {
    const text = texts[field]
    if (!text.trim() && field !== REQUIRED) continue
    if (text.trim() && sameValue(text, base[field])) {
      const value = Number(text)
      entered[field] = value
      if (value < SPECS[field].min || value > SPECS[field].max) {
        notes.push(`Your saved ${SPECS[field].label.toLowerCase()} of ${text} ${unitOf(field)} is outside the ${rangeOf(field)} this form accepts. It stays as saved unless you change it.`)
      }
      continue
    }
    const parsed = validateField(field, text)
    if (parsed.ok) entered[field] = parsed.value
    else errors[field] = parsed.error
  }
  return { entered, errors, notes }
}

/** Soft cross-field checks. They never block; they ask the user to look again. */
export function warnings({ height, inseam, outseam, shoulders, chest, thigh, hips, torso }: Entered): string[] {
  const out: string[] = []
  if (height && inseam && inseam > height * 0.6) out.push('Your inseam is more than 60% of your height. Check it was taken to the ankle bone.')
  if (inseam && outseam && outseam <= inseam) out.push('Your outseam is not longer than your inseam. The outseam starts at your waist, so it is normally longer.')
  if (shoulders && chest && (shoulders > chest * 0.6 || shoulders < chest * 0.25)) out.push('Your shoulder width looks unusual next to your chest. Check you measured across the back, not around.')
  if (thigh && hips && thigh > hips * 0.75) out.push('Your thigh is large next to your hips. Check it is one thigh, not both.')
  if (height && torso && torso > height * 0.45) out.push('Your torso length is more than 45% of your height. Check it ends at your natural waist.')
  return out
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The API body: only what was entered, rounded to 0.1 (a value equal to the saved one is kept exactly, so an untouched 72.25 is not
 * rewritten as 72.3); everything else null. Bust is hidden unless female, so then the saved bust is kept, not nulled. Null without a height.
 */
export function toPayload(entered: Entered, model: BodyModelId | null, build: BodyBuildId | null, saved: BodyProfile | null = null): BodyProfile | null {
  if (entered.height === undefined) return null
  const pick = (field: Field, key: keyof BodyProfile) => {
    const value = entered[field]
    return value === undefined ? null : value === saved?.[key] ? value : round(value)
  }
  return {
    heightCm: pick('height', 'heightCm')!,
    weightKg: pick('weight', 'weightKg'),
    shoulderWidthCm: pick('shoulders', 'shoulderWidthCm'),
    chestCm: pick('chest', 'chestCm'),
    bustCm: model === 'female' ? pick('bust', 'bustCm') : (saved?.bustCm ?? null),
    torsoLengthCm: pick('torso', 'torsoLengthCm'),
    waistCm: pick('waist', 'waistCm'),
    hipsCm: pick('hips', 'hipsCm'),
    inseamCm: pick('inseam', 'inseamCm'),
    outseamCm: pick('outseam', 'outseamCm'),
    thighCm: pick('thigh', 'thighCm'),
    armLengthCm: pick('sleeve', 'armLengthCm'),
    bodyModel: model,
    bodyBuild: build,
  }
}

/** What differs from the saved profile, for a PATCH. A cleared field is null. */
export function changedFields(payload: BodyProfile, saved: BodyProfile): Partial<BodyProfile> {
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== saved[key as keyof BodyProfile]))
}

const text = (value: number | null | undefined) => (value == null ? '' : String(value))

/** A saved profile (or none) as the form's text fields. */
export function toTexts(profile: BodyProfile | null): Texts {
  return {
    height: text(profile?.heightCm),
    weight: text(profile?.weightKg),
    shoulders: text(profile?.shoulderWidthCm),
    sleeve: text(profile?.armLengthCm),
    bust: text(profile?.bustCm),
    chest: text(profile?.chestCm),
    torso: text(profile?.torsoLengthCm),
    waist: text(profile?.waistCm),
    hips: text(profile?.hipsCm),
    thigh: text(profile?.thighCm),
    inseam: text(profile?.inseamCm),
    outseam: text(profile?.outseamCm),
  }
}
