import { render } from '@testing-library/react-native'
import { Text } from 'react-native'

import { color, themed, themes, useTheme } from '../theme'
import { ThemeProvider } from '../ThemeProvider'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ default: jest.fn() }))

const mockScheme = (s: 'light' | 'dark' | null) =>
  (jest.requireMock('react-native/Libraries/Utilities/useColorScheme').default as jest.Mock).mockReturnValue(s)

function Probe() {
  const t = useTheme()
  return <Text testID="paper">{t.color.paper}</Text>
}

describe('theme', () => {
  it('uses the dark palette when the scheme is dark', async () => {
    mockScheme('dark')
    const { getByTestId } = await render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(getByTestId('paper').props.children).toBe('#161113')
    expect(themes.dark.color.obsidian).toBe('#FFFBFD')
    expect(themes.dark.color.redInk).toBe('#FF6B76')
    expect(themes.dark.type.body.color).toBe('#FFFBFD')
  })

  it('falls back to light for a null scheme and without a provider', async () => {
    mockScheme(null)
    const wrapped = await render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(wrapped.getByTestId('paper').props.children).toBe('#FFFBFD')
    expect((await render(<Probe />)).getByTestId('paper').props.children).toBe('#FFFBFD')
  })

  it('caches themed styles per theme', async () => {
    const useStyles = themed((t) => ({ bg: t.color.paper }))
    let light: object | undefined
    let again: object | undefined
    let dark: object | undefined
    const Capture = ({ out }: { out: (s: object) => void }) => (out(useStyles()), null)
    await render(<Capture out={(s) => (light = s)} />)
    await render(<Capture out={(s) => (again = s)} />)
    mockScheme('dark')
    await render(<ThemeProvider><Capture out={(s) => (dark = s)} /></ThemeProvider>)
    expect(again).toBe(light)
    expect(dark).not.toBe(light)
    expect(dark).toEqual({ bg: '#161113' })
  })

  it('keeps the light palette values unchanged', () => {
    expect(color).toBe(themes.light.color)
    expect(color).toEqual({
      red: '#CB1C2B',
      redPress: '#A81624',
      redInk: '#CB1C2B',
      onRed: '#FFFBFD',
      obsidian: '#161113',
      graphite: '#322D2F',
      green: '#1F6F4A',
      mint: '#E6F4EC',
      stonewash: '#85807C',
      porcelain: '#EEECED',
      paper: '#FFFBFD',
      scrim: 'rgba(22,17,19,0.5)',
    })
  })
})
