import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { ReverseGeocodeError, searchPlaces, type PlaceHit } from '@/api/reverseGeocode'
import { Button } from '@/ui/Button'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { FloatingField } from '@/ui/FloatingField'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { color, space, type } from '@/ui/theme'

const TARGET = 44
const MIN_QUERY = 3
const MAX_QUERY = 100

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; query: string; hits: PlaceHit[] } | { status: 'chosen'; label: string }

const failureCopy = (failure: unknown) =>
  failure instanceof ReverseGeocodeError && failure.kind === 'timeout'
    ? 'The place search took too long to answer. Check your connection and try again.'
    : failure instanceof ReverseGeocodeError && failure.kind === 'server'
      ? 'The place search service had a problem. Try again in a moment, or tap the map instead.'
      : "Can't reach the place search. Check your connection and try again, or tap the map instead."

// A way to set the pin without the map (screen readers, denied location). It searches only when asked, never while typing, to stay inside OpenStreetMap's usage policy.
export function PinSearch({ onPick, disabled }: { onPick: (lat: number, lon: number) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  const typed = query.trim()
  const tooShort = typed.length < MIN_QUERY

  async function search() {
    if (tooShort || disabled) return
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    setState({ status: 'loading' })
    try {
      const hits = await searchPlaces(typed, controller.signal)
      if (!controller.signal.aborted) setState({ status: 'done', query: typed, hits })
    } catch (failure) {
      if (!controller.signal.aborted) setState({ status: 'error', message: failureCopy(failure) })
    }
  }

  return (
    <View style={styles.group}>
      <FloatingField
        testID="pin-search"
        label="Find on map"
        value={query}
        onChangeText={(text) => setQuery(text.slice(0, MAX_QUERY))}
        helper="Type a street, barangay or landmark, then search."
        editable={!disabled}
        autoCorrect={false}
        returnKeyType="search"
        maxLength={MAX_QUERY}
        onSubmitEditing={() => void search()}
      />
      <Button testID="pin-search-go" variant="secondary" label="Search Places" pending={state.status === 'loading'} disabled={tooShort || disabled} onPress={() => void search()} />
      {state.status === 'loading' && (
        <View testID="pin-search-loading" accessible accessibilityLabel="Searching" accessibilityRole="progressbar" style={styles.group}>
          {[0, 1, 2].map((key) => <Skeleton key={key} height={TARGET} />)}
        </View>
      )}
      {state.status === 'error' && (
        <View testID="pin-search-error" accessibilityRole="alert" style={styles.banner}>
          <Text style={type.body}>{state.message}</Text>
          <HeaderIcon testID="pin-search-retry" name="refresh" label="Retry" onPress={() => void search()} />
        </View>
      )}
      {state.status === 'done' && state.hits.length === 0 && (
        <Text testID="pin-search-empty" accessibilityLiveRegion="polite" style={styles.body}>{`No places in the Philippines match "${state.query}". Check the spelling, add the city, or tap the map.`}</Text>
      )}
      {state.status === 'done' && state.hits.map((hit, index) => (
        <PressableScale
          key={`${hit.lat},${hit.lon},${index}`}
          testID={`pin-search-result-${index}`}
          accessibilityRole="button"
          accessibilityLabel={hit.label}
          accessibilityHint="Moves the pin here"
          onPress={() => {
            setState({ status: 'chosen', label: hit.label })
            onPick(hit.lat, hit.lon)
          }}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Text numberOfLines={2} style={type.body}>{hit.label}</Text>
        </PressableScale>
      ))}
      {state.status === 'chosen' && <Text testID="pin-search-chosen" accessibilityLiveRegion="polite" style={type.small}>{`Pin moved to ${state.label}.`}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  body: { ...type.body, color: color.graphite },
  banner: { borderWidth: 1, borderColor: color.stonewash, borderLeftWidth: 4, borderLeftColor: color.red, padding: space.md, gap: space.md },
  row: { minHeight: TARGET, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  pressed: { backgroundColor: color.porcelain },
})
