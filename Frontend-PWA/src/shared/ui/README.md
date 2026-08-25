// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared/ui

> The component library: every reusable, domain-blind Vue component, from the Console shell to badges, charts, and feedback states.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`.

## The Console pattern

The signature reusable capability. `ConsoleLayout` + `ConsoleHeader` + `ConsoleList`, driven by `useConsoleController` in [`@core`](../../core/services/README.md), give every list view the same search, sort, progressive rendering, selection, status pill, and empty/error/skeleton handling. [Roster](../../features/roster/README.md) and [Headhunter](../../features/headhunter/README.md) are thin configurations of it.

## Layout and shell

| Component | Role |
| :--- | :--- |
| `ConsoleLayout.vue` | The feature-view shell: header, FAB sync, pull-to-refresh, empty/error orchestration. Supports `ignoreBlueprintMode` prop to exempt specific views (e.g., Settings) from whole-slot Blueprint skeleton swaps, enabling granular per-card skeleton management. |
| `ConsoleHeader.vue` | Search (debounced), sort controls, and the status pill. |
| `ConsoleList.vue` | Time-sliced list container with Showcase support. |
| `SettingsCard.vue` / `SkeletonSettingsCard.vue` | Collapsible settings container and its skeleton. `SkeletonSettingsCard.vue` renders in a default collapsed state (header only) matching user-facing `SettingsCard.vue` captured bone dimensions from `bones.generated.json` to prevent layout shift. |
| `AppFooter.vue` | Version and legal footer. |

## Cards, primitives and stats

| Component | Role |
| :--- | :--- |
| `BaseCard.vue` / `BaseCardSkeleton.vue` | The foundational card (squish, selection) and its skeleton. `BaseCard.vue` integrates the declarative `v-tactile` directive on its score section and expand chevron button for mobile WebView touch feedback. |
| `BaseBadge.vue` | The atomic badge. |
| `Icon.vue` | The SVG renderer; paths come from `@core/theme/icons`. |
| `StatusPill.vue` / `MomentumPill.vue` | System-health pill and trend indicator. |
| `StatsGrid.vue` / `StatisticItem.vue` | Responsive stat grid and a labeled data point. |
| `SettingRow.vue` | A standardized settings/preference row. Modernized with a 48px high tap target for WebView mobile compliance, integrated with the declarative `v-tactile` haptic feedback model, and standardizes click emits callback parameters to eliminate anemic variable pathogens (`emitEvent` typed argument). |

## Identity badges

| Component | Role |
| :--- | :--- |
| `ScoreBadge.vue` | Performance (PeS) / Potential (PoS) score with benchmarking. |
| `TrophyBadge.vue` | Trophy count with benchmark tooltip. |
| `RoleBadge.vue` / `TenureBadge.vue` | Clan role and days-in-clan. |
| `LongevityBadge.vue` / `TagBadge.vue` | Discovery duration and player tag. |

## Charts

| Component | Role |
| :--- | :--- |
| `BaseHistoryChart.vue` | Domain-blind trend chart with best-fit line and projection. |
| `WarHistoryChart.vue` / `VoyageHistoryChart.vue` | War and Voyage variants. |

## Interactive

| Component | Role |
| :--- | :--- |
| `BaseSelect.vue` / `BaseSegmentedControl.vue` | Accessible replacements for native select and segmented controls, hardened for Android WebViews. |
| `DurationInput.vue` | Days/hours/minutes input with clamping. |
| `CardActions.vue` | Card-level action bar. |
| `SelectionBar.vue` / `ScoreThresholdSelector.vue` | Bulk-operation bar and its score-threshold picker. |
| `FloatingDock.vue` / `NavigationDock.vue` / `SelectionFab.vue` | The bottom dock that morphs into contextual selection actions. Configured with a declarative `v-tactile` haptic feedback brokering model and 48px touch targets for WebView mobile ergonomics. |
| `HeaderInfoOverlay.vue` | Explains a view's metrics. |

## Voyage and feedback

| Component | Role |
| :--- | :--- |
| `VoyageBanner.vue` / `EventManagement.vue` / `VoyageSetupForm.vue` | Voyage progress banner, admin hub, and setup form. `VoyageSetupForm.vue` is modernized with a 48px high `.target-input` for mobile touch footprint compliance and standardizes generic variables for state tracking (`isVoyageActive`, `remainingMilliseconds`, and `voyageStatus`). |
| `ErrorBoundary.vue` / `ErrorState.vue` | Runtime error capture and recovery UI. |
| `ToastContainer.vue` / `Toast.vue` | Global transient notifications. |
| `EmptyState.vue` | Empty-data feedback. |

## Standardized Interactive APIs

### SettingRow.vue
Standard preference row used across Settings cards (Appearance, Notifications, Modes, Feature flags) and Laboratory parameter configurations.
- **Props**:
  - `label?: string` - Main display title.
  - `description?: string` - Contextual helper description.
  - `active?: boolean` - Active/selected switch toggle status.
  - `disabled?: boolean` - Disables interactions, sets pointer-events, and applies 0.5 opacity.
  - `loading?: boolean` - Applies skeleton loading animations and classes to the switch container.
  - `mini?: boolean` - Suppresses padding and scales down fonts for dense layouts.
- **Slots**:
  - `#label` - Custom markup for labels.
  - `#description` - Custom markup for descriptions.
- **Events**:
  - `@click` - Emitted only when row is not disabled, standardizing the payload parameter as `emitEvent` to conform to CleanStack naming rules and eliminate anemic variable pathogens.
- **WebView Mobile Ergonomics**: Enforces `min-height: var(--sys-space-48)` with vertical padding and leverages `v-tactile` for declarative haptic feedback brokering.

## Conventions

- No third-party UI, icon, or charting libraries; styles consume `--sys-*` variables.
- Minimum 48px touch targets and descriptive ARIA labels.
- Tests live in `ui-tests/`.

## See also

- [Frontend README](../../../README.md) | [`@shared`](../README.md) | [`@core/theme`](../../core/theme/README.md)
- [`@shared/composables`](../composables/README.md) - chart components consume chart composables; interactive components use gesture composables
- [`@core/services`](../../core/services/README.md) - `ConsoleLayout` and `ConsoleList` are driven by `useConsoleController` from here
