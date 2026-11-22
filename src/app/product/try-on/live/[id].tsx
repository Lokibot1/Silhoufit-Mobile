import { Ionicons } from '@expo/vector-icons'
import type { Session } from '@supabase/supabase-js'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'

import { useSession } from '@/auth/session'
import { supabase } from '@/lib/supabase'
import { openExternal, SITE } from '@/lib/site'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { space, themed, useTheme } from '@/ui/theme'
import { useScheme } from '@/ui/ThemeProvider'
import { useToast } from '@/ui/toast'

const TARGET = 44
const TIMEOUT_MS = 20_000
const ORIGIN = new URL(SITE).origin
const STORAGE_KEYS = `Object.keys(localStorage).filter(function (k) { return /^sb-.*-auth-token$/.test(k) || k === 'silhoufit-session' }).forEach(function (k) { localStorage.removeItem(k) }); true;`

// The web app treats a visitor as signed in only with both keys. The refresh token is blanked so the page can never rotate it and sign the phone out.
function handoff(session: Session, user: { name: string; email: string; avatarUrl?: string }, theme: 'light' | 'dark') {
  const ref = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const set = (key: string, value: unknown) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`
  const theme_ = `localStorage.setItem('silhoufit-theme', ${JSON.stringify(theme)});`
  return `(function () { try { if (location.origin !== ${JSON.stringify(ORIGIN)}) return; ${set(`sb-${ref}-auth-token`, { ...session, refresh_token: '' })} ${set('silhoufit-session', { ...user, role: 'customer' })} ${theme_} } catch (e) {} })(); true;`
}

// Same-site pages load here; any other https link opens in the system browser; every other scheme is refused.
function allowed(url: string) {
  try {
    if (new URL(url).origin === ORIGIN) return true
  } catch {
    return false
  }
  if (/^https:\/\//i.test(url)) openExternal(url).catch(() => {})
  return false
}

type Phase = 'consent' | 'asking' | 'denied' | 'web' | 'expired'

function Card({ title, message, children }: { title: string; message: string; children: ReactNode }) {
  const styles = useStyles()
  const { type } = useTheme()
  return (
    <ScrollView contentContainerStyle={styles.card}>
      <Text accessibilityRole="header" style={type.h2}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {children}
    </ScrollView>
  )
}

// A WebView of the web try-on page with the app's login handed in. Nothing (no permission request, no page) starts before the consent card is accepted.
export default function LiveTryOn() {
  const styles = useStyles()
  const { color: palette, type } = useTheme()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const scheme = useScheme()
  const { session, profile, loading: sessionLoading, signOut } = useSession()
  const { id: raw, color: colorParam } = useLocalSearchParams<{ id: string | string[]; color?: string | string[] }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const color = typeof colorParam === 'string' && colorParam ? colorParam : undefined
  const web = useRef<WebView<object>>(null)
  const leaving = useRef(false)
  const [phase, setPhase] = useState<Phase>('consent')
  const [canAsk, setCanAsk] = useState(true)
  const [script, setScript] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<'network' | 'server' | null>(null)

  // Best effort: the page's copy of the login is wiped before the screen goes.
  const leave = (go: () => void) => {
    if (leaving.current) return
    leaving.current = true
    web.current?.injectJavaScript(STORAGE_KEYS)
    go()
  }
  const close = () => leave(() => router.back())

  useEffect(() => {
    if (!sessionLoading && !session) leave(() => router.replace('/sign-in'))
  })

  useEffect(() => {
    if (phase !== 'web' || !loading || failure) return
    const timer = setTimeout(() => setFailure('network'), TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [phase, loading, failure, attempt])

  async function openWeb() {
    setPhase('web')
    setLoading(true)
    setFailure(null)
    setScript(null)
    const { data, error } = await supabase.auth.refreshSession()
    if (error && error.name === 'AuthRetryableFetchError') return setFailure('network') // offline is not a dead session
    if (error || !data.session) {
      toast('Your session has expired. Sign in again.')
      leave(() => void signOut().finally(() => router.replace('/sign-in')))
      return
    }
    const name = profile?.fullName ?? (`${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || data.session.user.email) ?? ''
    setScript(handoff(data.session, { name, email: profile?.email ?? data.session.user.email ?? '', avatarUrl: profile?.avatarUrl ?? undefined }, scheme))
    setAttempt((n) => n + 1)
  }

  async function start() {
    setPhase('asking')
    let result: { granted: boolean; canAskAgain: boolean }
    try {
      result = await ImagePicker.requestCameraPermissionsAsync()
    } catch {
      result = { granted: false, canAskAgain: true }
    }
    if (result.granted) return openWeb()
    setCanAsk(result.canAskAgain)
    setPhase('denied')
  }

  function onNavigate({ url }: WebViewNavigation) {
    let path: string
    try {
      const parsed = new URL(url)
      if (parsed.origin !== ORIGIN) return
      path = parsed.pathname
    } catch {
      return
    }
    if (path.startsWith('/login')) setPhase('expired')
    else if (/^\/shop(\/[^/]+)?\/?$/.test(path)) close()
    else if (path.startsWith('/profile/measurements')) leave(() => { router.back(); router.push('/profile/body') })
  }

  const uri = `${SITE}/shop/${encodeURIComponent(id)}/try-on${color ? `?color=${encodeURIComponent(color)}` : ''}`
  const failed = phase === 'web' && failure
  const message = failure === 'server' ? 'The try-on page did not respond. Try again in a moment.' : "Can't reach the try-on. Check your connection and try again."

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Text accessibilityRole="header" style={[type.h2, styles.title]}>Live Try-On</Text>
        <PressableScale testID="live-close" accessibilityRole="button" accessibilityLabel="Close live try-on" onPress={close} style={styles.close}>
          <Ionicons name="close" size={24} color={palette.obsidian} />
        </PressableScale>
      </View>
      <View style={styles.body}>
        {phase === 'consent' && (
          <Card title="Try it on with your camera" message="The camera picture stays on this phone and is never uploaded or recorded. Your measurements stay in your SilhouFit account. Next, tap Turn on camera on the try-on page.">
            <Button testID="live-start" label="Start Camera" onPress={() => void start()} />
            <Button testID="live-not-now" variant="secondary" label="Not Now" onPress={close} />
          </Card>
        )}
        {phase === 'asking' && <Skeleton height={TARGET} />}
        {phase === 'denied' && (
          <Card title="Camera access is off" message="The try-on needs the camera to show the shirt on you. Turn it on, or try the shirt on without the camera.">
            {canAsk ? (
              <Button testID="live-allow" label="Allow Camera" onPress={() => void start()} />
            ) : (
              <Button testID="live-settings" label="Open Settings" onPress={() => void Linking.openSettings().catch(() => {})} />
            )}
            <Button testID="live-no-camera" variant="secondary" label="Try On Without Camera" onPress={() => void openWeb()} />
          </Card>
        )}
        {phase === 'expired' && (
          <Card title="Your try-on session timed out" message="For your security the try-on page signed out. Reopen it to carry on.">
            <Button testID="live-reopen" label="Reopen" onPress={() => void openWeb()} />
          </Card>
        )}
        {phase === 'web' && (
          <>
            {script !== null && (
              <WebView
                key={attempt}
                ref={web}
                testID="live-web"
                source={{ uri }}
                accessibilityLabel="Live try-on"
                originWhitelist={[ORIGIN]}
                injectedJavaScriptBeforeContentLoaded={script}
                onShouldStartLoadWithRequest={(request) => allowed(request.url)}
                onNavigationStateChange={onNavigate}
                javaScriptEnabled
                domStorageEnabled
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
                allowFileAccess={false}
                allowFileAccessFromFileURLs={false}
                mixedContentMode="never"
                setSupportMultipleWindows={false}
                allowsFullscreenVideo={false}
                allowsBackForwardNavigationGestures={false}
                onLoadEnd={() => setLoading(false)}
                onError={() => setFailure('network')}
                onHttpError={() => setFailure('server')}
                style={styles.body}
              />
            )}
            {loading && !failed && (
              <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading live try-on" testID="live-loading" style={styles.overlay} pointerEvents="none">
                <Skeleton height={320} />
                <Text style={styles.loadingText}>Loading live try-on…</Text>
              </View>
            )}
            {failed && (
              <View testID="live-error" style={[styles.overlay, styles.error]}>
                <Card title="Couldn't load the try-on" message={message}>
                  <Button testID="live-retry" label="Retry" onPress={() => void openWeb()} />
                </Card>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  bar: { minHeight: TARGET + space.sm, flexDirection: 'row', alignItems: 'center', paddingLeft: space.lg, paddingRight: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  title: { flex: 1 },
  close: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  card: { padding: space.lg, gap: space.md },
  message: { ...type.body, color: color.graphite },
  overlay: { ...StyleSheet.absoluteFill },
  loadingText: { ...type.small, position: 'absolute', alignSelf: 'center', top: 150 },
  error: { backgroundColor: color.paper },
}))
