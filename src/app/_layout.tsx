import { useFonts } from 'expo-font'
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Text } from 'react-native'

import { SessionProvider, useSession } from '@/auth/session'
import { fontAssets } from '@/ui/fonts'
import { IntroLoader } from '@/ui/IntroLoader'
import { KralLogo } from '@/ui/KralLogo'
import { color, type } from '@/ui/theme'
import { ToastProvider } from '@/ui/toast'

SplashScreen.preventAutoHideAsync()

const kralTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.paper, card: color.paper, text: color.obsidian, primary: color.red, border: color.porcelain },
}

// Cold-start loader: shown over the app until fonts + session restore are done and the animation has played.
function Gate() {
  const { loading } = useSession()
  const [done, setDone] = useState(false)
  return (
    <>
      <StatusBar style={done ? 'dark' : 'light'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="product/[id]"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="orders/[id]"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="sign-in"
          options={{
            presentation: 'modal',
            headerTitle: () => <Text style={type.h2}>Sign In</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
      </Stack>
      {!done && <IntroLoader ready={!loading} onFinished={() => setDone(true)} />}
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets)
  const fontsSettled = fontsLoaded || !!fontError

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync()
  }, [fontsSettled])

  if (!fontsSettled) return null
  return (
    <SessionProvider>
      <ThemeProvider value={kralTheme}>
        <ToastProvider>
          <Gate />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
