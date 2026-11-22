import { useFonts } from 'expo-font'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState, type ReactNode } from 'react'
import { Text } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { AgeGate } from '@/auth/AgeGate'
import { SessionProvider, useSession } from '@/auth/session'
import { fontAssets } from '@/ui/fonts'
import { OnboardingGate } from '@/onboarding/OnboardingGate'
import { IntroLoader } from '@/ui/IntroLoader'
import { KralLogo } from '@/ui/KralLogo'
import { themes, useTheme } from '@/ui/theme'
import { ThemeProvider, useScheme } from '@/ui/ThemeProvider'
import { ToastProvider } from '@/ui/toast'
import { useReduceMotion } from '@/ui/useReduceMotion'

// Expo Router renders this when a screen throws.
export { RouteError as ErrorBoundary } from '@/ui/ErrorScreen'

SplashScreen.preventAutoHideAsync()

function navTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  const c = themes[scheme].color
  return { ...base, colors: { ...base.colors, background: c.paper, card: c.paper, text: c.obsidian, border: c.porcelain, primary: c.red, notification: c.red } }
}

// Cold-start loader: shown over the app until fonts + session restore are done and the animation has played.
function Gate() {
  const { loading } = useSession()
  const [done, setDone] = useState(false)
  const reduce = useReduceMotion()
  const { color, type } = useTheme()
  const scheme = useScheme()
  return (
    <>
      <StatusBar style={done && scheme !== 'dark' ? 'dark' : 'light'} />
      <Stack screenOptions={{ animation: reduce ? 'none' : 'ios_from_right' }}>
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
          name="product/reviews/[id]"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Customer reviews</Text>,
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
          name="orders/review"
          options={{
            headerTitle: () => <Text style={type.h2}>Your Review</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="checkout"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="messages"
          options={{
            headerTitle: () => <Text style={type.h2}>Messages</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="cart"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Cart</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="addresses"
          options={{
            headerTitle: () => <Text style={type.h2}>Delivery Addresses</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="addresses/new"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Add Address</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="addresses/[id]"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Edit Address</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="profile/password"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Change Password</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="profile/body"
          options={{
            headerTitle: () => <Text accessibilityRole="header" style={type.h2}>Body Profile</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="faq"
          options={{
            headerTitle: () => <Text style={type.h2}>FAQ</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: reduce ? 'none' : 'fade' }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="sign-in"
          options={{
            presentation: 'modal',
            animation: reduce ? 'none' : 'slide_from_bottom',
            headerTitle: () => <Text style={type.h2}>Sign In</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            presentation: 'modal',
            animation: reduce ? 'none' : 'slide_from_bottom',
            headerTitle: () => <Text style={type.h2}>Forgot Password</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="sign-up"
          options={{
            presentation: 'modal',
            animation: reduce ? 'none' : 'slide_from_bottom',
            headerTitle: () => <Text style={type.h2}>Create Account</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="check-email"
          options={{
            presentation: 'modal',
            animation: reduce ? 'none' : 'slide_from_bottom',
            headerTitle: () => <Text style={type.h2}>Check Your Email</Text>,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
          }}
        />
        <Stack.Screen
          name="auth/reset"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="auth/confirm"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="auth/age"
          options={{
            headerTitle: () => <KralLogo width={72} />,
            headerStyle: { backgroundColor: color.paper },
            headerShadowVisible: false,
            headerTintColor: color.obsidian,
            gestureEnabled: false,
            headerBackVisible: false,
          }}
        />
      </Stack>
      <AgeGate />
      <OnboardingGate enabled={done} />
      {!done && <IntroLoader ready={!loading} onFinished={() => setDone(true)} />}
    </>
  )
}

function NavTheme({ children }: { children: ReactNode }) {
  return <NavThemeProvider value={navTheme(useScheme())}>{children}</NavThemeProvider>
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets)
  const fontsSettled = fontsLoaded || !!fontError

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync()
  }, [fontsSettled])

  if (!fontsSettled) return null
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <ThemeProvider>
          <NavTheme>
            <ToastProvider>
              <Gate />
            </ToastProvider>
          </NavTheme>
        </ThemeProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  )
}
