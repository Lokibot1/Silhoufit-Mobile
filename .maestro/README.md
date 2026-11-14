# Maestro flows

UNRUN: written without Maestro or a device available. Expect small selector/timing fixes on first run.

## Prerequisites
- Maestro installed, and an emulator or device running a dev build (preferred) with the dev server reachable. In Expo Go, `appId` is `host.exp.exponent`, `launchApp` opens the Expo Go home (not the project) and `clearState` wipes all Expo Go data, so use a dev build.
- A seeded customer account on the dev backend (the app talks to `EXPO_PUBLIC_API_URL` and the same Supabase project).

## Env vars
| Var | Meaning |
|---|---|
| `APP_ID` | Bundle/package id of the build (required) |
| `TEST_EMAIL` | Seeded customer email (required) |
| `TEST_PASSWORD` | Its password (required) |
| `WRONG_PASSWORD` | Optional, only 03. Defaults to `Wrong-Password-1!` (declared in the flow header) |
| `UNKNOWN_EMAIL` | Optional, only 03. An email that must not exist; defaults to `nobody-e2e-unknown@example.com` |

## Run
```
maestro test -e APP_ID=com.example.silhoufit -e TEST_EMAIL=a@b.com -e TEST_PASSWORD=secret .maestro/
```
Single flow: pass its file instead of the folder. `subflows/` is a helper folder and is not run on its own.

## Flows (Profile cycle)
All auth lives on the Profile tab, not Shop. Ids used: `intro-loader`, `tab-profile`, `profile-sign-in`, `profile-name`, `profile-sign-out`, `sign-in-*`, `toast`.

| Flow | Covers |
|---|---|
| 01 | Cold start, Profile tab shows the signed-out prompt, no redirect to sign-in |
| 02 | Empty form: required errors |
| 03 | Wrong password and unknown email show identical copy |
| 04 | Sign in from Profile: modal closes, name visible, "Signed in as" toast |
| 05 | Session survives stopApp + relaunch without clearState, prompt never shown |
| 06 | Sign out: prompt returns, "Signed out" toast, name gone |
| 07 | Show/Hide password toggle |
| 08 | Signed-out prompt title and message |

Helpers: `subflows/launch.yaml` (clear state, wait up to 10 s for `intro-loader` to vanish), `subflows/relaunch.yaml` (same, keeps session), `subflows/sign-in.yaml` (Profile tab, Sign In, fill, submit, wait for `profile-name`).

Device-only checks are in `MANUAL.md`. The Shop tab is still a placeholder; no flow depends on its `shop-*` ids.
