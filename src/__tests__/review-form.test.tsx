import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, Platform, type AlertButton } from 'react-native'

import { ApiError } from '@/lib/api'
import { UploadError } from '@/lib/imageUpload'
import { ReviewForm } from '../review/ReviewForm'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/api/reviews', () => ({ createReview: jest.fn(), updateReview: jest.fn(), notifyReviewsChanged: jest.fn() }))
jest.mock('@/lib/imageUpload', () => ({ ...jest.requireActual('@/lib/imageUpload'), pickImages: jest.fn(), uploadPhoto: jest.fn(), deleteUploaded: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/auth/session', () => ({ useSession: () => ({ signOut: mockSignOut }) }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (enabled: boolean, callback: (e: unknown) => void) => {
    mockPrevent.enabled = enabled
    mockPrevent.callback = callback
  },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }))
jest.mock('@/ui/toast', () => ({ useToast: () => mockToast }))
const mockToast = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockDispatch = jest.fn()
const mockPrevent: { enabled: boolean; callback: (e: unknown) => void } = { enabled: false, callback: () => {} }
const api = jest.requireMock('@/api/reviews')
const imageUpload = jest.requireMock('@/lib/imageUpload')
const mockPick: jest.Mock = imageUpload.pickImages
const mockUpload: jest.Mock = imageUpload.uploadPhoto
const mockDelete: jest.Mock = imageUpload.deleteUploaded
const { router } = jest.requireMock('expo-router')
let alertSpy: jest.SpyInstance

const base = { userId: 'u1', orderId: 'o1', productId: 'p1', productName: 'Linen Tee', onConflict: jest.fn() }
const saved = { id: 'r1', orderId: 'o1', productId: 'p1', rating: 4, comment: 'Soft and true to size.', photos: ['https://x/reviews/u1/a.jpg', 'https://x/reviews/u1/b.jpg'], skus: ['S1'], createdAt: '2026-11-01T00:00:00.000Z' }
const LONG = 'Fits well and feels great.'
const photo = (n: number, over = {}) => ({ uri: `file:///c/${n}.jpg`, name: `${n}.jpg`, ext: 'jpg', type: 'image/jpeg', size: 1000, ...over })
const sheetGone = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) }) // Android waits for the sheet's fade before opening a picker
const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  })

