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
- [ ] Very long product names wrap to two lines then clip; prices stay left-aligned under the name and never overlap the stock badge on the photo or the rating text.
- [ ] A product with a broken or missing photo shows its name on a Porcelain tile, never a broken-image square.
- [ ] Typing quickly in the search field sends one request after you pause (about 300 ms); stale results never replace newer ones.
- [ ] TalkBack and VoiceOver: each card reads name, price, stock and rating; the search field, Clear search and Retry buttons are labelled.
- [ ] Slow network on a cold start: the six skeleton cards show (progressbar "Loading"), then real cards replace them with no layout shift.
- [ ] Remote product photos load and cache (expo-image); with the photo host blocked the card falls back to the name tile.
- [ ] Empty catalogue (no active products): Shop shows "No pieces yet" with a Refresh button (`shop-empty-action`); it cannot be automated without an empty backend.
- [ ] A category with no active products: Shop shows "No <category> pieces yet" with Show All (`shop-empty-action`), which restores the full list. Needs a category in `GET /products/filters` with no products, so it is not in Maestro.
- [ ] Header stays pinned (search, cart button, chips, sort) while the list scrolls; the cart badge shows the item count when signed in and a bag has pieces, and reads "Cart, N items" in TalkBack/VoiceOver.
- [ ] Scroll to load more (page 2+): data-dependent (needs more than 12 products), so not in Maestro. Check `shop-count` against the cards scrolled.
- [ ] Shop top bar: one Paper band with a Porcelain hairline under the notch/status bar on Android and iOS (nothing clipped, no gap), with the search field on the left and the cart and messages icons on the right.
- [ ] Status-bar icons are dark on Shop, same as Cart, Orders and Profile (and after returning from a product).
- [ ] Screen transitions: pushing a product or order slides in, Sign In slides up from the bottom, tab switches shift; none of them jump.
- [ ] Reduce Motion (iOS) / "Remove animations" (Android) on: all those transitions become instant. Toggle it with the app open and confirm it follows.
- [ ] 320px-wide screen: the Paper band, search field, cart and messages icons fit with no horizontal overflow.
- [ ] Cart count badge and unread dot (red with Paper text) are readable against the Paper band; they are the only red on the bar.
- [ ] Keyboard open while searching: the Clear search button stays tappable and the keyboard does not hide results you tap (`keyboardShouldPersistTaps`).

