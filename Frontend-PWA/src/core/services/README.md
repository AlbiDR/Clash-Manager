// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/services

> Layer 1 singletons and state orchestrators: persistence, sync, the reusable list "Console" engine, connectivity, platform bridges, and the PWA lifecycle.

**Layer 1 (@core)** | may import `@core/api` and `@core/utils` | imports nothing above it.

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
| `useConsoleController.ts` | Drives the list views (Roster, Headhunter): filtering, sorting, progressive rendering. |
| `useConsoleSelection.ts` | Batch selection logic (select all, select by score). |
| `useConsoleMetadata.ts` | Connectivity and statistics badges for a console. |
| `useListFilter.ts` | Search and sort over large datasets, cached with `WeakMap`. |
| `useProgressiveList.ts` | Time-sliced rendering (`requestIdleCallback`) to hold 60fps. |
| `useBlitzMode.ts` | The batch deep-link "Blitz" pipeline shared by the console views. |

## Connectivity and platform bridges

| Service | Role |
| :--- | :--- |
| `useConnectivityManager.ts` | Resolves overall system health and sync confidence. |
| `useConnectionStatus.ts` | Unifies network status and API availability. |
| `useNetworkInfo.ts` | Network telemetry (RTT, downlink) and degradation detection. |
| `useVisibilityRefresh.ts` | Refreshes data when the document regains focus. |
| `useBroadcastChannel.ts` | Cross-tab state sync (settings, dismissals). |
| `useNativeBridge.ts` | Brokers the Android bridge: permissions and Blitz calibration for the wrapper. |
| `useExternalLink.ts` | OS intents and Clash Royale deep links. |
| `useShare.ts` / `useShareTarget.ts` | Web Share API and inbound shared player tags. |
| `useBadge.ts` | App badges, native or notification-based. |

## App shell, settings and modes

| Service | Role |
| :--- | :--- |
| `useAppSettings.ts` | Application settings and feature flags, mirrored to LocalStorage and IndexedDB. |
| `usePwaManager.ts` | PWA update and recovery lifecycle, plus the Android APK update URL. |
| `useUiCoordinator.ts` | Global layout spacing and floating-action-button state. |
| `useBackHandler.ts` | Hardware back-button behavior in the wrapper. |
| `useBenchmarking.ts` | Compares a member's stats against clan averages in a single pass. |
| `useDeepLinkHandler.ts` | Expands and scrolls to an item from URL parameters. |
| `useSystemInfo.ts` | Source of truth for app version and the global display modes. |
| `useShowcaseMode.ts` / `useBlueprintMode.ts` / `useSyntheticMode.ts` | The Showcase (demo), Blueprint (skeleton), and Synthetic (mock-data) modes. |
| `useToast.ts` | Global toasts with haptic pairing. |

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md) | [`@core/api`](../api/README.md) | [`@core/utils`](../utils/README.md)
- [`@shared`](../../shared/README.md) - Layer 2 composables wrap several services (e.g. `useHaptics` delegates to the platform bridge; Voyage composables read from `@core` stores)
- [APK](../../../../APK/README.md) - `useNativeBridge.ts` brokers the Android bridge; its native contract is defined in the APK layer
