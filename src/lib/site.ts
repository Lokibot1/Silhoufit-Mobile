import * as WebBrowser from 'expo-web-browser'

// The legal pages live on the web app; the sign-up consent links open them in the system browser.
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://silhoufit-frontend.vercel.app').replace(/\/+$/, '')
const PATHS = { terms: '/terms-of-service', privacy: '/privacy-policy', about: '/about', refund: '/refund-policy', cookies: '/cookie-policy' } as const

export const openLegal = (doc: keyof typeof PATHS) => WebBrowser.openBrowserAsync(`${SITE}${PATHS[doc]}`)

export const CONTACT_EMAIL = 'team@silhoufit.dev' // same address as the web Contact page
