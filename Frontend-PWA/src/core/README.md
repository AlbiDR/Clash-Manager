// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Core Layer (@core) : Agnostic Kernel

The **System Kernel**. A collection of pure logic engines, infrastructure singletons, and agnostic utilities that form the foundational substrate of the Clash Manager client.

---

## Purpose
The Core Layer (Layer 1) provides the essential infrastructure required for the application to function. It is designed to be domain-aware but framework-ignorant where possible, serving as the authoritative kernel for data transport, persistence, and state orchestration.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Agnostic Kernel. Zero dependencies on higher layers (Shared, Features, App).
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 0 (`@substrate`).
 - **Forbidden**: Strictly forbidden from importing from Layer 2 (`@shared`), Layer 3 (`@features`), or Layer 4 (`@app`).

## Directory Structure

### API Clients (`/api`)
The authoritative transport layer for the Supabase binary stack.
- **SupabaseClient.ts**: The infrastructure-level gateway for authentication and configuration.
- **Specialized Clients**: Domain-specific orchestrators for RPC and Edge Function interactions:
 - `VoyageClient.ts`: Manages Clan Voyage activations, ledger updates, and event completion.
 - `RecruitClient.ts`: Manages headhunter recruitment, blacklist operations, and diagnostic scouting.
 - `ProfileClient.ts`: Brokered access to player card synchronization.
 - `MaintenanceClient.ts`: Triggers system-level maintenance cycles and manages push notification registration.
- **useApiState.ts**: Authoritative connectivity singleton for backend availability and handshake discovery.
- **Data Schemas**: Decomposed domain-specific modules (e.g., `BaseSchemas.ts`, `VoyageSchemas.ts`, `MemberSchemas.ts`, `RecruitSchemas.ts`, `ProfileSchemas.ts`, `AppSchemas.ts`, `OfflineSchemas.ts`, `MaintenanceSchemas.ts`) providing strict Valibot validation for inbound database payloads. Aggregated via the `DataSchemas.ts` barrel.
- **Data Mappers**: Transformation logic for converting raw Supabase rows into Persistence-Ignorant Domain Models. Enforces clinical normalization for complex telemetry, including Voyage history, Heritage tenure, and `potential_score` fallback logic.

### Configuration (`/config`)
Static system constants and environment orchestration.
- **index.ts**: The sole config module, centralizing business thresholds, staleness/visibility timeouts, IndexedDB storage constants (including the deprecated-DB purge registry), and push-notification identities.

### Services (`/services`)
Infrastructure singletons and Layer 1 state orchestrators.
- **StorageService.ts**: The persistence engine. Brokers access to IndexedDB via the `idbKernel` and manages high-fidelity caching.
- **useClashDataStore.ts**: The authoritative central store for high-integrity clan datasets. Delegates sync logic to `useClashSync.ts`.
- **useClashSync.ts**: The specialized kernel for managing the lifecycle of the central data store, including hydration and background synchronization.
- **useClashLoader.ts**: Orchestrates route-level hydration, ensuring a Stale-While-Revalidate (SWR) topology by awaiting local cache before firing background network refreshes.
- **useConsoleController.ts**: The primary orchestrator for complex list views (Roster, Headhunter). Manages domain-blind infrastructure (filtering, sorting, progressive rendering) and delegates selection logic to `useConsoleSelection.ts`.
- **useConsoleSelection.ts**: Orchestrates batch selection logic (Select All, Score-based thresholding) for console views, decoupling selection handlers from the main controller.
- **useBlitzMode.ts**: Orchestrates the automated batch deep-linking ("Blitz") pipeline shared by console views.
- **useConnectivityManager.ts**: Resolves 8-tier system health and synchronization status.
- **useConnectionStatus.ts**: Unifies physical network status and logical API availability.
- **useConsoleMetadata.ts**: Manages connectivity status and statistics badges for the list orchestrator.
- **useProgressiveList.ts**: Time-sliced rendering engine for high-density list stability.
- **useListFilter.ts**: High-performance engine for searching and sorting large datasets using `WeakMap` caching.
- **useSelectionStore.ts**: Manages sets of selected item identifiers for batch operations.
- **useUiCoordinator.ts**: Master arbiter of layout spacing and global FAB state.
- **useToast.ts**: Global notification service.
- **usePwaManager.ts**: Infrastructure-level PWA lifecycle and recovery orchestrator.
- **useAppSettings.ts**: Multi-tier strategy for application configuration and feature flags.
- **useBenchmarking.ts**: Statistical engine for comparing individual metrics against clan averages.
- **useDeepLinkHandler.ts**: Manages item expansion and auto-scroll based on URL parameters.
- **useVisibilityRefresh.ts**: Triggers background refreshes based on document visibility changes.
- **useSystemInfo.ts**: SSOT for application versioning and global modes.
- **useShowcaseMode.ts / useBlueprintMode.ts / useSyntheticMode.ts**: Specialized global demonstration and auditing modes.
- **useStoragePersistence.ts**: Brokered access to prevent silent data eviction.
- **useBackHandler.ts**: Orchestrates hardware back button interception.
- **useBadge.ts**: Cross-platform application badging (Native vs Notification fallback).
- **useNativeBridge.ts**: Central orchestrator for the Native Android JSBridge, brokering hardware permissions and Blitz Mode calibration coordinates for the TWA wrapper.
- **useNetworkInfo.ts**: Layer 1 broker for network telemetry and degradation detection.
- **useShare.ts / useShareTarget.ts / useExternalLink.ts**: Native sharing and OS intent brokerage.
- **useBroadcastChannel.ts**: Cross-tab state synchronization.

