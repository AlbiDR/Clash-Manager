// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Laboratory (@features/laboratory)

> The upgrade planner: simulates the cheapest path to a target King Level and shows the exact order and cost.

**Layer 3 (@features)** | imports `@shared`, `@core` | never another feature.

## What it does

- Loads any player by tag (card levels fetched via the [`sync-player-cards`](../../../../Backend/supabase/functions/sync-player-cards/README.md) Edge Function, normalized to a 1-16 scale).
- Takes your real inventory: gold, gems, and wild cards per rarity.
- Runs one of two strategies: **Level Projection** (reach a target King Level, assuming resources can be farmed) or **Resource Efficiency** (best XP-per-gold using only what you own, with a heavy penalty on gem spending).
- Shows current vs projected King Level, total XP gained, and gold and gems spent.
- Lists the recommended upgrade order, step by step, rendered progressively so hundreds of steps stay smooth.

## Contents

| Path | Role |
| :--- | :--- |
| `views/LaboratoryView.vue` | The console view. |
| `components/` | The input and result cards: `TargetPicker`, `VaultCard`, `ParameterCard`, `SummaryCard`, `TrajectoryList`, `TrajectoryItem`, `LaboratorySkeleton`. |
| `composables/useLaboratory.ts` | Layout state, profile ingestion, and inventory merging. |
| `composables/useLaboratorySimulation.ts` | Runs the engine without blocking the UI and cancels stale runs. |
| `logic/` | The simulation engine (see below). |
| `stores/useLaboratoryStore.ts` | Pinia store; persists settings, the observed player, and inventory overrides to LocalStorage. |

## The engine (`logic/`)

A generator-based simulator that processes upgrades in ~10ms chunks to stay at 60fps, bounded by a hard safety limit of `SIMULATION_MAX_ITERATIONS` to prevent infinite loop execution. `SimulationEngine` drives the loop; `SimulationCore` evaluates and applies each upgrade; `ScoringStrategy` provides the interchangeable Level-Projection and Resource-Efficiency strategies; candidates are selected from a binary-heap `PriorityQueue` (O(log N)); `ProfileHydrator` validates input through a Valibot schema; `SimulationMappers` shapes the result for the UI.

## See also

- [Frontend README](../../../README.md) | [`@features`](../README.md)
- Backend: [`sync-player-cards`](../../../../Backend/supabase/functions/sync-player-cards/README.md) - the Edge Function that fetches and normalizes the player's card collection
- [`@core/api`](../../core/api/README.md) - `ProfileClient.ts` is the client that calls `sync-player-cards`; Laboratory uses it through that client
- Game math in [`@core/utils`](../../core/utils/README.md) - `game.ts`, `economy.ts`, and `PriorityQueue.ts` are the engine this feature runs on
