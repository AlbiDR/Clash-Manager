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
| `useClashSyncUtils.ts` | Pure sync helpers: timeout-bound network fetching, empty DTO initialization, error normalization. |
| `useClashLoader.ts` | Route-level hydration that awaits cache before firing a network refresh (stale-while-revalidate). |
| `useStoragePersistence.ts` | Requests durable storage so data is not silently evicted. |
| `useSelectionStore.ts` | Tracks selected item ids for batch operations. |

## Lists and the Console engine

| Service | Role |
| :--- | :--- |
| `useConsoleController.ts` | Drives the list views ([Roster](../../features/roster/README.md), [Headhunter](../../features/headhunter/README.md)): filtering, sorting, progressive rendering. |
| `useConsoleSelection.ts` | Batch selection logic (select all, select by score). |
| `useConsoleMetadata.ts` | Connectivity and statistics badges for a console. |
| `useListFilter.ts` | Search and sort over large datasets, cached with `WeakMap`, supporting persistent sorting preferences and reactive cache invalidation. |
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
| `usePowerSaving.ts` | Brokers native Android Battery Saver status, maintaining reactive state and DOM attributes. |
| `useExternalLink.ts` | OS intents and Clash Royale deep links. |
| `useShare.ts` / `useShareTarget.ts` | Web Share API and inbound shared player tags. |
| `useBadge.ts` | App badges, native or notification-based. |

## App shell, settings and modes

| Service | Role |
| :--- | :--- |
| `useAppSettings.ts` | Application settings and feature flags, mirrored to LocalStorage and IndexedDB. |
| `useConfirm.ts` | Global modal confirmation service (replacing native `confirm()` with styled MD3 ConfirmDialog) to eliminate unstyled system blocks in Android. |
| `apkManagerUtils.ts` | Pure helper functions, formatting utilities, and version comparison logic for APK update management. |
| `apkResolver.ts` | Dynamic APK release metadata, version matching, and filename resolution utility. |
| `apkResolverUtils.ts` | Pure utilities, constants, types, and helpers for companion APK version parsing and release resolution. |
| `useApkManager.ts` | Native APK shell update management (installed vs published release comparison, download dispatching, and bridge state). |
| `useUiCoordinator.ts` | Global layout spacing and floating-action-button state. |
| `useDismissOnBack.ts` | Back (Android button or gesture, browser Back) closes the top-most open overlay instead of leaving the screen. |
| `useBenchmarking.ts` | Compares a member's stats against clan averages in a single pass. |
| `useDeepLinkHandler.ts` | Expands and scrolls to an item from URL parameters. |
| `useSystemInfo.ts` | Source of truth for app version and the global display modes. |
| `useShowcaseMode.ts` / `useBlueprintMode.ts` / `useSyntheticMode.ts` | The Showcase (demo), Blueprint (skeleton), and Synthetic (mock-data) modes. |
| `useToast.ts` | Global toasts with haptic pairing. |

### Statistical Clan Benchmarking Engine (`useBenchmarking.ts`)

`useBenchmarking.ts` provides normalized statistical comparisons between individual player metrics and clan baselines in Layer 1 Core:
- **WeakMap Memoization Cache (`statsCache`):** Caches calculated statistics (`lb` and `hh` `StatsMap`) in a module-level `WeakMap` keyed by the reactive `rawData` payload object reference. This eliminates O(N) recalculations across component render cycles while preventing stale store singleton state pollution, memory leaks, and cross-test contamination across store resets.
- **Single-Pass Aggregation (`calculateStats`):** Aggregates numeric metrics across candidate pools (`lb` roster members or `hh` recruits) in a single O(N) array traversal, computing mean (`avg`), `min`, and `max` boundaries while guarding against empty datasets and division by zero.
- **Context-Aware Metric Extractors:** Isolates internal clan roster metrics (`LB_EXTRACTORS`) from prospective recruit metrics (`HH_EXTRACTORS`) via context keys (`'lb'` vs `'hh'`), computing trophy ranks, win rates, war reliability, fame averages, and activity durations.
- **Performance Tier Evaluation:** Evaluates values against dataset statistics into four performance tiers (`ELITE`, `TOP TIER`, `GROWING`, `UNDER`). Automatically adjusts calculation thresholds for inverted metrics (`lowerIsBetter: true` for `lastSeen` and `lastScan` duration minutes), where lower values represent superior performance.
- **Ghost Benchmarking Safety Gate (`getSafeBenchmark`):** Gates statistical lookup behind `useAppSettings` feature flags (`ghostBenchmarking`), returning `null` safely when ghost benchmarking is disabled or when metric values are undefined.

