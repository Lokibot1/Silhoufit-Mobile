import { checkImage, type Photo } from './imageUpload'

// The web app's review rules (SilhouFit/src/utils/reviewValidation.ts). Its profanity filter is left to the server.
export const REVIEW_LIMITS = { textMin: 10, textMax: 1000, photosMax: 5 } as const

export type ReviewErrors = { rating?: string; text?: string }

// Control characters other than the line break are what this removes, on purpose.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g

/** Live typing filter: no control characters, at most one blank line in a row, capped. Emoji and line breaks stay. */
export const filterReviewText = (input: string) =>
  input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, REVIEW_LIMITS.textMax)
    .replace(/[\uD800-\uDBFF]$/, '') // a cut can leave half an emoji

export function validateReview(values: { rating: number; text: string }): ReviewErrors {
  const errors: ReviewErrors = {}
  const { textMin, textMax } = REVIEW_LIMITS
  if (!Number.isInteger(values.rating) || values.rating < 1 || values.rating > 5) errors.rating = 'Choose 1 to 5 stars.'
  const text = values.text.trim()
  if (!text) errors.text = 'Enter a few words about your order. A review needs some text.'
  else if (text.length < textMin) errors.text = `Your review is too short. Use at least ${textMin} characters so it helps other shoppers.`
  else if (text.length > textMax) errors.text = `Your review is too long. It can be at most ${textMax} characters, so shorten it.`
  return errors
}

/** Why a chosen photo can't be added, or null. `held` is how many photos the review already has. */
export function checkReviewPhoto(photo: Photo, held: number): string | null {
  return checkImage(photo) ?? (held >= REVIEW_LIMITS.photosMax ? `${photo.name} wasn't added. A review holds ${REVIEW_LIMITS.photosMax} photos at most, so remove one first.` : null)
}
