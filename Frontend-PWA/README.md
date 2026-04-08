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
| **Transport** | **GasClient** | Hybrid bridge utilizing a Worker Hub Circuit Breaker (20s timeout) with an authoritative Google Apps Script fallback. Implements 'text/plain' requests to bypass CORS preflight and a 5-attempt jittered exponential backoff loop. |
| **Validation** | **Valibot** | Mandatory schema enforcement at all Layer 1 boundaries |
| **Storage** | **IndexedDB** | High-performance persistence via `StorageService` (idb) |
| **Build** | **Vite 7** | Optimized build pipeline with advanced PWA workbox strategies |

---
<br />

## Core Orchestration & Infrastructure

The application kernel (@core) manages complex system-level behaviors through specialized Layer 1 services:

### 1. Unified State & Sync (`useClashDataStore`)
Implements a **Stale-While-Revalidate** strategy for clan datasets.
- **Validation Boundary**: All inbound payloads are validated against `WebAppDataSchema` before store hydration to prevent malformed data from entering the application state.
- **Background Sync**: Orchestrates periodic data refreshes with `wakeLock` protection to prevent mobile sleep during heavy operations.

### 2. List Orchestration (`useConsoleController`)
The primary behavioral engine for high-density list views (Roster, Headhunter).
- **Unified Interface**: Coordinates searching, sorting, pagination (`useProgressiveList`), and deep-linking through a single reactive interface.
- **Status Resolver**: Implements a 7-tier priority hierarchy to resolve the most critical system status (Invalid API URL, Offline, Sync Error, Waking Server..., Syncing..., Fallback, and Nominal).

### 3. Progressive Rendering Engine (`useProgressiveList`)
Maintains 60FPS UI performance when handling large datasets via a time-sliced rendering strategy.
- **Idle Budgeting**: Utilizes `requestIdleCallback`'s `IdleDeadline` to process multiple items per frame without blocking the main interaction thread.
- **Memory Safety**: Uses `shallowRef` to minimize reactive overhead and ensures deterministic cleanup via `onScopeDispose`.

### 4. Haptic Notification System (`useToast`)
A resilient, global notification service with integrated hardware feedback.
- **Hardware Brokerage**: Pairs semantic notification types (Success, Error, Info) with specific haptic patterns via the `useHaptics` engine.
- **Interaction Safety**: Implements a debounce-locked action handler to prevent race conditions during rapid user input.

### 5. Connectivity Singleton (`useApiState`)
The authoritative arbiter of backend availability and handshake discovery.
- **Handshake Discovery**: Orchestrates the initial 25,000ms handshake to detect server availability, cold-boot "waking" states, or configuration gaps.
- **Physical Detection**: Integrates with `navigator.onLine` to distinguish between logical server failures and physical network disconnects.

### 6. Statistical Benchmarking (`useBenchmarking`)
A high-performance O(N) engine for comparing individual metrics against clan-wide averages.
- **Single-Pass Optimization**: Aggregates mean, min, and max values across all metrics in a single traversal of the dataset.
- **Tier Resolution**: Dynamically classifies performance into 4 tiers (Elite, Top Tier, Growing, Under) based on statistical deviations.

### 7. UI Coordination (`useUiCoordinator`)
The master arbiter of layout spacing and element visibility.
- **Occlusion Prevention**: Dynamically calculates bottom offsets for the `FabIsland` and `ToastContainer` to ensure interactive elements never overlap.
- **Singleton Control**: Manages a global FAB state, allowing different feature views to register actions and labels in a unified UI layer.

### 8. Redundant Persistence (`useAppSettings`)
A multi-tier strategy for application configuration and feature flags.
- **Cross-Layer Visibility**: Settings are mirrored between `LocalStorage` (for main-thread UI) and `IndexedDB` (for Service Worker access).
- **Tab Synchronization**: Listens for `storage` events to ensure configuration remains consistent across multiple open browser tabs.

### 9. Metadata Centralization (`useSystemInfo`)
Provides a single source of truth for application versioning and specialized global modes (Showcase, Blueprint, Synthetic).

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