### IndexedDB Persistence & Migration Engine (`StorageService.ts`)

`StorageService.ts` provides clinical isolation for application data persistence in Layer 1 Core:
- **Resilient Key-Value Store (`idb`):** Abstracts IndexedDB CRUD operations over `idbKernel` (`openDB`, `idbCore`) with automatic memory-store fallbacks (`memoryStore`, `forceMemoryMode()`) in unsupported, private, or restricted environments.
- **Legacy Database Migration Bridge (`migrateLegacyData`):** Automatically detects and batch-migrates key-value records from the legacy database store (`STORAGE_LEGACY_DB_NAME`) into the active store upon initialization, using domain-descriptive iteration (`recordIndex`), before purging the legacy database.
- **Deprecated Database Purging (`purgeDeprecatedDatabases`):** Asynchronously iterates through known obsolete database names (`STORAGE_DEPRECATED_DB_NAMES`) to reclaim browser storage quota and eliminate schema leakage across application updates.
- **Nuclear Reset Recovery (`destroyAll`):** Exposes an emergency recovery command that closes active database handles, deletes disk databases (`STORAGE_DB_NAME`, `STORAGE_LEGACY_DB_NAME`, and deprecated DBs), wipes in-memory backups, and forces memory mode for the remainder of the session to recover from severe persistent storage corruption.
- **WebAppData Snapshot Persistence (`loadCache` / `saveCache`):** Provides standardized helpers to hydrate and persist the raw application state snapshot DTO under `CACHE_KEY_MAIN` (`CLAN_MANAGER_DATA_V8`).

### Declarative Global Dialog Confirmation (`useConfirm.ts`)

The modal confirmation composable provides a robust, styled replacement for the native browser/WebView `window.confirm()` method to prevent blocking and unstyled system alerts:
- **Interface Contracts & Return Shape (`UseConfirmReturn`):** Formally exposes `active: Ref<ActiveConfirm | null>`, `confirm(pendingConfirmationOptions: ConfirmOptions): Promise<boolean>`, and `resolve(isUserActionConfirmed: boolean): void`. Decouples confirmation invocation sites across any layer from presentation rendering in `ConfirmDialog.vue`.
- **Singleton State Isolation (`active` ref):** Scoped to Layer 1 Core module-level reactive state (`active`), ensuring only a single modal can be presented at a time to prevent overlapping dialog conflicts and unbounded modal queues across the shell.
- **Asynchronous Promise Flow & Collision Safety:** Exposes a promise-driven `confirm()` method that immediately registers the active modal with default fallback labels (`confirmLabel: "Confirm"`, `cancelLabel: "Cancel"`, `tone: "default"`) and returns a Promise resolving to `boolean` (`isUserActionConfirmed`) once user input occurs.
- **Guarded Resolution Lifecycle:** `resolve(isUserActionConfirmed)` guards against redundant or out-of-order invocations when `active.value` is null, cleanly triggering the registered promise resolver callback before resetting the active modal state to `null`.
- **Tone & Ergonomics:** Supports custom dialog title/message, customizable action labels, and visual tone configuration (`danger` vs `default`) to visually communicate destructive actions (e.g. factory resets or API key deletions).

### Application Settings & Feature Flag Management (`useAppSettings.ts`)

`useAppSettings.ts` acts as the global feature flag and user preference manager in Layer 1 Core:
- **Valibot Validation Boundary (`ModuleStateSchema`):** Enforces strict runtime schema parsing via Valibot on raw storage snapshots and cross-tab storage payload events. Malformed or invalid settings revert safely to default configurations (`DEFAULT_STATE`) to preserve UI runtime stability.
- **Redundant Dual-Tier Persistence:** Maintains reactive singleton settings (`modules`) in `LocalStorage` (`cm_modules_v2`) for main-thread UI performance, while selectively mirroring notification preferences (`cm_notifications_enabled`, `cm_notification_threshold`) to IndexedDB (`idb`) for background Service Worker access.
- **Cross-Tab Storage Synchronization:** Listens to global `storage` events to re-validate and synchronize settings in real time across concurrent open browser tabs.
- **Type-Safe Toggle Guards:** Exposes `toggle(key)` for boolean flag inversions, enforcing strict property type checking without unsafe type assertions or `any` coercions.

### Showcase Mode Orchestration (`useShowcaseMode.ts`)

