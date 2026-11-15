import { Ionicons } from '@expo/vector-icons'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchCategoryMeasurements, MEASUREMENT_FIELDS, type MeasurementKey } from '@/api/sizeMeasurements'
import { ApiError, errorMessage } from '@/lib/api'
import { useRequest } from '@/lib/useRequest'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, radius, space, type } from '@/ui/theme'
import { buildSizeGuide, needsBaseRows, norm, type GuideRow, type GuideVariant } from './sizeGuide'

type Props = { visible: boolean; onClose: () => void; category: string | null; variants: GuideVariant[]; selected: string | null }

const LABEL = Object.fromEntries(MEASUREMENT_FIELDS.map(({ key, label }) => [key, label])) as Record<MeasurementKey, string>
const LINE = 24
const CARD_PAD = space.md
const cm = (n: number) => `${Number(n.toFixed(1))} cm`

// A card is padding, a 24px title line, a gap, then one 24px line per measurement; the skeleton uses the same sums so nothing shifts.
const cardHeight = (lines: number) => 2 * CARD_PAD + LINE + space.sm + lines * LINE

function Card({ row, columns, selected, category }: { row: GuideRow; columns: MeasurementKey[]; selected: boolean; category: string | null }) {
  const source = row.source === 'product' ? 'This piece' : row.source === 'base' ? `Standard${category ? ` for ${category}` : ''}` : ''
  const label = [
    `Size ${row.size}${selected ? ', selected' : ''}`,
    row.source === 'none' ? 'Not available' : columns.map((key) => `${LABEL[key]} ${row.values[key] === null ? 'not measured' : cm(row.values[key])}`).join(', '),
  ].join('. ')
  return (
    <View testID={`size-guide-row-${row.size}`} accessible accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.card, selected && styles.selected]}>
      <View style={styles.title}>
        <Text style={[type.body, styles.size]}>{`${row.size}${selected ? ' (Selected)' : ''}`}</Text>
        {source !== '' && <Text numberOfLines={1} style={[type.small, styles.source]}>{source}</Text>}
      </View>
      {row.source === 'none' ? (
        <Text style={[type.body, styles.muted]}>Not available</Text>
      ) : (
        columns.map((key) => (
          <View key={key} style={styles.line}>
            <Text style={[type.body, styles.grow]}>{LABEL[key]}</Text>
            <Text style={[type.body, type.numeric, styles.value]}>{row.values[key] === null ? '–' : cm(row.values[key])}</Text>
          </View>
        ))
      )}
    </View>
  )
}

function Content({ onClose, category, variants, selected }: Omit<Props, 'visible'>) {
  const base = !!category && needsBaseRows(variants)
  const { status, data, error, retry } = useRequest(`${category}|${base}`, (signal) => (base && category ? fetchCategoryMeasurements(category, signal) : Promise.resolve([])))
  // Nothing stored for the category (404) is not a failure: the guide is just unavailable.
  const failed = status === 'error' && !(error instanceof ApiError && error.kind === 'not-found')
  const guide = buildSizeGuide(category, variants, data ?? [])
  const available = guide.rows.some((row) => row.source !== 'none')

  if (status === 'loading') {
    const lines = guide.columns.length || 4
    return (
      <View testID="size-guide-loading" accessible accessibilityLabel="Loading size guide" accessibilityRole="progressbar" style={styles.stack}>
        {guide.rows.map((row) => <Skeleton key={row.size} height={cardHeight(lines)} />)}
      </View>
    )
  }
  if (failed && !available) {
    return <StateMessage alert title="Couldn't load the size guide" message={errorMessage(error)} actionLabel="Retry" onAction={retry} testID="size-guide-retry" />
  }
  if (!available) {
    return <StateMessage title="No size guide yet" message="This piece has no measurements yet. Check the description for sizing notes, or message the team." actionLabel="Close" onAction={onClose} testID="size-guide-empty-close" />
  }
  return (
    <View style={styles.stack}>
      <Text style={[type.body, styles.muted]}>Garment measurements in cm, taken flat across the garment.</Text>
      {failed && (
        <View testID="size-guide-failed" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{`The standard measurements didn't load. ${errorMessage(error)}`}</Text>
          <Button testID="size-guide-retry" variant="secondary" label="Retry" onPress={retry} />
        </View>
      )}
      {guide.rows.map((row) => <Card key={row.size} row={row} columns={guide.columns} category={category} selected={!!selected && norm(selected) === norm(row.size)} />)}
      {guide.rows.some((row) => row.source === 'product') && <Text style={[type.small, styles.muted]}>{`Rows marked "This piece" use this product's own measurements.`}</Text>}
    </View>
  )
}

/** A bottom sheet of garment measurements per size. The content mounts only while open, so nothing is fetched until it is asked for. */
export function SizeGuideSheet({ visible, onClose, ...rest }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable testID="size-guide-backdrop" accessible={false} importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View testID="size-guide" accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[type.h2, styles.grow]}>Size guide</Text>
            <PressableScale testID="size-guide-close" accessibilityRole="button" accessibilityLabel="Close size guide" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={24} color={color.obsidian} />
            </PressableScale>
          </View>
          <ScrollView contentContainerStyle={styles.body}>{visible && <Content onClose={onClose} {...rest} />}</ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  sheet: { maxHeight: '85%', backgroundColor: color.paper },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.xs, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg },
  stack: { gap: space.md },
  grow: { flex: 1 },
  muted: { color: color.graphite },
  card: { padding: CARD_PAD, gap: space.sm, borderRadius: radius.soft, borderWidth: 1, borderColor: color.porcelain },
  selected: { backgroundColor: color.porcelain, borderColor: color.obsidian },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: LINE },
  size: { fontFamily: font.semibold },
  source: { flexShrink: 1, color: color.graphite },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: LINE },
  value: { textAlign: 'right' },
  banner: { gap: space.md, padding: space.md, borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red },
})
