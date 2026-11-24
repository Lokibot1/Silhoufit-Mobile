import AsyncStorage from '@react-native-async-storage/async-storage'

// Device-local switches for the new-notification toast and chime. Anything but 'off' is on, so a fresh install or a failed read stays on.
const KEYS = { popup: 'silhoufit-notify-popup', sound: 'silhoufit-notify-sound' } as const
export type NotificationPref = keyof typeof KEYS

const prefs: Record<NotificationPref, boolean> = { popup: true, sound: true }
const toggled = new Set<NotificationPref>() // a switch changed before the stored value arrived keeps the person's choice

export const popupsOn = () => prefs.popup
export const soundOn = () => prefs.sound

export function loadNotificationPrefs() {
  return Promise.resolve()
    .then(() => AsyncStorage.multiGet(Object.values(KEYS)))
    .then((pairs) => {
      for (const [stored, value] of pairs) {
        const key = (Object.keys(KEYS) as NotificationPref[]).find((k) => KEYS[k] === stored)
        if (key && !toggled.has(key)) prefs[key] = value !== 'off'
      }
    })
    .catch(() => {})
}

export function setNotificationPref(key: NotificationPref, on: boolean) {
  prefs[key] = on
  toggled.add(key)
  return AsyncStorage.setItem(KEYS[key], on ? 'on' : 'off').catch(() => {})
}
