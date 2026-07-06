// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Shared Layer (@shared) : Driver & Molecule Substrate

The **Substrate Layer**. A collection of domain-blind UI building blocks, interaction drivers, and stateful composables that define the visual and behavioral language of the Clash Manager ecosystem.

---

## Purpose
The Shared Layer (Layer 2) provides a standardized set of primitives and drivers that are agnostic of specific business logic. It serves as the bridge between the Agnotsic Core (Layer 1) and the Domain-Specific Features (Layer 3).

## Architectural Context
- **Layer**: Layer 2 (@shared)
- **Role**: Driver & Molecule Layer. Provides stateless UI or brokered access to external/shared state.
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 1 (`@core`) and Layer 0 (`@substrate`).
 - **Forbidden**: Strictly forbidden from importing from Layer 3 (`@features`) or Layer 4 (`@app`).

## Logic Subsystems

### UI Molecules (`/ui`)
Dumb or brokered components that receive data via props and emit events.
- **Foundational Primitives**: `Icon.vue`, `BaseCard.vue`, `BaseBadge.vue`.
- **Layout Orchestrators**: `ConsoleLayout.vue`, `ConsoleHeader.vue`, `ConsoleList.vue`.
- **Domain-Blind Visualization**: `BaseHistoryChart.vue`.
- *See [ui/README.md](./ui/README.md) for a comprehensive component registry.*

### Shared Composables (`/composables`)
Stateful logic engines that manage component-level behaviors and hardware brokerage.
- **useTheme.ts**: Master arbiter for theme-aware visual states - applies light/dark tokens as CSS variables on the document root, toggles the `dark` class, persists the preference to LocalStorage (`cm_theme_preference`), and rewrites the `theme-color` meta tag.
- **useHistoryChart.ts**: Centralizes history parsing, slicing, and weighted trend prediction for visualization components.
- **useSelectionBar.ts**: Encapsulates logic for score threshold selection and comparison mode toggling in bulk operation surfaces.
- **useCountdown.ts**: High-performance interval timer for real-time expiration feedback (e.g., Voyage banners).
- **useViewport.ts**: Orchestrates viewport-aware reactivity and breakpoint sensing across the monorepo.
- **useCardMechanics.ts**: Manages "squish-interactions," selection states, and semantic scaling for card-based UI.
- **usePullToRefresh.ts**: Orchestrates native-feeling pull-to-refresh gestures and synchronization triggers.
- **useHeaderScroll.ts**: Provides reactive scroll-depth detection for adaptive header styling.
- **useLongPress.ts**: Hardware-accelerated long-press gesture detection with haptic feedback.
- **useStatusPill.ts**: Centralizes expansion state, haptic feedback, and responsive label formatting for connectivity status indicators.
- **useBenchmarkedStat.ts**: Encapsulates reactive logic for generating benchmarking tooltips, integrating with the core benchmarking engine.
- **useScoreSelector.ts**: Encapsulates the UI logic for score threshold selection, including expansion state, haptic feedback, and smooth scrolling.
- **useBaseHistoryChart.ts**: Handles geometric translation of raw values into SVG paths and bar heights for history visualizations.

### Interaction Directives (`/directives`)
Low-level DOM manipulators for standardized user feedback.
- **vTactile.ts**: High-performance tap and long-press haptic engine. Implements an **Architectural Protection** rule that ignores interactions on actionable children (`.btn-action`, `a`, `.hit-target`) to prevent nested haptic conflicts. Features a 500ms long-press threshold and DPI-aware movement tolerance (10px baseline).
- **vTooltip.ts**: Accessible, theme-aware rich information overlay utilizing the native **Popover API** for top-layer rendering. Employs a singleton delegation architecture on `document.body` to minimize DOM footprint by reusing a shared tooltip instance. Features a 400ms touch long-press trigger, 40ms haptic feedback, and automatic hide-on-scroll resilience.

### Shared Utilities (`/utils`)
Domain-aware presentation helpers for UI formatting.
- **game.ts**: Authoritative role-to-label normalization and CSS class mapping.

---

## Integration Standards
- **Domain Blindness**: Logic in this layer must remain agnostic of "Players", "Recruits", or "Clans". Use generic terms like "Items", "Values", or "Thresholds".
- **Statelessness**: Favor stateless components and composables that consume `MaybeRefOrGetter` for maximum reactivity.
- **Hardware Brokerage**: All hardware interactions (Vibration, WakeLock) must be brokered through `@core/services` via shared composables.
