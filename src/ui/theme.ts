// KRAL design tokens (see SilhouFit/src/assets/DESIGN.md). Flat, softly rounded corners, hairlines, one loud red.
export const color = {
  red: '#CB1C2B',
  redPress: '#A81624',
  obsidian: '#161113',
  graphite: '#322D2F',
  green: '#1F6F4A',
  mint: '#E6F4EC', // Selected option fill
  stonewash: '#85807C',
  porcelain: '#EEECED',
  paper: '#FFFBFD',
  scrim: 'rgba(22,17,19,0.5)', // Obsidian behind sheets and dialogs
}
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
// Two radii only: soft tiles and cards, and pills for chips and the search field.
export const radius = { soft: 8, pill: 999 }
export const hairline = { borderWidth: 1, borderColor: color.porcelain }
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
export const type = {
  h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 28, letterSpacing: 0.5, color: color.obsidian, ...upper },
  h2: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, color: color.obsidian },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.obsidian },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.graphite },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, letterSpacing: 1.1, color: color.graphite, ...upper },
  button: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24, letterSpacing: 1, ...upper },
  tagline: { fontFamily: font.serifItalic, fontSize: 14, lineHeight: 20, color: color.stonewash },
  numeric: { fontVariant: ['tabular-nums' as const] },
}
