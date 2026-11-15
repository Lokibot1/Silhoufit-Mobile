import { checkReviewPhoto, filterReviewText, REVIEW_LIMITS, validateReview } from '../reviewValidation'

jest.mock('@/lib/supabase', () => ({ supabase: {} }))

const photo = { uri: 'file:///a.jpg', name: 'a.jpg', ext: 'jpg', type: 'image/jpeg', size: 1000 }

describe('validateReview', () => {
  it('needs a rating from 1 to 5', () => {
    expect(validateReview({ rating: 0, text: 'Fits really well.' }).rating).toBe('Choose 1 to 5 stars.')
    expect(validateReview({ rating: 6, text: 'Fits really well.' }).rating).toBeDefined()
    expect(validateReview({ rating: 3, text: 'Fits really well.' })).toEqual({})
  })
  it('needs 10 to 1000 characters of text, trimmed', () => {
    expect(validateReview({ rating: 5, text: '   ' }).text).toMatch(/needs some text/)
    expect(validateReview({ rating: 5, text: '  too short ' }).text).toMatch(/at least 10 characters/)
    expect(validateReview({ rating: 5, text: 'x'.repeat(10) }).text).toBeUndefined()
    expect(validateReview({ rating: 5, text: 'x'.repeat(1000) }).text).toBeUndefined()
    expect(validateReview({ rating: 5, text: 'x'.repeat(1001) }).text).toMatch(/at most 1000 characters/)
  })
})

describe('filterReviewText', () => {
  it('keeps emoji and line breaks, drops control characters and long blank runs', () => {
    expect(filterReviewText('Love it 😀\u0007\r\n\n\n\nok')).toBe('Love it 😀\n\nok')
  })
  it('caps at 1000 without leaving half an emoji', () => {
    expect(filterReviewText('x'.repeat(999) + '😀')).toBe('x'.repeat(999))
    expect(filterReviewText('x'.repeat(1200))).toHaveLength(REVIEW_LIMITS.textMax)
  })
})

describe('checkReviewPhoto', () => {
  it('checks the image first, then the count', () => {
    expect(checkReviewPhoto({ ...photo, type: 'image/gif' }, 0)).toMatch(/Only JPG, PNG or WebP/)
    expect(checkReviewPhoto(photo, 4)).toBeNull()
    expect(checkReviewPhoto(photo, 5)).toBe("a.jpg wasn't added. A review holds 5 photos at most, so remove one first.")
  })
})
