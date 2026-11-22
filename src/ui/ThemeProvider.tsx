import { createContext, useContext, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'

import { ThemeContext, themes } from './theme'

type Scheme = 'light' | 'dark'

const SchemeContext = createContext<Scheme>('light')
export const useScheme = () => useContext(SchemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  // Commit 10 swaps this for a stored Light / Dark / System preference, falling back to the system value.
  const scheme: Scheme = system === 'dark' ? 'dark' : 'light'
  return (
    <SchemeContext.Provider value={scheme}>
      <ThemeContext.Provider value={themes[scheme]}>{children}</ThemeContext.Provider>
    </SchemeContext.Provider>
  )
}