## Product page
- [ ] Sticky bottom bar (cart button and Add to Cart, `product-cart`, `product-add-to-cart`): always visible while scrolling, sits above the gesture bar or home indicator with no overlap, and the cart badge count matches the Cart tab. After Add to Cart succeeds the badge goes up without leaving the page. The "Added to cart" toast sits just above the bar for about 4.5 s: check it never covers the cart badge or Add to Cart, also when the "Choose ..." hint line is showing.
- [ ] Gallery scrolls away with the page; swiping it pages one photo at a time (also while the page is scrolled slightly) and does not trigger the vertical scroll by accident. Photos fade in; a failed photo shows the name tile.
- [ ] Price is the red focal point under the gallery; "From" shows until a colour and size are chosen. The rating row ("4.5 ★ · 12 reviews") only appears for a product with reviews.
- [ ] 320px wide and font scale at the maximum: the price and "Only N left" wrap onto two lines without overlap, the bar's inline hint or error does not push the Add to Cart button off screen, and chips and swatches stay at least 44px to tap.
- [ ] Sold-out option (needs a product with a variant at stock 0, e.g. size M sold out in Black): the chip is struck through and dimmed, tapping it does nothing (no selection, no hint change), its accessibility label ends with "unavailable". Pick a colour whose only remaining sizes are in stock: the sold-out size stays disabled. A product with every variant at 0 shows "Sold out" in red-free graphite text and a disabled "Sold out" button.
- [ ] Gallery swipe inside the vertical scroll (multi-photo product): start the swipe on the photo, slightly diagonal. Horizontal intent pages the photo and the page does not scroll; vertical intent scrolls the page and the photo does not move. Page back to "1 / N". The automated check is flow 43 (it only swipes if the first Shop card has several photos).
- [ ] Two quick Add to Cart taps (cart badge): the button shows its pending state, only one item is added per tap, and the bar badge matches the Cart tab. Flow 44 covers the badge with a plain double add.
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
- [ ] 360x640 screen: the gallery is capped at half the screen height and the price shows under it without scrolling. TalkBack/VoiceOver reads the product name before the price, each photo as "..., photo 1 of N" (no separate counter), and the disabled Add to Cart announces what to choose first.
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
- [ ] Sticky summary bar (`cart-bar`: Subtotal, item count and Checkout, which is enabled for a clean bag and disabled with "Fix the items marked above to check out" while a row shows a warning): stays pinned while the list scrolls, sits directly above the tab bar with no gap or overlap on a phone with a gesture bar, and the last card and Clear Cart can scroll fully clear of it.
- [ ] Toast above the bar: Remove an item (with two or more in the bag) and change nothing else; "Item removed" sits just above the bar and never covers the subtotal or Checkout. After removing the last item or Clear Cart the toast drops to the normal low position. Check on Android and iOS (the lift is measured from the bar's window position).
- [ ] Card image: turn the network off or use an item whose image URL is broken; the card shows a Porcelain tile with the product name, not a blank or broken square. Photos fade in.
- [ ] Stepper at the stock limit: at quantity equal to the stock the + button is disabled and a low-stock item says "Only N left"; at 1 the - button is disabled; both stay 44px and read "Quantity N, increase/decrease" in TalkBack/VoiceOver.
- [ ] Tap a card (image or name): the product page opens once even on a fast double tap; Back returns to the Cart with the list where it was.
- [ ] Removing a card slides the rest up (not a jump); with Reduce Motion on, it snaps.
- [ ] 320px wide and font scale 200%: the subtotal and "Subtotal / N Items" fit on one row or wrap without clipping, the Checkout button label wraps, the trash icon never overlaps a two-line name.
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

## Orders
Pay and cancel change real orders, so they are manual. Use a dedicated test account with one unpaid order, one paid order and enough orders (more than 10) to page.
- [ ] Pull down on the Orders list: spinner shows and rows refresh; with airplane mode on, a toast explains and the rows stay.
- [ ] Tab row (All, To pay, To ship, To receive, Completed, Cancelled, Returns/Refund): it scrolls sideways on a narrow phone with no clipped chip; each label shows its count, the selected chip is filled, and TalkBack/VoiceOver reads "To pay, 2 orders, selected". The tab stays selected after opening an order and going back, or switching tabs and returning.
- [ ] An empty tab (for example Cancelled with none) shows "No cancelled orders" and "Show All Orders" returns to All.
- [ ] Order card at 320px wide: number, status pill, date, two item lines with thumbnail, "+N more items" and "Total (N items)" fit with no horizontal scroll; a very long product name clamps to two lines.
- [ ] A product image that fails to load (airplane mode after the list loaded, or an order whose image link is dead) shows the product name in the grey tile, never a broken square.
- [ ] Track: an order that is shipped or out for delivery with a courier link shows Track (`order-track-<id>`) and it opens the courier page in the in-app browser; an order without a link shows no Track. Review & Pay (`order-pay-<id>`) on an unpaid card opens the order detail, it does not start a payment.
- [ ] More than 100 orders (needs a seeded account): all of them load and the tab counts add up (the app reads at most 500).
- [ ] Airplane mode on a cold start: Orders shows "Couldn't load your orders" with the reason and Retry (`orders-retry`); Retry works once back online.
- [ ] Airplane mode after the list loaded, then return to the Orders tab: the rows stay and a toast explains (no error screen).
- [ ] Open an order, change nothing, go back: the list keeps its scroll position and tab (the silent refresh on focus replaces rows in place).
- [ ] Pay Now on an unpaid order (needs a test payment on the payment provider's test mode): the payment page opens in the in-app browser; closing it (iOS) or returning to the app (Android) refreshes the order and its status. Double-tapping Pay Now opens one browser.
- [ ] Pay Now when the payment link cannot be made (stop the backend's payment provider or use an order with a total under 1.00): an inline message explains it and Pay Now stays available.
- [ ] Complete a test payment, return to the app: status shows Paid, Pay Now and Cancel Order are gone.
- [ ] Cancel Order on an unpaid order: "Are you sure?" with Keep Order and Cancel Order; Keep Order, Android back and tapping outside do nothing; Cancel Order shows the "Order cancelled" toast and the status turns Cancelled with the reason in the timeline. There is no undo.
- [ ] Cancel an order that was paid on another device in the meantime: an inline message with the server's reason shows, and the status refreshes to the real one.
- [ ] A paid order shows no Pay Now and no Cancel Order.
- [ ] Deep link `silhoufitmobile://orders/<made-up uuid>` and a real order id of another account: "We couldn't find this order", Back to Orders opens the Orders tab. A link opened from a cold start has an "Orders" header button that goes to the Orders tab, never a blank screen.
- [ ] 320px-wide screen: rows, the status chips, items, amounts and buttons fit with no horizontal scroll; a very long product name clamps to two lines and a long order number stays on one line.
- [ ] Font scale 200% (Android Font size and Display size, iOS Larger Text): rows and the detail wrap or grow with no clipping or overlap; both buttons are reachable.
- [ ] Account switch: sign out, sign in as another account, open Orders: the previous account's orders never show, not even for a moment.
- [ ] TalkBack and VoiceOver: each card reads "Order <number>, <status>, <n items>, total <amount>, placed <date>"; status and payment read as words, not colour; the Alert buttons are read.
- [ ] Times show in Philippine time with AM/PM (for example an order placed at 1:49 PM Manila reads "1:49 PM" on a phone set to another time zone).
- [ ] Orders skeleton and detail skeleton on a slow network match the final layout with no jump.
- [ ] Failed payment: pay with a test card that the provider declines (or close the payment page unpaid), return to the app: the order stays unpaid or shows the failed payment status, an inline message explains, and Pay Now stays available to try again.
- [ ] A cancelled order shows its cancellation reason in the timeline and neither Pay Now nor Cancel Order.
- [ ] Keep Order in the cancel confirmation changes nothing (status stays, no toast).

## Notifications (Alerts tab)
Updates are built on the device from the customer's 20 newest orders (no API feed). The "last seen" time is stored per account on the device.
- [ ] Tab bar shows five labels in order Shop, Cart, Orders, Alerts, Profile; at 320px-wide (and with large font) none is clipped, wrapped or overlapping, and each touch target is at least 44px. Labels are 12px uppercase on purpose (an exception to the 14px minimum so five fit): check PROFILE, ORDERS and ALERTS at 320px and at the largest font scale (capped at 1.2x, so the bar must not grow or wrap).
- [ ] Tab switches shift smoothly across all five tabs (including to and from Alerts); with Reduce Motion / "Remove animations" on they are instant.
- [ ] Signed-in empty state: an account with no orders shows "No updates yet"; "Browse the Shop" (`notifications-empty-action`) lands on the Shop tab. Needs an account with no orders, so not in Maestro.
- [ ] "New" marker, first visit: sign in as an account with updates, open Alerts: no row shows "New" (flow 34 asserts this).
- [ ] "New" marker, after a change: with Alerts already opened once, change an order in the backend (pay, dispatch, deliver or cancel it), then open Alerts: only the new event shows "New" (`notification-new`, read as ", new" in TalkBack/VoiceOver); older rows do not.
- [ ] "New" marker across tab switches: after that visit, go to another tab and back to Alerts: the marker is gone (leaving after the list showed marked everything seen). A quick switch away and back before the list loaded (throttled network) keeps the marker. Opening an order and coming back also clears it. Killing and reopening the app keeps that state; another account never inherits it.
- [ ] Opening a row opens that order; Back returns to Alerts. Pull down refreshes; with airplane mode on a toast explains and the rows stay; on a cold start "Couldn't load your updates" shows Retry (`notifications-retry`).
- [ ] Sign out then sign in as another account: the previous account's updates never show, not even for a moment.
- [ ] 320px-wide: rows (including a long cancellation reason) wrap with no horizontal scroll; the skeleton matches the rows with no jump. TalkBack/VoiceOver read "<label>, order <number>, <time>".

## Messages (chat with the store)
Needs a customer test account and a staff account on the dev backend (web inbox open as staff). Realtime on React Native has never run in this app, so this section is the first real test of it.
- [ ] Android keyboard: open Messages, tap the input. The composer rides above the keyboard (not hidden behind it, no big gap), the newest bubble stays visible, and the header and status bar are not pushed. Closing the keyboard drops the composer back to the bottom. Repeat with a multi-line message (the input grows to about 5 lines, then scrolls) and on iOS. The app uses `behavior="padding"` with the screen's own distance from the window top as the offset, chosen because Android is edge-to-edge on SDK 58; if it is off by the header height, that offset is the first place to look.
- [ ] Realtime, store to customer: with Messages open on the phone, reply from the staff web inbox. The reply appears within a couple of seconds with no pull or reopening, once, labelled "KRAL". Do it again with the app in the Shop tab, then open Messages: the reply is there (refetch on focus).
- [ ] Realtime, customer to store: send from the phone; the staff inbox shows it live. The bubble on the phone appears once, not twice.
- [ ] Realtime blocked: turn off the Realtime or private-channel policy (or airplane mode, then on): the screen shows nothing alarming; sending and reopening still work; after the connection returns the missed reply appears (refetch on reconnect).
- [ ] Unread dot: a staff reply while the customer is elsewhere shows the dot on `shop-messages` (Shop band) and `header-messages` (other tabs) after returning to that tab; opening Messages clears it on the next visit. Silent until the next focus is the known limit (no live badge).
- [ ] The dot reads "Messages, unread messages" in TalkBack/VoiceOver; a new customer's first open creates their conversation (no error).
- [ ] Failed send: airplane mode, send: the bubble stays with "Not sent. We couldn't reach the server..." and Retry (`message-failed-retry`); turning the network on and tapping Retry sends it once. Double-tapping Send sends one message.
- [ ] 2,000-character limit: the count appears from 1,800 characters and the input stops at 2,000.
- [ ] Empty state (no flow reaches it reliably): a brand-new customer account, first open of Messages shows "No messages yet" with Write a Message, which focuses the input and opens the keyboard. Flow 41 covers it only if the account never wrote to the store.
- [ ] Second actor, exact steps for realtime and the dot (not automatable: Maestro drives one device). Setup: customer test account on the phone, a staff account in the web inbox in a desktop browser. (1) Phone on Messages, staff replies: the reply shows within about 2 s, once, labelled "KRAL". (2) Phone on Messages, send: staff sees it live; the phone shows one bubble. (3) Phone on Orders, staff replies; return to the Shop tab then Orders: `shop-messages-badge` / `header-messages-badge` shows (the dot is evaluated on focus, not live). (4) Tap the icon: the reply is there; go back: the dot is gone after the next focus.
- [ ] Sign out while on Messages (or open it signed out): "Sign in to message the store"; signing in returns to Messages with the conversation. Another account never sees the previous one's messages or draft.
- [ ] 320px-wide: the Shop band fits search, cart and messages with no horizontal scroll (the field is about 184px wide, "Search" readable, the clear button appears only with text); long messages and the "Not sent" copy wrap.
- [ ] Times read in 12-hour form ("1:49 PM") and the tab-header messages button does not crowd the KRAL logo at 320px.
- [ ] Failed send: turn on airplane mode, send. The bubble shows "Not sent" with Retry (`message-failed-retry`) and Discard (`message-failed-discard`); Send stays disabled and the text is kept until you act. Discard clears it and re-enables Send. A refused-as-invalid message shows only Discard.
- [ ] Lost response: while the failed bubble shows, have the saved copy arrive (staff inbox shows it, or reconnect so the resync runs): the failed bubble disappears and only one copy remains. Known limit: identical text sent twice on purpose is treated as one.
- [ ] Keyboard gap: with the keyboard open the composer sits directly on the keys (no empty band, Android gesture-nav and iOS home-indicator devices); closed, it keeps the safe-area padding.
- [ ] Screen reader: TalkBack reads a new staff reply once when it arrives live (Android uses a live region on that bubble, check it actually speaks); VoiceOver announces "KRAL said: ..." once. Opening the screen does not read the history aloud. The failed bubble reads "Not sent, <text>".
- [ ] Counter: "n/2000" shows right-aligned in Graphite when the input is focused or has text, and turns red from 1,900.

## Floating-label fields (Sign In)

- [ ] Label float: tap Email, the label shrinks and slides up onto the top border in about 180 ms, the border cut behind it looks clean on the Paper background (no seam, no box around the label), and the border and label turn Obsidian with a 2px border. Blur with text keeps it floated; blur empty drops it back inside.
- [ ] Error: leave a field empty and blur, the border and label turn red and the message reads below it; the label stays floated only if text is present.
- [ ] Autofill: the Android autofill prompt and iOS password manager fill Email and Password, and the labels float on fill (not stuck over the text).
- [ ] Large font scale (Settings, largest text): the label and input text cap at 120%, so the label is not clipped, the field does not grow past that, and the floated label is still centred on the border.
- [ ] Keyboard: focusing Password on a small phone keeps the field visible above the keyboard.
- [ ] Reduce Motion on: the label snaps, no slide.
- [ ] TalkBack/VoiceOver: each field is read once as "Email" or "Password" (the floating label is not read twice), the error is announced when it appears, and Show password reads as a button.

## Google sign-in
Needs the owner setup below first. Use a dedicated Google test account (a test user while the consent screen is unpublished).
- [ ] Full sign-in in Expo Go (Android and iOS) and in a dev build: Continue with Google opens the browser, consent, the app returns, the "Signed in with Google" toast shows and Profile shows the Google name and avatar.
- [ ] A brand-new Google account gets a profile on first sign-in: Profile loads (no "Couldn't load your profile") and the Cart and Orders tabs work.
- [ ] An existing email/password account with the same Gmail address lands in the same account (same orders and cart), not a duplicate.
- [ ] Cancel on Google's consent page, and closing the browser (Android Back, iOS Cancel): back on Sign In with no banner and no toast; the button works again.
- [ ] Airplane mode before tapping: the banner reads "Can't reach Google sign-in. The connection dropped before it finished. Check your connection and try again."
- [ ] A banned/deactivated account: the banner reads "This account has been deactivated. Contact the store for help." Confirm Supabase's real `error_code` for a banned OAuth user is `user_banned` (it is assumed, not verified); if it differs, the copy falls back to "Google sign-in didn't finish".
- [ ] Android: after the redirect there is no "Unmatched Route" screen or flash of one (the `auth/callback` guard route closes itself); Back from Sign In still works.
- [ ] Double-tap Continue with Google: one browser opens; Sign In is disabled while it is open, and Continue with Google is disabled while a password sign-in is pending.
- [ ] Signed out, Add to Cart, Continue with Google: after signing in the app returns to the product.
- [ ] Airplane mode while the browser is open, then finish or cancel: Sign In shows the banner or returns quietly, never stuck on the busy button.
- [ ] Kill the app after a Google sign-in and relaunch (no clear state): still signed in, Profile shows the Google name, no sign-in prompt.
- [ ] Expo Go vs dev build: Expo Go returns through the `exp://...` address and needs that allow-list entry; a dev build or release uses `silhoufitmobile://auth/callback`. A redirect missing from the allow-list makes Supabase fall back to the Site URL, so the app stays on Sign In. Test both.
- [ ] Android Custom Tab: system Back closes it (flow 25 automates this); iOS: the system prompt "wants to use supabase.co to sign in" shows once per tap and Cancel returns quietly (flow 25 taps it).
- [ ] Failed exchange copy (link reused or expired): "Google sign-in didn't finish. The sign-in expired or was already used, so you're not signed in. Tap Continue with Google to try again."
- [ ] TalkBack and VoiceOver read "Continue with Google" and skip the "(OR)" divider (it is hidden from accessibility on purpose, which is also why Maestro may not see `sign-in-divider`).
- [ ] 320px-wide screen: divider and button fit with no horizontal scroll.

## Profile (menu and shortcuts)
- [ ] Signed in, Profile shows the avatar, name, email and "Member since <date>" (Manila date); the edit icon at the right opens Edit Profile; VoiceOver/TalkBack skip it (the Edit Profile row announces the same action once).
- [ ] My Orders shows "View all" and four tiles (To pay, To ship, To receive, Completed), each at least 44px tall with a visible label; each opens the Orders tab on the matching sub-tab, and View all opens Orders unfiltered. Back from Orders returns to Profile.
- [ ] Menu rows are 56px with hairline dividers; Delivery Addresses and Body Profile are dimmed with the visible "Coming soon" caption, do nothing when tapped and are announced as disabled. Sign Out shows a chevron-less row with a spinner while signing out.
- [ ] Sign Out shows the native Alert "Are you sure?" with Cancel and a red/destructive "Sign Out"; Cancel keeps the session, Sign Out shows the "Signed out" toast. On Android the buttons may be uppercase. The error state's Sign Out button asks the same way.
- [ ] Avatar fallback on the new header: broken URL shows initials, no name shows the person icon, same name gives the same colour.
- [ ] At 320px wide and at the largest font scale: the header, tile labels ("To receive" wraps to two lines at most) and rows do not clip or overlap, there is no horizontal scroll, and the screen scrolls to Sign Out.
- [ ] Skeleton while loading has the same blocks as the loaded screen (header, tiles, four rows) with no jump when the data arrives.
- [ ] Profile shortcut after manually changing the Orders tab lands on the shortcut's tab: open Orders, pick All, go to Profile, tap To pay (Orders shows To pay); pick Completed, return to Profile, tap View all (Orders shows All); tap To pay twice from Profile with a manual tab change between. Sign out and sign in as another account: Orders starts on All.
- [ ] Order detail at 320px and the largest font scale: the Status and Payment chips wrap their label instead of clipping, with no horizontal scroll. Disabled Profile rows (Delivery Addresses, Body Profile) show readable dark "Coming soon" captions with a dimmed icon, and screen readers announce Edit Profile once (not the header icon too).

## Edit Profile (changes real account data: use a test account)
- [ ] Profile > Edit Profile (row or header icon) opens the form pre-filled with first, middle, last name, suffix, birthday and gender; the header shows the logo and a back arrow, and a double tap opens it once.
- [ ] Save Changes is disabled until something changes, disables again if the change is undone, and shows a spinner while saving.
- [ ] Change the first name and save: toast "Profile updated", the screen goes back, and Profile shows the new name at once with no reload flash. Reopen: the new value is pre-filled.
- [ ] Clear the middle name, suffix and birthday and pick "Not specified" gender, then save: all four are cleared on the server (reopen, and check the web profile), the other fields are untouched.
- [ ] Validation: errors appear when leaving a field, then update as you type. First/last name required; digits or symbols rejected; a word over 30 letters rejected; an emoji (keyboard emoji) is rejected with "Emoji aren't allowed in this field." in a name and the suffix. The suffix counter reads n/20 and stops at 20. Birthday: "1995/5/9" tidies to 1995-05-09 on leaving the field; 2023-02-31 and a future date show their message and block Save.
- [ ] Hermes runs the emoji pattern without a crash (a RegExp error on first open would show a red screen).
- [ ] Keyboard: the Return key moves First, Middle, Last, Suffix, Birthday and then closes the keyboard; the focused field and the Save button stay reachable above the keyboard on Android and iOS, at 320px wide and at the largest font scale; the birthday field opens the numbers-and-punctuation keyboard on iOS (dash and slash on it) and the standard keyboard on Android (a numeric Android keyboard may have no dash); a loosely spaced "1995 / 5 / 9" is not cut off.
- [ ] Android edge-to-edge: with the keyboard open, the last field (Birthday) and Save Changes stay above the keyboard and the system bars.
- [ ] Airplane mode, then Save: the banner explains the connection problem and Save works again once it is back; the typed values are kept. A server rejection (for example from a deliberately bad value) shows the server's reason in the banner.
- [ ] Expire the session (revoke it in Supabase), then Save: toast "Your session has expired. Sign in again." and the screen shows the sign-in prompt.
- [ ] Signed out, deep link `silhoufitmobile://profile/edit`: "Sign in to edit your profile" with a Sign In button.
- [ ] Reduce Motion on: the floating labels settle without animating. TalkBack and VoiceOver read every field's label and error, the gender chips as selected or not, and the banner when it appears.

## Checkout review and Place Order (CREATES REAL ORDERS: cancel each one afterwards, an unpaid order reserves stock until cancelled)
- [ ] Open it by deep link `silhoufitmobile://checkout` (the Cart's Checkout button opens it too). Signed out it shows "Sign in to check out"; with an empty cart it shows "Nothing to check out" and Back to Cart.
- [ ] Address sheet: tapping Change opens it and the screen reader starts at "Choose delivery address"; each row is read as a radio with its selected state; Close, Cancel, the dim area and Android Back all close it, and where focus lands afterwards is left to the platform (check it does not jump to the top of the page; Change is the ideal target but not guaranteed). The dim area also covers the status and navigation bars on Android. The page behind is not reachable while it is open.
- [ ] An address without a map pin (add one on the web and clear its pin) is dimmed, cannot be selected, and reads "Needs a map pin: add it on the web"; TalkBack/VoiceOver announce it as disabled with that reason. It is never auto-selected, even when it is the default.
- [ ] Change to another address: the Shipping row shows its skeleton, then the new courier and fee, and the total updates. In airplane mode the Shipping row shows the connection message and Retry, and the rest of the page stays usable.
- [ ] Failed product image shows the name tile (56x72), no broken square. A line with too little stock shows its red warning.
- [ ] 320px wide and the largest font scale: no horizontal scroll, the item rows, the address card, the summary and the bar do not clip or overlap, and the scroll reaches Summary above the bar. The numbers stay right-aligned.
- [ ] Gesture-bar and 3-button phones: the bar clears the system bar, and the bar (total, hint, notice, Place Order) stays fully visible without covering the last card. With Reduce Motion on, the sheet opens without sliding.
- [ ] Place Order is disabled, with the reason read aloud from the bar hint, when: there is no address, only pinless addresses, a line has a warning (stock or removed product), or no shipping fee is loaded. Pending shows a spinner and a double tap sends one order.
- [ ] Happy path (dedicated account): Place Order opens the order screen, the "Order placed" toast shows, the hosted payment page opens in the in-app browser, closing it reloads the order, and the cart no longer holds the ordered pieces. Cancel the order afterwards (Order screen > Cancel Order).
- [ ] Payment page fails to open (airplane mode right after the order is created): the order screen shows its Retry copy and "Pay Now"; the order exists under To pay.
- [ ] Fee changed (needs a quote that expires or changes; wait over 30 s on the screen or change the address): Place Order stops with "Delivery is now ... Check your total, then place your order again." and creates nothing; the second tap places it.
- [ ] Price changed between the review and the order (change the variant price on the web first): the alert "Your total changed from ... to ..." offers "Pay" and "Not Now", and both open the order; only Pay opens the payment page.
- [ ] Stock too low (lower the variant stock on the web): the inline alert says "An item in your cart is out of stock or no longer available." (never the server's SKU or id text) with Back to Cart; the Cart then shows the row warning.
- [ ] Network drop on Place Order: the inline alert offers Try Again, which sends the same order (the server ignores the same order sent twice within 60 seconds). After a long wait check Orders for a duplicate before trying again.
- [ ] Lost response (accept the order on a second device or the web, then cut the network before the answer arrives; or throttle until the 30 s limit): the alert offers Try Again; Try Again and Place Order both look in Orders first and, finding the unpaid order, open it with "Your order was already placed" and send no second order. With the lookup also failing, "We couldn't confirm whether your order went through" shows Open Orders and Check Again, and no new order is placed. Check Orders for exactly one order afterwards.
- [ ] Leave the screen (Back, or a deep link) while Place Order is in flight, order created: no jump back to the order screen and no alert; the toast "Order placed. Find it in Orders." shows and the order is under To pay. The cart lines are removed once the order exists (as on the web), even when you leave.
- [ ] While Place Order is pending, Change delivery address is disabled and an open address sheet ignores a pick.
- [ ] A 403 shows "You don't have permission to place this order."; a 409 shows "Your cart changed while you were checking out..." with Back to Cart; neither says the session expired. A rejected token signs out once (one "session expired" toast, one sign-in prompt).
- [ ] Small screen and notice: at 320px wide and 200% font, trigger a long notice (the lookup-failed one with two buttons): it scrolls inside a capped area, Place Order stays on screen and tappable, and every notice button is reachable by scrolling it.
- [ ] Expire the session, then Place Order: the screen shows the sign-in prompt. At 320px wide and the largest font scale the bar with a notice and Place Order still leaves the page visible above it, and TalkBack and VoiceOver read the hint and the alert.

## Owner setup checklist (Google sign-in, not code)
- [ ] Supabase > Authentication > URL Configuration > Redirect URLs: add `silhoufitmobile://auth/callback` (dev builds and release) and the Expo Go address that `Linking.createURL('auth/callback')` prints, for example `exp://192.168.1.225:8081/--/auth/callback`. The LAN IP changes, so on the dev project only you may use `exp://**/--/auth/callback`; remove it before release.
- [ ] Supabase > Authentication > Providers: Google is enabled with the client id and secret.
- [ ] Google Cloud needs no change: its authorised redirect stays `https://<project>.supabase.co/auth/v1/callback`.
- [ ] Keep the OAuth consent screen's test users up to date, or publish the consent screen.
