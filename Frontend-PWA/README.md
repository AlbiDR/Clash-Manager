# Clash Manager --- Client Core (PWA)

[![Client](https://img.shields.io/badge/Client-v13.3.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../.github/authoritative-design-references/CleanStack%20Architecture.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Operational Command Center**. A high-performance, offline-first Vue 3.5 application that serves as the primary interface for clan management.

---
<br />

## Screenshots

<div align="left">
  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #f6f8fa;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Light Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #ffffff; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>

  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #161b22;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Dark Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #0d1117; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="public/assets/branding/roster-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="public/assets/branding/headhunter-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
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
| **Transport** | **GasClient** | Hybrid bridge utilizing a Worker Hub Circuit Breaker (20s timeout) with an authoritative Google Apps Script fallback. Implements 'text/plain' requests to bypass CORS preflight and Matrix Inflation (decompressing row-based matrices) to reduce payload size by 70%. |
| **Validation** | **Valibot** | Mandatory schema enforcement at all Layer 1 boundaries |
| **Storage** | **IndexedDB** | High-performance persistence via `StorageService` (idb) |
| **Build** | **Vite 7** | Optimized build pipeline with advanced PWA workbox strategies |

---
<br />

## Core Orchestration & Infrastructure

The application kernel (@core) manages complex system-level behaviors through specialized Layer 1 services:

### 1. Unified State & Sync (`useClashDataStore`)
The authoritative Layer 1 central store for high-integrity clan datasets.
- **Unified Sync Kernel**: Centralizes state mutation (data, timestamps, source), metadata sync, and IndexedDB persistence across all hydration paths (local, worker, background).
- **Hub Attribution Logic**: Tracks dataset provenance via `dataSource` and `hubTimestamp` to distinguish between direct GAS and optimized Worker Hub payloads.
- **High-Fidelity Metadata**: Preserves server-side lifecycle markers (`lastCompiledTime`, `lastFetchedTime`) to ensure accurate data age calculations across distributed environments.
- **Stale-While-Revalidate**: Implements a zero-latency hydration strategy by loading from IndexedDB on boot while updating from the remote backend in the background.
- **Validation Boundary**: All inbound payloads are strictly validated against `WebAppDataSchema` to prevent "any" plague propagation into the application state.

### 2. Recruitment Blitz (`useBatchQueue`)
Orchestrates the "Recruitment Pipeline" for the Headhunter feature through a multi-tier deep-linking strategy.
- **Automated Blitz**: Manages a recursive engine that sequentially triggers OS intents to open recruit profiles in the Clash Royale client with mobile-optimized timing (4000ms safety delay).
- **Environment Trust**: Implements trust verification to ensure automated actions are only executed in standard browser/PWA contexts.
- **FAB Integration**: Dynamically calculates Floating Action Button (FAB) labels and states based on selection and Blitz progress.

### 3. List Orchestration (`useConsoleController`)
The primary Layer 1 orchestrator for high-density list views (Roster, Headhunter).
- **Layout Orchestration**: Centralizes the communication between infrastructure and the `ConsoleLayout` component via standardized `layoutProps` and `layoutEvents` interfaces, reducing boilerplate in feature views.
- **Dependency Inversion**: Bridges domain-blind infrastructure (searching, sorting, pagination, selection) with feature-level requirements through a unified reactive interface.
- **Status Resolver**: Implements a 7-tier priority hierarchy to resolve the most critical system status (Invalid API URL, Offline, Sync Error, Waking Server..., Syncing..., Fallback, and Nominal).
- **Performance Orchestration**: Centralizes item metadata resolution and `v-memo` key generation to ensure consistent rendering optimizations across feature views.
- **Lifecycle Management**: Monitors document visibility and triggers automatic background refreshes after extended inactivity (30m+) to ensure data currency.

### 4. Progressive Rendering Engine (`useProgressiveList`)
Maintains 60FPS UI performance when handling large datasets via a time-sliced rendering strategy.
- **Idle Budgeting**: Utilizes `requestIdleCallback`'s `IdleDeadline` to process multiple items per frame without blocking the main interaction thread.
- **Churn Prevention**: Implements an incremental update strategy for minor dataset changes (< 5 items) to prevent jarring layout shifts and scroll jumps.
- **Memory Safety**: Uses `shallowRef` to minimize reactive overhead and ensures deterministic cleanup via `onScopeDispose`.

### 5. Haptic Notification System (`useToast`)
A resilient, global notification service with integrated hardware feedback.
- **Hardware Brokerage**: Pairs semantic notification types (Success, Error, Info) with specific haptic patterns via the `useHaptics` engine to provide physical confirmation.
- **Interaction Safety**: Implements an 800ms debounce-locked action handler to prevent race conditions during rapid user input on high-consequence actions like "UNDO".

### 6. Connectivity Singleton (`useApiState`)
The authoritative Layer 1 arbiter of backend availability and handshake discovery (located in `@core/api/`).
- **Handshake Discovery**: Orchestrates the initial 25,000ms handshake to detect server availability, cold-boot "waking" states, or configuration gaps.
- **Worker Verification**: Proactively pings the high-performance Worker Hub to determine if the optimized data path is available.

### 7. Connectivity Arbitrator (`useConnectionStatus`)
Unifies physical network status and logical API availability into a single source of truth.
- **Priority Resolution**: Implements a 6-tier priority queue (Physical Offline -> Logical Offline -> Success -> Syncing -> Slow -> Online) to ensure the most critical status is always visible.
- **Reactive Deltas**: Automatically manages window listeners and provides reactive feedback for network transitions and speed degradation.

### 8. Hardware Brokerage (`useWakeLock`)
Prevents device sleep during resource-intensive operations (Batch Blitz, Sync).
- **Visibility Resilience**: Automatically re-acquires the wake lock when the application returns to the foreground if user intent is still active.
- **System Synchronization**: Integrated into the synchronization engine to ensure data integrity during long-running background fetches.

### 9. Statistical Benchmarking (`useBenchmarking`)
A high-performance O(N) engine for comparing individual metrics against clan-wide averages.
- **Single-Pass Optimization**: Aggregates mean, min, and max values across all metrics in a single traversal of the dataset to minimize CPU cycles.
- **Tier Resolution**: Dynamically classifies performance into 4 tiers (Elite, Top Tier, Growing, Under) based on statistical deviations from the mean.
- **Singleton Pattern**: Shares pre-calculated statistical models across all component instances via a module-level cache.

### 10. UI Coordination (`useUiCoordinator`)
The master arbiter of layout spacing and element visibility.
- **Occlusion Prevention**: Dynamically calculates bottom offsets for the `FabIsland` and `ToastContainer` to ensure interactive elements never overlap.
- **Singleton Control**: Manages a global FAB state, allowing different feature views to register actions and labels in a unified UI layer.

### 11. Redundant Persistence (`useAppSettings`)
A multi-tier strategy for application configuration and feature flags.
- **Cross-Layer Visibility**: Settings are mirrored between `LocalStorage` (for main-thread UI) and `IndexedDB` (for Service Worker access).
- **Tab Synchronization**: Listens for `storage` events to ensure configuration remains consistent across multiple open browser tabs.

### 12. Deep Link Navigation (`useDeepLinkHandler`)
Manages item expansion and auto-scroll based on URL query parameters.
- **Navigation Safety**: Implements a 'run-once' guard to prevent layout jumps during background data refreshes.
- **Context Awareness**: Constructively scrolls specific roster or headhunter items into view upon landing via 'pin' parameters.

### 13. Metadata Centralization (`useSystemInfo`)
Provides a single source of truth for application versioning and specialized global modes (Showcase, Blueprint, Synthetic). Implements a priority queue for display badges (Showcase > Blueprint > Synthetic).

### 14. Audit Mode Orchestration (`useShowcaseMode`)
Acts as the master arbiter for the application's demonstration and auditing states.
- **Master-Child Sync**: Implements a MASTER -> CHILD propagation pattern, ensuring that toggling Showcase Mode automatically synchronizes both Blueprint and Synthetic child modes.
- **Reactive Resolution**: Utilizes a child-to-master watcher to automatically activate the Showcase status if both constituent modes are manually enabled.

### 15. Geometric Skeletons (`useBlueprintMode`)
Allows for layout stability auditing by forcing the application into a structural-only state.
- **Visual Pruning**: Strips decorative elements from components, leaving only geometric skeletons to facilitate interaction design debugging.
- **Singleton Persistence**: Ensures all components share a unified toggle status, persisted to `localStorage` for cross-session consistency.

### 16. Synthetic Data Engine (`useSyntheticMode`)
Decouples the UI from live backend dependencies for demonstration and testing.
- **High-Fidelity Mocks**: Enables a global toggle that redirects data ingestion to high-fidelity synthetic payloads.
- **Isolation**: Acts as a Layer 1 singleton to ensure data consistency across the entire application shell.

### 17. Storage Protection (`useStoragePersistence`)
Brokered access to the Storage Manager API to prevent silent data eviction.
- **Origin Persistence**: Explicitly requests the browser to grant "persisted" status to the application's origin, ensuring IndexedDB and localStorage remain intact under device storage pressure.
- **Status Monitoring**: Provides reactive signals for `isSupported` and `isPersisted` states.

### 18. Hardware Navigation (`useBackHandler`)
Orchestrates hardware back button interception for modal and overlay management.
- **History Shimming**: Implements a "synthetic state" strategy by pushing temporary entries to the browser history stack, allowing 'popstate' events to close UI components rather than navigating away.
- **Android Optimization**: Specifically designed to provide a native-feeling "back to close" experience on mobile devices.

### 19. Share Intent Processor (`useShareTarget`)
Infrastructure kernel for handling incoming Web Share Target API intents.
- **Tag Extraction**: Utilizes specialized regex to identify player tags (#XXXX) from shared OS text, titles, or URLs.
- **Intent Redirection**: Automatically cleans the history state and redirects to the Recruiter view with extracted tags applied as active filters.

### 20. Adaptive Haptics Engine (`useHaptics`)
Brokered access to device vibration hardware for tactical physical feedback.
- **Battery Awareness**: Implements power-aware scaling, automatically reducing vibration intensity when the device is in low-power mode or below 20% battery.
- **Interaction Security**: Enforces a strict user-gesture requirement before allowing hardware access to comply with browser security models.

### 21. Cross-Platform Badging (`useBadge`)
Orchestrates application-level notification badges across inconsistent platform APIs.
- **Dual-Path Strategy**: Utilizes the native W3C Badge API for iOS/Desktop and a persistent notification fallback for Android.
- **Flood Protection**: Implements a 1500ms debounce and exponential backoff retry mechanism to prevent API exhaustion and Service Worker instability.

### 22. Intent Orchestration (`useExternalLink`)
Specialized broker for deep-linking into external applications and the Clash Royale client.
- **Hidden Anchor Pattern**: Employs a temporary DOM element with a 100ms cleanup lifecycle to trigger OS Intents without dropping PWA execution context.
- **Android Intent Protocol**: Uses direct `intent://` schemes to ensure reliability when launching from sandboxed WebViews or Chrome Custom Tabs.

### 23. Native Share Broker (`useShare`)
Provides a unified interface for the Web Share API with defensive error management.
- **Cancellation Handling**: Automatically silences `AbortError` exceptions to treat user cancellation as a successful termination of the UI flow.
- **Capability Guard**: Proactively detects hardware sharing support before exposing interactive elements.

### 24. Cross-Tab Synchronization (`useBroadcastChannel`)
Ensures atomic state consistency across multiple open browser tabs/windows.
- **Real-Time Events**: Dispatches high-priority messages for data synchronization success and recruit dismissal to prevent UI desynchronization.
- **Memory Safety**: Implements deterministic cleanup of the communication channel on component unmount.

### 25. Advanced Network Telemetry (`useNetworkInfo`)
Layer 1 hardware broker for the Network Information API.
- **Degradation Detection**: Proactively identifies "Slow" connection states based on high latency (>500ms RTT) or low bandwidth (<1Mbps downlink).
- **Singleton Persistence**: Maintains a module-level state to ensure consistent connection metrics across all application call sites.

### 26. Optimized List Logic (`useListFilter`)
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
Create a .env file in the root directory to link to your backend:

```ini
# URL of your Google Apps Script Web App execution
VITE_GAS_URL=https://script.google.com/macros/s/.../exec

# Worker Hub Opt-In (Enables 0ms latency Data Hub reads with fallback)
VITE_USE_WORKER_HUB=true
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
In addition to local testing, the codebase is autonomously maintained by a **7-agent Nightly Pipeline**. This system executes every 24 hours to enforce structural purity, synchronize README documentation, and audit dependency health via the `Nightly` branch.

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
