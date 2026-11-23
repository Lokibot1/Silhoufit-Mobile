import * as ImagePicker from 'expo-image-picker'

import { CHAT_BUCKET, checkImage, deleteUploaded, isAbort, pickImages, toPhoto, uploadPhoto, UploadError, uploadErrorMessage, type Photo } from '../imageUpload'

const mockSession = jest.fn()
const mockRemove = jest.fn()
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => mockSession() }, storage: { from: () => ({ remove: (paths: string[]) => mockRemove(paths) }) } } }))
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>

const photo = (over: Partial<Photo> = {}): Photo => ({ uri: 'file:///cache/a.jpg', name: 'a.jpg', ext: 'jpg', type: 'image/jpeg', size: 1000, ...over })
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('toPhoto', () => {
  it('reads the type from the picker, the extension from the file', () => {
    expect(toPhoto({ uri: 'file:///c/x.png', fileName: 'IMG_1.PNG', mimeType: 'image/png', fileSize: 12, width: 1, height: 1 })).toEqual({ uri: 'file:///c/x.png', name: 'IMG_1.PNG', ext: 'png', type: 'image/png', size: 12 })
  })
  it('lets a re-encoded file win over its original name (HEIC turned into JPEG)', () => {
    expect(toPhoto({ uri: 'file:///c/x.jpg', fileName: 'IMG_1.HEIC', mimeType: 'image/jpeg', width: 1, height: 1 })).toMatchObject({ ext: 'jpg', type: 'image/jpeg', size: null })
  })
  it('falls back to the extension for the type and to the uri for the name', () => {
    expect(toPhoto({ uri: 'file:///c/y.webp', width: 1, height: 1 })).toMatchObject({ name: 'y.webp', ext: 'webp', type: 'image/webp' })
  })
})

describe('checkImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(checkImage(photo({ type }))).toBeNull()
  })
  it('rejects another type with a specific message', () => {
    expect(checkImage(photo({ type: 'image/gif', name: 'a.gif', ext: 'gif' }))).toBe("a.gif wasn't added. Only JPG, PNG or WebP photos work, so choose a different photo.")
  })
  it('rejects a good type under a wrong extension, and a good extension under a wrong type', () => {
    expect(checkImage(photo({ ext: 'heic' }))).toMatch(/Only JPG, PNG or WebP/)
    expect(checkImage(photo({ type: 'application/pdf' }))).toMatch(/Only JPG, PNG or WebP/)
    expect(checkImage(photo({ type: '' }))).toMatch(/Only JPG, PNG or WebP/)
  })
  it('allows exactly 5 MB and rejects more, saying the size and what to do', () => {
    expect(checkImage(photo({ size: 5 * 1024 * 1024 }))).toBeNull()
    expect(checkImage(photo({ size: 6.5 * 1024 * 1024 }))).toBe("a.jpg wasn't added. It is 6.5 MB and the limit is 5 MB, so choose a smaller photo.")
  })
  it('lets an unknown size through (the server limits it too)', () => {
    expect(checkImage(photo({ size: null }))).toBeNull()
  })
})

describe('pickImages', () => {
  const asset = { uri: 'file:///c/a.jpg', width: 1, height: 1 }
  beforeEach(() => {
    jest.clearAllMocks()
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never)
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] } as never)
    picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as never)
  })

  it('crops a profile photo square at quality 0.8', async () => {
    const result = await pickImages('library', { square: true })
    expect(result.status).toBe('picked')
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] })
  })
  it('lets the library return several, up to the limit', async () => {
    await pickImages('library', { limit: 3 })
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 3 })
  })
  it('asks for the camera first and reports a refusal without opening it', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never)
    expect(await pickImages('camera')).toEqual({ status: 'denied' })
    expect(picker.launchCameraAsync).not.toHaveBeenCalled()
  })
  it('does not ask permission for the library', async () => {
    await pickImages('library')
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled()
  })
  it('reports a cancel and a crash instead of throwing', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null } as never)
    expect(await pickImages('library')).toEqual({ status: 'cancelled' })
    picker.launchCameraAsync.mockRejectedValueOnce(new Error('native'))
    expect(await pickImages('camera')).toEqual({ status: 'failed' })
  })
})

