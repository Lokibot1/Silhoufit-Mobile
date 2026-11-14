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
