# Maestro flows

UNRUN: written without Maestro or a device available. Expect small selector/timing fixes on first run.

## Prerequisites
- Maestro installed, and an emulator or device running a dev build (preferred) with the dev server reachable. In Expo Go, `appId` is `host.exp.exponent`, `launchApp` opens the Expo Go home (not the project) and `clearState` wipes all Expo Go data, so use a dev build.
- A seeded customer account on the dev backend (the app talks to `EXPO_PUBLIC_API_URL` and the same Supabase project).

## Env vars
| Var | Meaning |
|---|---|
| `APP_ID` | Bundle/package id of the build (required) |
| `TEST_EMAIL` | Seeded customer email (required). Use a DEDICATED test account: flow 17 empties and changes its real cart |
| `TEST_PASSWORD` | Its password (required) |

Orders flows (20 to 24) are read-only. The account needs at least one order for flow 21's detail assertions to run; without one they tolerate it and assert the empty state instead.
| `WRONG_PASSWORD` | Optional, only 03. Defaults to `Wrong-Password-1!` (declared in the flow header) |
| `SEARCH_TERM` | Only 10. A search word that matches at least one active product on the dev backend |
| `UNKNOWN_EMAIL` | Optional, only 03. An email that must not exist; defaults to `nobody-e2e-unknown@example.com` |

## Run
```
maestro test -e APP_ID=com.example.silhoufit -e TEST_EMAIL=a@b.com -e TEST_PASSWORD=secret .maestro/
```
Single flow: pass its file instead of the folder. `subflows/` is a helper folder and is not run on its own.

## Flows (Profile, Shop, Product, Cart and Orders cycles)
All auth lives on the Profile tab, not Shop; Shop is public. Ids used: `shop-list`, `shop-card-<id>` (and `shop-card-<id>-image`, so flows match cards with `shop-card-(?!.*-image$).+`), `shop-count`, `shop-search`, `shop-search-clear`, `shop-cart`, `shop-cart-badge`, `shop-category-all`, `shop-category-<name>`, `shop-sort`, `shop-empty`, `shop-empty-action`, `shop-retry`, `shop-load-more-retry`, `intro-loader`, `tab-profile`, `profile-sign-in`, `profile-name`, `profile-sign-out`, `sign-in-*` (including `sign-in-divider`, `sign-in-google`), `toast`.

