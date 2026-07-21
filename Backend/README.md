// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager - Backend (Supabase Binary Stack)

This directory serves as the **Single Source of Truth** for the `Clash-Manager` backend infrastructure, leveraging a **Binary Unitary Architecture** to consolidate ingestion and scoring logic into a clinical, high-performance substrate.

---

## I. Architectural Vision
The backend has transitioned from a distributed model (GAS/Node.js) into a streamlined **Supabase-native** environment.
- **Structural Coherence**: Database organization mirrors the **CleanStack ADR** (L0-L5) for perfect technical purity.
- **Edge-Native Ingestion**: Deno-powered Edge Functions (Supabase Functions) replace legacy workers.
- **Realtime Orchestration**: Native Postgres broadcasting for instant PWA dashboard updates.

---

## II. Directory Structure
| Path | Role | Description |
| :--- | :--- | :--- |
| `supabase/functions/` | **Edge Layer** | Deno-native business logic and ingestion gates. |
| `supabase/migrations/` | **Substrate Layer** | Relational DNA, triggers, and clinical schema definitions. |
| `supabase/config.toml` | **Orchestration** | Supabase project configuration and identity mapping. |

---

## III. Database Substrate (CleanStack Mapping)
The project employs a strictly segmented schema strategy to maintain domain isolation:

### 1. `substrate` (L0 - Raw Data)
- **Role**: Ingestion gatekeeper and orchestration state.
- **Logic**: Receives volatile raw state from Edge Functions. No processing logic.
- **Core Models**:
 - `substrate.headhunter_epoch_state`: Singleton state table for managing the Headhunter Top-50 Safety Epoch Loop.
- **Privacy**: Service-role internal only; strictly isolated from public access.

### 2. `drivers` (L2 - Domain Storage)
- **Role**: Persistence-ignorant domain objects and historical archives.
- **Core Models**:
 - `drivers.members`: The single authoritative source for active player telemetry.
 - `drivers.war_history`: **Infinite Career Ledger** tracking every week since first sync (Unlimited History).
 - `drivers.player_battles`: **100-Sample Rolling Window** per resident for deep performance scoring. Includes server-side `riverRaceDuel` and crown metrics derived at ingestion.
 - `drivers.war_activity`: Daily deck usage and participation logs.

### 3. `features` (L3 - Business Presentation)
- **Role**: Materialized views and API-ready logic for frontend consumption.
- **Interfaces**:
 - `features.roster_view`: Deeply sorted roster with dynamic tenure labeling.
 - `features.voyage_summary`: SSOT for active Clan Voyage status and progress.
 - `features.voyage_contributions`: High-resolution ledger of individual voyage performance.
 - `features.war_activity_view`: Realtime clan activity and presence tracking.
 - `features.governance_report`: Consolidated system audit trail and pipeline health logs.

---

## IV. The Clinical Ingestion Pipeline
Ingestion is performed via a **Hexa-Engine Edge Architecture**, supported by automated database shredders and the authoritative maintenance orchestrator.

1. **Gatekeeper (`ingest-royale-data`)**: The primary Deno Edge Function responsible for the clinical synchronization protocol. Features strict Valibot-enforced structural validation and a clinical Hexa-Stage synchronization protocol. While implemented as a unified pipeline for efficiency, it conceptually covers 6 stages:
 - **S1 (Discovery)**: Harvests new recruits from high-fidelity tournament anchors.
 - **S2 (Clan Profile)**: Atomic synchronization of clan-level telemetry (trophies, location, requirements).
 - **S3 (Roster Sync)**: Full-pool synchronization of active member telemetry and joins/leaves.
 - **S4 (River Race)**: Extraction of current standings and task completion. Performs server-side `riverRaceDuel` and crown derivation for the current week.
 - **S5 (War History)**: Infinite Career Ledger synchronization (most recent 12 war weeks).
 - **S6 (Deep Depth)**: Extracts the rolling battle-log window (capped by the Royale API at ~25 battles) for every resident. Implements server-side crown derivation for historical battle logs.
