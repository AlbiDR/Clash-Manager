// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Shared Directives (@shared/directives)

The **DOM Catalyst Layer**. Low-level DOM manipulators that provide standardized interaction feedback and specialized rendering behaviors across the application.

---

## Purpose
Shared Directives (Layer 2) are used to attach reusable behavioral logic directly to DOM elements. They ensure that common interactions - such as haptic feedback on tap or rich tooltip overlays - are applied consistently without polluting component-level logic.

## Architectural Context
- **Layer**: Layer 2 (@shared/directives)
- **Role**: DOM Interactions.
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 1 (@core).
 - **Forbidden**: Strictly forbidden from importing from Layer 3 (@features) or Layer 4 (@app).

## Directive Registry

### v-tactile (`vTactile.ts`)
The high-performance tap and long-press haptic engine.
- **Architectural Protection**: Automatically ignores interactions on actionable children (`.btn-action`, `a`, `.hit-target`) to prevent nested haptic conflicts and redundant triggers.
- **Thresholds**: Implements a 500ms long-press threshold and a 10px DPI-aware movement tolerance to distinguish between intent and accidental movement.
- **Hardware Integration**: Directly interfaces with the brokered haptics service to trigger physical vibrations.

### v-tooltip (`vTooltip.ts`)
An accessible, theme-aware rich information overlay engine.
- **Popover API**: Utilizes the native web Popover API for efficient top-layer rendering, ensuring tooltips always appear above other UI elements without z-index conflicts.
- **Singleton Delegation**: Employs a singleton architecture on `document.body`. A single shared tooltip instance is reused across the entire application to minimize memory footprint and DOM clutter.
- **Interaction Logic**: Activated by a 400ms touch long-press (integrated with 40ms haptic feedback for confirmation). Automatically dismisses on scroll to maintain visual focus.

---

## Integration Standards
- **Global Registration**: Directives are registered globally in the application entry point to ensure they are available to all components.
- **Clinical Purity**: Directives should focus strictly on DOM manipulation and interaction feedback. Business logic should always be delegated to Composables or Services.
- **SSR Safety**: Directive implementations must account for Server-Side Rendering (SSR) or non-browser environments by checking for the presence of the `window` object.
