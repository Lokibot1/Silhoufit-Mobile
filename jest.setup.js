// Button, rows and lists now go through PressableScale / PullToRefresh (reanimated + gesture-handler, which need native modules); tests render the plain equivalents.
jest.mock('@/ui/PressableScale', () => ({ PressableScale: jest.requireActual('react-native').Pressable }))
jest.mock('@/ui/PullToRefresh', () => ({ PullToRefresh: ({ refreshing, onRefresh, children }) => children({ refreshing, onRefresh }) }))