| Flow | Covers |
|---|---|
| 01 | Signed-out cold start lands on the Shop (no redirect), then the Profile tab shows the signed-out prompt |
| 02 | Empty form: required errors |
| 03 | Wrong password and unknown email show identical copy |
| 04 | Sign in from Profile: modal closes, name visible, "Signed in as" toast |
| 05 | Session survives stopApp + relaunch without clearState, prompt never shown |
| 06 | Sign out: prompt returns, "Signed out" toast, name gone |
| 07 | Show/Hide password toggle (fields are floating-label: the label is not a placeholder, flows type by `sign-in-email`/`sign-in-password` id) |
| 08 | Signed-out prompt title and message |
| 09 | Shop (Cycle 2): list visible without signing in, nonsense search shows the empty state, clearing restores the list. Needs at least one active product |
| 10 | Shop search with a matching term (`SEARCH_TERM`) returns cards, clearing restores. Needs a matching product |
| 11 | Shop still loads after signing in and after signing out (taps the Shop tab via `tab-shop`) |
| 12 | Product page (Cycle 3): tap the first Shop card, the product opens without signing in, hardware back returns to the Shop (Android only), pick colour and size, Add to Cart while signed out lands on the sign-in screen. Needs an active product with stock |
| 13 | Signed in: open a product, pick colour and size, Add to Cart shows the "Added to cart" toast. Needs a seeded customer and an in-stock product . Repeated runs add to the same cart and the backend counts it against stock (400): use a high-stock product or clear the cart (`DELETE /cart`) first |
| 14 | Signed out: Add to Cart opens sign-in; after signing in the app returns to the same product and Add to Cart shows "Added to cart". Needs a seeded customer and an in-stock product . Repeated runs add to the same cart and the backend counts it against stock (400): use a high-stock product or clear the cart (`DELETE /cart`) first |
| 15 | Deep link `silhoufitmobile://product/<made-up uuid>`: "This piece is no longer available", Back to Shop returns to the Shop. Needs only the backend |
| 16 | Cart (Cycle 4), signed out: the Cart tab shows "Sign in to see your cart" with `cart-sign-in` and no list |
| 17 | Cart, signed in: clears the bag through the UI if it has rows, adds exactly one piece from the Shop, asserts row, quantity 1, count and subtotal, then + and - (quantity and subtotal change and return), Remove asks first (Cancel keeps it, Remove Item empties the bag), then `cart-empty-action` lands on the Shop (`shop-list`). Changes the real cart of `TEST_EMAIL` and ends empty, so use a dedicated test account. Needs a product with stock of at least 3 as the first Shop card |
| 18 | Cart, signed out: tap `cart-sign-in`, sign in, the modal closes and the Cart tab shows `cart-list` or `cart-empty-action` (not Profile, not Shop). Read-only |
| 19 | Cart, signed in then signed out on Profile: the Cart tab shows the signed-out prompt and no rows, count, subtotal or Clear Cart from the previous account. Read-only; strongest when the bag already has a row |
| 20 | Orders (Cycle 5), signed out: the Orders tab shows "Sign in to see your orders" with `orders-sign-in` and no list or rows |
| 21 | Orders, signed in. Read-only: waits for `orders-list` or `orders-empty-action`; with orders it opens the first row, asserts `order-detail`, `order-status`, `order-payment-status` and `order-total`, then goes back (Android `back`, iOS header back) to `orders-list`; with none it asserts "No orders yet" and that `orders-empty-action` lands on `shop-list`. Needs `TEST_EMAIL`; orders are optional, but the detail assertions only run when the account has at least one |
| 22 | Orders, signed out: tap `orders-sign-in`, sign in, the modal closes and the Orders tab shows `orders-list` or `orders-empty-action` (not Profile, not Shop). Read-only |
| 23 | Orders, signed in then signed out on Profile: the Orders tab shows the signed-out prompt and no rows or empty state from the previous account. Read-only |
| 24 | Deep link `silhoufitmobile://orders/<made-up uuid>` while signed in: "We couldn't find this order" with `order-error-back`; Back to Orders lands on the Orders tab. Needs only a seeded customer; the dev launcher may intercept the link in a dev build |
| 25 | Continue with Google: button shows on Sign In, tapping opens the browser; Android closes it with Back, iOS taps the system prompt's Cancel; back on Sign In with no banner, no toast, form still usable. Does not complete a Google sign-in. Needs the Supabase setup in MANUAL.md |
| 26 | Deep link `silhoufitmobile://auth/callback?error=access_denied` and `?error=server_error&error_description=x` while on Sign In with no sign-in in flight: no "Unmatched Route", no banner, back on Sign In. Needs no account; the dev launcher or an iOS prompt may intercept the link |
| 27 | Email/password still works with the Google button: `sign-in-google` sits below `sign-in-submit` (divider asserts are optional, it is hidden from accessibility), then a password sign-in reaches `profile-name`. Needs `TEST_EMAIL`, `TEST_PASSWORD` |
| 28 | Shop categories: the first real chip (`shop-category-(?!all$).+`) selects, `shop-category-all` is deselected and the list or empty state returns; a nonsense search with a category picked shows the search empty state and `shop-empty-action` (Clear Search) restores the list with All selected and the original count; picking a category then All restores the count. Needs `GET /products/filters` to return at least one category. The empty-category copy ("No <category> pieces yet" with Show All) needs a category with no active products, so it is manual (MANUAL.md) |
| 29 | Shop sort chip `shop-sort`: Newest -> Price: low to high -> Price: high to low -> Newest, asserting the label and the list after each tap (label regexes are wrapped in `.*` because the accessibility label is "Sort by <option>. Tap to change.") |
| 30 | Shop cart button `shop-cart`, signed out: no `shop-cart-badge`, tap lands on the Cart tab with `cart-sign-in` and "Sign in to see your cart". Needs only the backend |
| 31 | Shop cart button, signed in: lands on the Cart tab with `cart-list` or `cart-empty-action`, no sign-in prompt. Read-only. Needs `TEST_EMAIL`, `TEST_PASSWORD`. The badge count itself is not asserted (it depends on the bag) |
| 32 | Shop top bar (Paper band, `32-shop-top-bar.yaml`): signed-out cold start shows `shop-search`, `shop-cart`, `shop-messages` and `shop-list`, no `header-messages` and no KRAL logo (the logo is an image labelled "KRAL", no testID, matched by text); `tab-cart` shows the logo header with `header-messages` and hides the search bar and `shop-messages`; `tab-shop` brings the search bar, cart and messages buttons and list back and the logo is gone. Waits after every tab switch for the transition. Needs only the backend |
| 33 | Notifications, signed out: the Alerts tab shows "Sign in to see your order updates" with `notifications-sign-in` and no list or rows |
| 34 | Notifications, signed in. Read-only: waits for `notifications-list` or `notifications-empty-action`; the first visit after cleared state shows no `notification-new`; with updates opens the first `notification-row-.+`, asserts `order-detail` and `order-status`, goes back (Android `back`, iOS header back) to `notifications-list`, still no `notification-new`; with none asserts "No updates yet". Needs `TEST_EMAIL`; an account with a payment, courier, delivery, cancellation or in-progress update exercises the list |
| 35 | Tab set: signed out, taps `tab-cart`, `tab-orders`, `tab-notifications`, `tab-profile`, `tab-shop` and waits for each screen's own marker (`cart-sign-in`, `orders-sign-in`, `notifications-sign-in`, `profile-sign-in`, `shop-list`). Needs only the backend. The visual order is a device check |
| 36 | Notifications, signed out: tap `notifications-sign-in`, sign in, the modal closes and the Alerts tab shows `notifications-list` or `notifications-empty-action` (not Profile, not Shop). Read-only |
| 37 | Messages, signed out: Shop band `shop-messages` opens Messages with `messages-sign-in` and "Sign in to message the store", no `messages-input`, no `shop-messages-badge`. Needs only the backend |
| 38 | Messages, signed in: from the Shop band, types a unique "Maestro e2e <timestamp>" (evalScript), taps `messages-send`, the bubble shows, the input clears, no `message-unsent` or `message-failed-retry`. POSTS A REAL MESSAGE every run: needs a dedicated test account (`TEST_EMAIL`, `TEST_PASSWORD`); the first open also creates its conversation |
| 39 | Messages from a tab header, signed out: Orders tab, `header-messages` opens Messages with `messages-sign-in`, no composer or list. Needs only the backend |
| 40 | Messages, signed out: Shop `shop-messages`, tap `messages-sign-in`, sign in on the Sign In screen, it closes and Messages shows `messages-input` (not Profile, not Shop). Read-only. Needs `TEST_EMAIL`, `TEST_PASSWORD` |
| 41 | Messages, signed in, read-only: waits for `messages-list` or `messages-empty-action`. With messages it asserts the list and composer; with none it asserts "No messages yet" and that `messages-empty-action` (Write a Message) leaves the composer in place. The empty branch only runs for an account that never wrote to the store (flow 38 ends that for its account), otherwise it is manual |
| 42 | Product bottom bar cart shortcut, signed in: from a Shop card, `product-cart` and `product-add-to-cart` are visible without scrolling, tapping `product-cart` lands on the Cart tab (`cart-list` or `cart-empty-action`) and `product-add-to-cart` is gone. Read-only. Needs `TEST_EMAIL`, `TEST_PASSWORD` and an active product. The badge count is not asserted (it depends on the bag) |
| 43 | Product gallery paging: first Shop card, no sign-in. If `product-gallery-counter` exists (more than one photo) it swipes `product-gallery` LEFT and waits for "2 / N", then RIGHT back to "1 / N", then asserts the name and `product-add-to-cart` are still there. With one or no photo it passes without swiping (use MANUAL.md for a multi-photo product) |
| 44 | Product bar cart count, signed in: adds the first Shop card twice and asserts the `product-cart` accessibility label ("Cart, N items") changes after the second add while `product-cart-badge` shows. WRITES DATA: two pieces stay in the cart of `TEST_EMAIL` (run 17 afterwards, it empties the bag), the product needs stock of at least 2. Needs `TEST_EMAIL`, `TEST_PASSWORD` |
| 45 | Cart item opens its product: adds the first Shop card, opens the Cart, asserts the sticky bar (`cart-bar`, `cart-subtotal`, "Checkout is coming soon"), taps `cart-open-<itemId>` and lands on the product page (`product-name`, `product-add-to-cart`). WRITES DATA: one piece stays in the cart of `TEST_EMAIL` (run 17 afterwards, it empties the bag). Needs `TEST_EMAIL`, `TEST_PASSWORD` and an in-stock product |

