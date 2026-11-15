import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { TrackingMap } from '../TrackingMap'

jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native')
  return { WebView: (props: object) => <View testID="tracking-map" {...props} /> }
})
jest.mock('../Skeleton', () => ({ Skeleton: () => null }))

const URL = 'https://share.lalamove.test/1'
const map = () => screen.getByTestId('tracking-map')

describe('TrackingMap', () => {
  it('loads the https link, locked down, with a label', async () => {
    await render(<TrackingMap url={URL} />)
    expect(map().props.source).toEqual({ uri: URL })
    expect(map().props.accessibilityLabel).toBe('Live delivery map')
    expect(map().props.originWhitelist).toEqual(['https://*'])
    expect(map().props.javaScriptEnabled).toBe(true)
    expect(map().props.allowFileAccess).toBe(false)
    expect(map().props.mixedContentMode).toBe('never')
    expect(map().props.setSupportMultipleWindows).toBe(false)
  })

  it('shows the loading overlay until the load ends', async () => {
    await render(<TrackingMap url={URL} />)
    expect(screen.getByText('Loading live map…')).toBeTruthy()
    await act(async () => map().props.onLoadEnd())
    expect(screen.queryByText('Loading live map…')).toBeNull()
  })

  it.each(['onError', 'onHttpError'])('%s shows the error, and Retry reloads', async (handler) => {
    await render(<TrackingMap url={URL} />)
    await act(async () => map().props[handler]())
    expect(screen.getByText("Couldn't load the live map.")).toBeTruthy()
    expect(screen.queryByText('Loading live map…')).toBeNull()
    await fireEvent.press(screen.getByTestId('tracking-map-retry'))
    expect(screen.queryByText("Couldn't load the live map.")).toBeNull()
    expect(screen.getByText('Loading live map…')).toBeTruthy()
  })

  it('shows the error when nothing loads within 20 seconds', async () => {
    jest.useFakeTimers()
    await render(<TrackingMap url={URL} />)
    await act(async () => void (await jest.advanceTimersByTimeAsync(20_000)))
    expect(screen.getByText("Couldn't load the live map.")).toBeTruthy()
    jest.useRealTimers()
  })

  it('does not time out once loaded', async () => {
    jest.useFakeTimers()
    await render(<TrackingMap url={URL} />)
    await act(async () => map().props.onLoadEnd())
    await act(async () => void (await jest.advanceTimersByTimeAsync(30_000)))
    expect(screen.queryByText("Couldn't load the live map.")).toBeNull()
    jest.useRealTimers()
  })

  it.each([
    ['https://other.test/x', true],
    ['http://other.test/x', false],
    ['intent://scan#Intent;scheme=zxing;end', false],
    ['market://details?id=x', false],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
  ])('navigation to %s allowed: %s', async (url, allowed) => {
    await render(<TrackingMap url={URL} />)
    expect(map().props.onShouldStartLoadWithRequest({ url })).toBe(allowed)
  })
})
