// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Headhunter Scanner Engine (@backend)

The **Discovery & Recruitment Kernel**. A highly concurrent Deno-native Edge Function responsible for scanning the Clash Royale ecosystem to identify, profile, and ingest high-potential recruits into the Clash Manager substrate.

---

## Purpose
The Headhunter Scanner (Layer 5 Control) orchestrates the clinical identification of "Ghost" candidates (non-clanned players) and active tournament participants. It acts as the primary discovery gate for the recruitment pipeline, ensuring that only players meeting strict statistical and competitive thresholds are ingested for administrative review.

## Architectural Context
- **Layer**: Layer 5 (Control) / Layer 4 (Orchestration)
- **Role**: Discovery Engine.
- **Import Boundaries**:
 - **Allowed**: Can import from `@shared` (protocols, schemas, types).
 - **Axiom**: Acts as a standalone orchestration service triggered by internal cron or manual L5 PWA requests.

## The Clinical 5-Stage Pipeline
The scanner operates as a sequential, atomic pipeline to maintain data integrity and prevent discovery overlaps.

### S0: Ghost Purge
**Objective**: substrate hygiene.
- Evicts any existing top-50 recruits who have joined a clan since the last scan.
- Ensures the active "Hot Zone" remains populated only by free agents.

### S1: Shadow Scout
**Objective**: opportunistic ingestion.
- Harvests leads from recent battle-log opponents of tracked players via the `get_shadow_discovery_targets` RPC (limited to 75 targets), which selects distinct recent opponents from `drivers.player_battles` (last 24h), excluding existing members, recruits, and blacklisted tags.
- Identifies "Shadow" candidates - players who have interacted with the clan but are not yet formally tracked.

### S2: Tournament Discovery
**Objective**: ecosystem expansion.
- Activates only when the request payload contains the sentinel `"AUTO"` (cron sends `{"tournaments":["AUTO"]}`); no tournament tags are taken from the payload.
- Pulls discovery keywords from the DB via the `get_active_discovery_anchors` RPC (falling back to a curated alphanumeric keyword set), then searches `/tournaments?name={keyword}` and harvests members.
- Does NOT apply a trophy filter; it filters only by clan status / exclusion set. Trophy gating is deferred to the S3 Profiler, which fetches the full ladder profile.

### S3: Profiler
**Objective**: deep-depth validation.
- Performs O(N) deep-profiling of all discovered candidates.
- Enforces strict Valibot validation boundaries and persists validated recruits to the `drivers.recruits` substrate.

### S4: Rescan
**Objective**: lifecycle maintenance.
- Refreshes telemetry for the existing "ACTIVE" pool of recruits.
- Automatically downgrades or evicts recruits who no longer meet the competitive criteria or have exceeded the staleness window.

---

## Infrastructure Dependencies
- **Key Farm (`ROYALE_API_KEYS`)**: Utilizes the concurrent key farm to bypass Supercell API rate limits during high-volume tournament scans.
- **Vault Sync**: Dynamically retrieves authoritative secrets from the Supabase Vault during boot to ensure runtime security.
- **Context Boundary (`get_headhunter_context`)**: Relies on a secured database RPC to retrieve dynamic exclusion sets (clanned players, blacklisted tags) and performance thresholds.
- **Safety Epoch Loop**: Implements the Safety Epoch Loop via `substrate.headhunter_epoch_state` to prevent redundant Top-50 leaderboard scans and ensure optimal discovery rotation.

## Operational Standards
- **Concurrency Control**: Implements batch processing with concurrency guards to balance ingestion speed against backend pressure.
- **Timeout Resilience**: Each stage is wrapped in a 10-minute deterministic timeout to prevent orphan Deno processes and budget exhaustion.
- **Audit Transparency**: Dispatches detailed audit logs and progress heartbeats to the `governance_report` view for realtime monitoring.
