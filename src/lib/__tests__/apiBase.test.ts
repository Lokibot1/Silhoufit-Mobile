import Constants from 'expo-constants'

import { apiBaseUrl } from '../apiBase'

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { hostUri: undefined as string | undefined } } }))

const config = Constants.expoConfig as { hostUri?: string }
const original = process.env.EXPO_PUBLIC_API_URL
const dev = (value: boolean) => ((globalThis as { __DEV__?: boolean }).__DEV__ = value)

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = original
  config.hostUri = undefined
  dev(true)
})

describe('apiBaseUrl', () => {
  it('follows the dev server host when .env holds a stale LAN address, keeping the port', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.6:3000'
    config.hostUri = '192.168.1.4:8081'
    expect(apiBaseUrl()).toBe('http://192.168.1.4:3000')
  })

  it('keeps the port written in .env', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.6:4000'
    config.hostUri = '192.168.1.4:8081'
    expect(apiBaseUrl()).toBe('http://192.168.1.4:4000')
  })

  it('works with no .env value, defaulting to port 3000', () => {
    process.env.EXPO_PUBLIC_API_URL = ''
    config.hostUri = '10.0.0.8:8081'
    expect(apiBaseUrl()).toBe('http://10.0.0.8:3000')
  })

  it('also replaces a localhost address, which a phone can never reach', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000'
    config.hostUri = '192.168.1.4:8081'
    expect(apiBaseUrl()).toBe('http://192.168.1.4:3000')
  })

  it('leaves a real hostname alone', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com'
    config.hostUri = '192.168.1.4:8081'
    expect(apiBaseUrl()).toBe('https://api.example.com')
  })

  it('falls back to .env when the host is a tunnel name, not an IP', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.6:3000'
    config.hostUri = 'abc-xyz.exp.direct:80'
    expect(apiBaseUrl()).toBe('http://192.168.1.6:3000')
  })

  it('falls back to .env when the dev server reports no host', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.6:3000'
    expect(apiBaseUrl()).toBe('http://192.168.1.6:3000')
  })

  it('uses .env as written in a production build', () => {
    dev(false)
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.6:3000'
    config.hostUri = '192.168.1.4:8081'
    expect(apiBaseUrl()).toBe('http://192.168.1.6:3000')
  })

  it('returns an empty string when nothing is configured and there is no host', () => {
    delete process.env.EXPO_PUBLIC_API_URL
    expect(apiBaseUrl()).toBe('')
  })
})
