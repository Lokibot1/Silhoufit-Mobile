import { Alert, Linking, StyleSheet, Text, View } from 'react-native'

import { pickImages, type Photo } from '@/lib/imageUpload'
import { ActionSheet } from './ActionSheet'
import { space, themed, useTheme } from './theme'
import { useToast } from './toast'

type Props = {
  visible: boolean
  onClose: () => void
  title: string
  /** Called with what the user picked; checking it is the caller's job. */
  onPhotos: (photos: Photo[]) => void
  /** Crop to a square (a profile photo). */
  square?: boolean
  /** How many photos the library may return. */
  limit?: number
  /** Adds "Remove Photo" to the sheet. */
  onRemove?: () => void
}

// Take Photo / Choose From Library / (Remove Photo) / Cancel. A refused camera permission explains itself and offers Settings.
export function PhotoSourceSheet({ visible, onClose, title, onPhotos, square, limit, onRemove }: Props) {
  const toast = useToast()
  async function pick(source: 'camera' | 'library') {
    const result = await pickImages(source, { square, limit })
    if (result.status === 'picked') onPhotos(result.photos)
    else if (result.status === 'denied') {
      Alert.alert('Camera access is off', 'SilhouFit needs the camera to take a photo. Turn on camera access in Settings, then try again, or choose a photo from your library instead.', [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => {}) },
      ])
    } else if (result.status === 'failed') toast(source === 'camera' ? "Couldn't open the camera. Try again, or choose a photo from your library." : "Couldn't open your photo library. Try again.")
  }
  return (
    <ActionSheet
      visible={visible}
      title={title}
      onClose={onClose}
      options={[
        { label: 'Take Photo', testID: 'photo-camera', onPress: () => void pick('camera') },
        { label: 'Choose From Library', testID: 'photo-library', onPress: () => void pick('library') },
        ...(onRemove ? [{ label: 'Remove Photo', testID: 'photo-remove', destructive: true, onPress: onRemove }] : []),
      ]}
    />
  )
}

// The bar and the percent for an upload.
export function UploadProgress({ percent, label, testID }: { percent: number; label: string; testID?: string }) {
  const styles = useStyles()
  const { type } = useTheme()
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={[type.small, type.numeric, styles.percent]}>{`${percent}%`}</Text>
    </View>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: { flex: 1, height: 8, backgroundColor: color.porcelain, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: color.red },
  percent: { width: 44, textAlign: 'right', color: color.graphite },
}))
