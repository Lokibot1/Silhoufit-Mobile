import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { FAQ, filterFaq, type FaqLink } from '@/faq/faqData'
import { openLegal } from '@/lib/site'
import { PressableScale } from '@/ui/PressableScale'
import { StateMessage } from '@/ui/StateMessage'
import { radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

// Static content: no loading or error state. Empty is a search with no match.
export default function Faq() {
  const styles = useStyles()
  const { color, type } = useTheme()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const opening = useRef(false)
  // A fast double tap must not push a screen twice; allow it again when this screen regains focus.
  useFocusEffect(useCallback(() => { opening.current = false }, []))
  const shown = filterFaq(FAQ, query)
  const term = query.trim()

  const follow = (to: FaqLink['to']) => {
    if (to === 'refund' || to === 'privacy') return openLegal(to).catch(() => toast("Couldn't open the page. Check your connection and try again."))
    if (opening.current) return
    opening.current = true
    if (to === 'orders') router.navigate('/orders')
    else router.push(to === 'body' ? '/profile/body' : '/sign-up')
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.search}>
        <Ionicons name="search" size={24} color={color.graphite} style={styles.searchIcon} />
        <TextInput
          testID="faq-search"
          accessibilityLabel="Search questions"
          placeholder="Search questions"
          placeholderTextColor={color.graphite}
          style={[styles.input, query !== '' && styles.inputClearable]}
          value={query}
          onChangeText={setQuery}
          maxLength={80}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query !== '' && (
          <PressableScale testID="faq-search-clear" accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
            <Ionicons name="close" size={24} color={color.obsidian} />
          </PressableScale>
        )}
      </View>
      <Text testID="faq-count" accessibilityLiveRegion="polite" style={[type.small, type.numeric, styles.count]}>
        {term ? `${shown.length} of ${FAQ.length} questions` : `${FAQ.length} questions`}
      </Text>

      {shown.length === 0 ? (
        <View testID="faq-empty">
          <StateMessage title={`No questions match "${term}"`} message="Check the spelling or try a shorter word." actionLabel="Clear Search" onAction={() => setQuery('')} testID="faq-empty-action" />
        </View>
      ) : (
        <View style={styles.card}>
          {shown.map((item, index) => {
            const expanded = open === item.id
            return (
              <View key={item.id} style={index > 0 && styles.divider}>
                <PressableScale
                  testID={`faq-item-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={item.question}
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : item.id)}
                  style={({ pressed }) => [styles.question, pressed && styles.pressed]}>
                  <Text style={[type.body, styles.grow]}>{item.question}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={24} color={color.graphite} />
                </PressableScale>
                {expanded && (
                  <View style={styles.answer}>
                    <Text style={[type.body, styles.muted]}>{item.answer}</Text>
                    {item.link && (
                      <PressableScale
                        testID={`faq-link-${item.id}`}
                        accessibilityRole="link"
                        accessibilityLabel={item.link.label}
                        onPress={() => follow(item.link!.to)}
                        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
                        <Text style={[type.body, styles.linkText]}>{item.link.label}</Text>
                      </PressableScale>
                    )}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}

const useStyles = themed(({ color, type, hairline }) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.paper },
  screen: { padding: space.lg, gap: space.md },
  grow: { flex: 1 },
  muted: { color: color.graphite },
  search: { justifyContent: 'center', borderRadius: radius.pill, backgroundColor: color.porcelain },
  searchIcon: { position: 'absolute', left: space.md },
  input: { ...type.body, color: color.obsidian, minHeight: 44, paddingVertical: space.sm, paddingLeft: 48, paddingRight: space.md },
  inputClearable: { paddingRight: 44 },
  clear: { position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { color: color.graphite },
  card: { borderRadius: radius.soft, overflow: 'hidden', ...hairline },
  divider: { borderTopWidth: 1, borderTopColor: color.porcelain },
  question: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.lg },
  pressed: { backgroundColor: color.porcelain },
  answer: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  link: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  linkText: { color: color.redInk, textDecorationLine: 'underline' },
}))
