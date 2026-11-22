import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchBodyProfile, type BodyProfile } from '@/api/bodyProfile'
import { fetchProduct, type Product } from '@/api/products'
import { fetchCategoryMeasurements } from '@/api/sizeMeasurements'
import { useSession } from '@/auth/session'
import { ApiError, errorMessage } from '@/lib/api'
import { SPECS, type Entered } from '@/lib/bodyMeasurements'
import { openExternal } from '@/lib/site'
import { useRequest } from '@/lib/useRequest'
import { canTryOn } from '@/product/arGarment'
import { compareFit, recommendSize, type FitLevel, type FitRegion } from '@/product/arFit'
import { buildSizeGuide, needsBaseRows } from '@/product/sizeGuide'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { PressableScale } from '@/ui/PressableScale'
import { Skeleton } from '@/ui/Skeleton'
import { StateMessage } from '@/ui/StateMessage'
import { radius, space, themed, useTheme } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const TARGET = 44
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const REGIONS: FitRegion[] = ['chest', 'waist', 'shoulders', 'sleeve']
const REGION: Record<FitRegion, string> = { chest: 'Chest', waist: 'Waist', shoulders: 'Shoulders', sleeve: 'Sleeve' }
const LEVEL: Record<FitLevel, string> = { 'too-tight': 'Too tight', fitted: 'Fitted', regular: 'Regular fit', loose: 'Loose fit', oversized: 'Oversized' }
// Each band has its own icon as well as its words, so the fit never rests on colour.
const ICON: Record<FitLevel, keyof typeof Ionicons.glyphMap> = {
  'too-tight': 'alert-circle-outline',
  fitted: 'contract-outline',
  regular: 'checkmark-circle-outline',
  loose: 'expand-outline',
  oversized: 'add-circle-outline',
}
const BODY_FIELDS = ['chest', 'waist', 'shoulders', 'sleeve'] as const
const LINKS = { model: 'https://skfb.ly/ozHJJ', author: 'https://sketchfab.com/funlab117', licence: 'https://creativecommons.org/licenses/by/4.0/' }
const OPEN_FAILED = "Couldn't open the page. Check your connection and try again."

type Colour = { name: string; hex: string | null; imageUrl: string | null }

// The colours a product comes in, from its variants: the first hex and the first photo found for each name.
function coloursOf(variants: Product['variants']): Colour[] {
  const found = new Map<string, Colour>()
  for (const v of variants) {
    if (!v.color) continue
    const hex = v.colorHex && HEX.test(v.colorHex) ? v.colorHex : null
    const seen = found.get(v.color.toLowerCase())
    found.set(v.color.toLowerCase(), seen ? { ...seen, hex: seen.hex ?? hex, imageUrl: seen.imageUrl ?? v.imageUrl } : { name: v.color, hex, imageUrl: v.imageUrl })
  }
  return [...found.values()]
}

// Only the four measurements a shirt is compared on; a field never filled in is left out.
function enteredOf(profile: BodyProfile): Entered {
  const values = { chest: profile.chestCm, waist: profile.waistCm, shoulders: profile.shoulderWidthCm, sleeve: profile.armLengthCm }
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null))
}

const cm = (n: number) => String(Math.round(n * 10) / 10)

function Photo({ url, label, name }: { url: string | null; label: string; name: string }) {
  const styles = useStyles()
  const { height } = useWindowDimensions()
  const [failed, setFailed] = useState(false)
  return (
    <View testID="try-on-photo" accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.photo, { height: Math.min(360, height * 0.4) }]}>
      {url && !failed ? (
        <Image source={{ uri: url }} accessible={false} contentFit="contain" transition={200} onError={() => setFailed(true)} style={styles.fill} />
      ) : (
        <View style={[styles.fill, styles.center]}>
          <Text numberOfLines={3} style={styles.fallbackText}>{name}</Text>
        </View>
      )}
    </View>
  )
}