Cart ids: `tab-cart`, `cart-list`, `cart-bar` (sticky summary, outside the list), `cart-checkout` (disabled: no checkout exists yet) with `cart-checkout-note`, `cart-open-<itemId>` (opens the product), `cart-row-<itemId>`, `cart-qty-<itemId>`, `cart-inc-<itemId>`, `cart-dec-<itemId>`, `cart-remove-<itemId>`, `cart-row-error-<itemId>`, `cart-clear` (a quiet text link at the end of the list), `cart-subtotal` and `cart-count` (both in the sticky bar), `cart-sign-in`, `cart-retry`, `cart-empty-action`. Remove and Clear Cart confirm with a native `Alert`, so Maestro taps its buttons by text ("Cancel", "Remove Item", "Clear All Items"); there are no `cart-confirm-*` ids. Flows 16 to 19 are UNRUN like the rest. Collision guard: `cart-row-<id>` is also a prefix of `cart-row-error-<id>`, so flows match rows with `cart-row-(?!error-).+`. The quantity Text carries an accessibility label ("Quantity N"), so quantity asserts use `(Quantity )?N`. Native Alert buttons are tapped through `subflows/confirm-alert.yaml` (`BUTTON` env, `(?i)` regex because Android may uppercase labels, `below: (?i)Are you sure\?` kept as a safeguard only: the confirm labels no longer collide with the footer Clear Cart button). The product page sits above the tabs, so flow 17 goes back (Android `back`, iOS header back by label) and waits for `tab-cart` before opening the Cart.

