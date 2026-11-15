import 'react-native-gesture-handler/jestSetup'
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { PagedTabs, SideScroll } from '../PagedTabs'
import { swipeTarget, tabIndex } from '../tabSwipe'

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() }, usePathname: () => '/orders' }))

describe('swipeTarget', () => {
  it('goes to the next tab on a long left drag and the previous on a right one', () => {
    expect(swipeTarget(-120, 0, 400, 2)).toBe(3)
    expect(swipeTarget(120, 0, 400, 2)).toBe(1)
  })
  it('goes on a fast flick even when short', () => {
    expect(swipeTarget(-40, -800, 400, 0)).toBe(1)
  })
  it('stays put on a short slow drag or a flick against the drag direction', () => {
    expect(swipeTarget(-60, -100, 400, 2)).toBeNull()
    expect(swipeTarget(-40, 800, 400, 2)).toBeNull()
  })
  it('does not wrap at the ends or from a non-tab path', () => {
    expect(swipeTarget(200, 0, 400, 0)).toBeNull()
    expect(swipeTarget(-200, 0, 400, 4)).toBeNull()
    expect(swipeTarget(-200, 0, 400, -1)).toBeNull()
  })
})

describe('tabIndex', () => {
  it('maps tab paths in bar order', () => {
    expect(['/', '/cart', '/orders', '/notifications', '/profile', '/(tabs)/cart', '/messages'].map(tabIndex)).toEqual([0, 1, 2, 3, 4, 1, -1])
  })
})

it('PagedTabs renders its content, including a SideScroll inside and outside it', async () => {
  await render(<GestureHandlerRootView><PagedTabs><Text>tab content</Text><SideScroll><Text>chips</Text></SideScroll></PagedTabs></GestureHandlerRootView>)
  expect(screen.getByText('tab content')).toBeTruthy()
  expect(screen.getByText('chips')).toBeTruthy()
  await render(<GestureHandlerRootView><SideScroll><Text>alone</Text></SideScroll></GestureHandlerRootView>)
  expect(screen.getByText('alone')).toBeTruthy()
})
