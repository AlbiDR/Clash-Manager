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
| `MainActivity` | The WebView host and the `AndroidBridge` JavaScript interface. Hardens the WebView, handles Clash Royale deep links, and brokers user-confirmed APK update installs. |
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
| `openOverlaySettings()` | void | Opens the per-app Android "Display over other apps" screen. |
| `canRequestPackageInstalls()` | boolean | Whether Android allows this app to request user-confirmed APK installs. |
| `openPackageInstallSettings()` | void | Opens the per-app Android screen for allowing APK install requests. |
| `openAccessibilitySettings()` | void | Opens the system accessibility settings. |
| `getAppVersionName()` / `getAppVersionCode()` / `getBuildNumber()` | string / number / number | Reports installed APK identity so updater checks never hand Android a downgrade. |
| `getCoordinates()` / `saveCoordinates(ix, iy, cx, cy)` | string / void | Read and persist Blitz calibration coordinates. |
| `getLastBlitzRun()` | string | The last Blitz run as JSON (players, profiles opened, invite taps, outcome), so the PWA can report a run it could not watch. |
| `setThemeColors(background, dark)` | void | The PWA reports the colours it is showing, so the strips behind the status and navigation bars match the page and their icons stay readable. |
| `startBlitz(tagsJson, delayMs)` | void | Starts a Blitz sequence for the given player tags, dwelling `delayMs` on each profile. |
| `openPlayerProfile(tag)` | void | Deep-links to a Clash Royale player profile. |
| `openExternalUrl(url)` | void | Opens a URL via an Android intent. |
| `downloadApkFile(url, filename, sha256?)` | boolean | Downloads the latest APK through `DownloadManager`, verifies SHA-256 when metadata provides it, then opens Android's installer for user confirmation. |

The PWA-side contract for these methods lives in [`core/types`](../Frontend-PWA/src/core/types/README.md); changing a signature here means changing it there too.

## Contents

| Path | Role |
| :--- | :--- |
| `src/` | Java source (the authoritative source of truth). |
| `android/` | Decoded APK: `AndroidManifest.xml`, `apktool.yml` (version), `classes.dex` (built from `src/`), `res/`. |
| `release/` | The signed release APK, committed by CI. |
| `reference/` | Reference archives (twa-manifest, web app manifest). |
| `build-apk.sh` | Compiles `src/` to DEX, merges it into `android/`, then aligns, signs, and verifies. `--check` proves the committed dex was built from `src/`. |
| `toolchain.json`, `toolchain-env.sh`, `fetch-build-deps.mjs` | The pinned toolchain (JDK, build-tools, platform, apktool, compile and test jars) and its resolver. Downloads are sha256-checked and cached in the ignored `.deps/`. |
| `test/`, `test-apk.sh` | JVM unit tests for the Java in `src/`, run without a device. |
| `gen-android-icons.mjs` | Adaptive launcher-icon generator. |
| `verify-*.mjs`, `audit-wrapper-integrity.mjs` | The guardrails (see below). |

## Build

```bash
pnpm apk:check            # compile from src/, merge into android/classes.dex, package unsigned, verify integrity (typical dev flow)
pnpm apk:check:source     # prove the committed classes.dex was built from src/ (writes no tracked file)
pnpm apk:test             # run the JVM unit tests in test/
pnpm icons:android        # regenerate adaptive launcher icons
```

Every tool version is pinned in [`toolchain.json`](toolchain.json): the JDK (25, the newest LTS; it only compiles, the phone runs ART), the Java source level, build-tools, the platform, apktool, and the jars the source compiles against. `toolchain-env.sh` finds a matching JDK and an Android SDK (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the legacy `~/.bubblewrap/android_sdk`) and refuses any other JDK, because a different javac compiles different bytecode from the same source. `fetch-build-deps.mjs` downloads the pinned jars from their official repositories, checks each sha256, and caches them in the ignored `.deps/`. The same scripts run on a Mac, on Linux and in CI. After changing anything in `src/`, run `pnpm apk:check` and commit the rebuilt `android/classes.dex`; CI fails the push otherwise. Running `build-apk.sh` without `--no-sign` also signs, if a local keystore is present.

Signed release builds run in CI (`.github/workflows/apk-release.yml`): it decodes the keystore from secrets, builds, aligns, signs, verifies the signature, runs the integrity gate, and commits the signed `release/clashmanager-v<version>+<buildNumber>.apk` back to Beta. `<buildNumber>` is CI's monotonic `github.run_number`, distinct from `versionCode` (which is derived purely from `<version>` - see `verify-apk-integrity.mjs`), so two builds of the same version can still be told apart from a downloaded file alone. `release/latest.json` points at that one tracked versioned filename and build number for scripts, older clients, DownloadManager save names, and already-current update checks.

## Seeing it run

`./APK/build-apk.sh --dev` builds **CM Dev**: the same native code under its own package id (`com.albidr.clashmanager.dev`), debuggable, signed with the local debug key, so it installs next to the real app. It loads the live PWA by default; `CLASHMANAGER_DEV_URL=http://localhost:5173/Clash-Manager/` points it at the local dev server, reached from the device with `node APK/apk-dev.mjs reverse 5173`.

`node APK/apk-dev.mjs` drives it over adb: `install`, `start` (`--rehearsal` runs Blitz without opening Clash Royale, which switches USB debugging off while it is open), `shot`, `ui`, `logs`, `eval "<js>"` inside the WebView, and `emulator`.

`node APK/apk-dev.mjs emulator` creates (once) and boots the virtual phone pinned in `toolchain.json` (Android 16 at the owner's Pixel 10 screen size) and prints its serial; with a phone also attached, set `ANDROID_SERIAL` to choose. It draws with the Mac's GPU, at the Pixel 10's exact layout size but a lower pixel density, without sound or cameras; `pnpm apk:emulator:app` builds **Clash Manager Emulator.app** in `/Applications`, which starts it from Finder or the Dock with no terminal or agent (rebuild it after moving the repository). `node APK/apk-dev.mjs debloat` disables the preinstalled Google apps that sync in the background (listed in `toolchain.json`, undone with `adb shell pm enable <package>`). It needs the SDK's `emulator` package and that system image installed. Clash Royale does not run there, so real-game checks stay on a phone; rehearsals cover the rest. Accessibility is a security setting and is switched on by a person, once per install.

## Guardrails

| Check | Command / trigger | What it protects |
| :--- | :--- | :--- |
| `verify-android-source.mjs` | `pnpm apk:verify:source`; runs on every `APK/**` push | The native layer is present in the source tree. |
| `verify-dex-source.mjs` | `pnpm apk:check:source`; runs on every `APK/**` push | The committed `classes.dex` holds exactly the app classes `src/` compiles to: nothing stale, nothing unbuilt, no leftovers. |
| `verify-bridge-contract.mjs` | `pnpm apk:verify:bridge`; runs on every push touching `APK/**` or the PWA contract | The Java `@JavascriptInterface` methods, the PWA's `AndroidBridge` type and the release gate's list agree on names, argument counts and types. |
| `verify-dwell-parity.mjs` | `pnpm apk:verify:dwell`; runs on every push touching `APK/**` or the PWA config | BlitzService's dwell range, step and detents match the PWA's Blitz Speed settings. |
| `test/` | `pnpm apk:test`; runs on every `APK/**` push | JVM unit tests for the Java (Blitz dwell mapping and formatting today). |
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