`useShowcaseMode.ts` acts as a Layer 1 master-child state orchestrator that coordinates the simultaneous activation of Synthetic (mock data) and Blueprint (skeleton UI) display states:
- **Master-Child Synchronization:** Bidirectionally synchronizes state between child composables (`useSyntheticMode` and `useBlueprintMode`) and master Showcase status. Disabling Synthetic mode automatically deactivates master Showcase mode, whereas enabling both sub-modes manually promotes Showcase status.
- **Persistence & Automation Intents:** Initializes state from `localStorage` (`clash_manager_showcase_mode`) or URL query parameters (`showcase=true`) / hash search params to support headless test automation and external rendering pipelines.
- **Blueprint Override Control:** Respects explicit blueprint override settings (`clash_manager_blueprint_mode = false`), permitting mock data orchestration without skeleton UI overlays for branding pipelines (e.g., `portfolio-stitch.html`).

### Blueprint Mode Service (`useBlueprintMode.ts`)

`useBlueprintMode.ts` manages the structural skeleton display state for interaction design and layout debugging in Layer 1 Core:
- **Triple-Tier Initialization:** Evaluates toggle status with strict fallback precedence: local persistence (`clash_manager_blueprint_mode`), direct URL parameters (`blueprint=true`), and master Showcase mode defaults unless explicitly disabled (`clash_manager_blueprint_mode !== "false"`).
- **Dual Parameter Parsing:** Incorporates fallback query parsing (`getParam`) that inspects both `window.location.search` and hash parameters (`window.location.hash`) for headless test automation and routing isolation.
- **Build-Time Skeleton Derivation:** Gates the visibility of structural UI skeletons whose geometric dimensions derive from build-time capture (`core/theme/bones.generated.json`, generated via `scripts/capture_skeletons.ts`).
- **State Persistence & Control:** Exposes reactive reference `isBlueprintMode`, `toggleBlueprintMode`, and `setBlueprintMode`, synchronizing all state mutations to `localStorage`.

### Synthetic Mode Engine (`useSyntheticMode.ts`)

`useSyntheticMode.ts` provides a global toggle for high-fidelity mock data demonstration in Layer 1 Core:
- **Interface Contracts & Return Shape (`UseSyntheticModeReturn`):** Formally exports `isSyntheticMode: Ref<boolean>`, `toggleSyntheticMode: () => void`, and `setSyntheticMode: (targetState: boolean) => void`. Satisfies CleanStack Architecture ADR Section I (Core Services) and ADR Section II (Presentation Orchestration) by establishing an authoritative, cross-cutting mock mode.
- **Singleton State Isolation (`isSyntheticMode`):** Holds reactive state at module scope, ensuring all consumers (stores, adapters, UI badges) share an identical, synchronized mock data switch without prop-drilling or event emitter overhead.
- **Dual Search & Hash Query Parameter Resolution (`getParam`):** Robust query parameter extraction inspects standard search parameters (`window.location.search`) first and falls back to hash-based query strings (`location.hash.split("?")[1]`), ensuring seamless compatibility across SPA hash routing modes while guarding against SSR/headless environments where `window` is undefined.
- **Resolution Precedence & Production Leak Protection:** Resolves initial state through a strict precedence hierarchy: (1) explicit `localStorage` persistence (`clash_manager_synthetic_mode === "true"`), (2) explicit URL query parameter (`?synthetic=true`), and (3) showcase cascade (`?showcase=true`). The showcase fallback respects an explicit `"false"` in `localStorage` to prevent showcase URLs from forcing mock data when disabled by the user.
- **Deterministic State Persistence:** Synchronously commits state updates to `localStorage` under `clash_manager_synthetic_mode` on every toggle or explicit assignment, with SSR/headless safety checks (`typeof localStorage !== "undefined"`).

### APK Resolution Lifecycle (`useApkManager.ts`, `apkManagerUtils.ts`, `apkResolver.ts` & `apkResolverUtils.ts`)

The APK manager, standalone APK resolver, and helper utility services implement decomposed mechanisms for native Android wrapper upgrades. Browser-owned PWA lifecycle APIs are brokered by Layer 2 in `@shared/composables/usePwaManager.ts`:

