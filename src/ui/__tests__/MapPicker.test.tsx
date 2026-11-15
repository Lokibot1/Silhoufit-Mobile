import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Linking } from 'react-native'

import { allowRequest, mapHtml, MapPicker, parseMapMessage } from '../MapPicker'

const mockInject = jest.fn()
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native')
  const { useImperativeHandle } = jest.requireActual('react')
  return {
    WebView: ({ ref, ...props }: { ref?: { current: unknown } }) => {
      useImperativeHandle(ref as never, () => ({ injectJavaScript: mockInject }))
      return <View testID="map" {...props} />
    },
  }
})
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}))
jest.mock('../Skeleton', () => ({ Skeleton: () => null }))
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
const location = jest.requireMock('expo-location')

const send = (data: unknown) => act(async () => screen.getByTestId('map').props.onMessage({ nativeEvent: { data: typeof data === 'string' ? data : JSON.stringify(data) } }))
const ready = () => send({ type: 'ready' })
const pin = (lat: unknown, lng: unknown) => ({ type: 'pin', lat, lng })
// The form owns the pin, as in the app: whatever onChange reports comes back as `value`.
function Controlled({ onChange }: { onChange: (lat: number, lon: number) => void }) {
  const [value, setValue] = useState<{ lat: number; lon: number } | null>(null)
  return <MapPicker value={value} onChange={(lat, lon) => (setValue({ lat, lon }), onChange(lat, lon))} />
}

beforeEach(() => {
  jest.clearAllMocks()
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true })
  location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 14.5547, longitude: 121.0244 } })
})

describe('parseMapMessage', () => {
  it('accepts our messages and a pin inside the Philippines', () => {
    expect(parseMapMessage('{"type":"ready"}')).toEqual({ type: 'ready' })
    expect(parseMapMessage('{"type":"tiles"}')).toEqual({ type: 'tiles' })
    expect(parseMapMessage('{"type":"pin","lat":14.5,"lng":121}')).toEqual({ type: 'pin', lat: 14.5, lon: 121 })
  })
  it.each([
    ['out of range', '{"type":"pin","lat":35,"lng":139}'],
    ['the null island', '{"type":"pin","lat":0,"lng":0}'],
  ])('reports %s as outside, never silently', (_name, data) => {
    expect(parseMapMessage(data)).toEqual({ type: 'outside' })
  })
  it('accepts the outside message the page sends', () => {
    expect(parseMapMessage('{"type":"outside"}')).toEqual({ type: 'outside' })
  })
  it.each([
    ['not numbers', '{"type":"pin","lat":"14.5","lng":"121"}'],
    ['null (what JSON makes of NaN)', '{"type":"pin","lat":null,"lng":121}'],
    ['infinite', '{"type":"pin","lat":1e999,"lng":121}'],
    ['missing a coordinate', '{"type":"pin","lat":14.5}'],
    ['an unknown type', '{"type":"navigate","url":"https://evil.test"}'],
    ['not JSON', 'NaN'],
    ['not an object', '"pin"'],
    ['oversized', `{"type":"ready","pad":"${'x'.repeat(300)}"}`],
  ])('ignores %s', (_name, data) => {
    expect(parseMapMessage(data)).toBeNull()
  })
  it('ignores anything that is not a string', () => {
    expect(parseMapMessage({ type: 'ready' })).toBeNull()
    expect(parseMapMessage(undefined)).toBeNull()
  })
})

describe('page', () => {
  it('pins Leaflet and its integrity hashes, uses OSM tiles with attribution, and opens on the pin when there is one', () => {
    const html = mapHtml(null)
    expect(html).toContain('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
    expect(html).toContain('integrity="sha256-')
    expect(html).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(html).toContain('OpenStreetMap</a> contributors')
    expect(html).toContain('center:[14.5995,120.9842]')
    expect(mapHtml({ lat: 10.3, lon: 123.9 })).toContain('center:[10.3,123.9]')
  })
  it('keeps the marker inside the Philippines in the page itself: bounds, snap back, an outside message, 44px zoom buttons', () => {
    const html = mapHtml(null)
    expect(html).toContain('"minLat":4,"maxLat":22,"minLon":116,"maxLon":127')
    expect(html).toContain('maxBounds:')
    expect(html).toContain('maxBoundsViscosity:1')
    expect(html).toContain("post({type:'outside'})")
    expect(html).toContain('marker.setLatLng(last)')
    expect(html).toContain('.leaflet-touch .leaflet-bar a{width:44px;height:44px')
  })
  it('only allows the inline page and the copyright link (opened outside the app)', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue()
    expect(allowRequest('about:blank')).toBe(true)
    expect(allowRequest('https://silhoufit-frontend.vercel.app/')).toBe(true)
    expect(allowRequest('https://evil.test/')).toBe(false)
    expect(allowRequest('http://tile.openstreetmap.org/')).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(allowRequest('https://www.openstreetmap.org/copyright')).toBe(false)
    expect(open).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright')
  })
})

