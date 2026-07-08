// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Core Services (@core/services) : Infrastructure Singletons

The **System Orchestrators**. A collection of framework-agnostic singletons and Layer 1 state managers that provide the foundational infrastructure for the Clash Manager ecosystem.

---

## Purpose
Core Services (Layer 1) manage global application concerns such as persistence, data synchronization, connectivity, and list orchestration. They are designed to be consumed by any higher layer, ensuring that critical infrastructure logic remains centralized and consistent.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Infrastructure Singletons.
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 0 (@substrate) and Layer 1 (@core/api, @core/utils).
 - **Forbidden**: Strictly forbidden from importing from Layer 2 (Shared), Layer 3 (Features), or Layer 4 (App).

## Service Registry

### Persistence & Data Lifecycle
- **StorageService.ts**: The authoritative persistence engine. Brokers access to IndexedDB via the `idbKernel` and manages high-fidelity caching with in-memory fallback.
- **useClashDataStore.ts**: The central store for high-integrity clan datasets. Delegates sync logic to `useClashSync.ts`.
- **useClashSync.ts**: Orchestrates the lifecycle of the central data store, including hydration from local cache and background synchronization.
- **useClashLoader.ts**: Orchestrates route-level hydration, ensuring a Stale-While-Revalidate (SWR) topology by awaiting local cache before firing background network refreshes.
- **useStoragePersistence.ts**: Brokered access to the Storage Manager API to prevent silent data eviction.
- **useSelectionStore.ts**: Manages the persistence and synchronization of item selection states across complex views.

### Console & List Orchestration
- **useConsoleController.ts**: The primary orchestrator for complex feature views. Manages domain-blind infrastructure (filtering, sorting, progressive rendering).
- **useConsoleSelection.ts**: Decouples batch selection logic (Select All, Score-based thresholding) from the main controller.
- **useListFilter.ts**: High-performance engine for searching and sorting large datasets using `WeakMap` caching for O(1) field lookups.
- **useConsoleMetadata.ts**: Decouples connectivity status and statistics badge logic from console controllers to maintain architectural purity and support UI simulation modes.
- **useProgressiveList.ts**: Time-sliced rendering engine utilizing `requestIdleCallback` to maintain 60FPS UI stability.
- **useBlitzMode.ts**: Orchestrates the automated batch deep-linking ("Blitz") pipeline shared by console views.

### Connectivity & System Health
- **useConnectivityManager.ts**: Master arbiter of 8-tier system health and synchronization status confidence.
- **useConnectionStatus.ts**: Unifies physical network status and logical API availability.
- **useNetworkInfo.ts**: Hardware broker for network telemetry (RTT, Downlink) and degradation detection.
- **useVisibilityRefresh.ts**: Triggers background data refreshes based on document visibility changes.
- **useBroadcastChannel.ts**: Facilitates cross-tab/window communication for synchronized state updates (e.g., login, settings).
- **useNativeBridge.ts**: Central orchestrator for the Native Android JSBridge, brokering hardware permissions and Blitz Mode calibration coordinates for the TWA wrapper.
- **useBadge.ts**: Centralized manager for application-level badges (Home Screen, Dock) with support for hardware-brokered native updates.

### Application Shell & Logic
- **useAppSettings.ts**: Multi-tier strategy for application configuration, mirrored across `LocalStorage` and `IndexedDB`.
- **usePwaManager.ts**: Manages infrastructure-level PWA lifecycle (SW updates, recovery protocols).
- **useUiCoordinator.ts**: Master arbiter of layout spacing and global FAB (Floating Action Button) state.
- **useBackHandler.ts**: Orchestrates hardware back button behavior in hybrid environments, ensuring predictable navigation stack exit.
- **useBenchmarking.ts**: Statistical engine for comparing individual metrics against clan averages using single-pass O(N) optimization.
- **useDeepLinkHandler.ts**: Manages item expansion and auto-scroll based on URL parameters.
- **useExternalLink.ts**: Hardware broker for OS intents and browser navigation, implementing platform-specific deep-linking strategies for Clash Royale.
- **useSystemInfo.ts**: SSOT for application versioning and global modes.
- **useShowcaseMode.ts**: Global UI simulation engine for high-fidelity demonstration and marketing.
- **useBlueprintMode.ts**: Orchestrates the "Blueprint" overlay for rapid UI prototyping and architectural review.
- **useSyntheticMode.ts**: Enables synthetic data injection for stress-testing and zero-network development.
- **useShare.ts**: Unified hardware broker for the Web Share API, providing defensive error handling for native share sheet interactions.
- **useShareTarget.ts**: Orchestrates the Web Share Target API, extracting player tags from incoming OS share intents and routing to feature views.
- **useToast.ts**: Global notification service with semantic hardware haptic pairing.

---

## Integration Standards
- **Singleton Pattern**: Services are typically implemented as module-level singletons or Pinia-like stores to ensure state consistency.
- **Agnostic Logic**: Focus on *how* the system operates rather than *what* specific domain data it handles.
- **Resource Management**: Proactively manage event listeners and timers to prevent memory leaks and redundant execution.