1. **Dedicated APK Shell Update Management (`useApkManager.ts` & `apkManagerUtils.ts`):** Manages native APK metadata resolution, installed vs. published release version comparison, download dispatching, and bridge status monitoring.
   - **Update State Machine (`ApkUpdateState`):** Drives UI status and notification workflows through distinct deterministic states: `idle`, `checking`, `available`, `current`, `blocked`, `mismatch`, and `error`.
   - **Pure Comparison & Formatting Helpers (`apkManagerUtils.ts`):** Houses pure mathematical semver comparison (`compareReleaseVersions`), installed-to-published candidate evaluation (`getInstalledReleaseComparison`), currency validation (`isInstalledApkCurrent`), and presentation formatting (`formatInstalledApkLabel`, `formatApkArtifactLabel`, `formatApkFeedSourceLabel`, `getReleaseVersionLabel`).
   - **Downgrade & Stale Feed Protection:** Prevents downloading stale release feeds or rollback versions (`isPublishedApkOlderThanInstalled`). If the published feed version or build number is strictly older than what is currently running, downloads are blocked and transition to `mismatch` with telemetry warnings, protecting local app databases and SQLite state from downgrade corruption.
   - **Bridge Permission Brokering & Fallbacks:** Checks package install permissions (`canRequestPackageInstalls`). If permissions are missing, redirects the user to system settings (`openPackageInstallSettings`) with a `blocked` state. For legacy shells lacking permission check APIs, automatically falls back to browser-mediated downloads.
   - **Multi-Tier Download Dispatching:** For modern native shells (`>= MIN_NATIVE_APK_DOWNLOAD_RESULT_BUILD = 191`), delegates download actions to `downloadApkFile(url, filename, sha256)`. If native download is declined or unavailable, cascades gracefully to `openExternalUrl` or standard window location redirection.
   - **Unified Diagnostic & Artifact Labels:** Computes standardized presentation badges (`installedApkLabel`, `latestApkLabel`, `apkArtifactLabel`, `apkFeedSourceLabel`, and `apkChangelog`), uniting version name, version code, build number, byte magnitude, and cryptographic checksum previews.
2. **Decomposed APK Release Resolution (`apkResolver.ts` & `apkResolverUtils.ts`):** Dynamic companion APK metadata and filename resolution is isolated in Layer 1 core utility services to decouple presentation logic from infrastructure concerns.
   - **Pure Helpers & Types (`apkResolverUtils.ts`):** Houses pure utilities, constants, and structured types (such as `ReleaseApkParts` and `ApkReleaseDownload`). It handles the regex-based validation of release filenames (`isReleaseApkFilename`), path builders, and direct download-url matching logic.
   - **Metadata Boundary Validation Guards:** Enforces ADR Section III validation boundaries on candidate release payloads using type predicate guards (`isReleaseVersion`, `isReleaseBuildNumber`, `isSha256Digest`, and `isReleaseSizeBytes`). This prevents malformed semver strings, non-integer or negative build IDs, corrupted/truncated checksums, and zero-byte sizes from leaking across the network boundary into presentation settings and update telemetry.
   - **SemVer Build Sorting:** `compareReleaseApkFilenames` in `apkResolverUtils.ts` parses SemVer structures and unique version/build suffixes (e.g., `clashmanager-v14.43.2+176.apk`) to perform precise chronological release order sorting.
   - **Multi-Tier Resolution & Fail-Safes:** At download trigger, `apkResolver.ts` races/orchestrates three API lookup pathways in parallel (same-origin metadata `/APK/release/latest.json`, GitHub Repository Contents API `ref=Beta` branch, and the raw beta repository URL) to guarantee release detection.
   - **Cache & Throttling Limits:** Caches successfully resolved metadata filenames in memory with a robust `APK_RESOLUTION_CACHE_TTL_MS` (60 seconds) duration, and deduplicates concurrent active resolution lookups via a shared promise registry.
   - **Ergonomics & Wrapper Bridging:** Once resolved, `useApkManager.ts` delegates download actions to `downloadApkFile` or `openExternalUrl` on the native bridge if inside the Android wrapper container, falling back to window location assignment in PWAs.

### Single-Flight Sync & Error Thresholding (`useClashSync.ts` & `useClashSyncUtils.ts`)

