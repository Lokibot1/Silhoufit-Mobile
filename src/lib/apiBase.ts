import Constants from 'expo-constants'

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
// Loopback, link-local and the private LAN ranges: addresses a developer's own PC has, which change with the network.
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/

/**
 * The API's base URL. In development the Expo dev server and the backend run on the same PC, and the dev server already
 * advertises the PC's address that the phone can reach (`hostUri`), so a PC that switches between Ethernet and Wi-Fi
 * needs no .env edit. Only a local/LAN address in EXPO_PUBLIC_API_URL (or none) is replaced, keeping its port; a real
 * hostname, and every production build, use EXPO_PUBLIC_API_URL as written. A tunnel's hostname is not an IP, so it falls back too.
 */
export function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL ?? ''
  if (!__DEV__) return configured

  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  if (!host || !IPV4.test(host)) return configured

  let port = '3000'
  if (configured) {
    try {
      const url = new URL(configured)
      if (!LOCAL_HOST.test(url.hostname)) return configured
      port = url.port || port
    } catch {
      return configured
    }
  }
  return `http://${host}:${port}`
}