Orders ids: `tab-orders`, `orders-list`, `order-row-<orderId>`, `orders-retry`, `orders-sign-in`, `orders-empty-action`, `orders-load-more-retry`, and on the detail `order-detail`, `order-status`, `order-payment-status`, `order-total`, `order-pay-now`, `order-cancel`, `order-retry`, `order-error-back`, `order-inline-error`, `order-sign-in`, `order-header-back`. `order-header-back` only exists when the detail was opened by deep link (nothing to go back to). Rows are `order-row-<id>` only, but flows 20, 21 and 23 still use `order-row-(?!error-).+` as a guard; `order-status` and `order-payment-status` are matched exactly, never with `order-.+`. Paying (`order-pay-now`, opens the payment browser) and cancelling (`order-cancel`) change real orders and are manual only (MANUAL.md); flows 20 to 24 are UNRUN like the rest.

Notifications flows (33 to 36) are UNRUN like the rest. The signed-in empty state needs an account with no orders, and the "New" marker needs an order to change between visits; both are manual (MANUAL.md). Flows 01 to 36 and `subflows/` only tap tabs by `tab-*` id (no coordinates, swipes or positions), so the fifth tab broke none of them.

Notifications ids: `tab-notifications`, `notifications-list`, `notification-row-<orderId>-<kind>`, `notification-new`, `notifications-sign-in`, `notifications-retry`, `notifications-empty-action`.

Messages flows (37 to 41) are UNRUN like the rest. Messages ids: `shop-messages`, `shop-messages-badge`, `header-messages`, `header-messages-badge` (a dot, no number), `messages-list`, `messages-input`, `messages-send`, `message-<id>`, `message-unsent`, `message-failed-retry`, `messages-sign-in`, `messages-retry`, `messages-empty-action`. Realtime delivery, the unread dot with a staff reply, and the keyboard need a device or a second actor (a staff account), so they are device checks (MANUAL.md); `shop-messages-badge` / `header-messages-badge` are only asserted absent signed out. Flow 38 is the only one that writes data; its text is unique per run via `evalScript`. Flows 32 and 37 to 41 start from `launch.yaml` and wait with `extendedWaitUntil` after each navigation. The Shop search placeholder is now "Search" (its `accessibilityLabel` is still "Search pieces"); flows 09 to 11, 28, 29 and 32 use ids, so none broke.

Product ids: `product-gallery`, `product-name`, `product-price`, `product-swatch-<color>`, `product-size-<size>`, `product-add-to-cart`, `product-retry`, `product-error-back`, `product-inline-error`, `product-unavailable`, `product-rating` (only with reviews), `product-cart`, `product-cart-badge`, `product-gallery-counter`, `product-stock`, `product-description`. The sticky bottom bar (`product-cart`, `product-add-to-cart`) is always visible, so flows 12 to 14 and 17 no longer scroll to Add to Cart. Flow 15 also asserts that no bar shows for a missing product. Flows 43 (gallery swipe, conditional on `product-gallery-counter`) and 44 (cart count after two adds, writes data) are UNRUN. Sold-out options cannot be selected is a device check (MANUAL.md): it needs a product with a sold-out variant. Flows 12 to 14 open the first Shop card, then tap the first enabled swatch and size (`product-swatch-.+`, `product-size-.+` with `enabled: true`) after a bounded `scrollUntilVisible`. The backend therefore needs an in-stock product with variants as the first Shop card; 14 also needs `TEST_EMAIL` and `TEST_PASSWORD`, 15 needs neither. The deep-link scheme is `silhoufitmobile` (app.json). `back` in 12 only runs on Android. Flow 15 may be interrupted by the dev launcher in a dev build.

Note: Maestro `id:` is a full-string regex. Tab labels and `type.label` text render uppercase on Android, so match them with `(?i)`.

Helpers: `subflows/confirm-alert.yaml` (native Alert button by text), `subflows/launch.yaml` (clear state, wait up to 10 s for `intro-loader` to vanish), `subflows/relaunch.yaml` (same, keeps session), `subflows/sign-in.yaml` (Profile tab, Sign In, fill, submit, wait for `profile-name`).

Google flows (25 to 27) need no Google credentials: the consent screen is never automated. 25 and 26 need only `APP_ID`; 27 also needs `TEST_EMAIL` and `TEST_PASSWORD`. All flows here are UNRUN.

Device-only checks are in `MANUAL.md`.
