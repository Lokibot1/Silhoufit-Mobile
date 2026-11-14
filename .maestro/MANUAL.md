# Manual device checks

Not automatable with Maestro (or too flaky). Run on a real Android and iOS device before release.

- [ ] Airplane mode during sign-in: banner reads "Can't reach the sign-in service. Check your connection and try again." and the button re-enables. (Maestro's `setAirplaneMode` is Android only and unreliable on physical devices, so this is manual.)
- [ ] Emoji typed or pasted into Email and Password: inline "can't contain emoji" error, no crash (Hermes regex).
- [ ] Background the app for a while, foreground it: session still valid, token refreshed, no sign-in prompt.
- [ ] 320px-wide screen with the keyboard open: fields, errors, banner and Sign In button reachable by scrolling, no horizontal scroll.
- [ ] TalkBack and VoiceOver: field labels, inline errors (live region), banner (alert), the Show/Hide password label and the toast are announced.
- [ ] Rapid double-tap on Sign In: only one request is sent, the button shows busy/disabled.
- [ ] TalkBack and VoiceOver on Profile: the avatar reads "Profile photo of <name>" (or "<name> initials" when there is no photo).
- [ ] Airplane mode on a cold start while signed in: after the loader, Profile shows "Couldn't load your profile" with the reason, a Retry button and a Sign Out button; Retry works once the connection is back (testIDs `profile-retry`, `profile-sign-out`).
- [ ] Cold start while signed in, throttled network: the loader holds until the session is restored, and the Profile tab never flashes the "Sign in to see your profile" prompt or an empty frame before the name appears. (Flow 05 asserts the prompt is absent right after the loader, but a sub-second flash under the loader cannot be observed by Maestro.)
- [ ] Avatar fallback: with a profile whose avatar URL is broken or empty, Profile shows initials (first + last name), and a generic icon if there is no name; never a broken-image square.
- [ ] Profile skeleton while loading (slow network) matches the final layout with no jump when the name appears.
- [ ] Sign Out has no confirmation step (CLAUDE.md asks for confirmation on destructive actions); decide whether sign-out counts, then update flow 06.

## Shop
- [ ] Pull down on the Shop list: spinner shows, items refresh; with airplane mode on, a toast explains and the items stay.
- [ ] Scroll to the last page: each page appends without duplicates or a jump, and loading stops when there are no more pieces. (The "N PIECES" count matches.)
- [ ] Airplane mode on a cold start: Shop shows "Couldn't load the shop" with the reason and Retry (`shop-retry`); Retry works once back online.
- [ ] Airplane mode while page 2 loads: the loaded items stay and an inline "Couldn't load more pieces" row shows Retry (`shop-load-more-retry`); no endless retry loop.
- [ ] 320px-wide screen: two columns fit with no horizontal scroll; the skeleton cards match the real cards with no jump.
- [ ] Very long product names wrap to two lines then clip; prices stay right-aligned and never overlap the "Only N left" or rating text.
- [ ] A product with a broken or missing photo shows its name on a Porcelain tile, never a broken-image square.
- [ ] Typing quickly in the search field sends one request after you pause (about 300 ms); stale results never replace newer ones.
- [ ] TalkBack and VoiceOver: each card reads name, price, stock and rating; the search field, Clear search and Retry buttons are labelled.
- [ ] Slow network on a cold start: the six skeleton cards show (progressbar "Loading"), then real cards replace them with no layout shift.
- [ ] Remote product photos load and cache (expo-image); with the photo host blocked the card falls back to the name tile.
- [ ] Empty catalogue (no active products): Shop shows "No pieces yet" with a Refresh button (`shop-empty-action`); it cannot be automated without an empty backend.
- [ ] Scroll to load more (page 2+): data-dependent (needs more than 12 products), so not in Maestro. Check `shop-count` against the cards scrolled.
- [ ] Keyboard open while searching: the Clear search button stays tappable and the keyboard does not hide results you tap (`keyboardShouldPersistTaps`).
