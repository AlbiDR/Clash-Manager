// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Core Configuration (@core/config)

The **Authoritative Constant Kernel**. A centralized collection of business thresholds, operational constants, and system-wide identifiers that form the static substrate of the application.

---

## Purpose
The Configuration directory (Layer 1) centralizes all non-volatile parameters to prevent "Magic Number" drift and ensure architectural consistency across the monorepo. Following ADR Section I and VII, these constants are the single source of truth for the application's behavioral bounds.

## Architectural Context
- **Layer**: Layer 1 (@core/config)
- **Role**: Authoritative Constant Registry.
- **Import Boundaries**:
 - **Allowed**: Can be imported by any higher layer (L1, L2, L3, L4).
 - **Axiom**: To satisfy the **Zero Magic Numbers** rule, business logic in Features must import these constants rather than declaring local numeric literals.

## Configuration Registry

### Business Thresholds & Defaults
Defines the authoritative bounds for game-related logic and simulation.
- **DATA_STALENESS_THRESHOLD**: Time-to-Live (30 mins) before clan data is marked as stale in the UI.
- **DEFAULT_SCORE_THRESHOLD**: The system-wide baseline for recruitment prioritization (default: 75).
- **VOYAGE_DEFAULT_TARGET**: Authoritative crown target for new Clan Voyage events.
- **SCORE_SELECTION_STEPS**: Standardized increments for UI selection components.

### Core Timing Constants
Centralizes UI/UX stability delays and orchestration timeouts to ensure predictable interaction timing.
- **UI_STABILITY_DELAY**: Standardized delay (1.5s) to avoid layout shifts during initial hydration or font loading.
- **BLITZ_SAFETY_DELAY**: Safety window for automated Blitz Mode to ensure stable OS intent resolution.
- **BADGE_UPDATE_DEBOUNCE**: Throttling threshold for high-frequency notification badge updates.
- **STORAGE_DELETE_TIMEOUT**: Non-blocking safety timeout for persistent storage operations.

### Authoritative Storage Identifiers
Centralizes IndexedDB and LocalStorage configuration to ensure synchronization between the Main Thread and the Service Worker thread.
- **STORAGE_DB_NAME**: The authoritative database name (`clash_manager_v14`).
- **STORAGE_DEPRECATED_DB_NAMES**: A registry of legacy database identifiers targeted for automated pruning during system maintenance.
- **NOTIFICATION_TAG_RECRUIT**: The unique identifier for recruitment-related push notifications, shared between the PWA Manifest and the Service Worker.

---

## Technical Standards
- **Mathematical Identities**: The only permitted numeric literals are identities (e.g., `0`, `1`, `100` as percentage ceiling). All business-meaningful numbers must be extracted here.
- **Atomic Exports**: Constants are exported as discrete named exports to ensure optimal tree-shaking and deep-import compatibility.
- **Drift Protection**: Any modification to timing or storage constants must be synchronized with the corresponding logic in the Service Worker (`sw.ts`) and Native Android bridge.
