// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager --- Client Core (DeepNet)

[![Client](https://img.shields.io/badge/Client-v14.33.9-0066CC?style=flat-square&logo=vue.js&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../.github/authoritative-design-references/CleanStack%20Architecture.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **DeepNet Operational Command Center**. A high-performance, sovereign PWA infrastructure featuring intelligent local caching and live synchronization for administrative clan operations. Built on Vue 3.5.

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

- **Theme Engine**: Dynamic CSS variable injection (hex/RGB design tokens generated via `generateCssVariables` in `tokens.ts`) for seamless Light/Dark mode transitions without CSS-in-JS overhead.
- **Visual Purity**: Zero dependency on third-party icon libraries; all iconography is rendered via custom SVG paths in the `Icon.vue` primitive.
- **Hardware-Accelerated blurs**: Strategic use of `backdrop-filter` for glassmorphism effects on navigation and overlay layers.
- **Haptic Synchronization**: Interactions are paired with `navigator.vibrate` patterns (Heavy/Light/Success) via the `useHaptics` broker to provide physical feedback on mobile devices.
- **Fluid Topology**: Layouts that adapt continuously from mobile viewports to ultra-wide desktop dashboards using responsive media queries and flexbox.

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
| **Storage** | **IndexedDB** | High-performance persistence via `StorageService` (custom `idbKernel` IndexedDB wrapper with in-memory fallback) |
| **Build** | **Vite 7** | Optimized build pipeline with advanced PWA workbox strategies |

---
<br />

## Core Orchestration & Infrastructure

The application kernel (@core) manages complex system-level behaviors through specialized Layer 1 services:

### Persistence & Data Lifecycle
1. **Persistence Layer (`StorageService`)**: The authoritative persistence engine. Brokers access to IndexedDB via the `idbKernel` and manages high-fidelity caching with in-memory fallback.
2. **Unified State & Sync (`useClashDataStore`)**: The central store for high-integrity clan datasets. Delegates sync logic to `useClashSync.ts`.
3. **Synchronization Engine (`useClashSync`)**: Orchestrates the lifecycle of the central data store, including hydration from local cache and background synchronization.
4. **Data Hydration Orchestrator (`useClashLoader`)**: Orchestrates route-level hydration, ensuring a Stale-While-Revalidate (SWR) topology by awaiting local cache before firing background network refreshes.
5. **Storage Protection (`useStoragePersistence`)**: Brokered access to the Storage Manager API to prevent silent data eviction by explicitly requesting origin persistence.
6. **Selection Orchestrator (`useSelectionStore`)**: Manages the persistence and synchronization of item selection states for batch operations.

### Console & List Orchestration
7. **List Orchestration (`useConsoleController`)**: The primary orchestrator for complex feature views. Manages domain-blind infrastructure (filtering, sorting, progressive rendering, selection).
8. **Selection Logic Orchestrator (`useConsoleSelection`)**: Decouples batch selection logic (Select All, Score-based thresholding) from the main controller.
9. **Optimized List Logic (`useListFilter`)**: High-performance engine for searching and sorting large datasets using `WeakMap` caching for O(1) field lookups.
10. **Console Metadata (`useConsoleMetadata`)**: Decouples connectivity status and statistics badge logic from console controllers to maintain architectural purity.
11. **Progressive Rendering Engine (`useProgressiveList`)**: Time-sliced rendering engine utilizing `requestIdleCallback` to maintain 60FPS UI stability.
12. **Automated Batch Actions (`useBlitzMode`)**: Orchestrates the automated batch deep-linking ("Blitz") pipeline shared by console views.

### Connectivity & System Health
13. **Connectivity Hub Orchestrator (`useConnectivityManager`)**: Master arbiter of 8-tier system health and synchronization status confidence.
14. **Connectivity Arbitrator (`useConnectionStatus`)**: Unifies physical network status and logical API availability into a single source of truth.
15. **Advanced Network Telemetry (`useNetworkInfo`)**: Hardware broker for network telemetry (RTT, Downlink) and degradation detection.
16. **Visibility Orchestrator (`useVisibilityRefresh`)**: Triggers background data refreshes based on document visibility changes.
17. **Cross-Tab Synchronization (`useBroadcastChannel`)**: Facilitates cross-tab/window communication for synchronized state updates (e.g., settings).
18. **Native Bridge Orchestrator (`useNativeBridge`)**: Central orchestrator for the Native Android JSBridge, brokering hardware permissions and Blitz Mode calibration coordinates for the TWA wrapper.
19. **Cross-Platform Badging (`useBadge`)**: Centralized manager for application-level badges (Home Screen, Dock) with support for hardware-brokered native updates.

### Application Shell & Logic
20. **Settings Store (`useAppSettings`)**: Multi-tier strategy for application configuration, mirrored across `LocalStorage` and `IndexedDB`.
21. **PWA Lifecycle Manager (`usePwaManager`)**: Manages infrastructure-level PWA lifecycle (SW updates, recovery protocols) and native APK shell updates (brokering the download URL).
22. **UI Coordination (`useUiCoordinator`)**: Master arbiter of layout spacing and global FAB (Floating Action Button) state.
23. **Hardware Navigation (`useBackHandler`)**: Orchestrates hardware back button behavior in hybrid environments, ensuring predictable navigation stack exit.
24. **Statistical Benchmarking (`useBenchmarking`)**: Statistical engine for comparing individual metrics against clan averages using single-pass O(N) optimization.
25. **Deep Link Navigation (`useDeepLinkHandler`)**: Manages item expansion and auto-scroll based on URL parameters.
26. **Intent Orchestration (`useExternalLink`)**: Hardware broker for OS intents and browser navigation, implementing platform-specific deep-linking strategies.
27. **Metadata Centralization (`useSystemInfo`)**: SSOT for application versioning and global modes (Showcase, Blueprint, Synthetic).
28. **Audit Mode Orchestration (`useShowcaseMode`)**: Global UI simulation engine for high-fidelity demonstration and auditing.
29. **Geometric Skeletons (`useBlueprintMode`)**: Orchestrates the "Blueprint" overlay for rapid UI prototyping and architectural review.
30. **Synthetic Data Engine (`useSyntheticMode`)**: Enables synthetic data injection for stress-testing and zero-network development.
31. **Native Share Broker (`useShare`)**: Unified hardware broker for the Web Share API, providing defensive error handling for native share interactions.
32. **Share Intent Processor (`useShareTarget`)**: Orchestrates the Web Share Target API, extracting player tags from incoming OS share intents.
33. **Haptic Notification System (`useToast`)**: Global notification service with semantic hardware haptic pairing via `@shared/composables/useHaptics`.

---
<br />

## Shared Behavioral Logic (@shared/composables)

The application utilizes stateful logic engines (Layer 2) to manage component-level behaviors and hardware brokerage:

- **Hardware & OS Brokerage**: Reactive interfaces for device vibration (`useHaptics`), screen wake locks (`useWakeLock`), and viewport-aware reactivity (`useViewport`).
- **Interaction & Gesture Sensing**: High-performance gesture detection for long-press (`useLongPress`) and pull-to-refresh (`usePullToRefresh`).
- **Data Visualization**: Mathematical foundations for translation of raw history data into visual structures (`useHistoryChart`, `useBaseHistoryChart`).
- **Voyage Subsystem**: Specialized behavioral logic for Clan Voyage management (`useVoyageStore`, `useVoyageStatus`) promoted to Layer 2 for structural compliance.

---
<br />

## Specialized Domain Clients

The application utilizes specialized Layer 1 clients (@core/api) to manage domain-specific remote operations and RPC orchestrations.

### 1. Voyage Client (`VoyageClient`)
Authoritative transport layer for the Clan Voyage feature.
- **RPC Activation**: Orchestrates the `initialize_voyage` RPC to activate and configure clan-wide events.
- **Ledger Ingestion**: Fetches high-resolution contribution ledgers and event summaries from authoritative SSOT views.

### 2. Recruit Client (`RecruitClient`)
Authoritative transport layer for Headhunter recruitment operations.
- **Blacklist Orchestration**: Manages recruit dismissal and restoration via secured RPCs (`dismiss_recruits`, `undismiss_recruits`).
- **Realtime Synchronization**: Implements Postgres change listeners to ensure cross-device consistency for the recruitment blacklist.

### 3. Profile Client (`ProfileClient`)
Authoritative transport layer for player profile synchronization and normalization.
- **Edge Function Proxy**: Interfaces with the `sync-player-cards` Edge Function to perform rarity-relative normalization and backend persistence.
- **Validation Boundary**: Enforces strict `ProfileInputSchema` validation on all inbound player snapshots.

### 4. Maintenance Client (`MaintenanceClient`)
System-level orchestrator for administrative and maintenance operations.
- **Trigger Governance**: Facilitates manual triggers for nightly maintenance cycles and database janitor protocols.

---
<br />


## Architectural Layers

The codebase is organized using a layered, feature-driven architecture to ensure scalability and maintainable "Clean Stack" principles.

```text
src/
├── app/             # Layer 4: App (@app) [Glue] - Orchestration & Shell
├── core/            # [Layer 1: Core (@core)](./src/core/README.md) [Kernel] - Agnostic Infrastructure
├── features/        # Layer 3: Features (@features) [Business] - Domain Silos
├── shared/          # [Layer 2: Shared (@shared)](./src/shared/README.md) [Molecules] - Domain-blind UI
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
In addition to local testing, the codebase is autonomously maintained by a **12-agent Nightly Pipeline**. This system executes every 24 hours to enforce structural purity, synchronize README documentation, and audit dependency health via the `Nightly` branch.

---
<br />

## Mobile-First Features

- **Installable**: Meets all PWA criteria for installation on iOS and Android.
- **Offline Capable**: Application logic implements a "Stale-While-Revalidate" hydration pattern for domain data. Note that PWA assets utilize strict Workbox precaching for the shell, with no runtime SWR strategies applied to network requests.
- **Haptics**: Uses `navigator.vibrate` for tactile feedback on interactions.
- **Deep Linking**: Supports URL routing for sharing specific clan profiles or searches.

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](../LICENSE).
