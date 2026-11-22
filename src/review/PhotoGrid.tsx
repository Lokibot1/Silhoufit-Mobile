import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { type Photo } from '@/lib/imageUpload'
import { REVIEW_LIMITS } from '@/lib/reviewValidation'
import { PressableScale } from '@/ui/PressableScale'
import { radius, space, themed, useTheme } from '@/ui/theme'

/** A photo of the review: one it already has (`remote` set, no `photo`) or a new one that uploads on submit. */
export type Tile = { id: string; uri: string; remote: string | null; photo: Photo | null; state: 'ready' | 'uploading' | 'failed'; percent: number }

function PhotoTile({ tile, n, size, locked, onRemove, onRetry }: { tile: Tile; n: number; size: number; locked: boolean; onRemove: () => void; onRetry: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const [broken, setBroken] = useState(false)
  return (
    <View testID={`review-photo-${n}`} style={[styles.tile, { width: size, height: size }, tile.state === 'failed' && styles.failed]}>
      {broken ? (
        <View accessible accessibilityLabel={`Photo ${n}`} style={styles.fill}>
          <Ionicons name="image-outline" size={24} color={color.stonewash} />
        </View>
      ) : (
        <Image source={{ uri: tile.uri }} accessibilityLabel={`Photo ${n}`} contentFit="cover" onError={() => setBroken(true)} style={styles.fill} />
      )}
      {tile.state === 'uploading' && (
        <View testID={`review-photo-${n}-progress`} accessible accessibilityRole="progressbar" accessibilityLabel={`Uploading photo ${n}`} accessibilityValue={{ min: 0, max: 100, now: tile.percent }} style={styles.overlay}>
          <Text style={[type.small, type.numeric, styles.overlayText]}>{`${tile.percent}%`}</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${tile.percent}%` }]} />
          </View>
        </View>
      )}
      {tile.state === 'failed' && (
        <PressableScale testID={`review-photo-${n}-retry`} accessibilityRole="button" accessibilityLabel={`Retry uploading photo ${n}`} onPress={onRetry} style={styles.overlay}>
          <Text style={[type.small, styles.overlayText]}>Failed</Text>
          <Text style={[type.small, styles.overlayText, styles.retry]}>Retry</Text>
        </PressableScale>
      )}
      {!locked && (
        <PressableScale testID={`review-photo-${n}-remove`} accessibilityRole="button" accessibilityLabel={`Remove photo ${n}`} onPress={onRemove} style={styles.remove}>
          <View style={styles.removeDot}>
            <Ionicons name="close" size={16} color={color.paper} />
          </View>
        </PressableScale>
      )}
    </View>
  )
}

/** The review's photos in a grid of three, with an add tile while there is room. */
export function PhotoGrid({ tiles, size, locked, onAdd, onRemove, onRetry }: { tiles: Tile[]; size: number; locked: boolean; onAdd: () => void; onRemove: (id: string) => void; onRetry: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  return (
    <View style={styles.grid}>
      {tiles.map((tile, i) => (
        <PhotoTile key={tile.id} tile={tile} n={i + 1} size={size} locked={locked} onRemove={() => onRemove(tile.id)} onRetry={onRetry} />
      ))}
      {tiles.length < REVIEW_LIMITS.photosMax && (
        <PressableScale
          testID="review-add-photo"
          accessibilityRole="button"
          accessibilityLabel={`Add photo, ${tiles.length} of ${REVIEW_LIMITS.photosMax} added`}
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={onAdd}
          style={[styles.tile, styles.add, { width: size, height: size }, locked && styles.locked]}>
          <Ionicons name="add" size={24} color={color.graphite} />
          <Text style={[type.small, type.numeric]}>{`${tiles.length}/${REVIEW_LIMITS.photosMax}`}</Text>
        </PressableScale>
      )}
    </View>
  )
}

const useStyles = themed(({ color }) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { borderRadius: radius.soft, overflow: 'hidden', backgroundColor: color.porcelain },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { borderWidth: 2, borderColor: color.red },
  add: { borderWidth: 1, borderColor: color.stonewash, borderStyle: 'dashed', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  locked: { opacity: 0.5 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22, 17, 19, 0.7)', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  overlayText: { color: color.onRed },
  retry: { textDecorationLine: 'underline' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: color.graphite },
  bar: { height: 4, backgroundColor: color.red },
  remove: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'flex-end', padding: space.xs },
  removeDot: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: color.obsidian, alignItems: 'center', justifyContent: 'center' },
}))
