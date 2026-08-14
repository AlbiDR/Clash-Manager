// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Android Wrapper (APK)

> The Android build of Clash Manager: a custom WebView wrapper around the PWA, plus a native layer that automates sending clan invites inside Clash Royale.

This is a hand-written WebView app scaffolded on a Bubblewrap/TWA base. The Trusted Web Activity plumbing is left in place but dormant; the app actually launches through a custom `MainActivity` WebView so it can expose a native bridge and run background automation the browser cannot. The source of truth is the Java in [`src/`](src); the shipped binary is `android/classes.dex`.

## Blitz Mode

The headline native feature. When you multi-select recruits in the app and hit Blitz, the wrapper:

1. Opens each recruit's profile in Clash Royale via a deep link.
2. Uses an overlay service and an accessibility service to tap the invite button automatically, at coordinates you calibrate once.
3. Cycles through the whole queue, so batch recruiting in the PWA becomes hands-free invites in the game.

The [PWA](../Frontend-PWA/README.md) drives this through the [`window.AndroidBridge`](../Frontend-PWA/src/core/types/README.md) object; the presence of that object is how the PWA knows it is running inside the wrapper.

## Native components

Java classes in [`src/com/albidr/clashmanager/`](src/com/albidr/clashmanager):

| Class | Role |
| :--- | :--- |
| `MainActivity` | The WebView host and the `AndroidBridge` JavaScript interface. Hardens the WebView and handles Clash Royale deep links. |
| `BlitzService` | Foreground service that draws the calibration overlay and drives the invite queue. |
| `ClashManagerAccessibilityService` | Dispatches the synthetic taps that press invite/close in-game. |
| `Application` | App initialization entry point. |
| `LauncherActivity`, `DelegationService` | Dormant TWA scaffolding, retained but not the launcher. |

Declared permissions: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, `VIBRATE`, `INTERNET`, `REQUEST_INSTALL_PACKAGES`.

## The JavaScript bridge

| Method | Returns | Purpose |
| :--- | :--- | :--- |
| `isAndroidWrapper()` | boolean | True when running inside the wrapper. |
| `isAccessibilityActive()` | boolean | Whether the accessibility service is running. |
| `hasOverlayPermission()` | boolean | Whether `SYSTEM_ALERT_WINDOW` is granted. |
| `canRequestPackageInstalls()` | boolean | Whether Android allows this app to request user-confirmed APK installs. |
| `openPackageInstallSettings()` | void | Opens the per-app Android screen for allowing APK install requests. |
| `openAccessibilitySettings()` | void | Opens the system accessibility settings. |
| `getCoordinates()` / `saveCoordinates(ix, iy, cx, cy)` | string / void | Read and persist Blitz calibration coordinates. |
| `startBlitz(tagsJson)` | void | Starts a Blitz sequence for the given player tags. |
| `openPlayerProfile(tag)` | void | Deep-links to a Clash Royale player profile. |
| `openExternalUrl(url)` | void | Opens a URL via an Android intent. |

The PWA-side contract for these methods lives in [`core/types`](../Frontend-PWA/src/core/types/README.md); changing a signature here means changing it there too.

## Contents

| Path | Role |
| :--- | :--- |
| `src/` | Java source (the authoritative source of truth). |
| `android/` | Decoded APK: `AndroidManifest.xml`, `apktool.yml` (version), `classes.dex` (built from `src/`), `res/`. |
| `release/` | The signed release APK, committed by CI. |
| `reference/` | Reference archives (twa-manifest, web app manifest). |
| `build-apk.sh` | Compiles `src/` to DEX, merges it into `android/`, then aligns, signs, and verifies. |
| `gen-android-icons.mjs` | Adaptive launcher-icon generator. |
| `verify-apk-integrity.mjs`, `verify-android-source.mjs`, `verify-apk-drift.mjs`, `audit-wrapper-integrity.mjs` | The guardrails (see below). |

## Build

```bash
pnpm apk:check            # compile from src/ and verify integrity, unsigned (typical dev flow)
pnpm icons:android        # regenerate adaptive launcher icons
```

`build-apk.sh` requires JDK 17 (it rejects newer system JDKs) and the Android build-tools under `~/.bubblewrap/android_sdk`. Running it without `--no-sign` also signs, if a local keystore is present.

Signed release builds run in CI (`.github/workflows/apk-release.yml`): it decodes the keystore from secrets, builds, aligns, signs, verifies the signature, runs the integrity gate, and commits the signed `release/clashmanager-v<version>+<buildNumber>.apk` back to Beta. `<buildNumber>` is CI's monotonic `github.run_number`, distinct from `versionCode` (which is derived purely from `<version>` - see `verify-apk-integrity.mjs`), so two builds of the same version can still be told apart from a downloaded file alone. `release/latest.json` points at that one tracked versioned filename and build number for scripts, older clients, DownloadManager save names, and already-current update checks.

## Guardrails

| Check | Command / trigger | What it protects |
| :--- | :--- | :--- |
| `verify-android-source.mjs` | `pnpm apk:verify:source`; runs on every `APK/**` push | The native layer is present in the source tree. |
| `verify-apk-integrity.mjs` | `pnpm apk:verify <path>`; release gate | A built APK still contains every custom component, permission, and bridge method (catches stripped builds). |
| `audit-wrapper-integrity.mjs` | `pnpm audit:apk` | Manifest, color, shortcut, and version parity across the PWA manifest, `apktool.yml`, and friends. |
| `verify-apk-drift.mjs` | manual | The committed APK matches a fresh build (catches "edited `android/` but forgot to rebuild"). |

## Do not

- Rebuild with `bubblewrap build`. It overwrites the custom native layer with a generic TWA shell. Use `build-apk.sh`.
- Delete maskable icons or remove permissions from `AndroidManifest.xml`. The guardrails will fail the build.

## See also

- [Root README](../README.md) | [Frontend PWA](../Frontend-PWA/README.md) - the PWA this wrapper embeds
- [`core/types` bridge contract](../Frontend-PWA/src/core/types/README.md) - the `AndroidBridge` interface that must stay in sync with the native methods above
- [`@core/services`](../Frontend-PWA/src/core/services/README.md) - `useNativeBridge.ts` is the PWA-side broker for this native layer
- Feature consumers: [`@features/headhunter`](../Frontend-PWA/src/features/headhunter/README.md) - the feature that drives `startBlitz` | [`@features/settings`](../Frontend-PWA/src/features/settings/README.md) - the feature that exposes Blitz calibration (`saveCoordinates`/`getCoordinates`) and bridge detection
