# Clash Manager --- Client Core (PWA)

[![Client](https://img.shields.io/badge/Client-v14.0.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../.github/authoritative-design-references/CleanStack%20Architecture.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Operational Command Center**. A high-performance, offline-first Vue 3.5 application that serves as the primary interface for clan management.

---
<br />

## Screenshots

<div align="left">
  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #f6f8fa;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Light Mode</strong>
    </summary>
    <div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 10px; background-color: #ffffff; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/laboratory-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/settings-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>

  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #161b22;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Dark Mode</strong>
    </summary>
    <div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 10px; background-color: #0d1117; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/laboratory-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/settings-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>
</div>

---
<br />

## Sovereign Design System

The application utilizes a custom-engineered **Sovereign Design System** built on Vanilla CSS and TypeScript-driven injection (`src/core/theme/`).

- **Theme Engine**: Dynamic HSL variable injection for seamless Light/Dark mode transitions without CSS-in-JS overhead.
- **Visual Purity**: Zero dependency on third-party icon libraries; all iconography is rendered via custom SVG paths in the `Icon.vue` primitive.
- **Hardware-Accelerated blurs**: Strategic use of `backdrop-filter` for glassmorphism effects on navigation and overlay layers.
- **Haptic Synchronization**: Interactions are paired with `navigator.vibrate` patterns (Heavy/Light/Success) via the `useHaptics` broker to provide physical feedback on mobile devices.
- **Fluid Topology**: Layouts that adapt continuously from mobile viewports to ultra-wide desktop dashboards using container queries and flexbox.

---
<br />

## Technical Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **View** | **Vue 3.5** | Reactive interface with Composition API and `<script setup>` |
| **Logic** | **TypeScript** | Strict-mode type safety across the entire client kernel |
| **State** | **Pinia** | Authoritative store for high-volume clan data (Roster/Headhunter) |
| **Transport** | **Supabase SDK** | Native real-time bridge utilizing direct View access and Postgres RPCs for high-fidelity data orchestration. |
| **Validation** | **Valibot** | Mandatory schema enforcement at all Layer 1 boundaries |
| **Storage** | **IndexedDB** | High-performance persistence via `StorageService` (idb) |
| **Build** | **Vite 7** | Optimized build pipeline with advanced PWA workbox strategies |

---
<br />

## Core Orchestration & Infrastructure

The application kernel (@core) manages complex system-level behaviors through specialized Layer 1 services:

### 1. Unified State & Sync (`useClashDataStore`)
The authoritative Layer 1 central store for high-integrity clan datasets.
- **Unified Sync Kernel**: Centralizes state mutation (data, timestamps, source), metadata sync, and IndexedDB persistence across all hydration paths (local, background).
- **Direct View Access**: Utilizes authoritative Supabase feature views (`roster_view`, `headhunter_view`) to bypass legacy RPC bottlenecks.
- **High-Fidelity Metadata**: Preserves server-side lifecycle markers (`lastCompiledTime`, `lastFetchedTime`) to ensure accurate data age calculations across distributed environments.
- **Stale-While-Revalidate**: Implements a zero-latency hydration strategy by loading from IndexedDB on boot while updating from the Supabase backend in the background.
- **Validation Boundary**: All inbound payloads are strictly validated against `WebAppDataSchema` to prevent "any" plague propagation into the application state.

### 2. Selection Orchestrator (`useSelectionStore`)
A domain-blind utility for managing a set of selected item identifiers.
- **Selection Mode**: Facilitates multi-selection states and forced-selection overrides for batch operations.
- **Atomic Operations**: Provides handlers for toggling individual items, bulk selection (`selectAll`), and clearing state.

### 3. List Orchestration (`useConsoleController`)
The primary Layer 1 orchestrator for high-density list views (Roster, Headhunter).
- **Layout Orchestration**: Centralizes communication with the `ConsoleLayout` component via standardized `layoutProps` and `layoutEvents` interfaces, reducing boilerplate in feature views.
- **Domain Decoupling**: Bridges domain-blind infrastructure (filtering, sorting, progressive rendering, selection) with feature-level requirements.
- **Metadata Integration**: Consumes `useConsoleMetadata` to provide consistent system health feedback and item statistics.
- **Performance Orchestration**: Centralizes item metadata resolution and `v-memo` key generation to ensure consistent rendering optimizations across feature views.
- **Lifecycle Management**: Monitors document visibility and triggers automatic background refreshes after extended inactivity (30m+) to ensure data currency.

### 4. Console Metadata (`useConsoleMetadata`)
Extracts connectivity status and statistics badge logic from the list orchestrator to facilitate Layer 1 architectural purity.
- **Status Tiering**: Resolves tiered system health (text/type) based on `useConnectivityManager` diagnostics.
- **Dynamic Statistics**: Manages item counters in the header, supporting special display modes (Showcase, Blueprint).

### 5. Progressive Rendering Engine (`useProgressiveList`)
Maintains 60FPS UI performance when handling large datasets via a time-sliced rendering strategy.
- **Idle Budgeting**: Utilizes `requestIdleCallback`'s `IdleDeadline` to process multiple items per frame without blocking the main interaction thread.
- **Adaptive Chunking**: Implements a dynamic sizing strategy (10 vs 20 items per chunk depending on total list size) to balance rendering speed with frame stability.
- **Churn Prevention**: Implements an incremental update strategy for minor dataset changes (< 5 items) to prevent jarring layout shifts and scroll jumps.
- **Memory Safety**: Uses `shallowRef` to minimize reactive overhead and ensures deterministic cleanup via `onScopeDispose`.

### 6. Haptic Notification System (`useToast`)
A resilient, global notification service with integrated hardware feedback.
- **Hardware Brokerage**: Pairs semantic notification types (Success, Error, Info) with specific haptic patterns via the `useHaptics` engine to provide physical confirmation.
- **Interaction Safety**: Implements an 800ms debounce-locked action handler to prevent race conditions during rapid user input on high-consequence actions like "UNDO".

### 7. Connectivity Singleton (`useApiState`)
The authoritative Layer 1 arbiter of backend availability and handshake discovery (located in `@core/api/`).
- **Handshake Discovery**: Orchestrates the initial handshake to detect Supabase availability and configuration status.

### 8. Connectivity Arbitrator (`useConnectionStatus`)
Unifies physical network status and logical API availability into a single source of truth.
- **Priority Resolution**: Implements a 6-tier priority queue (Physical Offline -> Logical Offline -> Success -> Syncing -> Slow -> Online) to ensure the most critical status is always visible.
- **Reactive Deltas**: Automatically manages window listeners and provides reactive feedback for network transitions and speed degradation.

### 9. Connectivity Hub Orchestrator (`useConnectivityManager`)
Orchestrates data provenance, synchronization health, and UI-level connectivity indicators.
- **Confidence Scoring**: Calculates a health score based on network status, sync activity, and data age.
- **8-Tier Health Hierarchy**: Implements a strict priority-based status resolver (SYNCING > Sync Error > Invalid API URL > OFFLINE > STALE > DB > LOCAL > INITIALIZING) to ensure the most critical system state is always prioritized in the UI.
- **Metadata Normalization**: Bridges the gap between raw store metadata and human-readable temporal indicators (e.g., "10m ago").

### 10. Hardware Brokerage (`useWakeLock`)
Prevents device sleep during resource-intensive operations (Batch Blitz, Sync).
- **Visibility Resilience**: Automatically re-acquires the wake lock when the application returns to the foreground if user intent is still active.
- **System Synchronization**: Integrated into the synchronization engine to ensure data integrity during long-running background fetches.

### 11. Statistical Benchmarking (`useBenchmarking`)
A high-performance O(N) engine for comparing individual metrics against clan-wide averages.
- **Single-Pass Optimization**: Aggregates mean, min, and max values across all metrics in a single traversal of the dataset to minimize CPU cycles.
- **Tier Resolution**: Dynamically classifies performance into 4 tiers (Elite, Top Tier, Growing, Under) based on statistical deviations from the mean.
- **Singleton Pattern**: Shares pre-calculated statistical models across all component instances via a module-level cache.

### 12. UI Coordination (`useUiCoordinator`)
The master arbiter of layout spacing and element visibility.
- **Occlusion Prevention**: Dynamically calculates bottom offsets for the `FabIsland` and `ToastContainer` to ensure interactive elements never overlap.
- **Singleton Control**: Manages a global FAB state, allowing different feature views to register actions and labels in a unified UI layer.

### 13. Redundant Persistence (`useAppSettings`)
A multi-tier strategy for application configuration and feature flags.
- **Cross-Layer Visibility**: Settings are mirrored between `LocalStorage` (for main-thread UI) and `IndexedDB` (for Service Worker access). This ensures the Service Worker can access user preferences (like notification thresholds) even when the main thread is inactive.
- **Tab Synchronization**: Listens for the global `storage` event to ensure configuration remains atomic and consistent across multiple open browser tabs.
- **Validation Boundary**: Enforces strict Valibot schema validation (`ModuleStateSchema`) on all data retrieved from storage to prevent UI instability.

### 14. Deep Link Navigation (`useDeepLinkHandler`)
Manages item expansion and auto-scroll based on URL query parameters.
- **Navigation Safety**: Implements a 'run-once' guard to prevent layout jumps during background data refreshes.
- **Context Awareness**: Constructively scrolls specific roster or headhunter items into view upon landing via 'pin' parameters.

### 15. Metadata Centralization (`useSystemInfo`)
Provides a single source of truth for application versioning and specialized global modes (Showcase, Blueprint, Synthetic). Implements a priority queue for display badges (Showcase > Blueprint > Synthetic).

### 16. Audit Mode Orchestration (`useShowcaseMode`)
Acts as the master arbiter for the application's demonstration and auditing states.
- **Master-Child Sync**: Implements a MASTER -> CHILD propagation pattern, ensuring that toggling Showcase Mode automatically synchronizes both Blueprint and Synthetic child modes.
- **Reactive Resolution**: Utilizes a child-to-master watcher to automatically activate the Showcase status if both constituent modes are manually enabled.

### 17. Geometric Skeletons (`useBlueprintMode`)
Allows for layout stability auditing by forcing the application into a structural-only state.
- **Visual Pruning**: Strips decorative elements from components, leaving only geometric skeletons to facilitate interaction design debugging.
- **Singleton Persistence**: Ensures all components share a unified toggle status, persisted to `localStorage` for cross-session consistency.

### 18. Synthetic Data Engine (`useSyntheticMode`)
Decouples the UI from live backend dependencies for demonstration and testing.
- **High-Fidelity Mocks**: Enables a global toggle that redirects data ingestion to high-fidelity synthetic payloads.
- **Isolation**: Acts as a Layer 1 singleton to ensure data consistency across the entire application shell.

### 19. Storage Protection (`useStoragePersistence`)
Brokered access to the Storage Manager API to prevent silent data eviction.
- **Origin Persistence**: Explicitly requests the browser to grant "persisted" status to the application's origin, ensuring IndexedDB and localStorage remain intact under device storage pressure.
- **Status Monitoring**: Provides reactive signals for `isSupported` and `isPersisted` states.

### 20. Hardware Navigation (`useBackHandler`)
Orchestrates hardware back button interception for modal and overlay management.
- **History Shimming**: Implements a "synthetic state" strategy by pushing temporary entries to the browser history stack, allowing 'popstate' events to close UI components rather than navigating away.
- **Android Optimization**: Specifically designed to provide a native-feeling "back to close" experience on mobile devices.

### 21. Share Intent Processor (`useShareTarget`)
Infrastructure kernel for handling incoming Web Share Target API intents.
- **Tag Extraction**: Utilizes specialized regex to identify player tags (#XXXX) from shared OS text, titles, or URLs.
- **Intent Redirection**: Automatically cleans the history state and redirects to the Recruiter view with extracted tags applied as active filters.

### 22. Adaptive Haptics Engine (`useHaptics`)
Brokered access to device vibration hardware for tactical physical feedback.
- **Battery Awareness**: Implements power-aware scaling, automatically reducing vibration intensity when the device is in low-power mode or below 20% battery.
- **Interaction Security**: Enforces a strict user-gesture requirement before allowing hardware access to comply with browser security models.

### 23. Cross-Platform Badging (`useBadge`)
Orchestrates application-level notification badges across inconsistent platform APIs.
- **Dual-Path Strategy**: Utilizes the native W3C Badge API for iOS/Desktop and a persistent notification fallback for Android.
- **Flood Protection**: Implements a 1500ms debounce and exponential backoff retry mechanism to prevent API exhaustion and Service Worker instability.

### 24. Intent Orchestration (`useExternalLink`)
Specialized broker for deep-linking into external applications and the Clash Royale client.
- **Hidden Anchor Pattern**: Employs a temporary DOM element with a 100ms cleanup lifecycle to trigger OS Intents without dropping PWA execution context.
- **Android Intent Protocol**: Uses direct `intent://` schemes to ensure reliability when launching from sandboxed WebViews or Chrome Custom Tabs.

### 25. Native Share Broker (`useShare`)
Provides a unified interface for the Web Share API with defensive error management.
- **Cancellation Handling**: Automatically silences `AbortError` exceptions to treat user cancellation as a successful termination of the UI flow.
- **Capability Guard**: Proactively detects hardware sharing support before exposing interactive elements.

### 26. Cross-Tab Synchronization (`useBroadcastChannel`)
Ensures atomic state consistency across multiple open browser tabs/windows.
- **Real-Time Events**: Dispatches high-priority messages for data synchronization success and recruit dismissal to prevent UI desynchronization.
- **Memory Safety**: Implements deterministic cleanup of the communication channel on component unmount.

### 27. Advanced Network Telemetry (`useNetworkInfo`)
Layer 1 hardware broker for the Network Information API.
- **Degradation Detection**: Proactively identifies "Slow" connection states based on high latency (>500ms RTT) or low bandwidth (<1Mbps downlink).
- **Singleton Persistence**: Maintains a module-level state to ensure consistent connection metrics across all application call sites.

### 28. Optimized List Logic (`useListFilter`)
A domain-blind engine for high-performance searching and sorting of large datasets.
- **WeakMap Caching**: Utilizes a module-level `WeakMap` to cache normalized search fields, achieving O(1) amortized lookup performance and maintaining 60FPS during active filtering.
- **Stability Support**: Implements stable tie-breaking logic (Name -> ID) to ensure deterministic rendering order across sort transitions.

---
<br />


## Architectural Layers

The codebase is organized using a layered, feature-driven architecture to ensure scalability and maintainable "Clean Stack" principles.

```text
src/
├── app/             # Layer 4: App (@app) [Glue] - Orchestration & Shell
├── core/            # Layer 1: Core (@core) [Kernel] - Agnostic Infrastructure
├── features/        # Layer 3: Features (@features) [Business] - Domain Silos
├── shared/          # Layer 2: Shared (@shared) [Molecules] - Domain-blind UI
└── env.d.ts         # Environment definitions
```

---
<br />


## Layer Isolation & Import Boundaries
To ensure the "Clean Stack" integrity, the application enforces strict directional dependencies between layers.

- **Layer 1: Core (@core)**: The system kernel. Zero dependencies on higher layers. Contains agnostic infrastructure, themes, and global utilities.
- **Layer 2: Shared (@shared)**: Domain-blind UI primitives and layout orchestrators. Can import from Layer 1, but NEVER from Features or App.
- **Layer 3: Features (@features)**: Domain-specific silos (Roster, Laboratory, Headhunter). Can import from Layer 1 and Layer 2. Strictly forbidden from cross-feature imports (Silo Isolation) or importing from Layer 4.
- **Layer 4: App (@app)**: The orchestration glue. Can import from all lower layers (L1, L2, L3) to compose the final application shell and router.

Violation of these boundaries is considered architectural debt and will be flagged by the autonomous pipeline.

---
<br />

## Development

### Prerequisites
- Node.js v24+
- pnpm v10+

### Quick Start

```bash
# Install dependencies
pnpm install

# Start local development server (Hot Module Replacement)
pnpm dev
# > Available at http://localhost:5173
```

### Environment Setup
```ini
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

---
<br />

## Quality Assurance

The project adheres to strict testing standards to prevent regression in critical clan operations.

```bash
pnpm test          # Run unit logic tests
pnpm test:ui       # Open the Vitest UI dashboard
pnpm type-check    # Verify TypeScript types
```

### Nightly Pipeline
In addition to local testing, the codebase is autonomously maintained by an **8-agent Nightly Pipeline**. This system executes every 24 hours to enforce structural purity, synchronize README documentation, and audit dependency health via the `Nightly` branch.

---
<br />

## Mobile-First Features

- **Installable**: Meets all PWA criteria for installation on iOS and Android.
- **Offline Capable**: Views cache automatically (Stale-While-Revalidate strategy).
- **Haptics**: Uses `navigator.vibrate` for tactile feedback on interactions.
- **Deep Linking**: Supports URL routing for sharing specific clan profiles or searches.

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](../LICENSE).
