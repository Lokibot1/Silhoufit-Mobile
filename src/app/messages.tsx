import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { AccessibilityInfo, ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchMessages, fetchMyConversation, markRead, MAX_MESSAGE_LENGTH, sendFailureCopy, sendMessage, subscribeToConversation, type Attachment, type ChatMessage } from '@/api/chat'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { dateTime } from '@/lib/format'
import { HeaderIcon } from '@/ui/HeaderIcon'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { font, radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

// The character count turns red for the last 100 characters.
const WARN_FROM = MAX_MESSAGE_LENGTH - 100
// failure is null while the message is on its way, else the copy explaining why it was not sent. retry is false when sending it again cannot work.
type Unsent = { content: string; failure: string | null; retry: boolean }
type Row = ChatMessage | { unsent: Unsent }
type Store = { owner: string | null; convId: string | null; messages: ChatMessage[] | null; error: unknown; unsent: Unsent | null; blocked: boolean; blockedReason: string | null }
const EMPTY: Store = { owner: null, convId: null, messages: null, error: null, unsent: null, blocked: false, blockedReason: null }

// Adds what is new by id (so the echo of our own POST and a refetch never double a message) and keeps oldest first.
function merge(current: ChatMessage[] | null, incoming: ChatMessage[]) {
  const known = new Set((current ?? []).map((message) => message.id))
  const fresh = incoming.filter((message) => !known.has(message.id))
  return fresh.length ? [...(current ?? []), ...fresh].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : (current ?? [])
}

// Adds what arrived and, if one of the NEW messages is mine with the same text as the unsent one, the send actually went through (the server
// saved it but the reply was lost): drop the unsent bubble so Retry cannot post a second copy. Heuristic limit: the server has no idempotency
// key, so identical text sent twice on purpose while the first one failed is taken as the same message.
function land(s: Store, incoming: ChatMessage[], uid: string): Partial<Store> {
  const known = new Set((s.messages ?? []).map((message) => message.id))
  const went = s.unsent && incoming.some((message) => !known.has(message.id) && message.senderId === uid && message.content === s.unsent?.content)
  return { messages: merge(s.messages, incoming), ...(went ? { unsent: null } : {}) }
}

// "Photo", "Photos", "Video"... for what a message carries, so an attachment-only message still reads as something.
function attachmentLabel(attachments: Attachment[]) {
  const videos = attachments.filter((a) => a.type === 'VIDEO').length
  const photos = attachments.length - videos
  return [photos && (photos > 1 ? 'Photos' : 'Photo'), videos && (videos > 1 ? 'Videos' : 'Video')].filter(Boolean).join(', ')
}

function Bubble({ message, mine, live }: { message: ChatMessage; mine: boolean; live: boolean }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const time = dateTime(message.createdAt)
  const kinds = attachmentLabel(message.attachments)
  const shown = message.content || kinds
  return (
    <View testID={`message-${message.id}`} accessible accessibilityLiveRegion={live ? 'polite' : 'none'} accessibilityLabel={`${mine ? 'You' : 'KRAL'}, ${message.content && kinds ? `${message.content}, ${kinds}` : shown}, ${time}`} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {!mine && <Text style={type.label}>KRAL</Text>}
      <Text style={[type.body, mine && { color: color.paper }]}>{shown}</Text>
      <Text style={[type.small, type.numeric, { color: mine ? color.porcelain : color.graphite }]}>{time}</Text>
    </View>
  )
}

function UnsentBubble({ unsent, onRetry, onDiscard }: { unsent: Unsent; onRetry: () => void; onDiscard: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  return (
    <View testID="message-unsent" style={styles.unsent}>
      <View accessible accessibilityLabel={`${unsent.failure === null ? 'Sending' : 'Not sent'}, ${unsent.content}`} style={[styles.bubble, styles.mine, unsent.failure === null && styles.sending]}>
        <Text style={[type.body, { color: color.paper }]}>{unsent.content}</Text>
        {unsent.failure === null && <Text style={[type.small, { color: color.porcelain }]}>Sending</Text>}
      </View>
      {unsent.failure !== null && (
        <View accessibilityRole="alert" style={styles.failure}>
          <Text style={[type.small, { color: color.graphite }]}>{unsent.failure}</Text>
          <View style={styles.failureActions}>
            {unsent.retry && <HeaderIcon testID="message-failed-retry" name="refresh" label="Retry sending message" onPress={onRetry} />}
            <HeaderIcon testID="message-failed-discard" name="trash-outline" label="Discard unsent message" onPress={onDiscard} />
          </View>
        </View>
      )}
    </View>
  )
}

// Same shape as the bubbles: alternating sides, so the swap to real messages does not jump.
function MessagesSkeleton() {
  const styles = useStyles()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeleton}>
      {[['flex-start', '60%', 72], ['flex-end', '45%', 48], ['flex-start', '70%', 96], ['flex-end', '50%', 48]].map(([side, width, height], key) => (
        <View key={key} style={{ alignSelf: side as 'flex-start' | 'flex-end', width: width as `${number}%` }}>
          <Skeleton height={height as number} />
        </View>
      ))}
    </View>
  )
}