describe('MapPicker', () => {
  it('is locked down, shows the loading overlay until the page says it is ready, and names the map', async () => {
    await render(<MapPicker value={null} onChange={jest.fn()} />)
    const map = screen.getByTestId('map')
    expect(map.props.originWhitelist).toEqual(['https://*', 'about:blank'])
    expect(map.props.allowFileAccess).toBe(false)
    expect(map.props.mixedContentMode).toBe('never')
    expect(map.props.onShouldStartLoadWithRequest({ url: 'https://evil.test' })).toBe(false)
    expect(screen.getByTestId('map-picker-loading')).toBeTruthy()
    await ready()
    expect(screen.queryByTestId('map-picker-loading')).toBeNull()
  })

  it('reports a valid pin, says so when a pin is outside the Philippines, and ignores a malformed one', async () => {
    const onChange = jest.fn()
    await render(<MapPicker value={null} onChange={onChange} />)
    await send(pin(14.5, 121))
    expect(onChange).toHaveBeenCalledWith(14.5, 121)
    await send(pin(99, 121))
    expect(screen.getByText('That spot is outside the Philippines. Move the pin inside it.')).toBeTruthy()
    await send({ type: 'outside' })
    await send(pin(14.5, 'x'))
    await send('garbage')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('shows the pin it was given', async () => {
    await render(<MapPicker value={{ lat: 14.5547, lon: 121.0244 }} onChange={jest.fn()} />)
    expect(screen.getByTestId('map-picker-status').props.children).toBe('Pinned at 14.55470, 121.02440')
  })

  it('shows the required-pin error', async () => {
    await render(<MapPicker value={null} onChange={jest.fn()} error="Drop a pin" />)
    expect(screen.getByText('Drop a pin')).toBeTruthy()
  })

  describe('failure', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('shows an error with Retry after 20 seconds, and Retry loads again', async () => {
      await render(<MapPicker value={null} onChange={jest.fn()} />)
      await act(async () => jest.advanceTimersByTime(19_999))
      expect(screen.queryByTestId('map-picker-error')).toBeNull()
      await act(async () => jest.advanceTimersByTime(1))
      expect(screen.getByTestId('map-picker-error')).toBeTruthy()
      await fireEvent.press(screen.getByTestId('map-picker-retry'))
      expect(screen.queryByTestId('map-picker-error')).toBeNull()
      expect(screen.getByTestId('map-picker-loading')).toBeTruthy()
    })

    it.each([['onError'], ['onHttpError']])('%s and a page that could not load Leaflet show the error', async (handler) => {
      await render(<MapPicker value={null} onChange={jest.fn()} />)
      await act(async () => screen.getByTestId('map').props[handler]())
      expect(screen.getByTestId('map-picker-error')).toBeTruthy()
    })

    it('a page error message shows the error', async () => {
      await render(<MapPicker value={null} onChange={jest.fn()} />)
      await send({ type: 'error' })
      expect(screen.getByTestId('map-picker-error')).toBeTruthy()
    })

    it('Use My Location that takes longer than 15 seconds says so', async () => {
      location.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}))
      await render(<MapPicker value={null} onChange={jest.fn()} />)
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      await act(async () => jest.advanceTimersByTime(15_000))
      expect(screen.getByText(/longer than 15 seconds/)).toBeTruthy()
    })
  })

  describe('Use My Location', () => {
    it('moves the map and reports the pin', async () => {
      const onChange = jest.fn()
      await render(<Controlled onChange={onChange} />)
      await ready()
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      expect(await screen.findByTestId('map-picker-locate')).toBeTruthy()
      expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(14.5547, 121.0244)
      expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('window.setPin&&window.setPin(14.5547,121.0244)'))
      expect(screen.queryByTestId('map-picker-problem')).toBeNull()
    })

    it('before the map is ready the pin waits, then goes onto the map when the page says ready', async () => {
      const onChange = jest.fn()
      await render(<Controlled onChange={onChange} />)
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      expect(await screen.findByText('Pinned at 14.55470, 121.02440')).toBeTruthy()
      expect(onChange).toHaveBeenCalledWith(14.5547, 121.0244)
      expect(mockInject).not.toHaveBeenCalled()
      await ready()
      expect(mockInject).toHaveBeenCalledTimes(1)
      expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('window.setPin(14.5547,121.0244)'))
    })

    it('a late fix does not overwrite a pin dropped on the map meanwhile', async () => {
      let fix: (v: unknown) => void = () => {}
      location.getCurrentPositionAsync.mockReturnValue(new Promise((resolve) => (fix = resolve)))
      const onChange = jest.fn()
      await render(<Controlled onChange={onChange} />)
      await ready()
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      await send(pin(10.3, 123.9))
      await act(async () => fix({ coords: { latitude: 14.5547, longitude: 121.0244 } }))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(10.3, 123.9)
      expect(mockInject).not.toHaveBeenCalled()
      expect(screen.getByText('Pinned at 10.30000, 123.90000')).toBeTruthy()
    })

    it('denied: explains, offers Settings, and does not read the position', async () => {
      location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false })
      const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue()
      const onChange = jest.fn()
      await render(<MapPicker value={null} onChange={onChange} />)
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      expect(await screen.findByText(/Location is turned off for SilhouFit/)).toBeTruthy()
      await fireEvent.press(screen.getByTestId('map-picker-settings'))
      expect(settings).toHaveBeenCalled()
      expect(location.getCurrentPositionAsync).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('unavailable: says why and what to do', async () => {
      location.getCurrentPositionAsync.mockRejectedValue(new Error('Location provider is unavailable'))
      await render(<MapPicker value={null} onChange={jest.fn()} />)
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      expect(await screen.findByText(/couldn't work out where you are/)).toBeTruthy()
      expect(screen.queryByTestId('map-picker-settings')).toBeNull()
    })

    it('a position outside the Philippines is refused', async () => {
      location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 35.68, longitude: 139.69 } })
      const onChange = jest.fn()
      await render(<MapPicker value={null} onChange={onChange} />)
      await fireEvent.press(screen.getByTestId('map-picker-locate'))
      expect(await screen.findByText(/outside the Philippines/)).toBeTruthy()
      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