const rate = (n: number) => fireEvent.press(screen.getByTestId(`review-star-${n}`))
const write = (text: string) => fireEvent.changeText(screen.getByTestId('review-text'), text)
const addPhotos = async (...photos: ReturnType<typeof photo>[]) => {
  mockPick.mockResolvedValueOnce({ status: 'picked', photos })
  await fireEvent.press(screen.getByTestId('review-add-photo'))
  await fireEvent.press(screen.getByTestId('photo-library'))
  await sheetGone()
  await flush()
}
const submit = () => fireEvent.press(screen.getByTestId('review-submit'))
const fill = async () => {
  await rate(5)
  await write(LONG)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.replaceProperty(Platform, 'OS', 'android')
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  mockPrevent.enabled = false
  mockUpload.mockImplementation(async (p: { uri: string }) => `https://x/reviews/u1/${p.uri.split('/').pop()}`)
  api.createReview.mockResolvedValue(undefined)
  api.updateReview.mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('writing a review', () => {
  it('names the product and starts empty, with 44px stars as a radio group', async () => {
    await render(<ReviewForm {...base} />)
    expect(screen.getByText('Write A Review')).toBeTruthy()
    expect(screen.getByTestId('review-product')).toHaveTextContent('Linen Tee')
    expect(screen.getByTestId('review-rating').props.accessibilityRole).toBe('radiogroup')
    const star = screen.getByTestId('review-star-3')
    expect(star.props.accessibilityRole).toBe('radio')
    expect(star.props.accessibilityLabel).toBe('3 stars')
    expect(screen.getByTestId('review-star-1').props.accessibilityLabel).toBe('1 star')
    expect(screen.getByTestId('review-count')).toHaveTextContent('0/1000')
  })

  it('checks a star and counts characters as you type', async () => {
    await render(<ReviewForm {...base} />)
    await rate(4)
    expect(screen.getByTestId('review-star-4').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByTestId('review-star-5').props.accessibilityState).toMatchObject({ checked: false })
    await write('Great')
    expect(screen.getByTestId('review-count')).toHaveTextContent('5/1000')
    await write('x'.repeat(1200))
    expect(screen.getByTestId('review-count')).toHaveTextContent('1000/1000')
  })

  it('shows what is missing on submit and sends nothing', async () => {
    await render(<ReviewForm {...base} />)
    await submit()
    expect(screen.getByTestId('review-rating-error')).toHaveTextContent('Choose 1 to 5 stars.')
    expect(screen.getByText(/needs some text/)).toBeTruthy()
    expect(api.createReview).not.toHaveBeenCalled()
  })

  it('says a too short review is too short once the field is left', async () => {
    await render(<ReviewForm {...base} />)
    await write('Nice')
    await fireEvent(screen.getByTestId('review-text'), 'blur')
    expect(screen.getByText(/too short.*at least 10 characters/)).toBeTruthy()
  })

  it('says some words were hidden when the saved comment differs from what was sent', async () => {
    api.createReview.mockResolvedValue({ id: 'r1', comment: '****' + LONG.slice(4) })
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await flush()
    expect(mockToast).toHaveBeenCalledWith("Review posted. Some words were hidden because they aren't allowed. You can edit your review for 30 days.")
  })

  it('keeps the plain toast when the saved comment is unchanged', async () => {
    api.createReview.mockResolvedValue({ id: 'r1', comment: LONG })
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await flush()
    expect(mockToast).toHaveBeenCalledWith('Review posted')
  })

  it('posts a review without photos and leaves with a toast', async () => {
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await flush()
    expect(api.createReview).toHaveBeenCalledWith('o1', 'p1', { rating: 5, comment: LONG })
    expect(api.notifyReviewsChanged).toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Review posted')
    await waitFor(() => expect(router.back).toHaveBeenCalled())
  })

  it('holds the button while the request is pending, so a double tap posts once', async () => {
    let finish: () => void = () => {}
    api.createReview.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await submit()
    expect(api.createReview).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('review-submit').props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    expect(screen.getByTestId('review-text').props.editable).toBe(false)
    await act(async () => finish())
  })
})

describe('photos', () => {
  it('adds picked photos up to five and refuses the sixth, saying why', async () => {
    await render(<ReviewForm {...base} />)
    await addPhotos(photo(1), photo(2), photo(3), photo(4), photo(5))
    expect(screen.getByTestId('review-photo-5')).toBeTruthy()
    expect(screen.queryByTestId('review-add-photo')).toBeNull()
    await fireEvent.press(screen.getByTestId('review-photo-5-remove'))
    await addPhotos(photo(6), photo(7))
    expect(screen.getByTestId('review-photo-note')).toHaveTextContent(/7\.jpg wasn't added. A review holds 5 photos at most/)
  })

  it('asks the library for only the slots that are left', async () => {
    await render(<ReviewForm {...base} />)
    await addPhotos(photo(1), photo(2))
    mockPick.mockResolvedValueOnce({ status: 'cancelled' })
    await fireEvent.press(screen.getByTestId('review-add-photo'))
    await fireEvent.press(screen.getByTestId('photo-library'))
    await sheetGone()
    expect(mockPick).toHaveBeenLastCalledWith('library', { square: undefined, limit: 3 })
  })

  it('rejects a wrong type and an oversize photo with a specific message', async () => {
    await render(<ReviewForm {...base} />)
    await addPhotos(photo(1, { name: 'a.gif', ext: 'gif', type: 'image/gif' }), photo(2, { size: 9 * 1024 * 1024 }), photo(3))
    const notes = screen.getAllByTestId('review-photo-note')
    expect(notes[0]).toHaveTextContent(/a\.gif wasn't added\. Only JPG, PNG or WebP photos work/)
    expect(notes[1]).toHaveTextContent(/It is 9\.0 MB and the limit is 5 MB, so choose a smaller photo\./)
    expect(screen.getByTestId('review-photo-1')).toBeTruthy()
    expect(screen.queryByTestId('review-photo-2')).toBeNull()
  })

  it('labels each photo and its remove button for assistive tech, and removes one', async () => {
    await render(<ReviewForm {...base} />)
    await addPhotos(photo(1), photo(2))
    expect(screen.getByTestId('review-photo-2-remove').props.accessibilityLabel).toBe('Remove photo 2')
    await fireEvent.press(screen.getByTestId('review-photo-1-remove'))
    expect(screen.queryByTestId('review-photo-2')).toBeNull()
    expect(screen.getByTestId('review-add-photo').props.accessibilityLabel).toBe('Add photo, 1 of 5 added')
  })

  it('uploads each photo to the reviews bucket, shows its percent, then posts the public URLs', async () => {
    const reports: ((percent: number) => void)[] = []
    mockUpload.mockImplementation(async (p: { uri: string }, o: { onProgress: (n: number) => void }) => {
      reports.push(o.onProgress)
      return `https://x/reviews/u1/${p.uri.split('/').pop()}`
    })
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1), photo(2))
    await submit()
    await flush()
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///c/1.jpg' }), expect.objectContaining({ userId: 'u1', bucket: 'reviews' }))
    expect(api.createReview).toHaveBeenCalledWith('o1', 'p1', { rating: 5, comment: LONG, imageUrls: ['https://x/reviews/u1/1.jpg', 'https://x/reviews/u1/2.jpg'] })
    expect(reports).toHaveLength(2)
  })

  it('shows a per-photo percent while one uploads', async () => {
    let report: (n: number) => void = () => {}
    mockUpload.mockImplementation((_p: unknown, o: { onProgress: (n: number) => void }) => {
      report = o.onProgress
      return new Promise(() => {})
    })
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1), photo(2))
    await submit()
    await flush()
    await act(async () => report(37))
    expect(screen.getByTestId('review-photo-1-progress').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 37 })
    expect(screen.getByText('37%')).toBeTruthy()
    expect(screen.queryByTestId('review-photo-2-progress')).toBeNull()
    expect(screen.queryByTestId('review-photo-1-remove')).toBeNull() // controls are locked
    expect(screen.getByTestId('review-add-photo').props.accessibilityState.disabled).toBe(true)
  })

  it('keeps a failed photo in place, posts nothing, and a retry uploads only what failed', async () => {
    mockUpload.mockRejectedValueOnce(new UploadError('network'))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1), photo(2))
    await submit()
    await flush()
    expect(screen.getByTestId('review-photo-1-retry')).toBeTruthy()
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/connection dropped.*Your review wasn't posted/)
    expect(screen.getByTestId('review-submit')).toHaveTextContent('Retry Upload')
    expect(api.createReview).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByTestId('review-photo-1-retry'))
    await flush()
    expect(mockUpload).toHaveBeenCalledTimes(3) // 1 failed, then 1 and 2
    expect(api.createReview).toHaveBeenCalledWith('o1', 'p1', expect.objectContaining({ imageUrls: expect.any(Array) })) 
  })

  it('does not upload a photo twice when posting fails and is retried', async () => {
    api.createReview.mockRejectedValueOnce(new ApiError('network'))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/Can't reach the server.*Your text and photos are still here/)
    await submit()
    await flush()
    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(api.createReview).toHaveBeenCalledTimes(2)
  })

  it('cancels an upload in flight and keeps the form', async () => {
    mockUpload.mockImplementation(
      (_p: unknown, o: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => o.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))),
    )
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    await fireEvent.press(screen.getByTestId('review-cancel'))
    await flush()
    expect(mockToast).toHaveBeenCalledWith('Upload cancelled')
    expect(api.createReview).not.toHaveBeenCalled()
    expect(screen.getByTestId('review-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.queryByTestId('review-photo-1-retry')).toBeNull()
  })

  it('opens the camera permission explanation when the camera is refused', async () => {
    await render(<ReviewForm {...base} />)
    mockPick.mockResolvedValueOnce({ status: 'denied' })
    await fireEvent.press(screen.getByTestId('review-add-photo'))
    await fireEvent.press(screen.getByTestId('photo-camera'))
    await sheetGone()
    await flush()
    expect(alertSpy).toHaveBeenCalledWith('Camera access is off', expect.any(String), expect.any(Array))
  })
})