class FakeXhr {
  static last: FakeXhr
  headers: Record<string, string> = {}
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
  onload = () => {}
  onerror = () => {}
  onabort = () => {}
  ontimeout = () => {}
  timeout = 0
  status = 0
  responseText = ''
  method = ''
  url = ''
  body: unknown
  aborted = false
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.onabort()
  }
  finish(status: number, text = '') {
    this.status = status
    this.responseText = text
    this.onload()
  }
}

describe('uploadPhoto', () => {
  const opts = { userId: 'u1', bucket: 'avatars' }
  const originalXhr = globalThis.XMLHttpRequest
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    mockSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    globalThis.XMLHttpRequest = FakeXhr as never
  })
  afterAll(() => {
    globalThis.XMLHttpRequest = originalXhr
  })

  it('posts the file to the bucket under the user folder with a random name and answers its public URL', async () => {
    const onProgress = jest.fn()
    const promise = uploadPhoto(photo(), { ...opts, onProgress })
    await tick()
    const xhr = FakeXhr.last
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/avatars\/u1\/[0-9a-f-]{36}\.jpg$/)
    expect(xhr.headers).toMatchObject({ Authorization: 'Bearer tok', apikey: 'anon', 'x-upsert': 'false' })
    expect(xhr.headers['Content-Type']).toBeUndefined() // the multipart boundary is set by the platform
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.finish(200)
    expect(await promise).toBe(xhr.url.replace('/object/', '/object/public/'))
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([25, 100])
  })

  it('uploads chat photos into the attachments bucket under the user folder, and deleteUploaded cleans them there', async () => {
    const promise = uploadPhoto(photo(), { userId: 'u1', bucket: CHAT_BUCKET })
    await tick()
    const xhr = FakeXhr.last
    expect(CHAT_BUCKET).toBe('attachments')
    expect(xhr.url).toMatch(/\/object\/attachments\/u1\/[0-9a-f-]{36}\.jpg$/)
    xhr.finish(200)
    const url = await promise
    await deleteUploaded(url, 'u1', CHAT_BUCKET)
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^u1\/[0-9a-f-]{36}\.jpg$/)])
  })

  it('names every file differently', async () => {
    const urls: string[] = []
    for (let i = 0; i < 2; i += 1) {
      const promise = uploadPhoto(photo(), opts)
      await tick()
      urls.push(FakeXhr.last.url)
      FakeXhr.last.finish(200)
      await promise
    }
    expect(urls[0]).not.toBe(urls[1])
  })

  it.each([
    [400, '', 'invalid'],
    [413, '', 'invalid'],
    [429, '', 'rate-limit'],
    [500, '', 'server'],
    [400, '{"statusCode":"403","message":"new row violates row-level security policy"}', 'forbidden'],
    [403, '', 'forbidden'],
    [400, '{"statusCode":"401"}', 'unauthorized'],
  ])('maps HTTP %s %s to %s', async (status, text, kind) => {
    const promise = uploadPhoto(photo(), opts)
    await tick()
    FakeXhr.last.finish(status, text)
    await expect(promise).rejects.toMatchObject({ kind })
  })

  it('reports a dropped connection and a timeout as network', async () => {
    const promise = uploadPhoto(photo(), opts)
    await tick()
    FakeXhr.last.onerror()
    await expect(promise).rejects.toMatchObject({ kind: 'network' })
    const second = uploadPhoto(photo(), opts)
    await tick()
    expect(FakeXhr.last.timeout).toBeGreaterThan(0)
    FakeXhr.last.ontimeout()
    await expect(second).rejects.toMatchObject({ kind: 'network' })
  })

  it('aborts the request when the signal fires, and rejects with an AbortError', async () => {
    const controller = new AbortController()
    const promise = uploadPhoto(photo(), { ...opts, signal: controller.signal })
    await tick()
    controller.abort()
    expect(FakeXhr.last.aborted).toBe(true)
    await promise.then(
      () => {
        throw new Error('should have rejected')
      },
      (failure) => expect(isAbort(failure)).toBe(true),
    )
  })

  it('does not start when it is already aborted or there is no session', async () => {
    const controller = new AbortController()
    controller.abort()
    await uploadPhoto(photo(), { ...opts, signal: controller.signal }).then(
      () => {
        throw new Error('should have rejected')
      },
      (failure) => expect(isAbort(failure)).toBe(true),
    )
    mockSession.mockResolvedValue({ data: { session: null } })
    await expect(uploadPhoto(photo(), opts)).rejects.toBeInstanceOf(UploadError)
  })
})

