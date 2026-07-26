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
| `ConsoleLayout.vue` | The feature-view shell: header, FAB sync, pull-to-refresh, empty/error orchestration. |
| `ConsoleHeader.vue` | Search (debounced), sort controls, and the status pill. |
| `ConsoleList.vue` | Time-sliced list container with Showcase support. |
| `SettingsCard.vue` / `SkeletonSettingsCard.vue` | Collapsible settings container and its skeleton. |
| `AppFooter.vue` | Version and legal footer. |

## Cards, primitives and stats

| Component | Role |
| :--- | :--- |
| `BaseCard.vue` / `BaseCardSkeleton.vue` | The foundational card (squish, selection) and its skeleton. |
| `BaseBadge.vue` | The atomic badge. |
| `Icon.vue` | The SVG renderer; paths come from `@core/theme/icons`. |
| `StatusPill.vue` / `MomentumPill.vue` | System-health pill and trend indicator. |
| `StatsGrid.vue` / `StatisticItem.vue` | Responsive stat grid and a labeled data point. |
| `SettingRow.vue` | A settings row (toggle, loading, disabled). |

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

## Conventions

- No third-party UI, icon, or charting libraries; styles consume `--sys-*` variables.
- Minimum 48px touch targets and descriptive ARIA labels.
- Tests live in `ui-tests/`.

## See also

- [Frontend README](../../../README.md) | [`@shared`](../README.md) | [`@core/theme`](../../core/theme/README.md)
- [`@shared/composables`](../composables/README.md) - chart components consume chart composables; interactive components use gesture composables
- [`@core/services`](../../core/services/README.md) - `ConsoleLayout` and `ConsoleList` are driven by `useConsoleController` from here