`useClashSync.ts` and `useClashSyncUtils.ts` orchestrate data synchronization, local persistence, and error tolerance in Layer 1 Core:
- **Pure Sync Utilities (`useClashSyncUtils.ts`):** Houses stateless sync helpers including the 25-second overall network deadline (`fetchRemoteWithTimeout` and `AbortController`), empty dataset initialization (`createEmptyWebAppData`), and error normalization (`normalizeSyncError`). Individual read deadlines and transient retries belong to `SupabaseTransport.ts` in the API layer, so a retry does not download the whole payload again.
- **Single-Flight Synchronization:** Enforces single-flight remote execution (`activeSyncPromise`). Concurrent sync calls join the single active in-flight request promise, eliminating redundant network traffic and avoiding race conditions during batch or automated triggers.
- **Cold-Start Timeout Recovery:** A background sync that reaches the overall deadline can schedule one jittered follow-up when the app is online, visible, and not in Android power-saving mode. The timer is canceled with the store scope, statement-timeout failures are excluded because they signal database pressure, and repeated timeouts do not create a retry loop. A remote success resets the one-follow-up allowance; failed attempts leave the current cached or empty placeholder untouched until a fully validated payload commits.
- **Foreground Recovery:** After a timeout or connectivity failure, a real return from the background or a visible reconnect starts one sync through the existing single-flight lock, bypassing poll backoff. Healthy short app switches keep the normal freshness threshold. Authorization and validation failures are not retried on return, and the visibility listener is removed with the store scope.
- **Fault-Tolerance Visibility Thresholding:** Tracks consecutive remote synchronization failures (`consecutiveSyncFailures`). Background sync failures remain suppressed to maintain UI stability until the failure threshold (`SYNC_FAILURE_VISIBILITY_THRESHOLD = 3`) is reached, while manual user-triggered refreshes immediately expose error states (`syncError`).
- **Remote Success State Preservation:** Internal `commitSyncResult` gates clearing `consecutiveSyncFailures` and `syncError` behind an explicit `remoteSuccess` flag (defaulting to `false`). Purely local commits (such as cache hydration, local edits, or optimistic rollbacks) leave remote failure indicators intact so that local mutations cannot forge proof of backend reachability or suppress pending error visibility windows.

### High-Performance Search and Filtering (`useListFilter.ts`)

To support smooth 60FPS list interactions under heavy sorting and filtering operations, `useListFilter.ts` coordinates an optimized presentation-layer orchestration:
- **Reactive Preference Persistence:** When configured with a `sortStorageKey`, user-selected sorting preferences are automatically persisted to and hydrated from `localStorage`, preserving layout continuity across sessions.
- **WeakMap Search Cache & Invalidation:** To eliminate redundant string normalizations on every keystroke, a module-scope `WeakMap` caches normalized search strings per object. The caching system implements a robust validation check (`areSearchFieldsEqual`) that verifies if current searchable fields match cached fields, invalidating the cache and re-normalizing dynamically only when data shifts.

### Time-Sliced Progressive Rendering Engine (`useProgressiveList.ts`)

`useProgressiveList.ts` implements a time-sliced rendering strategy in Layer 1 Core to maintain 60FPS UI performance when displaying large datasets:
- **Time-Sliced Frame Scheduling:** Breaks large datasets into manageable chunks (10–20 items) and schedules their injection during idle browser frames via `requestIdleCallback`, with fallback to `requestAnimationFrame`.
- **Shallow Reactive Optimization (`shallowRef`):** Stores visible list slices in a `shallowRef` to prevent deep reactivity overhead across hundreds of array elements, drastically reducing CPU cycles during list expansion.
- **Idle Budgeting & Deadline Feature Detection:** Evaluates `IdleDeadline` time remaining (`deadline.timeRemaining() > 1`) to process multiple chunks within a single idle frame. Implements explicit feature detection (`hasIdleDeadline`) before calling `timeRemaining()` to prevent runtime `TypeError` exceptions when falling back to `requestAnimationFrame` (which passes a numeric timestamp primitive).
- **Minor Delta Churn Prevention:** Detects minor list size updates (strictly < 5 items difference) and preserves the current rendered slice length while slicing updated item content, preventing sudden scroll jumps or layout churn during background polling. Major structural shifts or size deltas >= 5 reset the visible window back to initial size for a fresh load.
- **Automated Timer Cleanup:** Implements `onScopeDispose` and `clearTimer` to cancel scheduled frame timers upon composable teardown or rapid list source updates. Correctly passes the active timer handle ID to `cancelIdleCallback` or `cancelAnimationFrame` (when `cancelIdleCallback` is absent) to prevent memory leaks and race conditions.

### Connectivity & Health Orchestration (`useConnectivityManager.ts`)

