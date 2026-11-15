import { fireEvent, render, screen } from '@testing-library/react-native'

import TabsLayout from '../app/(tabs)/_layout'

const mockNavigate = jest.fn()
const mockEmit = jest.fn(() => ({ defaultPrevented: false }))
let mockPath = '/'
let mockOptions: Record<string, { title: string; tabBarButtonTestID: string; tabBarIcon: (p: object) => unknown }> = {}
let mockIndex = 0

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn(), usePathname: () => mockPath }))
jest.mock('expo-router/js-top-tabs', () => {
  const React = jest.requireActual('react')
  const Screen = ({ name, options }: { name: string; options: (typeof mockOptions)[string] }) => {
    mockOptions[name] = options
    return null
  }
  const TopTabs = ({ tabBar, children }: { tabBar: (p: object) => unknown; children: unknown }) => {
    React.Children.forEach(children, (c: { props: { name: string; options: (typeof mockOptions)[string] } }) => (mockOptions[c.props.name] = c.props.options))
    const routes = Object.keys(mockOptions).map((name) => ({ key: name, name }))
    const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: mockOptions[r.name] }]))
    return tabBar({ state: { index: mockIndex, routes }, descriptors, emitter: { emit: mockEmit }, navigateToTab: mockNavigate, insets: { top: 0, bottom: 0, left: 0, right: 0 } })
  }
  TopTabs.Screen = Screen
  return { TopTabs }
})
jest.mock('@/chat/useChatUnread', () => ({ useChatUnread: () => false }))
jest.mock('@/ui/useReduceMotion', () => ({ useReduceMotion: () => false }))
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

beforeEach(() => {
  mockOptions = {}
  mockPath = '/'
  mockIndex = 0
  jest.clearAllMocks()
})

it('renders the five tab buttons with their testIDs, in order', async () => {
  await render(<TabsLayout />)
  for (const id of ['tab-shop', 'tab-cart', 'tab-orders', 'tab-notifications', 'tab-profile']) expect(screen.getByTestId(id)).toBeTruthy()
  expect(screen.getAllByRole('button').map((b) => b.props.testID)).toEqual(['tab-shop', 'tab-cart', 'tab-orders', 'tab-notifications', 'tab-profile'])
})

it('marks the focused tab selected and switches through tabPress', async () => {
  mockIndex = 2
  await render(<TabsLayout />)
  expect(screen.getByTestId('tab-orders').props.accessibilityState).toEqual({ selected: true })
  await fireEvent.press(screen.getByTestId('tab-cart'))
  expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'cart' }))
  expect(mockNavigate).toHaveBeenCalledWith('cart')
})

it('shows the screen title in the header on the other tabs, and no title on the Shop', async () => {
  await render(<TabsLayout />)
  expect(screen.queryAllByRole('header')).toHaveLength(0)
  for (const [path, title] of [['/cart', 'Cart'], ['/orders', 'Orders'], ['/notifications', 'Notifications'], ['/profile', 'Profile']]) {
    mockPath = path
    await render(<TabsLayout />)
  await render(<TabsLayout />)
  expect(screen.queryByTestId('header-messages')).toBeNull()
  mockPath = '/cart'
  await render(<TabsLayout />)
  expect(screen.getByTestId('header-messages')).toBeTruthy()
})
