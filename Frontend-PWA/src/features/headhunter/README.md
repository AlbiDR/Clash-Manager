# Headhunter -- Recruitment Orchestrator

The **Scout Feed**. A specialized Feature (Layer 3) responsible for discovering, evaluating, and managing potential recruits. It bridges the gap between raw tournament data and clan recruitment decisions.

---

## Purpose
The Headhunter feature provides a real-time feed of candidates scanned from external tournaments. It allows recruiters to perform bulk evaluations, dismiss non-fits with zero latency, and receive notifications for "elite" potentials.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly siloed. No imports from `Laboratory` or `Roster`.
- **Dependencies**:
  - `@core/api/SupabaseClient`: Backend communication (Dismissal/Scouting).
  - `@core/services/useBadge`: External notification badges.
  - `@core/services/useBroadcastChannel`: Cross-tab state synchronization.
  - `@core/services/useConsoleController`: Standardized list orchestration (Search/Sort/Selection).

## Logic Subsystems

### Recruitment Orchestrator (useRecruiter.ts)
The primary behavioral engine for the Headhunter interface.
- **Dual-Phase Sync**: Orchestrates **Manual Scouting** (GitHub workflow trigger for discovery) and **Background Sync** (consistency check with the Supabase view).
- **Hybrid Merge**: Injecting worker results directly into local reactive state to reduce perceived latency.
- **Console Integration**: Configures the `useConsoleController` with recruitment-specific sorting (Score, Trophies, Wins) and deep-linking.

### Dismissal Engine (useHeadhunter.ts)
Handles the lifecycle of recruit rejection.
- **Zero Latency Pattern**: Implements optimistic UI updates. Recruits are hidden instantly from the user's view while the network request is processed in the background.
- **Undo Logic**: Provides a 5-second grace period via Toast notifications to reverse dismissals before they are finalized.
- **Broadcast Sync**: Dispatches "dismiss" events via `BroadcastChannel` to ensure recruits hidden in one tab are instantly removed from all other open instances of the PWA.

### Resilience & Persistence (useRecruitBlacklist.ts)
Manages the "tombstone" state for dismissed recruits.
- **Local Tombstones**: IDs of dismissed recruits are stored in `LocalStorage` to ensure they remain hidden even if the backend sync is delayed or if the page is refreshed.
- **Garbage Collection (Pruning)**: Automatically clears local tombstones once the server payload confirms the recruit has been removed from the official scout feed, preventing storage bloat.

## Key Constraints & Why Not X?

- **Why Manual Scouting?**: Controlled scouting runs via GitHub Actions allow for audited, high-fidelity metrics extraction and governance logging.
- **Why Tombstones?**: To ensure "Visual Purity". If a user dismisses a recruit, they should never see it again, even if a subsequent background refresh returns a stale payload before the backend state has fully converged.
- **No Cross-Feature Imports**: Headhunter must remain context-agnostic. It knows about "Recruits" but nothing about "Clan Members". Evaluation against internal benchmarks is handled server-side in the `Scoring_Kernel`.

## Data Flow
1. **Ingestion**: `useRecruiter` triggers a sync.
2. **Scoring**: Candidates are scored server-side using the **Hybrid Benchmark** (PeS/PoS logic).
3. **Display**: Recruits are filtered against the local **Blacklist** (tombstones) and rendered via the `ConsoleLayout`.
4. **Action**: User dismisses a recruit -> Tombstone injected -> Supabase request dispatched -> Broadcast sent to other tabs.
