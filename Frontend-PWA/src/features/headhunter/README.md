# Headhunter -- Recruitment Orchestrator

The **Scout Feed**. A specialized Feature (Layer 3) responsible for discovering, evaluating, and managing potential recruits. It bridges the gap between raw tournament data and clan recruitment decisions.

---

## Purpose
The Headhunter feature provides a real-time feed of candidates scanned from external tournaments. It allows recruiters to perform bulk evaluations, dismiss non-fits with zero latency, and receive notifications for "elite" potentials.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly siloed. No imports from `Laboratory` or `Roster`.
- **Dependencies**:
  - `@core/api/SupabaseClient`: Layer 1 interface for the Supabase Binary Stack.
  - `@core/services/useBadge`: External notification badges.
  - `@core/services/useBroadcastChannel`: Cross-tab state synchronization.
  - `@core/services/useConsoleController`: Standardized list orchestration (Search/Sort/Selection).

## Logic Subsystems

### Recruitment Orchestrator (useRecruiter.ts)
The primary behavioral engine for the Headhunter interface.
- **Data Orchestration**: Synchronizes recruitment telemetry from the Layer 1 `useClashDataStore`, which handles the authoritative fetch from Supabase feature views.
- **Active Window Management**: Implements a 50-recruit "Active Window" (top candidates) while maintaining an internal 100-item pre-compiled pool for seamless replacement during bulk dismissals.
- **Console Integration**: Configures the `useConsoleController` with recruitment-specific sorting (Score, Trophies, Wins) and deep-linking.

### Dismissal Engine (useHeadhunter.ts)
Handles the lifecycle of recruit rejection.
- **Zero Latency Pattern**: Implements optimistic UI updates. Recruits are hidden instantly from the user's view while the network request is processed in the background via Supabase RPCs.
- **Undo Logic**: Provides a 5-second grace period via Toast notifications to reverse dismissals before they are finalized in the backend.
- **Broadcast Sync**: Dispatches "dismiss" events via `BroadcastChannel` to ensure recruits hidden in one tab are instantly removed from all other open instances of the PWA.

### Resilience & Persistence (useRecruitBlacklist.ts)
Manages the "tombstone" state for dismissed recruits.
- **Local Tombstones**: IDs of dismissed recruits are stored in `LocalStorage` to ensure they remain hidden even if the backend sync is delayed or if the page is refreshed.
- **Garbage Collection (Pruning)**: Automatically clears local tombstones once the server payload confirms the recruit has been removed from the official scout feed, preventing storage bloat.

## Key Constraints & Why Not X?

- **Why Edge-Native Discovery?**: Recruitment scanning requires high concurrency and low latency. By utilizing **Supabase Edge Functions** (Deno) instead of legacy polling, the system can discover and profile elite recruits from global tournaments 24/7 with zero overhead on the client.
- **Why Tombstones?**: To ensure "Visual Purity". If a user dismisses a recruit, they should never see it again, even if a subsequent background refresh returns a stale payload from a database view that hasn't finished its write cycle yet.
- **No Cross-Feature Imports**: Headhunter must remain context-agnostic. It knows about "Recruits" but nothing about "Clan Members". Evaluation against internal benchmarks is handled server-side in the Supabase substrate.

## Data Flow
1. **Discovery**: Supabase Edge Functions scan global tournaments and ingest candidates into the `substrate`.
2. **Scoring**: Candidates are scored and ranked within the database using the **Hybrid Benchmark** (PoS/RPoS logic).
3. **Ingestion**: `useRecruiter` observes the `useClashDataStore`, which fetches the top 100 recruits from the `features.headhunter_view`.
4. **Display**: Recruits are filtered against the local **Blacklist** (tombstones) and rendered via the `ConsoleLayout`.
5. **Action**: User dismisses a recruit -> Tombstone injected -> Supabase RPC dispatched -> Broadcast sent to other tabs.
