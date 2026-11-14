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

## Product page
- [ ] Swipe the gallery: it pages one photo at a time and the "1 / 4" counter follows. A single-photo product shows no counter; a product with no photos shows its name on a Porcelain tile.
- [ ] A product with a broken photo URL (or the photo host blocked) shows the name tile for that slide, never a broken-image square.
- [ ] 320px-wide screen: colour swatches and size chips wrap onto new lines, nothing scrolls sideways, a very long product name wraps, and the Add to Cart button clears the bottom edge/gesture bar.
- [ ] A size that is sold out for the chosen colour is dimmed and cannot be selected (TalkBack/VoiceOver read "Size L, unavailable"). Tapping a selected swatch or chip again clears it.
- [ ] Add more than the stock allows (needs a product whose stock you can exceed, or one already in the cart): the server's message shows inline above the button, with no toast.
- [ ] Airplane mode, then open a product: "Couldn't load this piece" with a Retry (`product-retry`); Retry works once back online.
- [ ] Deep link to a real product from a cold start (no history): the header Back and hardware back go to the Shop or close the app sensibly, never a blank screen or a loop. (The missing-product link is automated in flow 15.)
- [ ] Signed out: after signing in from Add to Cart the app returns to the same product by itself (no Back needed) with the earlier colour and size still selected (the screen stays mounted under the modal). Flow 14 checks the return and the add, not the retained selection.
- [ ] Sold-out size for the chosen colour is not selectable: data-dependent (needs a partly sold-out product), so not in Maestro.
- [ ] Add more than the stock allows needs a variant with stock 1; automating it needs seeded data.
- [ ] Font scale 200% (Android Font size and Display size, iOS Larger Text): name, chips, price and the Add to Cart label wrap or grow with no clipping or overlap.
- [ ] Safe area: on a phone with a gesture bar or notch, scroll to the bottom; Add to Cart and the description clear the gesture bar, and the toast does not cover the button.
- [ ] Product skeleton on a slow network matches the final layout (gallery block, name, price, chips, button) with no jump.
- [ ] A product with no variants shows "Not available to buy yet" and a disabled Add to Cart.
- [ ] TalkBack and VoiceOver: photos read "<name>, photo N of M"; swatches read "Colour <name>"; the price and stock lines are readable.

## Cart
- [ ] Airplane mode on opening the Cart tab for the first time: "Couldn't load your cart" with the reason and Retry (`cart-retry`); Retry works once back online.
- [ ] Airplane mode after the cart has loaded, then switch tabs and back: the rows stay and a toast explains; no error screen.
- [ ] Add a piece on the Product page, go to the Cart tab: the row is there without a manual refresh and the skeleton does not flash on later visits.
- [ ] Increase past the stock (or a variant whose stock is 1 and a second device holding it): the server's message shows inline on that row only, the quantity does not change, the + button stays tappable until the stock is reached.
- [ ] 320px-wide screen: rows, stepper, Remove and the subtotal fit with no horizontal scroll; a very long product name clamps to two lines.
- [ ] Font scale 200% (Android Font size and Display size, iOS Larger Text): name, variant line, prices, stepper and Remove wrap or grow with no clipping or overlap; the last row and Clear Cart are reachable.
- [ ] Close and reopen the app: the cart is still there (it lives on the account, not the device).
- [ ] Lower an item's stock in the backend (or deactivate its product), then open the Cart: that row shows "Only N left. Lower the quantity." (or "No longer available"), + is disabled, nothing crashes, and Remove still works.
- [ ] Sign out from Profile, then open the Cart tab: "Sign in to see your cart"; after signing in the app returns to the Cart tab and the rows load. A different account never sees the previous account's rows.
- [ ] Remove and Clear Cart (confirm button "Clear All Items") ask "Are you sure?" with Cancel; Android back or tapping outside the dialog does nothing; there is no undo after confirming.
- [ ] TalkBack and VoiceOver: steppers read "Decrease quantity of <name>" / "Increase ...", the quantity is announced when it changes, prices read as pesos, Remove reads "Remove <name> from cart".
- [ ] Double-tap + quickly: one request goes out, the row's spinner shows, and the other rows' buttons are dimmed until it finishes.
- [ ] Increase past the stock: the server's 400 message shows inline on that row only (`cart-row-error-<itemId>`), quantity unchanged. Needs a variant at its stock limit or a second device holding the last unit.
- [ ] Airplane mode during a mutation (+, -, Remove): the row shows the error inline and re-enables the other rows; a failing Clear Cart shows a toast.
- [ ] Delete succeeded but the refetch failed (airplane mode right after confirming Remove): the app explains the failure, and reopening the Cart tab shows the true bag.
- [ ] Two devices, same account: change the bag on device A, open the Cart tab on device B: rows match after focus; acting on a row already removed elsewhere shows an inline error, no crash.
- [ ] Native Alert labels: Android may render the buttons uppercase ("REMOVE ITEM"); confirm the flows' `(?i)` taps and the `below` selector in `subflows/confirm-alert.yaml` hit the dialog buttons on both platforms.
