# Maestro flows

UNRUN: written without Maestro or a device available. Expect small selector/timing fixes on first run.

## Prerequisites
- Maestro installed, an emulator or device running a dev build (preferred) with the dev server reachable. In Expo Go, `appId` is `host.exp.exponent` but `launchApp` opens the Expo Go home, not the project, and `clearState` wipes all Expo Go data, so use a dev build.
- A seeded customer account on the dev backend.

## Env vars
| Var | Meaning |
|---|---|
| `APP_ID` | Bundle/package id of the build (required) |
| `TEST_EMAIL` | Seeded customer email (required) |
| `TEST_PASSWORD` | Its password (required) |
| `WRONG_PASSWORD` | Optional, defaults to a wrong value |
| `UNKNOWN_EMAIL` | Optional, an email that must not exist |

## Run
```
maestro test -e APP_ID=com.example.silhoufit -e TEST_EMAIL=a@b.com -e TEST_PASSWORD=secret .maestro/
```
Single flow: pass its file instead of the folder. `subflows/` is not run on its own. Device-only checks are in `MANUAL.md`.
