const mockStore: Record<string, string> = {}
const mockAsync = {
  multiGet: jest.fn((keys: string[]) => Promise.resolve(keys.map((k) => [k, mockStore[k] ?? null]))),
  setItem: jest.fn((key: string, value: string) => Promise.resolve((mockStore[key] = value, undefined))),
}
jest.mock('@react-native-async-storage/async-storage', () => mockAsync)

// The module keeps its switches in memory, so every case starts from a fresh copy.
const fresh = () => {
  let mod!: typeof import('../notificationPrefs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous load
  jest.isolateModules(() => { mod = require('../notificationPrefs') })
  return mod
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(mockStore)) delete mockStore[key]
})

it('has both switches on before anything is read', () => {
  const { popupsOn, soundOn } = fresh()
  expect([popupsOn(), soundOn()]).toEqual([true, true])
})

it('turns a switch off only for a stored "off"', async () => {
  mockStore['silhoufit-notify-popup'] = 'off'
  mockStore['silhoufit-notify-sound'] = 'on'
  const { loadNotificationPrefs, popupsOn, soundOn } = fresh()
  await loadNotificationPrefs()
  expect([popupsOn(), soundOn()]).toEqual([false, true])
})

it('keeps both on for "on" or nothing stored', async () => {
  mockStore['silhoufit-notify-popup'] = 'on'
  const { loadNotificationPrefs, popupsOn, soundOn } = fresh()
  await loadNotificationPrefs()
  expect([popupsOn(), soundOn()]).toEqual([true, true])
})

it('keeps both on when the read fails', async () => {
  mockAsync.multiGet.mockRejectedValueOnce(new Error('disk'))
  const { loadNotificationPrefs, popupsOn, soundOn } = fresh()
  await loadNotificationPrefs()
  expect([popupsOn(), soundOn()]).toEqual([true, true])
})

it('writes "off" and "on" and changes the getter at once', async () => {
  const { setNotificationPref, soundOn } = fresh()
  const done = setNotificationPref('sound', false)
  expect(soundOn()).toBe(false)
  await done
  expect(mockAsync.setItem).toHaveBeenCalledWith('silhoufit-notify-sound', 'off')
  await setNotificationPref('sound', true)
  expect(mockAsync.setItem).toHaveBeenCalledWith('silhoufit-notify-sound', 'on')
  expect(soundOn()).toBe(true)
})

it('still changes the switch when the write fails', async () => {
  mockAsync.setItem.mockRejectedValueOnce(new Error('disk'))
  const { setNotificationPref, popupsOn } = fresh()
  await setNotificationPref('popup', false)
  expect(popupsOn()).toBe(false)
})

it('keeps a switch changed before the stored value arrived', async () => {
  const { loadNotificationPrefs, setNotificationPref, popupsOn, soundOn } = fresh()
  const loading = loadNotificationPrefs()
  await setNotificationPref('popup', false)
  await loading
  expect([popupsOn(), soundOn()]).toEqual([false, true])
})

it('keeps both on when the storage module throws at once', async () => {
  mockAsync.multiGet.mockImplementationOnce(() => { throw new Error('native module missing') })
  const { loadNotificationPrefs, popupsOn, soundOn } = fresh()
  await expect(loadNotificationPrefs()).resolves.toBeUndefined()
  expect([popupsOn(), soundOn()]).toEqual([true, true])
})
