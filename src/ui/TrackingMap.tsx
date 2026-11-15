import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'

import { HeaderIcon } from './HeaderIcon'
import { Skeleton } from './Skeleton'
import { color, hairline, space, type } from './theme'

export const MAP_HEIGHT = 360
const TIMEOUT_MS = 20_000
const isHttps = (url: string) => /^https:\/\//i.test(url)

// The courier's live map inline. The height is reserved up front so loading, error and loaded do not shift the page.
// Touches inside the map pan the map; the page scrolls by dragging anywhere outside it (the page padding and the text around it).
// The parent keys it by URL: an unchanged link never reloads on a poll.
export function TrackingMap({ url }: { url: string }) {
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setFailed(true), TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [loading, attempt])

  const retry = () => {
    setFailed(false)
    setLoading(true)
    setAttempt((n) => n + 1) // a new WebView: the surest reload
  }

  return (
    <View style={styles.box}>
      <WebView
        key={attempt}
        source={{ uri: url }}
        accessibilityLabel="Live delivery map"
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(request) => isHttps(request.url)}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        style={styles.fill}
      />
      {loading && !failed && (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading live map" testID="tracking-map-loading" style={styles.overlay} pointerEvents="none">
          <Skeleton height={MAP_HEIGHT} />
          <Text style={styles.loadingText}>Loading live map…</Text>
        </View>
      )}
      {failed && (
        <View accessibilityRole="alert" testID="tracking-map-error" style={[styles.overlay, styles.error]}>
          <Text style={type.body}>Couldn&apos;t load the live map.</Text>
          <HeaderIcon testID="tracking-map-retry" name="refresh" label="Retry" onPress={retry} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { height: MAP_HEIGHT, backgroundColor: color.porcelain, ...hairline },
  fill: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill },
  loadingText: { ...type.small, position: 'absolute', alignSelf: 'center', top: MAP_HEIGHT / 2 - 10 },
  error: { backgroundColor: color.paper, padding: space.lg, gap: space.md, justifyContent: 'center' },
})
