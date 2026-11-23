import * as ImagePicker from 'expo-image-picker'

import { supabase } from './supabase'

// Shared by the profile photo and review photos: pick, check, upload to Supabase Storage, clean up.
// The web app's rules: jpeg, png or webp up to 5 MB, stored as {userId}/{uuid}.{ext} in a public bucket the user writes to under their own folder.
export const AVATAR_BUCKET = 'avatars'
export const REVIEW_BUCKET = 'reviews'
export const CHAT_BUCKET = 'attachments'
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const QUALITY = 0.8
const UPLOAD_TIMEOUT_MS = 120_000

const TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const TYPE_OF_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** A picked image: where it is, what it is called, what it claims to be, and how big it is (null when the picker did not say). */
export type Photo = { uri: string; name: string; type: string; ext: string; size: number | null }

const extensionOf = (path: string | null | undefined) => path?.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? null

export function toPhoto(asset: ImagePicker.ImagePickerAsset): Photo {
  const name = asset.fileName ?? asset.uri.split('/').pop() ?? 'photo'
  // The file itself decides: iOS turns a HEIC into a JPEG while keeping its first name.
  const ext = extensionOf(asset.uri) ?? extensionOf(name) ?? ''
  return { uri: asset.uri, name, ext, type: asset.mimeType ?? TYPE_OF_EXTENSION[ext] ?? '', size: asset.fileSize ?? null }
}

/** Why a photo can't be used, or null. Checks the type and the extension (the server checks again) and the size. */
export function checkImage(photo: Photo): string | null {
  if (!TYPES.has(photo.type) || !EXTENSIONS.includes(photo.ext)) return `${photo.name} wasn't added. Only JPG, PNG or WebP photos work, so choose a different photo.`
  if (photo.size !== null && photo.size > IMAGE_MAX_BYTES) {
    return `${photo.name} wasn't added. It is ${(photo.size / 1024 / 1024).toFixed(1)} MB and the limit is 5 MB, so choose a smaller photo.`
  }
  return null
}

export type PickResult = { status: 'picked'; photos: Photo[] } | { status: 'cancelled' } | { status: 'denied' } | { status: 'failed' }

/**
 * Opens the camera or the library. `square` crops to 1:1 (a profile photo); `limit` lets the library return several (review photos).
 * Quality 0.8 compresses JPEGs. The library needs no permission (iOS and Android use the system picker); the camera asks first.
 */
export async function pickImages(source: 'camera' | 'library', { square = false, limit = 1 }: { square?: boolean; limit?: number } = {}): Promise<PickResult> {
  try {
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return { status: 'denied' }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: QUALITY }
    if (square) Object.assign(options, { allowsEditing: true, aspect: [1, 1] })
    else if (source === 'library' && limit > 1) Object.assign(options, { allowsMultipleSelection: true, selectionLimit: limit })
    const result = await (source === 'camera' ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options))
    return result.canceled ? { status: 'cancelled' } : { status: 'picked', photos: result.assets.map(toPhoto) }
  } catch {
    return { status: 'failed' }
  }
}

export type UploadErrorKind = 'unauthorized' | 'forbidden' | 'invalid' | 'rate-limit' | 'network' | 'server'
export class UploadError extends Error {
  constructor(readonly kind: UploadErrorKind) {
    super(`The photo upload failed (${kind}).`)
  }
}
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' })
export const isAbort = (failure: unknown) => failure instanceof Error && failure.name === 'AbortError'

const UPLOAD_KIND: Record<number, UploadErrorKind> = { 400: 'invalid', 401: 'unauthorized', 403: 'forbidden', 413: 'invalid', 415: 'invalid', 429: 'rate-limit' }

/** What happened, why and what to do, for a failed upload (a 401 is the caller's to handle: sign out). */
export function uploadErrorMessage(kind: UploadErrorKind): string {
  if (kind === 'network') return "We couldn't upload your photo. The connection dropped before it finished. Check your connection and try again."
  if (kind === 'rate-limit') return "We couldn't upload your photo. Our servers are limiting requests right now. Wait a minute, then try again."
  if (kind === 'forbidden') return "We couldn't upload your photo. Your account wasn't allowed to save it, which usually means your session has expired. Sign out, sign in again, then try again."
  if (kind === 'invalid') return "We couldn't upload your photo. The server didn't accept this file. Choose a JPG, PNG or WebP photo under 5 MB, then try again."
  return "We couldn't upload your photo. Something went wrong on our side. Try again in a moment."
}

// randomUUID, else getRandomValues, else Math.random as the last resort (the name is not a secret: the folder policy guards the bucket).
function uuid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 15) | 64
  b[8] = (b[8] & 63) | 128
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Uploads a photo to `bucket` as {userId}/{uuid}.{ext} and answers its public URL.
 * Sent as multipart FormData with the file's uri, which is the way React Native streams a file without loading it into memory
 * (supabase-js cannot upload a Blob from a file uri reliably here), over XMLHttpRequest because fetch cannot report upload progress.
 * An abort rejects with an AbortError.
 */
export async function uploadPhoto(photo: Photo, { userId, bucket, onProgress, signal }: { userId: string; bucket: string; onProgress?: (percent: number) => void; signal?: AbortSignal }): Promise<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (signal?.aborted) throw abortError()
  if (!token) throw new UploadError('unauthorized')
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL
  const path = `${userId}/${uuid()}.${TYPES.get(photo.type) ?? 'jpg'}`

  const form = new FormData()
  form.append('cacheControl', '31536000') // the name is random, so the file never changes
  form.append('file', { uri: photo.uri, name: path.split('/')[1], type: photo.type } as unknown as Blob)

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base}/storage/v1/object/${bucket}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.timeout = UPLOAD_TIMEOUT_MS
    let last = -1
    xhr.upload.onprogress = (event) => {
      const percent = event.lengthComputable ? Math.min(99, Math.round((event.loaded / event.total) * 100)) : last
      if (percent !== last) onProgress?.((last = percent)) // only whole-percent changes reach the screen
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      // Storage answers a policy rejection as HTTP 400 and puts the real code in the body, so read that first.
      let status = xhr.status
      try {
        status = Number((JSON.parse(xhr.responseText) as { statusCode?: string | number }).statusCode) || status
      } catch {
        // Not JSON; the HTTP status stands.
      }
      reject(new UploadError(UPLOAD_KIND[status] ?? 'server'))
    }
    xhr.onerror = () => reject(new UploadError('network'))
    xhr.ontimeout = () => reject(new UploadError('network'))
    xhr.onabort = () => reject(abortError())
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
  onProgress?.(100)
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

/** Deletes a photo this user uploaded earlier so replaced and abandoned ones do not pile up. Best effort: a failure only leaves an unused file. URLs outside the user's folder are ignored. */
export async function deleteUploaded(url: string, userId: string, bucket: string): Promise<void> {
  const marker = `/${bucket}/${userId}/`
  const at = url.indexOf(marker)
  if (at === -1) return
  try {
    await supabase.storage.from(bucket).remove([url.slice(at + bucket.length + 2).split('?')[0]])
  } catch {
    // The file stays in the bucket; nothing the user can act on.
  }
}
