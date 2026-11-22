import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Appearance, useColorScheme } from 'react-native'

import { ThemeContext, themes } from './theme'

type Scheme = 'light' | 'dark'
export type Preference = 'system' | 'light' | 'dark'

// Same key as the web (contexts/ThemeContext.tsx).
const KEY = 'silhoufit-theme'
const isPreference = (value: unknown): value is Preference => value === 'system' || value === 'light' || value === 'dark'

const SchemeContext = createContext<Scheme>('light')
export const useScheme = () => useContext(SchemeContext)

const AppearanceContext = createContext<{ preference: Preference; setPreference: (preference: Preference) => void }>({ preference: 'system', setPreference: () => {} })
export const useAppearance = () => useContext(AppearanceContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  // Renders with the device scheme until the stored choice is read.
  const [preference, setStored] = useState<Preference>('system')
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((value) => { if (isPreference(value)) setStored(value) }).catch(() => {})
  }, [])
  // Native UI (keyboard, Alert, pickers, status bar) follows the in-app choice; 'unspecified' clears it. react-native-web has no setColorScheme.
  useEffect(() => {
    if (typeof Appearance.setColorScheme === 'function') Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
  }, [preference])
  const setPreference = (next: Preference) => {
    setStored(next)
    AsyncStorage.setItem(KEY, next).catch(() => {
      // Storage failed: the choice still applies until the app restarts.
    })
  }
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference
  return (
    <AppearanceContext.Provider value={{ preference, setPreference }}>
      <SchemeContext.Provider value={scheme}>
        <ThemeContext.Provider value={themes[scheme]}>{children}</ThemeContext.Provider>
      </SchemeContext.Provider>
    </AppearanceContext.Provider>
  )
}