// Customer chat with the store. Realtime is a bonus: every focus refetches, so a dead channel only costs the live delivery.
export default function MessagesScreen() {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { session, profile, loading } = useSession()
  const userId = session?.user.id ?? null
  const customer = profile?.role === 'customer'
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [store, setStore] = useState<Store>(EMPTY)
  // Everything fetched is tagged with its account, so another account never sees it (not even for one render).
  const mine = store.owner === userId ? store : EMPTY
  const { convId, messages, error, unsent, blocked: muted, blockedReason } = mine
  const [text, setText] = useState('')
  const [masked, setMasked] = useState(false)
  const [textOwner, setTextOwner] = useState(userId)
  if (textOwner !== userId) {
    setTextOwner(userId)
    setText('')
    setMasked(false)
  }
  const [top, setTop] = useState(0)
  const [keyboard, setKeyboard] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  // The newest staff message that arrived live, for the Android live region.
  const [liveId, setLiveId] = useState<string | null>(null)
  const wrap = useRef<ComponentRef<typeof View>>(null)
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const userRef = useRef(userId)
  const toastRef = useRef(toast)
  const loaded = useRef(false)
  const focused = useRef(false)
  const opening = useRef(false)
  const inFlight = useRef(false)
  const sending = useRef<AbortController | null>(null)
  const retrying = useRef<AbortController | null>(null)
  const latest = useRef<ChatMessage[] | null>(null)
  const announced = useRef(new Set<string>())
  useEffect(() => {
    userRef.current = userId
    toastRef.current = toast
    loaded.current = messages !== null
    latest.current = messages
  })
  useEffect(
    () => () => {
      sending.current?.abort()
      retrying.current?.abort()
    },
    [],
  )
  // Track the keyboard so the composer drops the safe-area padding while it is open (it sits right on the keys then).
  useEffect(() => {
    const [show, hide] = Platform.OS === 'ios' ? (['keyboardWillShow', 'keyboardWillHide'] as const) : (['keyboardDidShow', 'keyboardDidHide'] as const)
    const subs = [Keyboard.addListener(show, () => setKeyboard(true)), Keyboard.addListener(hide, () => setKeyboard(false))]
    return () => subs.forEach((sub) => sub.remove())
  }, [])

  const patch = useCallback((uid: string, change: (s: Store) => Partial<Store>) => {
    if (userRef.current !== uid) return
    setStore((s) => {
      const base = s.owner === uid ? s : { ...EMPTY, owner: uid }
      return { ...base, ...change(base) }
    })
  }, [])

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!userId) return
      try {
        const conversation = await fetchMyConversation(signal)
        const list = await fetchMessages(conversation.id, signal)
        if (signal.aborted) return
        patch(userId, (s) => ({ convId: conversation.id, ...land(s, list, userId), error: null, blocked: conversation.blocked, blockedReason: conversation.blockedReason }))
        if (focused.current) markRead(conversation.id)
      } catch (failure) {
        if (signal.aborted) return
        if (loaded.current) toastRef.current(errorMessage(failure))
        else patch(userId, () => ({ error: failure }))
      }
    },
    [userId, patch],
  )

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      opening.current = false
      if (!userId || !customer) return () => { focused.current = false }
      const ctl = new AbortController()
      void load(ctl.signal)
      return () => {
        focused.current = false
        ctl.abort()
      }
    }, [userId, customer, load]),
  )

  useEffect(() => {
    if (!userId || !convId) return
    const ctl = new AbortController()
    const stop = subscribeToConversation(
      convId,
      (message) => {
        patch(userId, (s) => land(s, [message], userId))
        if (message.senderId !== userId && focused.current) {
          markRead(convId)
          // Only a live message that is new: not the initial load, not a resync, not a repeat of the same broadcast.
          if (!announced.current.has(message.id) && !latest.current?.some((known) => known.id === message.id)) {
            announced.current.add(message.id)
            setLiveId(message.id)
            if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`KRAL said: ${message.content || attachmentLabel(message.attachments)}`)
          }
        }
      },
      // Each SUBSCRIBED (first or after a reconnect) closes the gap in which a message could have been missed.
      (status) => {
        if (status === 'SUBSCRIBED') fetchMessages(convId, ctl.signal).then((list) => patch(userId, (s) => land(s, list, userId)), () => {})
      },
    )
    return () => {
      ctl.abort()
      stop()
    }
  }, [userId, convId, patch])

  const send = (content: string) => {
    if (!userId || inFlight.current) return
    inFlight.current = true
    setMasked(false)
    const ctl = (sending.current = new AbortController())
    patch(userId, () => ({ unsent: { content, failure: null, retry: true } }))
    sendMessage(content, ctl.signal)
      .then(
        (message) => {
          // The server masks profane words, so saved text that differs from what was sent means some were hidden.
          if (userRef.current === userId) setMasked(message.content !== content)
          patch(userId, (s) => ({ messages: merge(s.messages, [message]), unsent: null }))
        },
        (failure) => {
          // No unsent left means the echo already showed the message arrived.
          if (ctl.signal.aborted) return
          patch(userId, (s) => (s.unsent ? { unsent: { content, failure: sendFailureCopy(failure), retry: !(failure instanceof ApiError && failure.kind === 'validation') } } : {}))
          // A block that started after this screen loaded: reload the conversation so the composer shows it. A failed reload changes nothing.
          if (failure instanceof ApiError && failure.kind === 'forbidden') {
            fetchMyConversation(ctl.signal).then(
              (c) =>
                patch(userId, (s) => ({
                  blocked: c.blocked,
                  blockedReason: c.blockedReason,
                  // Signing in again cannot help a blocked customer, so say what actually happened.
                  ...(c.blocked && s.unsent ? { unsent: { ...s.unsent, failure: "Not sent. Your messaging is blocked, so this message can't be sent.", retry: false } } : {}),
                })),
              () => {},
            )
          }
        },
      )
      .finally(() => {
        inFlight.current = false
      })
  }
  const pending = unsent !== null && unsent.failure === null
  // A failed message stays until Retry or Discard, so a new one can never overwrite it.
  const blocked = unsent !== null || muted
  const empty = text.trim() === ''
  const submit = () => {
    if (blocked || empty || inFlight.current) return
    const content = text.trim()
    setText('')
    send(content)
  }
  const discard = () => {
    if (userId) patch(userId, () => ({ unsent: null }))
  }
  const retryLoad = () => {
    if (!userId) return
    retrying.current?.abort()
    const ctl = (retrying.current = new AbortController())
    patch(userId, () => ({ error: null }))
    void load(ctl.signal)
  }
  const signIn = () => {
    if (opening.current) return
    opening.current = true
    router.push('/sign-in')
  }

  const rows: Row[] = [...(unsent ? [{ unsent }] : []), ...[...(messages ?? [])].reverse()]
  const ready = userId !== null && messages !== null
  let content
  if (loading || (userId && !messages && !error)) content = <MessagesSkeleton />
  else if (!userId) {
    content = (
      <View style={styles.message}>
        <StateMessage title="Sign in to message the store" message="Ask the KRAL team about sizing, stock or your orders once you sign in." actionLabel="Sign In" onAction={signIn} testID="messages-sign-in" />
      </View>
    )
  } else if (!messages) {
    content = (
      <View style={styles.message}>
        <StateMessage alert title="Couldn't load your messages" message={errorMessage(error)} actionLabel="Retry" onAction={retryLoad} testID="messages-retry" />
      </View>
    )
  } else if (rows.length === 0) {
    content = (
      <View style={styles.message}>
        <StateMessage title="No messages yet" message="Write to the KRAL team and your conversation shows up here." actionLabel="Write a Message" onAction={() => input.current?.focus()} testID="messages-empty-action" />
      </View>
    )
  } else {
    content = (
      <FlatList
        testID="messages-list"
        inverted
        data={rows}
        keyExtractor={(row) => ('unsent' in row ? 'unsent' : row.id)}
        renderItem={({ item }) => ('unsent' in item ? <UnsentBubble unsent={muted ? { ...item.unsent, retry: false } : item.unsent} onRetry={() => send(item.unsent.content)} onDiscard={discard} /> : <Bubble message={item} mine={item.senderId === userId} live={item.id === liveId} />)}
        ItemSeparatorComponent={Gap}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
    )
  }

  return (
    <View ref={wrap} style={styles.screen} onLayout={() => wrap.current?.measureInWindow((_x, y) => setTop(y))}>
      {/* padding on both platforms: SDK 58 Android is always edge-to-edge, so the window no longer resizes for the keyboard. The offset is
          this view's own distance from the top of the window (status bar and header), which KeyboardAvoidingView cannot know. */}
      <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={top}>
        <View style={styles.screen}>{content}</View>
        {ready && muted && (
          <Text testID="messages-blocked-note" accessibilityRole="alert" style={[type.small, styles.note]}>
            {`Your messaging is blocked, so you can't send messages. You can still read replies.${blockedReason ? ` Reason: ${blockedReason}` : ''}`}
          </Text>
        )}
        {ready && masked && (
          <Text testID="messages-masked-note" accessibilityRole="alert" style={[type.small, styles.note]}>
            Some words were hidden. Repeated use of this language can lead to your messaging being blocked or your account banned.
          </Text>
        )}
        {ready && (
          <View style={[styles.composer, { paddingBottom: keyboard ? space.sm : Math.max(insets.bottom, space.sm) }]}>
            <View style={styles.field}>
              <TextInput
                ref={input}
                testID="messages-input"
                accessibilityLabel="Message"
                placeholder={muted ? 'Messaging is blocked' : 'Write a message'}
                placeholderTextColor={color.graphite}
                style={styles.input}
                value={text}
                onChangeText={(value) => {
                  setText(value)
                  setMasked(false)
                }}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                maxLength={MAX_MESSAGE_LENGTH}
                multiline
                editable={!muted}
              />
              {!muted && (inputFocused || text.length > 0) && <Text style={[type.small, type.numeric, styles.count, text.length >= WARN_FROM && styles.countWarn]}>{`${text.length}/${MAX_MESSAGE_LENGTH}`}</Text>}
            </View>
            <PressableScale
              testID="messages-send"
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: blocked || empty, busy: pending }}
              disabled={blocked || empty}
              onPress={submit}
              style={styles.send}>
              {pending ? <ActivityIndicator color={color.obsidian} /> : <Ionicons name="send" size={24} color={blocked || empty ? color.stonewash : color.redInk} />}
            </PressableScale>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

function Gap() {
  const styles = useStyles()
  return <View style={styles.gap} />
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  message: { padding: space.lg },
  list: { padding: space.lg },
  gap: { height: space.md },
  skeleton: { flex: 1, overflow: 'hidden', padding: space.lg, gap: space.md },
  bubble: { maxWidth: '85%', gap: space.xs, padding: space.md, borderRadius: radius.soft },
  mine: { alignSelf: 'flex-end', backgroundColor: color.obsidian },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.porcelain },
  sending: { opacity: 0.6 },
  unsent: { alignItems: 'flex-end', gap: space.sm },
  failureActions: { flexDirection: 'row', gap: space.sm },
  failure: { maxWidth: '85%', gap: space.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingTop: space.sm, paddingHorizontal: space.lg, borderTopWidth: 1, borderTopColor: color.porcelain, backgroundColor: color.paper },
  note: { padding: space.md, paddingHorizontal: space.lg, color: color.graphite, backgroundColor: color.porcelain },
  field: { flex: 1, gap: space.xs },
  input: { ...type.body, borderWidth: 1, borderColor: color.stonewash, borderRadius: radius.soft, minHeight: 48, maxHeight: 120, paddingHorizontal: space.md, paddingVertical: space.md, backgroundColor: color.paper },
  count: { alignSelf: 'flex-end', color: color.graphite },
  countWarn: { color: color.redInk, fontFamily: font.semibold },
  send: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
})
)
