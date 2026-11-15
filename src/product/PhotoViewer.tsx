import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { color, space, type } from '@/ui/theme'

function Page({ url, label, width, height }: { url: string; label: string; width: number; height: number }) {
  const [failed, setFailed] = useState(false)
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {failed ? (
        <Text style={[type.body, { color: color.porcelain }]}>{"This photo couldn't be loaded."}</Text>
      ) : (
        <Image source={{ uri: url }} accessible={false} contentFit="contain" onError={() => setFailed(true)} style={{ width, height }} />
      )}
    </View>
  )
}

function Pager({ photos, start, author, onClose }: { photos: string[]; start: number; author: string; onClose: () => void }) {
  // Keyed by width: a rotation or window resize remounts the pager on the photo being viewed, so offsets never go stale.
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(start)
  return (
    <View testID="photo-viewer" accessibilityViewIsModal style={styles.screen}>
      <FlatList
        key={width}
        data={photos}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => <Page url={item} width={width} height={height} label={`Photo ${i + 1} of ${photos.length} from ${author}`} />}
      />
      <View style={[styles.top, { top: insets.top + space.sm }]}>
        {photos.length > 1 && (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.counter}>
            <Text style={[type.label, type.numeric, { color: color.paper }]}>{`${index + 1} / ${photos.length}`}</Text>
          </View>
        )}
        <Pressable testID="photo-viewer-close" accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={24} color={color.paper} />
        </Pressable>
      </View>
    </View>
  )
}

/** A full-screen viewer for one review's photos: swipe between them; the close button or Android back closes it. `start` is the photo to open on, null while closed. */
export function PhotoViewer({ start, ...rest }: { photos: string[]; start: number | null; author: string; onClose: () => void }) {
  return (
    <Modal visible={start !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={rest.onClose}>
      {start !== null && <Pager start={start} {...rest} />}
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.obsidian },
  top: { position: 'absolute', left: space.lg, right: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { paddingHorizontal: space.md, paddingVertical: space.xs, backgroundColor: 'rgba(22,17,19,0.6)' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,17,19,0.6)' },
})