### Theme Engine (`/theme`)
The visual DNA of the application. Orchestrates a clinical, CSS-variable-driven design system with zero-flicker hydration.
- **HtmlEntry.ts**: The **TypeScript Source of Truth** for the application's entry point. It replaces the physical `index.html` file to achieve 100% technical purity and allows for dynamic metadata injection.
- **AppShell.ts**: The structural architect. Orchestrates the generation of critical CSS and static HTML skeletons to ensure sub-second visual stability during initial hydration.
- **tokens.ts**: The Design Token SSOT. Defines the foundational hex/RGB design tokens and generates standardized CSS variables (`--sys-color-*`).
- **base.ts**: The foundational substrate. Injects CSS resets, typography scales, and native gesture overrides.
- **animations.ts**: Centralizes high-performance CSS keyframes for shell-wide interactions (skeletons, transitions).
- **Theme Injection**: Logic for dynamic Light/Dark theme swapping and `theme-color` meta-tag orchestration.
- **Icon Paths**: Centralized SVG path definitions for the `Icon.vue` primitive.

### Domain Types (`/types`)
Authoritative TypeScript interfaces and enums used across the entire application.

### Utility Kernels (`/utils`)
Pure, stateless logic engines and formatting primitives.
- **idbKernel.ts**: Low-level IndexedDB boilerplate and memory-fallback logic.
- **PriorityQueue.ts**: High-performance data structure implementing a binary heap for $O(\log N)$ priority-based selection in simulation engines.
- **economy.ts**: Authoritative source for Clash Royale currency math, branded types (`Gold`, `Gems`, `XP`), and cost conversion logic.
- **game.ts**: Authoritative Clash Royale domain logic, costs, and XP tables.
- **time.ts, text.ts, math.ts**: Standardized sanitization, duration conversion, and high-performance numeric formatting logic.
- **navigation.ts**: Single Source of Truth for application-level navigation items, paths, and icons.
- **visibility.ts**: Lifecycle registry for orchestrating time-based revalidation triggers when the application regains focus.
- **bezier.ts**: Geometric foundations for data visualization and smooth SVG path generation.
- **sortOptions.ts & sortStrategies.ts**: Centralized logic for list orchestration, providing both UI metadata and clinical comparator functions.
- **mockData.ts**: High-fidelity synthetic payload generator for the Synthetic Data engine, ensuring UI stability during demonstration and testing.
- **locale.ts**: Maps browser navigator language to Supercell-supported locale codes for external URL generation.

---

## Integration Standards
- **Deep Import Protocol**: To prevent barrel-related bundle bloat, Layer 1 modules (especially schemas and utils) should be imported directly from their respective files when consumed by higher layers.
- **Validation Boundaries**: All inbound data from external sources (Supabase, LocalStorage, IndexedDB) MUST be validated against a Valibot schema at the service or client entry point.
- **Persistence Ignorance**: Logic in this layer must remain decoupled from the storage mechanism. Domain models should not reflect the underlying database structure.
- **Fail-Fast Purity**: Kernels must detect errors at the earliest point and halt execution to prevent state corruption.
