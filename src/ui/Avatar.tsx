import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { color, font } from './theme'

// The app's three avatar sizes: sm 32, md 40, lg 56.
const SIZES = { sm: 32, md: 40, lg: 56 }
const LETTER_SIZE = { sm: 14, md: 16, lg: 18 }
const BACKGROUNDS = [color.obsidian, color.graphite, color.red]

// First code point only if it is a letter (no split surrogate pairs, no emoji or digits).
function letter(s: string): string {
  const c = Array.from(s.trim())[0] ?? ''
  return /\p{L}/u.test(c) ? c : ''
}

export function initials(first: string, last: string): string {
  return (letter(first) + letter(last)).toUpperCase()
}

// Same name, same colour, always.
export function avatarColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return BACKGROUNDS[hash % BACKGROUNDS.length]
}

export function Avatar({ name, url, size = 'lg' }: { name: string; url: string | null; size?: keyof typeof SIZES }) {
  const box = { width: SIZES[size], height: SIZES[size] }
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const parts = name.trim().split(/\s+/)
  const letters = initials(parts[0], parts.length > 1 ? parts[parts.length - 1] : '')
  if (url && failedUrl !== url) {
    return (
      <Image
        source={{ uri: url }}
        accessible
        accessibilityLabel={`Profile photo of ${name}`}
        contentFit="cover"
        onError={() => setFailedUrl(url)}
        style={box}
      />
    )
  }
  return (
    <View accessible accessibilityLabel={letters ? `${name} initials` : `${name} profile`} style={[box, styles.center, { backgroundColor: avatarColor(name) }]}>
      {letters ? <Text style={[styles.letters, { fontSize: LETTER_SIZE[size] }]}>{letters}</Text> : <Ionicons name="person" size={SIZES[size] / 2} color={color.paper} />}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  letters: { fontFamily: font.semibold, fontSize: 18, color: color.paper },
})
