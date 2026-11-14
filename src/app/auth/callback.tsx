import { router, useNavigation } from 'expo-router'
import { useEffect } from 'react'

// Android also hands the Google redirect link to the router; without this route it would show "Unmatched Route" over Sign In.
// The browser session already receives the link, so only dismiss this route itself, and only while it is still on top.
export default function GoogleCallback() {
  const navigation = useNavigation()
  useEffect(() => {
    if (!navigation.isFocused()) return
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }, [navigation])
  return null
}
