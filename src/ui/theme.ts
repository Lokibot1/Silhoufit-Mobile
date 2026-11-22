// KRAL design tokens (see SilhouFit/src/assets/DESIGN.md). Flat, softly rounded corners, hairlines, one loud red.
import { createContext, useContext } from 'react'

const light = {
  red: '#CB1C2B',
  redPress: '#A81624',
  redInk: '#CB1C2B', // Red as text or icon on Paper; never a button fill
  onRed: '#FFFBFD', // Text on a red fill
  obsidian: '#161113',
  graphite: '#322D2F',
  green: '#1F6F4A',
  mint: '#E6F4EC', // Selected option fill
  stonewash: '#85807C',
  porcelain: '#EEECED',
  paper: '#FFFBFD',
  scrim: 'rgba(22,17,19,0.5)', // Obsidian behind sheets and dialogs
}
const dark: typeof light = {
  ...light,
  redInk: '#FF6B76',
  obsidian: '#FFFBFD',
  graphite: '#B5B0AD',
  green: '#6EE7A0',
  mint: '#12291D',
  porcelain: '#322D2F',
  paper: '#161113',
  scrim: 'rgba(0,0,0,0.6)',
}
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
// Two radii only: soft tiles and cards, and pills for chips and the search field.
export const radius = { soft: 8, pill: 999 }
// Fonts: Poppins for all UI (caps headings, body, labels, buttons); Lora Italic only for taglines and quiet asides.
export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  serifItalic: 'Lora_400Regular_Italic',
}
const upper = { textTransform: 'uppercase' as const }
// Sizes: 24 / 18 / 16 / 14. Essential text uses Obsidian or Graphite; Stonewash (3.7:1 on Paper) is for decoration and placeholders only, never text a user needs.
// Labels are the mono-style micro copy: small, uppercase, letter-spaced, written like (LABEL).
const build = (c: typeof light) => ({
  color: c,
  hairline: { borderWidth: 1, borderColor: c.porcelain },
  type: {
    h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 28, letterSpacing: 0.5, color: c.obsidian, ...upper },
    h2: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, color: c.obsidian },
    body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: c.obsidian },
    small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: c.graphite },
    label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, letterSpacing: 1.1, color: c.graphite, ...upper },
    button: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24, letterSpacing: 1, ...upper },
    tagline: { fontFamily: font.serifItalic, fontSize: 14, lineHeight: 20, color: c.stonewash },
    numeric: { fontVariant: ['tabular-nums' as const] },
  },
})
export type Theme = ReturnType<typeof build>
export const themes = { light: build(light), dark: build(dark) }
// Fixed light palette: IntroLoader, Avatar palette, photo overlays and tests. Screens should use useTheme().
export const color = light
export const { type, hairline } = themes.light

export const ThemeContext = createContext<Theme>(themes.light)
export const useTheme = () => useContext(ThemeContext)

// Builds a screen's styles once per theme: `const useStyles = themed((t) => StyleSheet.create({...}))`, then `const s = useStyles()`.
export function themed<T>(make: (t: Theme) => T) {
  const cache = new WeakMap<Theme, T>()
  return () => {
    const t = useTheme()
    let s = cache.get(t)
    if (!s) cache.set(t, (s = make(t)))
    return s
  }
}
