import { act, render, waitFor } from '@testing-library/react-native'
import { Appearance, Text } from 'react-native'

import { color, themed, themes, useTheme } from '../theme'
import { ThemeProvider, useAppearance } from '../ThemeProvider'

const mockStore: Record<string, string> = {}
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => Promise.resolve((mockStore[key] = value, undefined))),
}))
const setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {})

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ default: jest.fn() }))

const mockScheme = (s: 'light' | 'dark' | null) =>
  (jest.requireMock('react-native/Libraries/Utilities/useColorScheme').default as jest.Mock).mockReturnValue(s)

function Probe() {
  const t = useTheme()
  return <Text testID="paper">{t.color.paper}</Text>
}

describe('theme', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) delete mockStore[key]
    setScheme.mockClear()
  })

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

  describe('appearance preference', () => {
    const api = {} as ReturnType<typeof useAppearance>
    function Controls() {
      Object.assign(api, useAppearance())
      return <Probe />
    }
    const paper = (r: { getByTestId: (id: string) => { props: Record<string, unknown> } }) => r.getByTestId('paper').props.children

    it('follows the device scheme by default and clears the native override', async () => {
      mockScheme('dark')
      const r = await render(<ThemeProvider><Controls /></ThemeProvider>)
      expect(api.preference).toBe('system')
      expect(paper(r)).toBe('#161113')
      expect(setScheme).toHaveBeenLastCalledWith('unspecified')
    })

    it('lets Light and Dark override the device, stores the choice and sets the native scheme', async () => {
      mockScheme('dark')
      const r = await render(<ThemeProvider><Controls /></ThemeProvider>)
      await act(async () => api.setPreference('light'))
      expect(paper(r)).toBe('#FFFBFD')
      expect(mockStore['silhoufit-theme']).toBe('light')
      expect(setScheme).toHaveBeenLastCalledWith('light')
      mockScheme('light')
      await act(async () => api.setPreference('dark'))
      expect(paper(r)).toBe('#161113')
      expect(mockStore['silhoufit-theme']).toBe('dark')
      expect(setScheme).toHaveBeenLastCalledWith('dark')
    })

    it('restores the stored choice and ignores a junk value', async () => {
      mockScheme('light')
      mockStore['silhoufit-theme'] = 'dark'
      const r = await render(<ThemeProvider><Controls /></ThemeProvider>)
      await waitFor(() => expect(api.preference).toBe('dark'))
      expect(paper(r)).toBe('#161113')
      mockStore['silhoufit-theme'] = 'purple'
      await render(<ThemeProvider><Controls /></ThemeProvider>)
      await act(async () => {})
      expect(api.preference).toBe('system')
    })
  })
})
