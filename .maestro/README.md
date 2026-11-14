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
All auth lives on the Profile tab, not Shop; Shop is public. Ids used: `shop-list`, `shop-card-<id>` (and `shop-card-<id>-image`, so flows match cards with `shop-card-(?!.*-image$).+`), `shop-count`, `shop-search`, `shop-search-clear`, `shop-empty`, `shop-retry`, `shop-load-more-retry`, `intro-loader`, `tab-profile`, `profile-sign-in`, `profile-name`, `profile-sign-out`, `sign-in-*` (including `sign-in-divider`, `sign-in-google`), `toast`.

| Flow | Covers |
|---|---|
| 01 | Signed-out cold start lands on the Shop (no redirect), then the Profile tab shows the signed-out prompt |
| 02 | Empty form: required errors |
| 03 | Wrong password and unknown email show identical copy |
| 04 | Sign in from Profile: modal closes, name visible, "Signed in as" toast |
| 05 | Session survives stopApp + relaunch without clearState, prompt never shown |
| 06 | Sign out: prompt returns, "Signed out" toast, name gone |
| 07 | Show/Hide password toggle |
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

Cart ids: `tab-cart`, `cart-list`, `cart-row-<itemId>`, `cart-qty-<itemId>`, `cart-inc-<itemId>`, `cart-dec-<itemId>`, `cart-remove-<itemId>`, `cart-row-error-<itemId>`, `cart-clear`, `cart-subtotal`, `cart-count`, `cart-sign-in`, `cart-retry`, `cart-empty-action`. Remove and Clear Cart confirm with a native `Alert`, so Maestro taps its buttons by text ("Cancel", "Remove Item", "Clear All Items"); there are no `cart-confirm-*` ids. Flows 16 to 19 are UNRUN like the rest. Collision guard: `cart-row-<id>` is also a prefix of `cart-row-error-<id>`, so flows match rows with `cart-row-(?!error-).+`. The quantity Text carries an accessibility label ("Quantity N"), so quantity asserts use `(Quantity )?N`. Native Alert buttons are tapped through `subflows/confirm-alert.yaml` (`BUTTON` env, `(?i)` regex because Android may uppercase labels, `below: (?i)Are you sure\?` kept as a safeguard only: the confirm labels no longer collide with the footer Clear Cart button). The product page sits above the tabs, so flow 17 goes back (Android `back`, iOS header back by label) and waits for `tab-cart` before opening the Cart.

Orders ids: `tab-orders`, `orders-list`, `order-row-<orderId>`, `orders-retry`, `orders-sign-in`, `orders-empty-action`, `orders-load-more-retry`, and on the detail `order-detail`, `order-status`, `order-payment-status`, `order-total`, `order-pay-now`, `order-cancel`, `order-retry`, `order-error-back`, `order-inline-error`, `order-sign-in`, `order-header-back`. `order-header-back` only exists when the detail was opened by deep link (nothing to go back to). Rows are `order-row-<id>` only, but flows 20, 21 and 23 still use `order-row-(?!error-).+` as a guard; `order-status` and `order-payment-status` are matched exactly, never with `order-.+`. Paying (`order-pay-now`, opens the payment browser) and cancelling (`order-cancel`) change real orders and are manual only (MANUAL.md); flows 20 to 24 are UNRUN like the rest.

Product ids: `product-gallery`, `product-name`, `product-price`, `product-swatch-<color>`, `product-size-<size>`, `product-add-to-cart`, `product-retry`, `product-error-back`, `product-inline-error`, `product-unavailable`. Flows 12 to 14 open the first Shop card, then tap the first enabled swatch and size (`product-swatch-.+`, `product-size-.+` with `enabled: true`) after a bounded `scrollUntilVisible`. The backend therefore needs an in-stock product with variants as the first Shop card; 14 also needs `TEST_EMAIL` and `TEST_PASSWORD`, 15 needs neither. The deep-link scheme is `silhoufitmobile` (app.json). `back` in 12 only runs on Android. Flow 15 may be interrupted by the dev launcher in a dev build.

Note: Maestro `id:` is a full-string regex. Tab labels and `type.label` text render uppercase on Android, so match them with `(?i)`.

Helpers: `subflows/confirm-alert.yaml` (native Alert button by text), `subflows/launch.yaml` (clear state, wait up to 10 s for `intro-loader` to vanish), `subflows/relaunch.yaml` (same, keeps session), `subflows/sign-in.yaml` (Profile tab, Sign In, fill, submit, wait for `profile-name`).

Google flows (25 to 27) need no Google credentials: the consent screen is never automated. 25 and 26 need only `APP_ID`; 27 also needs `TEST_EMAIL` and `TEST_PASSWORD`. All flows here are UNRUN.

Device-only checks are in `MANUAL.md`.