`useConnectivityManager.ts` acts as the Layer 1 hub for data provenance, sync health, and network connectivity indicators across the application:
- **8-Tier Health Prioritization:** Resolves physical network status, backend configuration, and sync states into an authoritative single `hubHealth` signal:
  1. *Syncing / Loading:* Active synchronization (`loading = true`, Confidence: 50).
  2. *Sync Error:* Failed remote synchronization (`syncError` present, Confidence: 0).
  3. *API Configuration Error:* Invalid or unconfigured backend endpoint (`apiStatus = 'unconfigured'`, Confidence: 0).
  4. *Offline Failure:* Physical network disconnect (`networkStatus = 'offline'`, Confidence: 0).
  5. *Stale Data Warning:* Data age exceeds `DATA_STALENESS_MINUTES` threshold (Confidence: 40).
  6. *Nominal Remote DB:* Hydrated from remote Supabase DB (`currentSource = 'SUPABASE'`, Confidence: 100).
  7. *Nominal Local Storage:* Hydrated from validated local store (`isHydrated = true`, Confidence: 80).
  8. *Initializing Fallback:* Default initial status (Confidence: 10).
- **Provenance & Age Metadata:** Normalizes store timestamps (`lastSyncTime`, `lastCompiledTime`, `lastFetchedTime`) into human-readable relative duration strings via `formatTimeAgo` and calculates minute-level age (`ageMinutes`) for staleness evaluations.
- **Unified Sync Control:** Exposes reactive `isRefreshing` state and forwards the underlying store's manual `refresh` trigger.

### Native Android Bridge Coordination (`useNativeBridge.ts`)

The Native Bridge service coordinates communication between the Web/PWA layer and the Kotlin-backed Android WebView container (`AndroidBridge`):
- **Singleton Interface & Detection:** Computes `isNativeWrapper` by inspecting the global `window` object for the injected `AndroidBridge` interface.
- **Hardware Permission Brokerage:** Manages and exposes reactive state for native device permissions, including Accessibility services (`isAccessibilityAllowed`), Overlay / Draw-Over-Other-Apps (`isOverlayAllowed`), and per-app APK installation (`isPackageInstallAllowed`, `isPackageInstallSettingsSupported`). Exposes direct navigation actions (`openAccessibilitySettings`, `openOverlaySettings`, `openPackageInstallSettings`) to deep-link users into corresponding system settings menus.
- **Lifecycle Re-hydration & Resumption:** Attaches listeners for both window `focus` and document `visibilitychange` to trigger `onReturnToApp()`. This guarantees immediate re-polling of device permissions, re-hydration of calibration coordinates, and evaluation of backgrounded automated tasks whenever returning from system settings or external applications (such as Clash Royale).
- **Automated Blitz Run Telemetry & Toast Reporting:** Parses native JSON run records returned by `bridge.getLastBlitzRun()` via `parseBlitzRun()`, verifying required timestamp and count metrics while guarding against schema drift. Formats user-facing summaries via `describeBlitzRun()` (distinguishing profile-only scans from invite runs) and uses a persistent `localStorage` end-timestamp lock (`cm.blitz.lastReportedRunEnd`) to guarantee each completed run is toasted exactly once upon app return.
- **Blitz Calibration & Boundary Protections:** Manages interactive calibration coordinates (`inviteX`, `inviteY`, `closeX`, `closeY`) for the automation overlay:
  - **Resolution Independence:** Persists coordinates to the native layer normalized as floats (0.0 - 1.0) via `saveCoordinates()`, validating that coordinates are finite numbers to prevent NaN contamination across the bridge.
  - **Reconstruction & Rounding:** Hydrates raw native coordinates via `loadCoordinates()`, converting decimal offsets back to percentage values (0 - 100) via `toCalibrationPercent()` with boundary validation and fallback retention to defend against malformed payloads.
  - **Robust Fallback Paths:** Implements Android intents for opening deep-linked system settings (`ACCESSIBILITY_SETTINGS` and `MANAGE_OVERLAY_PERMISSION`) if running in normal web browser environments where direct bridge method invocations are unavailable.

### Network Telemetry & Degradation Brokering (`useNetworkInfo.ts`)