describe('server answers', () => {
  const failWith = async (failure: unknown) => {
    api.createReview.mockRejectedValueOnce(failure)
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await flush()
  }

  it('shows a 400 with what the server said', async () => {
    await failWith(new ApiError('validation', 'comment must be longer than 10 characters', 400))
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/The server said: comment must be longer than 10 characters\. Fix it, then try again\./)
  })

  it('signs out on a 401', async () => {
    await failWith(new ApiError('forbidden', undefined, 401))
    expect(mockToast).toHaveBeenCalledWith('Your session has expired. Sign in again.')
    expect(mockSignOut).toHaveBeenCalled()
  })

  it('keeps a 403 from moderation as its own message, not a sign-out', async () => {
    await failWith(new ApiError('forbidden', 'This review was removed by moderation.', 403))
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/This review was removed by moderation\./)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('switches to editing on a 409, with a toast saying so', async () => {
    await failWith(new ApiError('conflict', 'already reviewed', 409))
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/already reviewed this product.*edit it/))
    expect(base.onConflict).toHaveBeenCalled()
  })

  it('explains a 429 and a server failure', async () => {
    await failWith(new ApiError('rate-limit', undefined, 429))
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/Too many requests\. Wait a moment and try again\./)
    api.createReview.mockRejectedValueOnce(new ApiError('server', undefined, 500))
    await submit()
    await flush()
    expect(screen.getByTestId('review-banner')).toHaveTextContent(/The server had a problem\. Please try again\./)
  })
})

