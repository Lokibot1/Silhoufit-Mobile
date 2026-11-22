import { router, type ErrorBoundaryProps } from 'expo-router'
import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from './Button'
import { space, themed, useTheme } from './theme'

const goToShop = () => router.replace('/(tabs)')

// Shared body of the not-found and error screens. Own background: the error one can render outside the app's theme.
export function ErrorScreen({ code, title, message, alert, children }: { code: string; title: string; message: string; alert?: boolean; children: ReactNode }) {
  const styles = useStyles()
  const { type } = useTheme()
  return (
    <SafeAreaView style={styles.screen}>
      <View accessibilityRole={alert ? 'alert' : undefined} style={styles.box}>
        <Text style={type.label}>({code})</Text>
        <Text accessibilityRole="header" style={type.h1}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>{children}</View>
      </View>
    </SafeAreaView>
  )
}

export function NotFound() {
  return (
    <ErrorScreen code="404" title="Page not found" message="This link may be wrong, or the page has moved. Head back to the shop.">
      <Button testID="not-found-shop" label="Go to Shop" onPress={goToShop} />
      {router.canGoBack() && <Button testID="not-found-back" variant="secondary" label="Go Back" onPress={() => router.back()} />}
    </ErrorScreen>
  )
}

// Expo Router's route ErrorBoundary. The error stays out of the UI (no message, no stack); only its name is logged,
// as no monitoring service is wired up yet.
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { console.error(error?.name ?? 'Error') }, [error])
  return (
    <ErrorScreen alert code="Error" title="Something went wrong" message="That was on our side, not yours. Try again, or head back to the shop.">
      <Button testID="error-retry" label="Try Again" onPress={() => void retry()} />
      <Button testID="error-shop" variant="secondary" label="Go to Shop" onPress={() => { goToShop(); void retry() }} />
    </ErrorScreen>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper, justifyContent: 'center', padding: space.lg },
  box: { gap: space.md },
  message: { ...type.body, color: color.graphite },
  actions: { gap: space.sm, marginTop: space.sm },
}))
