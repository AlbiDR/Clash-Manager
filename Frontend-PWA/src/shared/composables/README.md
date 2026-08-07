// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared/composables

> Reusable, domain-blind behavior: hardware brokerage, gestures, chart math, and reactive UI state.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`.

## Hardware and OS

| Composable | Role |
| :--- | :--- |
| `useHaptics.ts` | Brokered vibration with named patterns; respects user preference and battery. |
| `useWakeLock.ts` | Keeps the screen awake during long operations. |
| `useViewport.ts` | Breakpoint and viewport reactivity. |
| `usePointerCapability.ts` | Detects coarse/fine pointer capability (touch vs. mouse/trackpad) via media queries. |
| `useTheme.ts` | Applies light/dark tokens, toggles the `dark` class, and rewrites the `theme-color` meta. |

## Interaction and gestures

| Composable | Role |
| :--- | :--- |
| `useLongPress.ts` | Long-press detection with haptics. |
| `usePullToRefresh.ts` | Pull-to-refresh gesture and trigger. |
| `useHeaderScroll.ts` | Scroll-depth for adaptive headers. |
| `useCardMechanics.ts` | Card squish, selection, and scaling. |

## Charts and stats

| Composable | Role |
| :--- | :--- |
| `useHistoryChart.ts` | History parsing, slicing, and weighted trend prediction (reconciled with standardized chronological and prediction token variable names). |
| `useBaseHistoryChart.ts` | Turns values into SVG paths and bar heights (utilizing standardized trend path variable mapping and best-fit linear trend calculations). |
| `useBenchmarkedStat.ts` | Builds benchmark tooltips against clan averages. |

## UI state

| Composable | Role |
| :--- | :--- |
| `useCountdown.ts` | Interval timer for live expiry (e.g. Voyage). |
| `useStatusPill.ts` | Expansion and label logic for the status pill. |
| `useSelectionBar.ts` | Lifecycle for bulk-operation surfaces. |
| `useScoreSelector.ts` | Score-threshold picking and comparison toggle. |

## Clan Voyage

Kept here (not in a feature) so [Roster](../../features/roster/README.md) and [Settings](../../features/settings/README.md) can share it.

| File | Role |
| :--- | :--- |
| `voyageTypes.ts` | Voyage domain models and enums. |
| `useVoyageStore.ts` | Reactive state for the active voyage and contributions (Supabase-backed, realtime). |
| `useVoyageStatus.ts` | Resolves the current phase and progress. |
| `useVoyageActions.ts` | Activation and ledger sync. |
| `useVoyageForm.ts` | Setup-form state, validation, and standardized exception handling using domain-descriptive catch parameters (`voyageFormActivationError`, `voyageFormCancellationError`, and `voyageFormSetEndError`). |

## Conventions

- Prefer `MaybeRefOrGetter` inputs; clean up timers and listeners in `onScopeDispose`.

## See also

- [Frontend README](../../../README.md) | [`@shared`](../README.md) | [`@shared/directives`](../directives/README.md) | [`@shared/ui`](../ui/README.md)
- [`@core/services`](../../core/services/README.md) - composables import from `@core` (e.g. `useHaptics` delegates to the platform bridge; Voyage composables read from `@core` stores)
- Feature consumers: [`@features/roster`](../../features/roster/README.md) - consumes Voyage composables for the `VoyageBanner` | [`@features/settings`](../../features/settings/README.md) - uses the same Voyage composables for the Event Management card