describe('editing a review', () => {
  it('opens pre-filled with the saved review and its photos, and Save waits for a change', async () => {
    await render(<ReviewForm {...base} review={saved} />)
    expect(screen.getByText('Edit Your Review')).toBeTruthy()
    expect(screen.getByTestId('review-star-4').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByTestId('review-text').props.value).toBe('Soft and true to size.')
    expect(screen.getByTestId('review-photo-2')).toBeTruthy()
    expect(screen.getByTestId('review-submit').props.accessibilityState.disabled).toBe(true)
    expect(mockPrevent.enabled).toBe(false)
  })

  it('says some words were hidden when the saved comment differs from what was sent', async () => {
    api.updateReview.mockResolvedValue({ id: 'r1', comment: '**** soft and true to size.' })
    await render(<ReviewForm {...base} review={saved} />)
    await fireEvent.press(screen.getByTestId('review-photo-1-remove'))
    await submit()
    await flush()
    expect(mockToast).toHaveBeenCalledWith("Review updated. Some words were hidden because they aren't allowed.")
  })

  it('sends the kept photos, drops a removed one, adds a new one, and deletes only the removed file once saved', async () => {
    await render(<ReviewForm {...base} review={saved} />)
    await fireEvent.press(screen.getByTestId('review-photo-1-remove'))
    await addPhotos(photo(9))
    await submit()
    await flush()
    expect(api.updateReview).toHaveBeenCalledWith('r1', { rating: 4, comment: 'Soft and true to size.', imageUrls: ['https://x/reviews/u1/b.jpg', 'https://x/reviews/u1/9.jpg'] })
    expect(api.createReview).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Review updated')
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith('https://x/reviews/u1/a.jpg', 'u1', 'reviews')
  })

  it('can remove every photo', async () => {
    await render(<ReviewForm {...base} review={saved} />)
    await fireEvent.press(screen.getByTestId('review-photo-1-remove'))
    await fireEvent.press(screen.getByTestId('review-photo-1-remove'))
    await submit()
    await flush()
    expect(api.updateReview).toHaveBeenCalledWith('r1', expect.objectContaining({ imageUrls: [] })) 
  })
})

describe('while the review is being sent', () => {
  let finish: () => void = () => {}
  let fail: (reason: unknown) => void = () => {}
  const hold = () => {
    api.createReview.mockReturnValue(
      new Promise<void>((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
    )
  }

  it('offers Cancel Upload while photos upload', async () => {
    mockUpload.mockImplementation(() => new Promise(() => {}))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    expect(screen.getByTestId('review-cancel')).toHaveTextContent('Cancel Upload')
  })

  it('has no Cancel once the save is sent, and sends the request without an abort signal', async () => {
    hold()
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    expect(api.createReview).toHaveBeenCalledTimes(1)
    expect(api.createReview.mock.calls[0]).toHaveLength(3)
    expect(screen.queryByTestId('review-cancel')).toBeNull()
    await act(async () => finish())
  })

  it('leaving mid-save neither aborts nor deletes the photos the saved review may use', async () => {
    hold()
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    await screen.unmount()
    expect(mockDelete).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(mockDelete).not.toHaveBeenCalled()
    expect(api.notifyReviewsChanged).toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Review posted')
  })

  it('leaving mid-save and then failing cleans the uploads up once, with no toast', async () => {
    hold()
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    await screen.unmount()
    await act(async () => fail(new ApiError('network')))
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith('https://x/reviews/u1/1.jpg', 'u1', 'reviews')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('leaving mid-upload aborts it and deletes what was already uploaded, with no toast', async () => {
    let signal: AbortSignal | undefined
    mockUpload.mockResolvedValueOnce('https://x/reviews/u1/1.jpg').mockImplementationOnce(
      (_p: unknown, o: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = o.signal
          o.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))
        }),
    )
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1), photo(2))
    await submit()
    await flush()
    await screen.unmount()
    await flush()
    expect(signal?.aborted).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith('https://x/reviews/u1/1.jpg', 'u1', 'reviews')
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('leaves only after the guard has been released, never in the same flush as the save', async () => {
    const seen: boolean[] = []
    router.back.mockImplementation(() => seen.push(mockPrevent.enabled))
    await render(<ReviewForm {...base} />)
    await fill()
    expect(mockPrevent.enabled).toBe(true)
    await submit()
    await flush()
    expect(mockPrevent.enabled).toBe(false)
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1))
    expect(seen).toEqual([false])
  })
})