`useNetworkInfo.ts` acts as the Layer 1 hardware broker for the W3C Network Information API, providing reactive connection metrics and latency/bandwidth degradation detection:
- **Interface Contracts & Return Shape (`UseNetworkInfoReturn`):** Formally exports `UseNetworkInfoReturn`, exposing `isSupported: boolean`, `effectiveType: DeepReadonly<Ref<string>>`, `downlink: DeepReadonly<Ref<number>>`, `saveData: DeepReadonly<Ref<boolean>>`, `rtt: DeepReadonly<Ref<number>>`, and `isSlowConnection: ComputedRef<boolean>`. Satisfies CleanStack Architecture ADR Section I (Core Services) and ADR Section IV (Resilience & Connectivity) by establishing an authoritative network quality contract.
- **Module Singleton State & Cold Boot Defaults:** Encapsulates reactive connection metrics at module scope (`effectiveType`, `downlink`, `saveData`, `rtt`). Optimistic defaults (`effectiveType = '4g'`, `downlink = 10`, `saveData = false`, `rtt = 0`) prevent premature degradation gating during cold boot initialization or server-side hydration.
- **Defensive API Probing & Environmental Safety:** Safely inspects browser globals (`navigator.connection || navigator.webkitConnection || navigator.mozConnection`), gracefully falling back to unsupported state (`isSupported: false`) when running in non-browser, SSR, or Web Worker environments without throwing runtime exceptions.
- **Degradation Detection Heuristic (`isSlowConnection`):** Computes connection degradation via multi-factor threshold evaluation: cellular 2G classifications (`effectiveType === 'slow-2g' || effectiveType === '2g'`), high network latency (`rtt > 500`), or constrained downlink bandwidth (`downlink < 1`). This allows presentation and sync engines to scale back non-critical asset hydration and telemetry polling.
- **Idempotent Hardware Listener Registration:** Uses an internal lifecycle guard (`isInitialized`) to guarantee a single, idempotent `change` event listener attachment to the underlying hardware API, preventing duplicate listener registration and memory leaks across multiple composable consumer instances.

### Android Battery Saver & Hardware Power Brokering (`usePowerSaving.ts`)

`usePowerSaving.ts` acts as the Layer 1 hardware broker for native Android Battery Saver status, maintaining state synchronization and triggering global runtime optimizations:
- **Module Singleton State (`isPowerSaving`):** Encapsulates reactive state at module scope, exposing a read-only `isPowerSaving` ref to all downstream consumers (`useClashSync`, `useTheme`, `useHaptics`, `useMotionPreference`, `useWakeLock`) to guarantee zero duplicate event listener registrations and uniform power-awareness.
- **Direct Bridge State Re-evaluation:** Rather than relying solely on push events, directly re-queries `bridge.isPowerSaveMode()` via `refreshPowerSaving()` on window focus and document visibility transitions (`visibilitychange`). This mitigates stale hardware state when power-saving toggles occur while the application is backgrounded.
- **Graceful Shell Fallback:** In web browsers or older native shells lacking `isPowerSaveMode`, gracefully defaults to `false` without throwing runtime exceptions.
- **DOM Attribute Toggling (`data-power-saving`):** Toggles the `data-power-saving` attribute on `document.documentElement` synchronously upon state shifts. This drives global CSS optimizations (disabling resource-heavy blur filters, simplifying card shadows, and clamping CSS keyframe animations) directly in the presentation tier.
- **System Event Listeners:** Attaches single-attachment listeners for native container change notifications (`cm-power-save-change`), window `focus`, and document `visibilitychange`.

### Console Metadata & Stats Badge Service (`useConsoleMetadata.ts`)

`useConsoleMetadata.ts` extracts connectivity status and stats badge orchestration from `useConsoleController.ts` to maintain Layer 1 purity:
- **Connectivity & System Health Aggregation:** Delegates connectivity state tracking to `useConnectivityManager.ts`, exposing simplified `status` (`type`, `text`, `nominal`) and `hubHealth` properties for header status pills.
- **Demo Mode Synthetic Counting:** Provides synthetic count values in Showcase mode (random integer 1–50) and Blueprint mode (`DEFAULT_MOCK_RECRUIT_COUNT` or `DEFAULT_MOCK_MEMBER_COUNT`) to ensure UI review confidence.
- **Filtered Dataset Ratio Badge Formatting:** When `visibleCount` is provided and differs from `itemCount` outside of demo modes, formats the header badge with ratio metadata (`value: `${showing} of ${itemCount}`` and `compactValue: `${showing}/${itemCount}``). When all items are showing or when `visibleCount` is omitted, returns standard count strings without ratio formatting.

### List Console Orchestration Engine (`useConsoleController.ts`)

