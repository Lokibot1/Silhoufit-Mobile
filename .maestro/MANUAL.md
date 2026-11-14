# Manual device checks

Not automatable with Maestro (or too flaky). Run on a real Android and iOS device before release.

- [ ] Airplane mode during sign-in: banner reads "Can't reach the sign-in service. Check your connection and try again." and the button re-enables. (Maestro's `setAirplaneMode` is Android only and unreliable on physical devices, so this is manual.)
- [ ] Emoji typed or pasted into Email and Password: inline "can't contain emoji" error, no crash (Hermes regex).
- [ ] Background the app for a while, foreground it: session still valid, token refreshed, no sign-in prompt.
- [ ] 320px-wide screen with the keyboard open: fields, errors, banner and Sign In button reachable by scrolling, no horizontal scroll.
- [ ] TalkBack and VoiceOver: field labels, inline errors (live region), banner (alert), the Show/Hide password label and the toast are announced.
- [ ] Rapid double-tap on Sign In: only one request is sent, the button shows busy/disabled.
