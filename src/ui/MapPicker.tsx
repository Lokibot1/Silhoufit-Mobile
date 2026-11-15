import * as Location from 'expo-location'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'

import { inPhilippines, MANILA, PH_BOUNDS } from '@/lib/addressValidation'
import { isRecord } from '@/lib/api'

import { Button } from './Button'
import { HeaderIcon } from './HeaderIcon'
import { Skeleton } from './Skeleton'
import { color, hairline, space, type } from './theme'

export const MAP_HEIGHT = 320
const TIMEOUT_MS = 20_000
const LOCATION_TIMEOUT_MS = 15_000
const STREET_ZOOM = 17
// OpenStreetMap's tile policy wants a Referer, which an inline page has none of: the page is given the web app's address as its base.
const BASE_URL = 'https://silhoufit-frontend.vercel.app/'
const COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
// Exact versions with Subresource Integrity, so a changed CDN file cannot run.
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet'
const CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
const JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='

type Pin = { lat: number; lon: number }

/** The page the WebView shows. `initial` only sets where it opens; later pins arrive through setPin. */
export function mapHtml(initial: Pin | null): string {
  const start = initial ?? MANILA
  const zoom = initial ? STREET_ZOOM : 11
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}.css" integrity="${CSS_SRI}" crossorigin="">
<style>html,body,#map{height:100%;margin:0;background:#EEECED}.leaflet-touch .leaflet-bar a{width:44px;height:44px;line-height:44px;font-size:24px}.pin{display:block;width:28px;height:28px;margin:8px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#CB1C2B;border:2px solid #FFFBFD;box-shadow:0 1px 4px rgba(0,0,0,.4)}</style>
</head><body><div id="map"></div>
<script src="${LEAFLET}.js" integrity="${JS_SRI}" crossorigin=""></script>
<script>
var post=function(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))};
if(typeof L==='undefined'){post({type:'error'})}else{
var B=${JSON.stringify(PH_BOUNDS)};
function inside(lat,lng){return isFinite(lat)&&isFinite(lng)&&lat>=B.minLat&&lat<=B.maxLat&&lng>=B.minLon&&lng<=B.maxLon}
var map=L.map('map',{center:[${start.lat},${start.lon}],zoom:${zoom},minZoom:5,maxBounds:[[B.minLat,B.minLon],[B.maxLat,B.maxLon]],maxBoundsViscosity:1});
var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="${COPYRIGHT_URL}">OpenStreetMap</a> contributors'}).addTo(map);
var failed=false;tiles.on('tileerror',function(){if(!failed){failed=true;post({type:'tiles'})}});
var icon=L.divIcon({className:'',html:'<span class="pin"></span>',iconSize:[44,44],iconAnchor:[22,42]});
var marker=null,last=null;
// The marker only ever sits on a pin the app has been told about: a spot outside the Philippines snaps back to the last good one.
function place(lat,lng){last=[lat,lng];if(marker){marker.setLatLng(last)}else{marker=L.marker(last,{icon:icon,draggable:true}).addTo(map);marker.on('dragend',function(){var p=marker.getLatLng();accept(p.lat,p.lng)})}}
function accept(lat,lng){if(inside(lat,lng)){place(lat,lng);post({type:'pin',lat:lat,lng:lng})}else{if(marker&&last)marker.setLatLng(last);post({type:'outside'})}}
map.on('click',function(e){accept(e.latlng.lat,e.latlng.lng)});
window.setPin=function(lat,lng){if(inside(lat,lng)){place(lat,lng);map.setView([lat,lng],${STREET_ZOOM})}};
${initial ? `place(${initial.lat},${initial.lon});` : ''}
post({type:'ready'});
}
</script></body></html>`
}

export type MapMessage = { type: 'ready' } | { type: 'error' } | { type: 'tiles' } | { type: 'outside' } | { type: 'pin'; lat: number; lon: number }

/** A message from the page, or null for anything that is not one of ours: bad JSON, an unknown type, a pin that is not a pair of finite numbers. A pin outside the Philippines is reported as `outside`, never dropped silently. */
export function parseMapMessage(data: unknown): MapMessage | null {
  if (typeof data !== 'string' || data.length > 200) return null
  let body: unknown
  try {
    body = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(body)) return null
  if (body.type === 'ready' || body.type === 'error' || body.type === 'tiles' || body.type === 'outside') return { type: body.type }
  if (body.type === 'pin' && typeof body.lat === 'number' && typeof body.lng === 'number' && Number.isFinite(body.lat) && Number.isFinite(body.lng)) return inPhilippines(body.lat, body.lng) ? { type: 'pin', lat: body.lat, lon: body.lng } : { type: 'outside' }
  return null
}

/** Only the first load (the inline page) and the OpenStreetMap copyright link (opened outside the app) are allowed; the page can never be navigated away. */
export function allowRequest(url: string): boolean {
  if (url === 'about:blank' || url === BASE_URL) return true
  if (url === COPYRIGHT_URL) void Linking.openURL(url)
  return false
}

type LocationProblem = 'denied' | 'unavailable' | 'timeout' | 'outside' | 'pinOutside'
const PROBLEMS: Record<LocationProblem, string> = {
  denied: "Location is turned off for SilhouFit, so we can't find you. Allow it in Settings and try again, or tap the map to drop the pin yourself.",
  unavailable: "We couldn't work out where you are, probably a weak signal or location services being off. Turn them on and try again, or tap the map to drop the pin yourself.",
  timeout: 'Finding your location took longer than 15 seconds. Try again, or tap the map to drop the pin yourself.',
  outside: "Your location is outside the Philippines, so it can't be a delivery pin. Tap the map to place the pin yourself.",
  pinOutside: 'That spot is outside the Philippines. Move the pin inside it.',
}

const withTimeout = <T,>(work: Promise<T>) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), LOCATION_TIMEOUT_MS)
    work.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    )
  })

type Props = { value: Pin | null; onChange: (lat: number, lon: number) => void; disabled?: boolean; error?: string }

// Leaflet over OpenStreetMap tiles in a WebView. Tap the map or drag the pin; the page reports the spot and this checks it before use.
// The height is fixed so loading, error and loaded never shift the form.
export function MapPicker({ value, onChange, disabled, error }: Props) {
  const view = useRef<ComponentRef<typeof WebView>>(null)
  const latest = useRef(value)
  const onPage = useRef(value) // the pin the page is showing
  const version = useRef(0) // counts pins set by anyone, so a slow GPS fix can tell it was overtaken
  const alive = useRef(true)
  const [page, setPage] = useState(() => ({ attempt: 0, html: mapHtml(value) }))
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [tilesFailed, setTilesFailed] = useState(false)
  const [locating, setLocating] = useState(false)
  const [problem, setProblem] = useState<LocationProblem | null>(null)

  useEffect(() => {
    latest.current = value
  })
  // A pin from outside the page (My Location, a search) is moved onto the map; before the page is ready it waits and goes on the ready phase.
  useEffect(() => {
    if (!value || (value.lat === onPage.current?.lat && value.lon === onPage.current?.lon)) return
    version.current += 1
    if (phase !== 'ready') return
    onPage.current = value
    view.current?.injectJavaScript(`window.setPin&&window.setPin(${value.lat},${value.lon});true;`)
  }, [value, phase])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (phase !== 'loading') return
    const timer = setTimeout(() => setPhase('failed'), TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase, page.attempt])

  const retry = () => {
    setPhase('loading')
    setTilesFailed(false)
    onPage.current = latest.current
    setPage((current) => ({ attempt: current.attempt + 1, html: mapHtml(latest.current) }))
  }

  function onMessage(event: WebViewMessageEvent) {
    const message = parseMapMessage(event.nativeEvent.data)
    if (!message) return
    if (message.type === 'ready') setPhase('ready')
    else if (message.type === 'error') setPhase('failed')
    else if (message.type === 'tiles') setTilesFailed(true)
    else if (message.type === 'outside') setProblem('pinOutside')
    else {
      setProblem(null)
      version.current += 1
      onPage.current = { lat: message.lat, lon: message.lon }
      onChange(message.lat, message.lon)
    }
  }

  async function locate() {
    if (locating) return
    setLocating(true)
    setProblem(null)
    const started = version.current
    let next: LocationProblem | null = null
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) next = 'denied'
      else {
        const { coords } = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
        if (!inPhilippines(coords.latitude, coords.longitude)) next = 'outside'
        // A pin dropped while the fix was coming in wins; the late fix is dropped.
        else if (alive.current && version.current === started) onChange(coords.latitude, coords.longitude)
      }
    } catch (failure) {
      next = failure instanceof Error && failure.message === 'timeout' ? 'timeout' : 'unavailable'
    }
    if (!alive.current) return
    setProblem(next)
    setLocating(false)
  }

  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={type.label}>(Map pin)</Text>
      <Text style={styles.body}>Your pin tells the courier exactly where to deliver and sets your shipping fee. Tap the map to drop it, then drag it to adjust.</Text>
      <Text style={type.small}>Your pin is sent to OpenStreetMap services to find the address.</Text>
      <View pointerEvents={disabled ? 'none' : 'auto'} style={[styles.box, !!error && styles.boxError]}>
        <WebView
          key={page.attempt}
          ref={view}
          source={{ html: page.html, baseUrl: BASE_URL }}
          accessibilityLabel="Map. Tap to drop the delivery pin, or drag the pin to adjust it. To set the pin without the map, use Find on map or Use My Location below."
          originWhitelist={['https://*', 'about:blank']}
          onShouldStartLoadWithRequest={(request) => allowRequest(request.url)}
          onMessage={onMessage}
          onError={() => setPhase('failed')}
          onHttpError={() => setPhase('failed')}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          nestedScrollEnabled
          style={styles.fill}
        />
        {phase === 'loading' && (
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading map" testID="map-picker-loading" style={styles.overlay} pointerEvents="none">
            <Skeleton height={MAP_HEIGHT} />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        )}
        {phase === 'failed' && (
          <View accessibilityRole="alert" testID="map-picker-error" style={[styles.overlay, styles.errorBox]}>
            <Text style={type.body}>{"Couldn't load the map. Check your connection, then try again."}</Text>
            <HeaderIcon testID="map-picker-retry" name="refresh" label="Retry" onPress={retry} />
          </View>
        )}
      </View>
      {tilesFailed && phase === 'ready' && <Text accessibilityRole="alert" style={styles.problem}>The map pictures did not load, so the map may look blank. Check your connection; Use My Location still works.</Text>}
      <Text testID="map-picker-status" accessibilityLiveRegion="polite" style={[type.small, type.numeric]}>
        {value ? `Pinned at ${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : 'No pin yet.'}
      </Text>
      <Button testID="map-picker-locate" variant="secondary" label="Use My Location" pending={locating} disabled={disabled} onPress={() => void locate()} />
      {problem && (
        <View testID="map-picker-problem" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{PROBLEMS[problem]}</Text>
          {problem === 'denied' && <Button testID="map-picker-settings" variant="secondary" label="Open Settings" onPress={() => void Linking.openSettings()} />}
        </View>
      )}
      <Text accessibilityLiveRegion="polite" style={[type.small, error ? styles.errorText : null]}>{error ?? ' '}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  body: { ...type.body, color: color.graphite },
  box: { height: MAP_HEIGHT, backgroundColor: color.porcelain, ...hairline },
  boxError: { borderColor: color.red },
  fill: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill },
  loadingText: { ...type.small, position: 'absolute', alignSelf: 'center', top: MAP_HEIGHT / 2 - 10 },
  errorBox: { backgroundColor: color.paper, padding: space.lg, gap: space.md, justifyContent: 'center' },
  problem: { ...type.small, color: color.red },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md, gap: space.md },
  errorText: { color: color.red },
})
