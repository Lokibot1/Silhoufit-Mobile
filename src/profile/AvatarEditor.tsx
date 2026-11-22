import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'

import { updateMe, type Me } from '@/api/me'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { AVATAR_BUCKET, checkImage, deleteUploaded, isAbort, uploadErrorMessage, uploadPhoto, UploadError, type Photo } from '@/lib/imageUpload'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { PhotoSourceSheet, UploadProgress } from '@/ui/PhotoPicker'
import { PressableScale } from '@/ui/PressableScale'
import { radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const expired = (failure: unknown) => (failure instanceof UploadError && failure.kind === 'unauthorized') || (failure instanceof ApiError && failure.status === 401)

function failureCopy(failure: unknown): string {
  if (failure instanceof UploadError) return uploadErrorMessage(failure.kind)
  return `We couldn't save your photo. ${errorMessage(failure)}`
}

type Phase = 'uploading' | 'saving' | null

// The profile photo on Edit Profile: tap it for the sheet, the photo uploads at once and saves to the profile; the form's own Save is separate.
export function AvatarEditor({ me, disabled, onBusy }: { me: Me; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { update, signOut } = useSession()
  const toast = useToast()
  const [sheet, setSheet] = useState(false)
  const [phase, setPhase] = useState<Phase>(null)
  const [percent, setPercent] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const uploaded = useRef<{ photo: Photo; url: string } | null>(null) // kept so a retry after a failed save does not upload twice
  const name = me.fullName ?? `${me.firstName} ${me.lastName}`
  const busy = phase !== null

  const phaseNow = useRef<Phase>(null)
  const mounted = useRef(true)
  const setBoth = (next: Phase) => {
    phaseNow.current = next
    setPhase(next)
  }

  useEffect(() => onBusy(busy), [busy, onBusy])
  // Leaving stops an upload, but never a save already sent (it may land); a file that no save will use is deleted.
  useEffect(
    () => () => {
      mounted.current = false
      if (phaseNow.current === 'saving') return
      controller.current?.abort()
      if (uploaded.current) void deleteUploaded(uploaded.current.url, me.id, AVATAR_BUCKET)
    },
    [me.id],
  )

  async function run(work: (signal: AbortSignal) => Promise<Me>, done: string, retry: () => void) {
    if (controller.current) return
    const own = new AbortController()
    controller.current = own
    setProblem(null)
    try {
      const updated = await work(own.signal)
      update(updated)
      toast(done)
      // The file it replaced is no use to anyone now.
      if (me.avatarUrl && me.avatarUrl !== updated.avatarUrl) void deleteUploaded(me.avatarUrl, me.id, AVATAR_BUCKET)
    } catch (failure) {
      if (isAbort(failure)) toast('Photo upload cancelled')
      else if (expired(failure)) {
        toast('Your session has expired. Sign in again.')
        void signOut()
      } else toast(failureCopy(failure), { action: { label: 'Retry', onPress: retry } })
      // Nobody is left to press Retry: the uploaded file would stay behind.
      if (!mounted.current && uploaded.current) void deleteUploaded(uploaded.current.url, me.id, AVATAR_BUCKET)
    } finally {
      controller.current = null
      setBoth(null)
    }
  }

  function upload(photo: Photo) {
    if (controller.current) return
    // A new choice replaces an earlier upload whose save failed.
    if (uploaded.current && uploaded.current.photo !== photo) void deleteUploaded(uploaded.current.url, me.id, AVATAR_BUCKET)
    setPercent(0)
    setBoth('uploading')
    return run(
      async (signal) => {
        const url = uploaded.current?.photo === photo ? uploaded.current.url : await uploadPhoto(photo, { userId: me.id, bucket: AVATAR_BUCKET, onProgress: setPercent, signal })
        uploaded.current = { photo, url }
        setBoth('saving')
        const updated = await updateMe({ avatarUrl: `${url}?v=${Date.now()}` }, signal) // the version makes every screen load the new picture
        uploaded.current = null
        return updated
      },
      'Profile photo updated',
      () => void upload(photo),
    )
  }

  function remove() {
    if (controller.current) return
    setBoth('saving')
    return run((signal) => updateMe({ avatarUrl: null }, signal), 'Profile photo removed', () => void remove())
  }

  function picked([photo]: Photo[]) {
    const reason = photo && checkImage(photo)
    if (reason) return setProblem(reason)
    if (photo) void upload(photo)
  }

  const confirmRemove = () =>
    Alert.alert('Are you sure?', 'Your profile photo will be removed and your initials will show instead.', [
      { text: 'Keep Photo', style: 'cancel' },
      { text: 'Remove Photo', style: 'destructive', onPress: () => void remove() },
    ])

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PressableScale
          testID="avatar-edit"
          accessibilityRole="button"
          accessibilityLabel={me.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
          accessibilityHint="Opens the choices to take or pick a photo"
          accessibilityState={{ disabled: disabled || busy }}
          disabled={disabled || busy}
          onPress={() => setSheet(true)}
          style={styles.avatar}>
          <Avatar name={name} url={me.avatarUrl} />
          <View style={styles.badge}>
            <Ionicons name="camera" size={14} color={color.onRed} />
          </View>
        </PressableScale>
        <View style={styles.info}>
          {phase === 'uploading' && (
            <>
              <UploadProgress testID="avatar-progress" percent={percent} label="Uploading profile photo" />
              <Button testID="avatar-cancel" variant="secondary" label="Cancel Upload" onPress={() => controller.current?.abort()} />
            </>
          )}
          {phase === 'saving' && (
            <View testID="avatar-saving" accessible accessibilityRole="progressbar" accessibilityLabel="Saving profile photo" style={styles.row}>
              <ActivityIndicator color={color.obsidian} />
              <Text style={type.small}>Saving photo</Text>
            </View>
          )}
          {!busy && <Text style={type.small}>Tap your photo to change it. JPG, PNG or WebP, up to 5 MB.</Text>}
        </View>
      </View>
      {problem && (
        <View testID="avatar-problem" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{problem}</Text>
        </View>
      )}
      <PhotoSourceSheet visible={sheet} onClose={() => setSheet(false)} title="Profile photo" square onPhotos={picked} onRemove={me.avatarUrl ? confirmRemove : undefined} />
    </View>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 56, height: 56 },
  badge: { position: 'absolute', right: -space.xs, bottom: -space.xs, width: 24, height: 24, borderRadius: radius.pill, backgroundColor: color.red, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: space.sm },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md },
}))
