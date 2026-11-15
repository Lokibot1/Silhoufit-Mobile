import { ApiError, isRecord, num, request } from '@/lib/api'

export type BodyModelId = 'male' | 'female'
export type BodyBuildId = 'skinny' | 'lean' | 'skinny_fat' | 'regular' | 'muscular' | 'overweight'

/** The saved body profile as the API sends and accepts it. Lengths are cm, weight is kg; an unset field is null. */
export type BodyProfile = {
  heightCm: number
  weightKg: number | null
  shoulderWidthCm: number | null
  chestCm: number | null
  bustCm: number | null
  torsoLengthCm: number | null
  waistCm: number | null
  hipsCm: number | null
  inseamCm: number | null
  outseamCm: number | null
  thighCm: number | null
  /** Shown to the user as "Sleeve length". */
  armLengthCm: number | null
  bodyModel: BodyModelId | null
  bodyBuild: BodyBuildId | null
}

const NUMBER_KEYS = ['weightKg', 'shoulderWidthCm', 'chestCm', 'bustCm', 'torsoLengthCm', 'waistCm', 'hipsCm', 'inseamCm', 'outseamCm', 'thighCm', 'armLengthCm'] as const
const BUILDS: unknown[] = ['skinny', 'lean', 'skinny_fat', 'regular', 'muscular', 'overweight']

/** The profile from a body-profile response, or null when it has no height. Unknown models (the API also has other/unisex) become null. */
export function toBodyProfile(body: unknown): BodyProfile | null {
  if (!isRecord(body)) return null
  const heightCm = num(body.heightCm)
  if (heightCm === null) return null
  const profile = { heightCm } as BodyProfile
  for (const key of NUMBER_KEYS) profile[key] = num(body[key])
  profile.bodyModel = body.bodyModel === 'male' || body.bodyModel === 'female' ? body.bodyModel : null
  profile.bodyBuild = BUILDS.includes(body.bodyBuild) ? (body.bodyBuild as BodyBuildId) : null
  return profile
}

const parse = (body: unknown) => {
  const profile = toBodyProfile(body)
  if (!profile) throw new ApiError('server')
  return profile
}

/** GET /users/me/body-profile. A 404 means none is saved yet: null. */
export async function fetchBodyProfile(signal?: AbortSignal): Promise<BodyProfile | null> {
  try {
    return parse(await request('GET', '/users/me/body-profile', undefined, signal))
  } catch (failure) {
    if (failure instanceof ApiError && failure.kind === 'not-found') return null
    throw failure
  }
}

/** PUT: creates the profile (a field left null stays empty). */
export async function saveBodyProfile(profile: BodyProfile, signal?: AbortSignal): Promise<BodyProfile> {
  return parse(await request('PUT', '/users/me/body-profile', profile, signal))
}

/** PATCH: changes only the fields passed (null clears one). The API answers 404 when nothing is saved yet. */
export async function updateBodyProfile(patch: Partial<BodyProfile>, signal?: AbortSignal): Promise<BodyProfile> {
  return parse(await request('PATCH', '/users/me/body-profile', patch, signal))
}