function FitSkeleton() {
  const styles = useStyles()
  return (
    <View testID="try-on-fit-loading" accessible accessibilityLabel="Loading your fit" accessibilityRole="progressbar" style={styles.stack}>
      <Skeleton width="60%" height={24} />
      <Skeleton height={20} />
      {REGIONS.map((region) => <Skeleton key={region} height={TARGET} />)}
    </View>
  )
}

function FitTable({ entered, fit }: { entered: Entered; fit: ReturnType<typeof compareFit> }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  return (
    <View testID="try-on-fit-table">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.tableRow}>
        <Text style={[type.small, styles.area]}>Area</Text>
        <Text style={[type.small, type.numeric, styles.num]}>Body cm</Text>
        <Text style={[type.small, type.numeric, styles.num]}>Garment cm</Text>
        <Text style={[type.small, styles.band]}>Fit</Text>
      </View>
      {REGIONS.map((region) => {
        const r = fit.regions[region]
        if (!r) return null
        const body = entered[region] ?? 0
        const garment = cm(body + r.easeCm) // ease is garment minus body, so this is the garment on the body's own basis
        return (
          <View
            key={region}
            testID={`try-on-fit-${region}`}
            accessible
            accessibilityLabel={`${REGION[region]}. Your body ${cm(body)} centimetres. Garment ${garment} centimetres. ${LEVEL[r.level]}.`}
            style={[styles.tableRow, styles.rule]}>
            <Text style={[type.body, styles.area]}>{REGION[region]}</Text>
            <Text style={[type.body, type.numeric, styles.num]}>{cm(body)}</Text>
            <Text style={[type.body, type.numeric, styles.num]}>{garment}</Text>
            <View style={styles.band}>
              <Ionicons name={ICON[r.level]} size={16} color={color.obsidian} />
              <Text style={[type.small, styles.bandText]}>{LEVEL[r.level]}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function Credit() {
  const styles = useStyles()
  const { type } = useTheme()
  const toast = useToast()
  const open = (url: string) => openExternal(url).catch(() => toast(OPEN_FAILED))
  const link = (testID: string, label: string, url: string) => (
    <Text testID={testID} accessibilityRole="link" accessibilityHint="Opens in your browser" onPress={() => open(url)} style={styles.link}>{label}</Text>
  )
  // Required by the CC BY 4.0 licence of the shirt model.
  return (
    <Text style={[type.small, styles.credit]}>
      {'3D shirt: “'}
      {link('try-on-credit-model', 'T Shirt', LINKS.model)}
      {'” by '}
      {link('try-on-credit-author', 'funlab117', LINKS.author)}
      {', licensed under '}
      {link('try-on-credit-licence', 'CC BY 4.0', LINKS.licence)}
      {', converted and rigged.'}
    </Text>
  )
}

function TryOnView({ product, preferred, onExpired }: { product: Product; preferred: string | undefined; onExpired: () => void }) {
  const styles = useStyles()
  const { color, type } = useTheme()
  const { category, variants } = product
  const [pickedSize, setPickedSize] = useState<string | null>(null)
  const [pickedColor, setPickedColor] = useState<string | null>(null)

  const base = !!category && needsBaseRows(variants)
  const sizesReq = useRequest(`${category}|${base}`, (signal) => (base && category ? fetchCategoryMeasurements(category, signal) : Promise.resolve([])))
  const profile = useRequest('body-profile', fetchBodyProfile)
  const expired = profile.error instanceof ApiError && profile.error.status === 401
  useEffect(() => {
    if (expired) onExpired()
  }, [expired, onExpired])

  // Nothing stored for the category (404) is not a failure: the sizes are just unavailable.
  const sizesFailed = sizesReq.status === 'error' && !(sizesReq.error instanceof ApiError && sizesReq.error.kind === 'not-found')
  const guide = buildSizeGuide(category, variants, sizesReq.data ?? [])
  const usable = guide.rows.filter((r) => r.source !== 'none')
  const entered = profile.data ? enteredOf(profile.data) : null
  const recommended = entered ? recommendSize(entered, usable) : null
  const row = usable.find((r) => r.size === pickedSize) ?? usable.find((r) => r.size === recommended) ?? usable[0]
  const size = row?.size
  const fit = entered && row ? compareFit(entered, row.values) : null
  const shown = fit ? REGIONS.filter((region) => fit.regions[region]) : []

  const colours = coloursOf(variants)
  const colour = colours.find((c) => c.name === pickedColor) ?? colours.find((c) => c.name.toLowerCase() === preferred?.toLowerCase()) ?? colours[0]
  const summary = size ? `Size ${size}${colour ? ` in ${colour.name}` : ''}${fit?.overall ? `: ${LEVEL[fit.overall].toLowerCase()}` : ''}` : ''
  const photo = colour?.imageUrl ?? product.images[0]?.url ?? null
  const profileLoading = profile.status === 'loading' || expired
  const noSizes = guide.rows.some((r) => r.source === 'none')

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Photo key={photo ?? 'none'} url={photo} name={product.name} label={`${product.name}${colour ? ` in ${colour.name}` : ''}`} />
      <View style={styles.block}>
        <Text accessibilityRole="header" style={type.h2}>{product.name}</Text>
        {summary !== '' && <Text testID="try-on-summary" accessibilityLiveRegion="polite" style={[type.body, type.numeric]}>{summary}</Text>}
      </View>

      <View testID="try-on-sizes" style={styles.block}>
        <Text accessibilityRole="header" style={type.label}>{`(Size)${size ? ` ${size}` : ''}`}</Text>
        {sizesReq.status === 'loading' ? (
          <View testID="try-on-sizes-loading" accessible accessibilityLabel="Loading sizes" accessibilityRole="progressbar" style={styles.row}>
            {[0, 1, 2].map((key) => <Skeleton key={key} width={TARGET} height={TARGET} />)}
          </View>
        ) : sizesFailed ? (
          <StateMessage alert title="Couldn't load the sizes" message={errorMessage(sizesReq.error)} actionLabel="Retry" onAction={sizesReq.retry} testID="try-on-sizes-retry" />
        ) : usable.length === 0 ? (
          <Text testID="try-on-sizes-empty" style={styles.muted}>This piece has no size measurements yet, so sizes are shown at standard fit.</Text>
        ) : (
          <>
            <View accessibilityRole="radiogroup" style={styles.row}>
              {guide.rows.map((r) => {
                const none = r.source === 'none'
                return <Chip tall radio key={r.size} testID={`try-on-size-${r.size}`} label={r.size} accessibilityLabel={none ? `Size ${r.size}, no measurements` : `Size ${r.size}`} selected={r.size === size} disabled={none} onPress={() => setPickedSize(r.size)} />
              })}
            </View>
            {noSizes && <Text testID="try-on-sizes-note" style={[type.small, styles.muted]}>Greyed-out sizes have no measurements yet, so they cannot be tried on.</Text>}
          </>
        )}
      </View>

      {colours.length > 0 && (
        <View testID="try-on-colours" style={styles.block}>
          <Text accessibilityRole="header" style={type.label}>{`(Colour)${colour ? ` ${colour.name}` : ''}`}</Text>
          <View accessibilityRole="radiogroup" style={styles.row}>
            {colours.map((c) => {
              const selected = c.name === colour?.name
              return (
                <PressableScale
                  key={c.name}
                  testID={`try-on-colour-${c.name}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`Colour ${c.name}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setPickedColor(c.name)}
                  style={[styles.option, selected && styles.optionOn]}>
                  {c.hex && <View style={[styles.swatch, { backgroundColor: c.hex }]} />}
                  <Text style={type.body}>{c.name}</Text>
                  {selected && <Ionicons name="checkmark" size={20} color={color.green} />}
                </PressableScale>
              )
            })}
          </View>
        </View>
      )}

      <View testID="try-on-fit" style={styles.block}>
        <Text accessibilityRole="header" style={type.label}>(Fit)</Text>
        {sizesReq.status === 'loading' || profileLoading ? (
          <FitSkeleton />
        ) : profile.status === 'error' ? (
          <StateMessage alert title="Couldn't load your measurements" message={errorMessage(profile.error)} actionLabel="Retry" onAction={profile.retry} testID="try-on-profile-retry" />
        ) : !row ? (
          <Text style={styles.muted}>Fit is shown once this piece has size measurements.</Text>
        ) : !entered ? (
          <StateMessage title="Add your measurements to see your fit" message="Your chest, waist, shoulder and sleeve measurements show how each size fits you." actionLabel="Add measurements" onAction={() => router.push('/profile/body')} testID="try-on-add" />
        ) : (
          <>
            {recommended && <Text testID="try-on-recommended" style={[type.body, type.numeric]}>{`Recommended size: ${recommended}`}</Text>}
            {shown.length === 0 ? (
              <Text testID="try-on-fit-empty" style={styles.muted}>Your saved measurements do not include a chest, waist, shoulder or sleeve value to compare with size {size}.</Text>
            ) : (
              <FitTable entered={entered} fit={fit!} />
            )}
          </>
        )}
      </View>

      <View testID="try-on-measurements" style={styles.block}>
        <Text accessibilityRole="header" style={type.label}>(Your Measurements)</Text>
        {profileLoading ? (
          <Skeleton height={BODY_FIELDS.length * 28} />
        ) : profile.status === 'error' ? (
          <Text style={styles.muted}>Your measurements did not load. Use Retry above.</Text>
        ) : entered ? (
          <>
            {BODY_FIELDS.map((field) => (
              <View key={field} accessible accessibilityLabel={`${SPECS[field].label} ${entered[field] === undefined ? 'not set' : `${cm(entered[field])} centimetres`}`} style={styles.line}>
                <Text style={[type.body, styles.grow]}>{SPECS[field].label}</Text>
                <Text style={[type.body, type.numeric, styles.value]}>{entered[field] === undefined ? 'Not set' : `${cm(entered[field])} cm`}</Text>
              </View>
            ))}
            <Button testID="try-on-edit" variant="secondary" label="Edit Measurements" onPress={() => router.push('/profile/body')} />
          </>
        ) : (
          <Text testID="try-on-measurements-empty" style={styles.muted}>You have not saved any measurements yet.</Text>
        )}
      </View>

      <View style={styles.block}>
        <Text testID="try-on-camera-note" style={[type.small, styles.muted]}>Live camera try-on is coming.</Text>
        <Credit />
      </View>
    </ScrollView>
  )
}

function ViewSkeleton() {
  const styles = useStyles()
  const { height } = useWindowDimensions()
  return (
    <View testID="try-on-loading" accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.scroll}>
      <Skeleton height={Math.min(360, height * 0.4)} />
      <View style={styles.block}>
        <Skeleton width="70%" height={24} />
        <Skeleton width="50%" height={24} />
      </View>
      <View style={styles.block}>
        <Skeleton width={80} height={20} />
        <View style={styles.row}>{[0, 1, 2].map((key) => <Skeleton key={key} width={TARGET} height={TARGET} />)}</View>
      </View>
    </View>
  )
}

// Needs a session (the product page gates its button too, so a signed-out visit is a deep link): without one it goes to sign-in.
export default function TryOnScreen() {
  const styles = useStyles()
  const { color } = useTheme()
  const toast = useToast()
  const { session, loading, signOut } = useSession()
  const { id: raw, color: colorParam } = useLocalSearchParams<{ id: string | string[]; color?: string | string[] }>()
  const id = typeof raw === 'string' ? raw.trim() : ''
  const preferred = typeof colorParam === 'string' ? colorParam : undefined
  const insets = useSafeAreaInsets()
  const leaving = useRef(false)
  const product = useRequest(id, (signal) => (id ? fetchProduct(id, signal) : Promise.reject(new ApiError('not-found'))))
  const gone = product.error instanceof ApiError && product.error.kind === 'not-found'

  useEffect(() => {
    if (loading || session || leaving.current) return
    leaving.current = true
    router.replace('/sign-in')
  }, [loading, session])

  // A 401 means the session is dead: sign out so the rest of the app agrees, then ask for a fresh sign-in.
  const expire = () => {
    if (leaving.current) return
    leaving.current = true
    toast('Your session has expired. Sign in again.')
    void signOut().finally(() => router.replace('/sign-in'))
  }
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/product/${id}`))
  const ready = product.data && canTryOn(product.data)

  return (
    <View style={styles.screen}>
      {/* A deep link or refresh has no screen to go back to, so the header arrow and the bar button fall back to the product page. */}
      <Stack.Screen
        options={{
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <PressableScale testID="try-on-header-back" accessibilityRole="button" accessibilityLabel="Back to product" onPress={goBack} style={styles.headerBack}>
                  <Ionicons name="chevron-back" size={24} color={color.obsidian} />
                </PressableScale>
              ),
        }}
      />
      {(loading || !session || product.status === 'loading') && <ViewSkeleton />}
      {!loading && !!session && product.status === 'error' && (
        <ScrollView contentContainerStyle={styles.message}>
          {gone ? (
            <StateMessage title="This piece is no longer available" message="It may have been removed from the shop. Head back to see what is in stock." actionLabel="Back to Shop" onAction={() => router.navigate('/')} testID="try-on-gone" />
          ) : (
            <StateMessage alert title="Couldn't load this piece" message={errorMessage(product.error)} actionLabel="Retry" onAction={product.retry} testID="try-on-retry" />
          )}
        </ScrollView>
      )}
      {!loading && !!session && product.data && !ready && (
        <ScrollView contentContainerStyle={styles.message}>
          <StateMessage title="AR try-on isn't available for this piece yet" message="Only some shirts have a 3D model so far. You can still check the sizes and measurements on the product page." actionLabel="Back to Product" onAction={goBack} testID="try-on-unavailable" />
        </ScrollView>
      )}
      {!loading && !!session && product.data && ready && (
        <>
          <TryOnView product={product.data} preferred={preferred} onExpired={expire} />
          <View style={[styles.bar, { paddingBottom: insets.bottom + space.sm }]}>
            <Button testID="try-on-back" label="Back to Product" onPress={goBack} />
          </View>
        </>
      )}
    </View>
  )
}

const useStyles = themed(({ color, type }) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xl },
  message: { padding: space.lg },
  fill: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  photo: { width: '100%', backgroundColor: color.porcelain },
  fallbackText: { ...type.label, textAlign: 'center' },
  block: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.sm, borderBottomWidth: 1, borderBottomColor: color.porcelain },
  stack: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  muted: { ...type.body, color: color.graphite },
  option: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.soft, borderWidth: 1, borderColor: color.porcelain },
  optionOn: { backgroundColor: color.mint, borderColor: color.green },
  swatch: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1, borderColor: color.stonewash },
  tableRow: { minHeight: TARGET, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { borderTopWidth: 1, borderTopColor: color.porcelain },
  area: { width: 80, textAlign: 'left' },
  num: { width: 64, textAlign: 'right' },
  band: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bandText: { flex: 1, textAlign: 'left', color: color.obsidian },
  line: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  value: { textAlign: 'right' },
  credit: { color: color.graphite },
  link: { color: color.obsidian, textDecorationLine: 'underline' },
  headerBack: { minHeight: TARGET, minWidth: TARGET, justifyContent: 'center' },
  bar: { paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.porcelain },
}))
