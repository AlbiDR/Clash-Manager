// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# App Layer (@app) -- Orchestration & Shell

The **System Orchestrator**. The highest functional layer of the application, responsible for composing Layer 3 Features into a unified shell, managing global navigation, and orchestrating the Service Worker lifecycle.

---

## Purpose
The App Layer (Layer 4) serves as the "glue" of the application. It defines the structural layout (Shell), the routing logic (Navigation), and the offline strategy (Service Worker), ensuring that independent features work together as a cohesive PWA.

## Architectural Context
- **Layer**: Layer 4 (@app)
- **Role**: Orchestration & Shell Layer.
- **Import Boundaries**:
  - **Allowed**: Can import from Layer 3 (`@features`), Layer 2 (`@shared`), Layer 1 (`@core`), and Layer 0 (`@substrate`).
  - **Axiom**: Layer 4 is the only layer authorized to import from `@features`.

## Core Components

### The Shell (`App.vue`)
The root component and primary container for the application.
- **Layout Management**: Orchestrates the top-level layout primitives and provides the mounting point for feature-specific views.
- **Global Event Handling**: Manages application-wide events and provides the reactive context for the entire component tree.

### The Router (`/router`)
The authoritative manager for navigation and view transitions.
- **Lazy Loading**: Implements code-splitting for Feature Views to ensure optimal initial bundle size.
- **Persistent Scroll Restoration**: Manages a custom, SessionStorage-backed scroll restoration engine to maintain context during navigation.
- **View Transitions**: Orchestrates hardware-accelerated View Transitions for fluid UI state changes.
- **Resilience**: Implements chunk-loading recovery to handle network errors during dynamic imports.

### The Service Worker (`sw.ts` & `/sw`)
The PWA kernel responsible for offline capability, asset delivery, and background tasks. Decomposed into specialized sub-modules for structural purity.
- **swKernel.ts**: Low-level IndexedDB primitives and environmental guards for the worker thread.
- **swSync.ts**: Domain-specific logic for background synchronization and push notification management.
- **Caching Topologies**: Uses Workbox precaching (`precacheAndRoute`) for the app shell and assets, paired with a network-first style custom navigation handler (navigation preload -> network -> precached `index.html` shell as the offline fallback). No runtime CacheFirst or StaleWhileRevalidate routes are registered, and there is no dedicated data caching strategy.
- **Update Orchestration**: Manages the "Prompt for Update" lifecycle to ensure clients are running the latest authoritative version.
- **Background Sync**: A `periodicsync` handler (tag `update-recruit-badge`) refreshes the recruit badge by querying the `headhunter_view` directly via PostgREST from the worker thread (Direct View Access), independently of the @core/Layer-1 services.

---

## Integration Standards
- **Feature Composition**: Views in this layer should remain as thin as possible, delegating all domain logic to Layer 3 Features.
- **Directional Integrity**: While this layer can import from all lower layers, no lower layer is permitted to import from `@app`.
- **Navigation Safety**: Route transitions must prioritize layout stability and performance, leveraging `v-memo` and `shallowRef` where appropriate.
