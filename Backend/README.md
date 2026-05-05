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
| `supabase/config.toml` | **Orchestration** | Supabase project configuration and identity mapping. |

---

## III. Database Substrate (CleanStack Mapping)
The project employs a strictly segmented schema strategy to maintain domain isolation:

### 1. `substrate` (L0 — Raw Data)
- **Role**: Ingestion gatekeeper.
- **Logic**: Receives volatile raw state from Edge Functions. No processing logic.
- **Privacy**: Service-role internal only; strictly isolated from public access.

### 2. `drivers` (L2 — Domain Storage)
- **Role**: Persistence-ignorant domain objects and historical archives.
- **Core Models**:
    - `drivers.members`: The single authoritative source for active player telemetry.
    - `drivers.war_history`: **Infinite Career Ledger** tracking every week since first sync (Unlimited History).
    - `drivers.player_battles`: **100-Sample Rolling Window** per resident for deep performance scoring.
    - `drivers.war_activity`: Daily deck usage and participation logs.

### 3. `features` (L3 — Business Presentation)
- **Role**: Materialized views and API-ready logic for frontend consumption.
- **Interfaces**:
    - `features.roster_view`: Deeply sorted roster with dynamic tenure labeling.
    - `features.war_activity_view`: Realtime participation tracking.
    - `features.war_loyalty_view`: **Career Fame Averaging** (Infinite lookback for PeS calculation).
    - `features.headhunter_view`: Evaluated recruitment candidates with clinical tiering.
    - `features.war_performance_analytics_view`: Historical clan performance trends and contributor analytics.

---

## IV. The Clinical Ingestion and Discovery Pipeline
The backend orchestrates a dual-path pipeline for internal telemetry and external discovery.

1. **Ingestion Gate (`ingest-royale-data`)**: A Deno Edge Function utilizing a Penta-Stage Pipe (Profile, Members, War Activity, History, Battles) with Round-Robin token rotation.
2. **Scout Gate (`headhunter-scanner`)**: A high-concurrency discovery engine that scans global tournaments to identify and profile elite recruits.
3. **Shredder (`drivers` layer)**: Automated SQL triggers and functions decompose raw JSON payloads into relational telemetry.
4. **Janitor (`substrate.execute_nightly_maintenance`)**: Daily automated culling of volatile data while Hard-Exempting career history.

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
4. **Edge Layer Deployment**: `ingest-royale-data` is bundled and deployed.

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

## VI. Environment & Secret Registry
| Constant | Source | Scope | Role |
| :--- | :--- | :--- | :--- |
| `ROYALE_API_KEYS` | GitHub Secret | Edge Function | The Key Farm (20+ Supercell JWTs). |
| `CLAN_TAG` | GitHub Variable | Edge/Pipeline | The Targeted Clan Identifier (SSOT). |
| `PLAYER_TAG` | GitHub Variable | Edge/Pipeline | The Targeted Player Identifier (SSOT). |

### Pipeline Secrets (Infrastructure)
| Secret | Role |
| :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | Authoritative CLI authentication. |
| `SUPABASE_PROJECT_ID` | Project Reference ID (hucktamloykszinwbtuh). |
| `SUPABASE_DB_PASSWORD` | Database DNA (Migration) synchronization password. |

---

## VII. Operational Security (Clinical Protocol)
- **RLS Lockdown**: Deny-by-default on all tables. Only specifically authorized `view` operations are permitted for the `anon` role.
- **Zero-Trust Boundary**: High-fidelity validation of all inbound payloads at the Ingestion Gate level.
- **Quota Guarding**: Proactive management of free-tier storage (500MB) via the automated janitor cycle.

---

## VIII. Current State — Roadmap (v1.8.0)
- [x] **Phase 1-6**: Complete (Substrate, Domain Schema, Binary Heartbeat, Hardening, Deep Ingestion, Janitor).
- [x] **Phase 7**: Full PWA integration (migrating features to `features.*` views).

---

> [!NOTE]
> This README is a live document reflecting the evolving state of the Clash-Manager backend.
> Compiled: 2026-04-05 by Antigravity
