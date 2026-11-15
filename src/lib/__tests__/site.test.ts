const mockOpenBrowser = jest.fn((_url: string) => Promise.resolve())
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (url: string) => mockOpenBrowser(url) }))

const load = (site?: string) => {
  if (site === undefined) delete process.env.EXPO_PUBLIC_SITE_URL
  else process.env.EXPO_PUBLIC_SITE_URL = site
  let mod!: typeof import('../site')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module per env value
  jest.isolateModules(() => { mod = require('../site') })
  return mod
}

beforeEach(() => mockOpenBrowser.mockClear())
afterAll(() => { delete process.env.EXPO_PUBLIC_SITE_URL })

it.each([
  ['terms', '/terms-of-service'],
  ['privacy', '/privacy-policy'],
  ['about', '/about'],
  ['refund', '/refund-policy'],
  ['cookies', '/cookie-policy'],
] as const)('opens %s at the web router path', (doc, path) => {
  load().openLegal(doc)
  expect(mockOpenBrowser).toHaveBeenCalledWith(`https://silhoufit-frontend.vercel.app${path}`)
})

it('uses EXPO_PUBLIC_SITE_URL and trims trailing slashes', () => {
  load('https://example.test//').openLegal('about')
  expect(mockOpenBrowser).toHaveBeenCalledWith('https://example.test/about')
})

it('exposes the web Contact page address', () => {
  expect(load().CONTACT_EMAIL).toBe('team@silhoufit.dev')
})
