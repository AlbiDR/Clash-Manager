// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared

> Layer 2: the domain-blind building blocks. UI components, behavioral composables, directives, and presentation helpers that features assemble into screens.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`.

## Subdirectories

Each owns its own README; this file is the map.

| Directory | Role |
| :--- | :--- |
| [`ui/`](ui/README.md) | The component library: the Console shell, cards, badges, charts, docks, and feedback states. |
| [`composables/`](composables/README.md) | Reactive behavior: haptics, gestures, charts, countdowns, and the Voyage store. |
| [`directives/`](directives/README.md) | DOM-level interaction: `v-tactile` (haptics) and `v-tooltip`. |
| [`utils/`](utils/README.md) | Presentation helpers (role-to-label formatting). |

## Conventions

- **Domain-blind.** Components here talk about items, values, and thresholds, not players, recruits, or clans.
- **Hardware is brokered.** Vibration, wake lock, and similar go through `@core/services` via composables, never directly.
- **Exception:** the Clan Voyage components and composables live here (not in a feature) so Roster and Settings can both use them without a cross-feature import.

## See also

- [Frontend README](../../README.md) | [CleanStack Architecture](../../../.github/authoritative-design-references/CleanStack%20Architecture.md)