describe('uploadPhoto details', () => {
  const originalXhr = globalThis.XMLHttpRequest
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    mockSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    globalThis.XMLHttpRequest = FakeXhr as never
  })
  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr
    jest.restoreAllMocks()
  })

  it('reports only whole-percent changes, and 100 only when it is done', async () => {
    const onProgress = jest.fn()
    const promise = uploadPhoto(photo(), { userId: 'u1', bucket: 'avatars', onProgress })
    await tick()
    const send = (loaded: number) => FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded, total: 1000 })
    ;[1, 2, 2, 3, 4, 999, 1000].forEach(send) // 0.1%, 0.2% ... all round to 0 or 100
    ;[10, 11, 11, 12].forEach((n) => send(n * 10))
    FakeXhr.last.finish(200)
    await promise
    const seen = onProgress.mock.calls.map(([p]) => p)
    expect(new Set(seen).size).toBe(seen.length) // never the same percent twice in a row
    expect(seen.at(-1)).toBe(100)
    expect(seen.slice(0, -1).every((p) => p <= 99)).toBe(true)
  })

  it('takes its random name from getRandomValues when randomUUID is missing', async () => {
    const getRandomValues = jest.fn((bytes: Uint8Array) => bytes.fill(0xab))
    jest.replaceProperty(globalThis, 'crypto', { getRandomValues } as never)
    const promise = uploadPhoto(photo(), { userId: 'u1', bucket: 'avatars' })
    await tick()
    expect(getRandomValues).toHaveBeenCalled()
    expect(FakeXhr.last.url).toMatch(/\/u1\/abababab-abab-4bab-abab-abababababab\.jpg$/)
    FakeXhr.last.finish(200)
    await promise
  })

  it('still names the file with neither crypto function', async () => {
    jest.replaceProperty(globalThis, 'crypto', undefined as never)
    const promise = uploadPhoto(photo(), { userId: 'u1', bucket: 'avatars' })
    await tick()
    expect(FakeXhr.last.url).toMatch(/\/u1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/)
    FakeXhr.last.finish(200)
    await promise
  })
})

describe('uploadErrorMessage', () => {
  it('says what happened and what to do, per kind', () => {
    expect(uploadErrorMessage('network')).toMatch(/Check your connection/)
    expect(uploadErrorMessage('invalid')).toMatch(/JPG, PNG or WebP photo under 5 MB/)
    expect(uploadErrorMessage('rate-limit')).toMatch(/Wait a minute/)
    expect(uploadErrorMessage('server')).toMatch(/Try again/)
    expect(uploadErrorMessage('forbidden')).toMatch(/session has expired.*sign in again/)
    expect(uploadErrorMessage('forbidden')).not.toMatch(/Choose a JPG/)
  })
})

describe('deleteUploaded', () => {
  beforeEach(() => jest.clearAllMocks())
  it("removes a file from the user's own folder, ignoring the version query", async () => {
    await deleteUploaded('https://x.supabase.co/storage/v1/object/public/avatars/u1/abc.jpg?v=3', 'u1', 'avatars')
    expect(mockRemove).toHaveBeenCalledWith(['u1/abc.jpg'])
  })
  it("leaves another user's file and a foreign URL alone", async () => {
    await deleteUploaded('https://x.supabase.co/storage/v1/object/public/avatars/u2/abc.jpg', 'u1', 'avatars')
    await deleteUploaded('https://cdn.test/a.jpg', 'u1', 'avatars')
    expect(mockRemove).not.toHaveBeenCalled()
  })
  it('swallows a failure', async () => {
    mockRemove.mockRejectedValueOnce(new Error('offline'))
    await expect(deleteUploaded('https://x/object/public/reviews/u1/a.png', 'u1', 'reviews')).resolves.toBeUndefined()
  })
})