describe('already reviewed (409)', () => {
  it('keeps the draft and the new photos, adds the saved photos, and switches to editing without deleting anything', async () => {
    api.createReview.mockRejectedValueOnce(new ApiError('conflict', 'already reviewed', 409))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    expect(base.onConflict).toHaveBeenCalled()
    await screen.rerender(<ReviewForm {...base} review={saved} />)
    expect(screen.getByText('Edit Your Review')).toBeTruthy()
    expect(screen.getByTestId('review-text').props.value).toBe(LONG)
    expect(screen.getByTestId('review-star-5').props.accessibilityState).toMatchObject({ checked: true })
    expect(screen.getByTestId('review-photo-3')).toBeTruthy() // the two saved photos first, then the one just uploaded
    expect(mockDelete).not.toHaveBeenCalled()
    await submit()
    await flush()
    expect(api.updateReview).toHaveBeenCalledWith('r1', { rating: 5, comment: LONG, imageUrls: ['https://x/reviews/u1/a.jpg', 'https://x/reviews/u1/b.jpg', 'https://x/reviews/u1/1.jpg'] })
    expect(mockUpload).toHaveBeenCalledTimes(1) // the new photo is not uploaded again
  })

  it('drops the surplus new photos (and deletes them) when the saved review leaves no room', async () => {
    api.createReview.mockRejectedValueOnce(new ApiError('conflict', 'already reviewed', 409))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1), photo(2), photo(3), photo(4))
    await submit()
    await flush()
    await screen.rerender(<ReviewForm {...base} review={saved} />)
    expect(screen.getByTestId('review-photo-5')).toBeTruthy()
    expect(mockDelete).toHaveBeenCalledWith('https://x/reviews/u1/4.jpg', 'u1', 'reviews')
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })
})

it('has no page-name label above the title (section labels stay)', async () => {
  await render(<ReviewForm {...base} />)
  expect(screen.queryByText('(Review)')).toBeNull()
  expect(screen.getByText('(Rating)')).toBeTruthy()
  expect(screen.getByText('(Photos)')).toBeTruthy()
})

describe('leaving', () => {
  it('guards back once something changed and confirms before discarding', async () => {
    await render(<ReviewForm {...base} />)
    expect(mockPrevent.enabled).toBe(false)
    await rate(3)
    expect(mockPrevent.enabled).toBe(true)
    const action = { type: 'GO_BACK' }
    mockPrevent.callback({ data: { action } })
    expect(alertSpy).toHaveBeenCalledWith('Discard changes?', expect.any(String), expect.any(Array))
    const buttons: AlertButton[] = alertSpy.mock.calls.at(-1)?.[2] ?? []
    expect(buttons.find((b) => b.text === 'Keep Editing')?.style).toBe('cancel')
    buttons.find((b) => b.text === 'Discard')?.onPress?.()
    expect(mockDispatch).toHaveBeenCalledWith(action)
  })

  it('lets go of the guard once the review is saved', async () => {
    await render(<ReviewForm {...base} />)
    await fill()
    await submit()
    await flush()
    expect(mockPrevent.enabled).toBe(false)
  })

  it('removes photos it uploaded for a review that was never saved', async () => {
    api.createReview.mockRejectedValueOnce(new ApiError('network'))
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    await screen.unmount()
    expect(mockDelete).toHaveBeenCalledWith('https://x/reviews/u1/1.jpg', 'u1', 'reviews')
  })

  it('keeps the uploads of a review that was saved', async () => {
    await render(<ReviewForm {...base} />)
    await fill()
    await addPhotos(photo(1))
    await submit()
    await flush()
    await screen.unmount()
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
