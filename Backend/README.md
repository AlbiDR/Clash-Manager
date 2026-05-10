// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager — Backend (Supabase Binary Stack)

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
| `supabase/functions/` | **Edge Layer** | Deno-native ingestion gates (`ingest-royale-data`) and discovery engines (`headhunter-scanner`). |
| `supabase/migrations/` | **Substrate Layer** | Relational DNA, triggers, and clinical schema definitions. |
| `supabase/config.toml` | **Orchestration** | Supabase project configuration (Project ID: `hucktamloykszinwbtuh`). |

---

## III. CleanStack Layer Mapping
The backend architecture is mapped strictly to the CleanStack layers to ensure monorepo-wide structural integrity.

| Layer | Artifact | Role |
| :--- | :--- | :--- |
| **L0 Substrate** | `substrate.*` schema | Raw ingestion tables, maintenance logic, and binary heartbeats. |
| **L1 Core** | `_shared/muscle.ts` | **Native Muscle**: Key Farm rotation and high-concurrency batch engine. |
| **L2 Drivers** | `drivers.*` schema | **Authoritative Models**: `members`, `war_history`, `player_battles`. |
| **L3 Features** | `features.*` schema | **API-Ready Views**: `roster_view`, `headhunter_view`, `war_performance_analytics_view`. |
| **L4 App** | `pipeline.ts` / `scanner.ts` | **Orchestrators**: Coordinates multi-stage sync and discovery pipelines. |
| **L5 Control** | `index.ts` / `protocol.ts` | **Clinical Protocol**: Enforces Auth, Validation (Valibot), and Telemetry. |

---

## IV. Database Substrate (Schema Strategy)
The project employs a strictly segmented schema strategy to maintain domain isolation:

### 1. `substrate` (L0 — Raw Data)
- **Role**: Ingestion gatekeeper.
- **Logic**: Receives volatile raw state from Edge Functions. No processing logic.
- **Privacy**: Service-role internal only; strictly isolated from public access.
- **Maintenance**: `substrate.execute_nightly_maintenance` orchestrates daily automated culling of volatile data while Hard-Exempting career history.

### 2. `drivers` (L2 — Domain Storage)
- **Role**: Persistence-ignorant domain objects and historical archives.
- **Core Models**:
    - `drivers.members`: The single authoritative source for active player telemetry.
    - `drivers.war_history`: **Infinite Career Ledger** tracking every week since first sync.
    - `drivers.player_battles`: **100-Sample Rolling Window** per resident for deep performance scoring.
    - `drivers.war_activity`: Daily deck usage and participation logs.

### 3. `features` (L3 — Business Presentation)
- **Role**: Materialized views and API-ready logic for frontend consumption.
- **Interfaces**:
    - `features.roster_view`: Deeply sorted roster with dynamic tenure labeling and RPeS/PeS metrics.
    - `features.headhunter_view`: Evaluated recruitment candidates with PoS/RPoS clinical tiering.
    - `features.war_performance_analytics_view`: Historical clan performance trends and contributor analytics.
    - `features.war_loyalty_view`: **Career Fame Averaging** (Infinite lookback for PeS calculation).

---

## V. The Clinical Pipelines

### 1. Ingestion Gate (`ingest-royale-data`)
The authoritative telemetry sync for the target clan. Executes a **Penta-Stage Pipe**:
- **S2-S5 (Clan Sync)**: Synchronizes Profile, Members, Current River Race, and War Log.
- **S6 (Deep Depth)**: High-resolution profiling of member battle logs to calculate competitive inertia.

### 2. Scout Gate (`headhunter-scanner`)
The global discovery engine for recruitment. Executes a **4-Stage Discovery Loop**:
- **S1 (Shadow Scout)**: Identifies leads from internal battle logs and existing recruits.
- **S2 (Tournament Discovery)**: High-concurrency scanning of global tournament brackets.
- **S3 (Profiling)**: Deep profiling and Valibot-enforced ingestion of high-potential candidates.
- **S4 (Rescan)**: Automated maintenance of the `ACTIVE` recruit pool, evicting players who have joined clans.

---

## VI. Technical Substrate Details

### Clinical Protocol (L5 Control)
Every Edge Function execution is governed by the **Clinical Protocol** (`_shared/protocol.ts`), enforcing a 6-stage lifecycle:
1. **CORS Preflight**: Standardized cross-origin security.
2. **Authorization Guard**: Strict Zero-Trust validation of the Internal Bearer Token.
3. **Payload Validation**: POST-only enforcement with mandatory **Valibot** schema checks.
4. **Governance Boot**: Initialization of microscopic telemetry in `substrate.governance_telemetry`.
5. **Logic Execution**: Handler execution with injected `logAudit` and `heartbeat` hooks.
6. **Governance Closure**: Finalization of telemetry, duration tracking, and data perfection auditing.

### Native Muscle (L1 Core)
High-performance infrastructure (`_shared/muscle.ts`) providing:
- **Key Farm**: Rotation across 20+ Supercell API keys to maximize rate limits.
- **Token Rotation**: Automatic failover and exponential backoff for throttled keys.
- **Concurrency Control**: Uses `p-limit` for high-throughput batch operations without resource exhaustion.

---

## VII. Development & Deployment

### Deployment Sequence
The `deploy-supabase.yml` workflow automates the following sequence:
1. **Context Initialization**: Changes within `Backend/**` trigger the pipeline.
2. **Secret Sync**: `CLAN_TAG`, `PLAYER_TAG`, and `ROYALE_API_KEYS` are injected.
3. **Database DNA Sync**: SQL migrations are pushed to the Supabase project.
4. **Edge Layer Deployment**: Functions are bundled and deployed with `--no-verify-jwt` (Auth handled by Protocol).

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
```

---

## VIII. Current State — Roadmap (v1.8.0)
- [x] **Phase 1-6**: Complete (Substrate, Domain Schema, Binary Heartbeat, Hardening, Deep Ingestion, Janitor).
- [x] **Phase 7**: Full PWA integration (migrating features to `features.*` views).
- [x] **Phase 8**: Headhunter Scanner 2.0 (Shadow Scouting & Tournament Discovery).

---

> [!NOTE]
> This README is a live document reflecting the evolving state of the Clash-Manager backend.
> Compiled: 2026-05-10 by Jules
