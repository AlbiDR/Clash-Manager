// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/services

> Layer 1 singletons and state orchestrators: persistence, sync, the reusable list "Console" engine, connectivity, platform bridges, and the PWA lifecycle.

**Layer 1 (@core)** | may import any sibling `@core` module - [`@core/api`](../api/README.md), [`@core/config`](../config/README.md), [`@core/types`](../types/README.md), [`@core/utils`](../utils/README.md), and other services in this directory | imports nothing above it: `@shared`, `@features`, and `@app` are forbidden and enforced by the `fe-no-higher-layer-import-in-core` dependency-cruiser rule.

This is the single registry for these services; higher-layer READMEs link here rather than re-listing them.

## Data, storage and sync

| Service | Role |
| :--- | :--- |
| `StorageService.ts` | Persistence engine over IndexedDB (via `idbKernel`), with an in-memory fallback. |
| `useClashDataStore.ts` | The central store for clan datasets; delegates syncing to `useClashSync`. |
| `useClashSync.ts` | Hydrates the store from cache, then refreshes from Supabase in the background. |
| `useClashLoader.ts` | Route-level hydration that awaits cache before firing a network refresh (stale-while-revalidate). |
| `useStoragePersistence.ts` | Requests durable storage so data is not silently evicted. |
| `useSelectionStore.ts` | Tracks selected item ids for batch operations. |

## Lists and the Console engine

| Service | Role |
| :--- | :--- |
| `useConsoleController.ts` | Drives the list views ([Roster](../../features/roster/README.md), [Headhunter](../../features/headhunter/README.md)): filtering, sorting, progressive rendering. |
| `useConsoleSelection.ts` | Batch selection logic (select all, select by score). |
| `useConsoleMetadata.ts` | Connectivity and statistics badges for a console. |
| `useListFilter.ts` | Search and sort over large datasets, cached with `WeakMap`. |
| `useProgressiveList.ts` | Time-sliced rendering (`requestIdleCallback`) to hold 60fps. Configured with a default `initialSize` of 12 items, transition safety controls, and a robust fallback to `requestAnimationFrame` for environments lacking idle scheduling. |
| `useBlitzMode.ts` | The batch deep-link "Blitz" pipeline shared by the console views. |

## Connectivity and platform bridges

| Service | Role |
| :--- | :--- |
| `useConnectivityManager.ts` | Resolves overall system health and sync confidence. |
| `useConnectionStatus.ts` | Unifies network status and API availability. |
| `useNetworkInfo.ts` | Network telemetry (RTT, downlink) and degradation detection. |
| `useVisibilityRefresh.ts` | Refreshes data when the document regains focus. |
| `useBroadcastChannel.ts` | Cross-tab state sync (settings, dismissals). |
| `useNativeBridge.ts` | Brokers the [Android bridge](../../../../APK/README.md): permissions and Blitz calibration for the wrapper. |
| `useExternalLink.ts` | OS intents and Clash Royale deep links. |
| `useShare.ts` / `useShareTarget.ts` | Web Share API and inbound shared player tags. |
| `useBadge.ts` | App badges, native or notification-based. |

## App shell, settings and modes

| Service | Role |
| :--- | :--- |
| `useAppSettings.ts` | Application settings and feature flags, mirrored to LocalStorage and IndexedDB. |
| `useConfirm.ts` | Global modal confirmation service (replacing native `confirm()` with styled MD3 ConfirmDialog) to eliminate unstyled system blocks in Android.
| `usePwaManager.ts` | PWA update/recovery lifecycle and direct latest APK download dispatch via the stable `clashmanager-latest.apk` release alias. |
| `useUiCoordinator.ts` | Global layout spacing and floating-action-button state. |
| `useBackHandler.ts` | Hardware back-button behavior in the wrapper. |
| `useBenchmarking.ts` | Compares a member's stats against clan averages in a single pass. |
| `useDeepLinkHandler.ts` | Expands and scrolls to an item from URL parameters. |
| `useSystemInfo.ts` | Source of truth for app version and the global display modes. |
| `useShowcaseMode.ts` / `useBlueprintMode.ts` / `useSyntheticMode.ts` | The Showcase (demo), Blueprint (skeleton), and Synthetic (mock-data) modes. |
| `useToast.ts` | Global toasts with haptic pairing. |

### Declarative Global Dialog Confirmation (`useConfirm.ts`)

The modal confirmation composable provides a robust, styled replacement for the native browser/WebView `window.confirm()` method to prevent blocking and unstyled system alerts:
- **State Isolation:** Implements global, reactive, single-active confirmation state (`active` ref) scoped strictly to Layer 1 Core.
- **Asynchronous Flow:** Exposes a promise-driven `confirm(pendingConfirmationOptions)` method that pauses execution and resolves to `isUserActionConfirmed` (boolean) once the user interacts with the UI dialog, ensuring clean linear usage.
- **Tone & Ergonomics:** Supports custom dialog text, customized button labels, and visual tone configuration (`danger` vs `default`) to convey destructive semantics (e.g. factory resets or API URL resets).

### PWA Updates and APK Resolution Lifecycle (`usePwaManager.ts`)

The PWA lifecycle orchestrator implements robust mechanisms to ensure both the browser-based client and the native Android wrapper can recover and upgrade seamlessly:

1. **Service Worker (SW) Coexistence:** Coordinates update checks and skips waiting states when an updated SW is staged, ensuring a fresh asset envelope is downloaded and applied immediately on reload.
2. **Direct Latest APK Download:** The Android companion app is built with unique version and build suffixes (e.g., `+148`), while CI also publishes a fixed `APK/release/clashmanager-latest.apk` alias. At the download trigger:
   - Always downloads from the fixed raw GitHub URL for `clashmanager-latest.apk`.
   - Reads `latest.json` only to recover the versioned save filename and compare the remote build number against native bridge metadata when available.
   - Dispatches the stable resource URL to `downloadApkFile`/`openExternalUrl` on the native bridge if running inside the Android wrapper, or falls back to standard browser `window.location.href` assignment.
3. **Disaster Recovery (Factory Reset):** Houses destructive state purge routines. When a factory reset is initiated, it unregisters active Service Workers, purges all named browser CacheStorage buckets, wipes LocalStorage/SessionStorage, and invokes IndexedDB destruction (`idb.destroyAll()`) to ensure an absolute clean slate on reload.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md) | [`@core/api`](../api/README.md) | [`@core/utils`](../utils/README.md)
- [`@shared`](../../shared/README.md) - Layer 2 composables wrap several services (e.g. `useHaptics` delegates to the platform bridge; Voyage composables read from `@core` stores)
- [APK](../../../../APK/README.md) - `useNativeBridge.ts` brokers the Android bridge; its native contract is defined in the APK layer
