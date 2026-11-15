import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { PsgcError } from '@/api/psgc'
import { normalizePlace } from '@/lib/psgcMatch'
import { useRequest } from '@/lib/useRequest'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { color, font, radius, space, type } from '@/ui/theme'

const TARGET = 44
const SKELETONS = [0, 1, 2, 3, 4, 5]

type Item = { code: string; name: string }
type Props<T extends Item> = {
  testID: string
  label: string
  value: string
  error?: string
  disabled?: boolean
  /** Why it is disabled, shown in place of the value. */
  disabledHint?: string
  /** Names the list: a new key loads the new list. */
  loadKey: string
  load: (signal: AbortSignal) => Promise<T[]>
  onPick: (item: T) => void
}

const failureCopy = (failure: unknown) =>
  failure instanceof PsgcError && failure.kind === 'timeout'
    ? 'The list took too long to load. Check your connection and try again.'
    : failure instanceof PsgcError && failure.kind === 'server'
      ? 'The address list service had a problem. Try again in a moment.'
      : "Can't reach the address list. Check your connection and try again."

// A field that opens a searchable bottom sheet of PSGC places. The list loads when the sheet opens (the API layer caches it).
export function PlacePicker<T extends Item>({ testID, label, value, error, disabled, disabledHint, loadKey, load, onPick }: Props<T>) {
  const [open, setOpen] = useState(false)
  const tint = error ? color.red : color.stonewash
  return (
    <View style={styles.field}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || 'not chosen'}`}
        accessibilityHint={disabled ? disabledHint : 'Opens a searchable list'}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, { borderColor: tint }, disabled && styles.off, pressed && styles.pressed]}>
        <View style={styles.grow}>
          <Text style={type.small}>{label}</Text>
          <Text numberOfLines={1} style={[type.body, !value && styles.placeholder]}>{value || (disabled && disabledHint ? disabledHint : 'Choose')}</Text>
        </View>
        <Ionicons name="chevron-down" size={24} color={color.graphite} />
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={[styles.message, error ? styles.messageError : null]}>{error}</Text>
      {open && (
        <Sheet
          title={label}
          selected={value}
          testID={testID}
          loadKey={loadKey}
          load={load}
          onClose={() => setOpen(false)}
          onPick={(item) => {
            setOpen(false)
            onPick(item)
          }}
        />
      )}
    </View>
  )
}

type SheetProps<T extends Item> = { title: string; selected: string; testID: string; loadKey: string; load: (signal: AbortSignal) => Promise<T[]>; onClose: () => void; onPick: (item: T) => void }

function Sheet<T extends Item>({ title, selected, testID, loadKey, load, onClose, onPick }: SheetProps<T>) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const list = useRequest(loadKey, load)
  const [query, setQuery] = useState('')
  const wanted = normalizePlace(query)
  const shown = (list.data ?? []).filter((item) => !wanted || normalizePlace(item.name).includes(wanted))
  return (
    <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.scrim}>
        <Pressable accessible={false} importantForAccessibility="no" onPress={onClose} style={styles.grow} />
        <View testID={`${testID}-sheet`} accessibilityViewIsModal style={[styles.sheet, { height: height * 0.8, paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[type.h2, styles.grow]}>{`Choose ${title.toLowerCase()}`}</Text>
            <Pressable testID={`${testID}-close`} accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()} list`} onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={24} color={color.obsidian} />
            </Pressable>
          </View>
          {list.status === 'ready' && list.data!.length > 0 && (
            <TextInput
              testID={`${testID}-search`}
              accessibilityLabel={`Search ${title.toLowerCase()}`}
              placeholder="Search"
              placeholderTextColor={color.stonewash}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              maxLength={50}
              style={styles.search}
            />
          )}
          {list.status === 'loading' && (
            <View testID={`${testID}-loading`} accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.rows}>
              {SKELETONS.map((key) => <Skeleton key={key} height={TARGET} />)}
            </View>
          )}
          {list.status === 'error' && <StateMessage alert title="Couldn't load the list" message={failureCopy(list.error)} actionLabel="Retry" onAction={list.retry} testID={`${testID}-retry`} />}
          {list.status === 'ready' && list.data!.length === 0 && (
            <View testID={`${testID}-empty`} style={styles.rows}>
              <Text accessibilityRole="header" style={type.h2}>Nothing to choose here</Text>
              <Text style={styles.body}>This area has no entries in our list. Close this and check the area above, or try again later.</Text>
            </View>
          )}
          {list.status === 'ready' && list.data!.length > 0 && shown.length === 0 && (
            <View testID={`${testID}-no-match`} style={styles.rows}>
              <Text accessibilityRole="header" style={type.h2}>No match</Text>
              <Text style={styles.body}>{`Nothing matches "${query.trim()}". Check the spelling, or clear the search to see everything.`}</Text>
              <Button testID={`${testID}-clear`} variant="secondary" label="Clear Search" onPress={() => setQuery('')} />
            </View>
          )}
          {shown.length > 0 && (
            <FlatList
              data={shown}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const on = item.name === selected
                return (
                  <Pressable
                    testID={`${testID}-option-${item.code}`}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: on }}
                    onPress={() => onPick(item)}
                    style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}>
                    <Text style={[type.body, on && styles.rowTextOn]}>{item.name}</Text>
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  grow: { flex: 1 },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderRadius: radius.soft },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: color.porcelain },
  placeholder: { color: color.stonewash },
  message: { ...type.small, minHeight: 20 },
  messageError: { color: color.red },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22,17,19,0.5)' },
  sheet: { backgroundColor: color.paper, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  close: { width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center' },
  search: { ...type.body, minHeight: 48, paddingHorizontal: space.md, borderWidth: 1, borderColor: color.stonewash, borderRadius: radius.soft },
  rows: { gap: space.sm },
  body: { ...type.body, color: color.graphite },
  row: { minHeight: TARGET, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  rowOn: { backgroundColor: color.obsidian },
  rowTextOn: { color: color.paper, fontFamily: font.semibold },
})
