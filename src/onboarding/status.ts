import AsyncStorage from '@react-native-async-storage/async-storage'
import type { User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

// Same key and shape as the web (service/onboarding.ts): Supabase Auth user_metadata.onboarding = { status, at }, so the tour
// is shown once per account across web and mobile. The device copy holds a save that has not reached Supabase yet.
const KEY = 'silhoufit-onboarding'

export type OnboardingChoice = 'completed' | 'skipped'
type Entry = { status: OnboardingChoice; synced: boolean }
// One entry per account, so a save that has not reached Supabase for account A survives B signing in on the same device.
type Cache = Record<string, Entry>

const isChoice = (value: unknown): value is OnboardingChoice => value === 'completed' || value === 'skipped'

async function readAll(): Promise<Cache> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null')
    return parsed && typeof parsed === 'object' ? (parsed as Cache) : {}
  } catch {
    return {}
  }
}

async function readCache(userId: string): Promise<Entry | null> {
  const entry = (await readAll())[userId] as Partial<Entry> | undefined
  return entry && isChoice(entry.status) ? { status: entry.status, synced: entry.synced === true } : null
}

async function writeCache(userId: string, entry: Entry) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...(await readAll()), [userId]: entry }))
  } catch {
    // Storage failed: the account copy still holds the answer.
  }
}

/** Writes the choice to the account. Supabase merges the top-level user_metadata keys, so only onboarding is sent and a stale snapshot can never overwrite the name or birthday. Never throws; false when it did not reach Supabase. */
async function push(userId: string, status: OnboardingChoice): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session || data.session.user.id !== userId) return false
    const onboarding = { status, at: new Date().toISOString() }
    const { error } = await supabase.auth.updateUser({ data: { onboarding } })
    if (error) return false
    await writeCache(userId, { status, synced: true })
    return true
  } catch {
    return false
  }
}

/** Remembers the choice on this device first, then on the account. A failed account save is retried by the next onboardingDone. */
export async function saveOnboarding(userId: string, status: OnboardingChoice): Promise<boolean> {
  await writeCache(userId, { status, synced: false })
  return push(userId, status)
}

/** True when this account already finished or skipped the tour (on any device). Retries an unsent save without waiting for it. */
export async function onboardingDone(user: User): Promise<boolean> {
  const cached = await readCache(user.id)
  if (cached) {
    if (!cached.synced) void push(user.id, cached.status)
    return true
  }
  const status: unknown = user.user_metadata?.onboarding?.status
  if (isChoice(status)) {
    await writeCache(user.id, { status, synced: true })
    return true
  }
  return false
}
