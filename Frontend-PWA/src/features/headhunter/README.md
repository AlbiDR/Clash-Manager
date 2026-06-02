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
- **Dual-Phase Sync**: Orchestrates **Manual Ingest** (manual sync trigger) and **Background Sync** (consistency check with the Supabase view).
- **Blitz Orchestration**: Configures the `useBlitzMode` engine for automated batch recruitment processing.
- **Console Integration**: Configures the `useConsoleController` with recruitment-specific sorting (Score, Trophies, Wins) and deep-linking.

### Recruitment Pipeline (useBlitzMode.ts)
Specialized engine for high-velocity recruitment processing.
- **Multi-Tier Deep Linking**: Manages a sequential queue for opening player profiles directly in the Clash Royale application.
- **Automated Blitz**: Implements a throttle-controlled execution loop to cycle through selected recruits with safety delays.
- **Environment Trust**: Proactively verifies the execution context before allowing hardware-level OS intents.

### Dismissal Engine (useHeadhunter.ts)
Handles the lifecycle of recruit rejection and realtime synchronization.
- **Zero Latency Pattern**: Implements optimistic UI updates. Recruits are hidden instantly from the user's view while the network request is processed in the background.
- **Realtime Synchronization**: Subscribes to the `drivers.recruit_blacklist` table to ensure dismissals performed on other devices are instantly reflected in the local UI.
- **Broadcast Sync**: Dispatches "dismiss" events via `BroadcastChannel` to ensure recruits hidden in one tab are instantly removed from all other open instances of the PWA.

### Resilience & Persistence (useRecruitBlacklist.ts)
Manages ephemeral "tombstones" for dismissed recruits to bridge the sync gap.
- **Ephemeral Tombstones**: Maintains a reactive in-memory `Set` of dismissed IDs to hide recruits during the ~200ms window between user action and Realtime confirmation.
- **SSOT Delegation**: Intentionally avoids `LocalStorage` persistence; tombstones reset on reload, delegating authoritative state to the Supabase Realtime subscription.

## Key Constraints & Why Not X?

- **Why Manual Ingest?**: While the **Headhunter Edge Function** discovers recruits around the clock, manual ingest triggers allow leadership to force a high-priority sync of the entire pool on demand.
- **Why Tombstones?**: To ensure "Visual Purity". If a user dismisses a recruit, they should never see it again, even if a subsequent background refresh returns a stale payload before the backend state has fully converged.
- **No Cross-Feature Imports**: Headhunter must remain context-agnostic. It knows about "Recruits" but nothing about "Clan Members". Evaluation against internal benchmarks is handled server-side in the `Scoring_Kernel`.

## Data Flow
1. **Ingestion**: `useRecruiter` triggers a sync.
2. **Scoring**: Candidates are scored server-side using the **Hybrid Benchmark** (PeS/PoS logic).
3. **Display**: Recruits are filtered against the local **Blacklist** (tombstones) and rendered via the `ConsoleLayout`.
4. **Action**: User dismisses a recruit -> Tombstone injected -> Supabase request dispatched -> Broadcast sent to other tabs.
