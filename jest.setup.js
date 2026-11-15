// Button, rows and lists now go through PressableScale / PullToRefresh (reanimated + gesture-handler, which need native modules); tests render the plain equivalents.
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/PullToRefresh', () => ({ PullToRefresh: ({ refreshing, onRefresh, children }) => children({ refreshing, onRefresh }) }))

// The native calendar has no JS implementation under test: a plain View carrying the props, and an Android opener the test can inspect.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return { __esModule: true, default: (props) => React.createElement(View, props), DateTimePickerAndroid: { open: jest.fn() } }
})