2. **The Headhunter (`headhunter-scanner`)**: A highly concurrent discovery engine featuring a 5-stage pipeline (S0: Ghost Purge, S1: Shadow Scout, S2: Tournament Discovery, S3: Profiler, S4: Rescan). Relies on the Key Farm to handle concurrent batching without throttling. Implements the **Safety Epoch Loop** via `substrate.headhunter_epoch_state` to prevent redundant Top-50 leaderboard scans.
3. **Royale API Proxy (`query-royale-api`)**: A secure L5 Control Layer proxy for transient leaderboard harvesting. Features a dynamic country rotation strategy for International clans to ensure diverse recruit discovery without polluting the database substrate.
4. **Battlelog Proxy (`fetch-player-battlelog`)**: A specialized L5 Control Layer proxy for fetching live player battle logs. Features a parallel fan-out strategy across the Key Farm to maximize data freshness across distributed proxy nodes.
5. **User Proxy (`sync-player-cards`)**: L5 Control Layer responsible for authenticated player profile and card synchronization. Utilizes inferred Valibot schemas for rarity-relative normalization and backend persistence, enforcing a zero-trust boundary for client-supplied snapshots.
6. **Voyage Orchestrator (`initialize_voyage`)**: SQL-based L5 Control Layer (RPC) responsible for activating and configuring Clan Voyage events.
7. **Shredder (`drivers` layer)**: Automated SQL triggers and functions in the database substrate that decompose raw JSON payloads into relational telemetry.
8. **Nightly Orchestrator (`execute_nightly_maintenance`)**: Authoritative SQL system janitor (pg_cron) responsible for pruning volatile state and maintaining substrate health.

---

## V. Development & Deployment
The backend lifecycle is governed by the **Supabase CLI** and **GitHub Actions**.

### Deployment Sequence
The `deploy-supabase.yml` workflow automates the following sequence:
1. **Context Initialization**: Changes within `Backend/**` trigger the pipeline.
2. **Secret Sync**:
 - `CLAN_TAG` and `PLAYER_TAG` repository variables are synced.
 - `ROYALE_API_KEYS` (The Key Farm) is injected into the Supabase environment.
3. **Database DNA Sync**: SQL migrations are pushed if `SUPABASE_DB_PASSWORD` is present.
4. **Edge Layer Deployment**: The workflow deploys all five Edge Functions (`ingest-royale-data`, `headhunter-scanner`, `sync-player-cards`, `query-royale-api`, and `fetch-player-battlelog`) ensuring a synchronized binary stack.

### Common CLI Operations
```bash
# Start local development stack
supabase start

# Create a new migration file
supabase migration new <name>

# Local function testing
supabase functions serve ingest-royale-data --no-verify-jwt

# Deploy Edge Functions
supabase functions deploy ingest-royale-data --no-verify-jwt
supabase functions deploy headhunter-scanner --no-verify-jwt
supabase functions deploy sync-player-cards --no-verify-jwt
supabase functions deploy query-royale-api --no-verify-jwt
supabase functions deploy fetch-player-battlelog --no-verify-jwt
```

---

## VI. Environment & Secret Registry
| Constant | Source | Scope | Role |
| :--- | :--- | :--- | :--- |
| `ROYALE_API_KEYS` | GitHub Secret | Edge Function | The Key Farm (pool of Supercell JWTs, comma-separated/JSON; ~20 per the deploy workflow). |
| `CLAN_TAG` | GitHub Variable | Edge/Pipeline | The Targeted Clan Identifier (SSOT). |
| `PLAYER_TAG` | GitHub Variable | Edge/Pipeline | The Targeted Player Identifier (SSOT). |

### Pipeline Secrets (Infrastructure)
| Secret | Role |
| :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | Authoritative CLI authentication. |
| `SUPABASE_DB_PASSWORD` | Database DNA (Migration) synchronization password. |
| `INTERNAL_BEARER_TOKEN` | Shared internal bearer token for service-to-service Edge Function auth (also synced to the Vault). |

> [!NOTE]
> `SUPABASE_PROJECT_ID` is a GitHub repository **Variable** (`vars.SUPABASE_PROJECT_ID`, value `hucktamloykszinwbtuh`) - the Project Reference ID - not a Secret.

---

## VII. Operational Security (Clinical Protocol)
- **RLS Lockdown**: Deny-by-default on all tables. Only specifically authorized `view` operations are permitted for the `anon` role.
- **Zero-Trust Boundary**: High-fidelity validation of all inbound payloads at the Ingestion Gate level. Enforces strict Valibot schemas (`TelemetrySchema`, `KeyPoolSchema`, `VaultSecretSchema`) centralized in `_shared/schemas.ts`.
- **Quota Guarding**: Proactive management of free-tier storage (500MB) via the automated janitor cycle.

---

## VIII. Current State - Roadmap (v14.33.9)
- [x] **Phase 1-7**: Complete (Substrate, Domain Schema, Binary Heartbeat, Hardening, Deep Ingestion, Janitor, Full PWA integration).
