import { Ionicons } from '@expo/vector-icons'
import { useRef, type ComponentRef } from 'react'
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Address } from '@/api/addresses'
import { Button } from '@/ui/Button'
import { PressableScale } from '@/ui/PressableScale'
import { color, font, radius, space, type } from '@/ui/theme'
import { useReduceMotion } from '@/ui/useReduceMotion'

import { addressLines } from './AddressLines'

const TARGET = 44
export const NO_PIN = 'Needs a map pin: edit it in Delivery Addresses'
export const hasPin = ({ latitude, longitude }: Address) => latitude !== null && longitude !== null

type Props = { visible: boolean; addresses: Address[]; selectedId: string | null; onSelect: (id: string) => void; onAdd: () => void; onClose: () => void }

// Pick where the order is delivered. A pinless address cannot be priced for delivery, so it is shown but disabled with the reason.
export function AddressSheet({ visible, addresses, selectedId, onSelect, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduceMotion = useReduceMotion()
  const title = useRef<ComponentRef<typeof Text>>(null)
  // The screen reader starts at the title, which announces what opened.
  const focusTitle = () => {
    const node = findNodeHandle(title.current)
    if (node) AccessibilityInfo.setAccessibilityFocus(node)
  }
  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} onShow={focusTitle}>
      <View style={styles.scrim}>
        <Pressable accessible={false} importantForAccessibility="no" onPress={onClose} style={styles.fill} />
        <View testID="address-sheet" style={[styles.sheet, { maxHeight: height * 0.85, paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.head}>
            <Text ref={title} accessible accessibilityRole="header" style={[type.h2, styles.grow]}>Choose delivery address</Text>
            <PressableScale testID="address-sheet-close" accessibilityRole="button" accessibilityLabel="Close address list" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={24} color={color.obsidian} />
            </PressableScale>
          </View>
          <ScrollView accessibilityRole="radiogroup" contentContainerStyle={styles.list}>
            {addresses.map((address) => {
              const pinned = hasPin(address)
              const selected = address.id === selectedId
              const lines = addressLines(address)
              return (
                <PressableScale
                  key={address.id}
                  testID={`address-option-${address.id}`}
                  accessibilityRole="radio"
                  accessibilityLabel={[address.recipientName, lines.street, lines.area, address.isDefault && 'Default', !pinned && NO_PIN].filter(Boolean).join(', ')}
                  accessibilityState={{ checked: selected, disabled: !pinned }}
                  disabled={!pinned}
                  onPress={() => onSelect(address.id)}
                  style={[styles.option, selected && styles.optionOn]}>
                  <View style={[styles.radio, selected && styles.radioOn, !pinned && styles.off]}>{selected && <View style={styles.dot} />}</View>
                  <View style={styles.grow}>
                    <Text style={styles.name}>{`${address.recipientName} | ${address.phone}`}</Text>
                    <Text style={styles.line}>{lines.street}</Text>
                    <Text style={styles.line}>{lines.area}</Text>
                    {address.isDefault && <Text style={styles.tag}>Default</Text>}
                    {!pinned && <Text style={styles.reason}>{NO_PIN}</Text>}
                  </View>
                </PressableScale>
              )
            })}
            <PressableScale testID="address-add" accessibilityRole="button" accessibilityLabel="Add New Address" onPress={onAdd} style={styles.option}>
              <Ionicons name="add" size={24} color={color.obsidian} />
              <Text style={styles.name}>Add New Address</Text>
            </PressableScale>
          </ScrollView>
          <Button testID="address-sheet-cancel" variant="secondary" label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.scrim },
  fill: { flex: 1 },
  sheet: { backgroundColor: color.paper, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  close: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  list: { gap: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TARGET, padding: space.md, borderWidth: 1, borderColor: color.porcelain, borderRadius: radius.soft },
  optionOn: { borderColor: color.obsidian },
  off: { opacity: 0.5 },
  radio: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: color.stonewash, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.red },
  dot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: color.red },
  name: { ...type.body, fontFamily: font.semibold },
  line: { ...type.small, color: color.graphite },
  tag: { ...type.small, ...type.numeric, color: color.red },
  reason: { ...type.small, color: color.red },
})