`useConsoleController.ts` acts as the primary Layer 1 orchestrator for complex list feature views (Roster, Headhunter):
- **Unified Service Integration:** Consolidates multiple specialized core services (`useListFilter` for search/sort, `useProgressiveList` for time-sliced rendering, `useSelectionStore` / `useConsoleSelection` for batch selection, `useConsoleMetadata` for status badges, `useDeepLinkHandler` for fragment expansion, `useVisibilityRefresh` for revalidation, and `useUiCoordinator` for FAB synchronization) into a single standardized controller contract for Layer 3 views.
- **Showcase Mode Truncation:** Constrains `visibleItems` list rendering to a single element (`visibleItems.value.slice(0, 1)`) when `isShowcaseMode` is active to maximize visual focus during presentation recording and automated UI audits.
- **Skeleton Display Priority Rules:** Evaluates `showSkeletons` under three distinct condition gates: explicit Blueprint Mode requests (`isBlueprintMode`), initial unhydrated store boot without sync errors (`!isHydrated && !syncError`), and active background refreshes with empty local data (`isRefreshing && data.length === 0`). Bypasses skeletons in Synthetic and Showcase modes to guarantee deterministic high-fidelity rendering.
- **Standardized Shell Contracts (`layoutProps` & `layoutEvents`):** Computes reactive props and event handlers tailored for `ConsoleLayout.vue`, bundling status badges, emptiness indicators, remote data provenance, and action handlers with support for feature-specific event overrides (`eventsOverride`).
- **Card Metadata & List Memoization (`getCardMetadata` & `getMemoKeys`):** Exposes `selectedSet` (O(1) Set lookups) and helper methods (`getCardMetadata`, `getMemoKeys`) to generate stable reactive flags and key arrays for Vue list rendering and memoization.

### Navigation Deep-Linking & Card Expansion (`useDeepLinkHandler.ts`)

`useDeepLinkHandler.ts` centralizes presentation orchestration for deep-linked item expansion and auto-scroll across list-based views (Roster, Headhunter) in Layer 1 Core:
- **Presentation Orchestration Contract (`UseDeepLinkHandlerReturn`):** Decouples navigation-driven DOM interaction and card expansion from monolithic feature views. Returns a reactive Set of expanded card identifiers (`expandedIds`), an expansion toggle function (`toggleExpand`), and a deep-link evaluation handler (`processDeepLink`).
- **Set Copy Reactivity Design:** In Vue 3, mutating a reactive `Set` directly does not reliably propagate triggers across subscriber components. The service guarantees deterministic reactivity by cloning the current Set into a new instance on every toggle or expansion event before reassigning `expandedIds.value`.
- **Single-Shot Run-Once Guard (`deepLinkHandled`):** Evaluates candidate deep links exactly once per lifecycle run. Background data revalidation (stale-while-revalidate / SWR) and periodic syncs are prevented from repeatedly re-triggering auto-scroll or resetting user viewport positions.
- **Parameter Type Normalization & Boundary Protection:** Normalizes candidate URL query values (`route.query.pin`), safely coercing multi-value arrays (`string[]`) to their primary string element to defend against parameter type spoofing. Verifies candidate ID existence within the active `DeepLinkTargetItem` collection before updating state, preventing phantom DOM queries on stale or forged deep-link URLs.
- **Asynchronous Layout Settling & Smooth Auto-Scroll:** Defers DOM element discovery (`getElementById`) until Vue settles render cycles via `nextTick()`. Executes smooth center-block scrolling (`targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })`) to prevent jarring layout thrashing and viewport clipping beneath fixed header or footer bars on mobile displays.

### Automated Batch Deep-Linking Pipeline (`useBlitzMode.ts`)

`useBlitzMode.ts` orchestrates automated batch deep-linking across console feature views in Layer 1 Core:
- **Multi-Tier Execution Strategy:** Detects execution environment and delegates batch recruiting/opening either directly to the native `AndroidBridge` JSBridge (when running inside the TWA wrapper container) or to a web-based safety-throttled sequence (`advanceBlitz`).
- **Floating Action Button (FAB) State:** Computes real-time action labels, deep-link target hrefs, selection counts, and processing indicators for floating action controls across selection modes.
- **Safety Throttling & Intent Protection:** Guards against OS-level queue saturation, battery drain, and browser popup blocking by clamping deep-link trigger intervals (`throttleMs`) with `BLITZ_SAFETY_DELAY` and resetting auto-advance timers upon manual user interaction.
- **Queue & Timer Teardown:** Integrates `onUnmounted` teardown and wraps `clearSelection` to ensure pending timers (`blitzOperationTimer`), queue arrays (`batchExecutionQueue`), and active Blitz states (`isBlitzActive`) clear cleanly upon component unmount or selection reset.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md) | [`@core/api`](../api/README.md) | [`@core/utils`](../utils/README.md)
- [`@shared`](../../shared/README.md) - Layer 2 composables wrap several services (e.g. `useHaptics` delegates to the platform bridge; Voyage composables read from `@core` stores)
- [APK](../../../../APK/README.md) - `useNativeBridge.ts` brokers the Android bridge; its native contract is defined in the APK layer
