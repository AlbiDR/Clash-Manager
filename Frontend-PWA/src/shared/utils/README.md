// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Shared Utilities (@shared/utils)

A collection of domain-aware but UI-focused helpers and formatting engines that support feature-level presentation logic.

---

## Purpose
Shared Utilities (Layer 2) provide specialized formatting and normalization logic that is too specific for the mathematical `@core/utils` but too general for a single `@feature`. These helpers often bridge the gap between raw domain data and visual presentation requirements.

## Architectural Context
- **Layer**: Layer 2 (@shared/utils)
- **Role**: Presentation Helpers.
- **Import Boundaries**:
  - **Allowed**: Can import from Layer 1 (`@core`) and Layer 0 (`@substrate`).
  - **Forbidden**: Strictly forbidden from importing from Layer 3 (`@features`) or Layer 4 (`@app`).

## Utility Kernels

### Game UI Helpers (`game.ts`)
Authoritative logic for normalizing domain strings into UI-ready labels and styles.
- **Role Formatting**: Normalizes raw API role strings (e.g., 'coleader') into human-readable labels and their associated CSS branding classes (`role-leader`, `role-elder`, etc.).

---

## Integration Standards
- **Presentation Focus**: Logic here should be focused on *how things look* rather than *what things mean* (which belongs in `@core/utils`).
- **Statelessness**: Helpers MUST remain pure and stateless. Any logic requiring reactivity should be implemented as a Composable in the `@shared/composables` directory.
- **Barrel Consumption**: Shared utils are exposed through the `@shared` barrel (`src/shared/index.ts`) and consumed via that aggregate export (e.g. `RoleBadge.vue` imports `formatRole` from `@shared`).
