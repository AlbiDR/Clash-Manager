---
title: Supabase Binary Stack Migration Plan
status: Live
version: 1.0.1
license: GPL-3.0-only
copyright: Copyright (C) 2026 AlbiDR
---

# Supabase Migration Plan — Binary Unitary Architecture (CleanStack)

This document is the **Single Source of Truth** for the transition of the `Clash-Manager` stack from Google Apps Script (GAS) to a **Supabase**-native environment. It follows the **CleanStack Authoritative Design Reference (ADR)** by strictly mapping database domains to project layers.

---

## I. The Vision: "Clash Manager — Redux"
The project is moving from a distributed 3-platform model to a streamlined **Binary Stack**.
- **Structural Coherence**: The database organization mirrors the project layers (L0-L5) for perfect technical purity.
- **Edge-Native Ingestion**: Supabase Edge Functions (Deno) replace the legacy Node.js worker.
- **Binary Bridge**: GitHub Actions serve as the automated pipeline for secret synchronization and deployment.
- **20-Key Farm**: A high-concurrency rotation logic that leverages 20 Royale API keys for maximum throughput.

---

## II. Project Layers (Database Substrate)
- **Cloud Provider**: Supabase (Postgres 17.6).
- **Project Ref**: `hucktamloykszinwbtuh` (Region: `eu-west-1`).
- **Orchestration**:
    - **PWA (Frontend)**: Reads from `features.` views via `anon` key + Realtime.
    - **Edge Functions (Backend)**: Ingests raw state, dumps into `substrate.` via `service_role` key.
    - **GitHub (Pipeline)**: Automated deployment of functions and secret sync via `deploy-supabase.yml` targeting the `Backend/` root.
    - **pg_cron (Database)**: Triggers the heartbeat for 30-minute ingestion cycles.

---

## III. Repository Structure (Authoritative Root: /Backend)
To align with the **Supabase CLI** hardcoded expectations, the project follows the standard directory mapping:

| Target Component | Source Path | Role |
| :--- | :--- | :--- |
| **Edge Functions** | `Backend/supabase/functions/` | Deno-native business logic (The Hunter). |
| **SQL Migrations** | `Backend/supabase/migrations/` | Relational DNA and trigger-shredders (The DNA). |
| **Project Config** | `Backend/supabase/config.toml` | Identity mapping and schema configuration. |

---

## IV. The Clinical Ingestion Strategy

### 1. Ingestion Gate (substrate. Layer)
- **The Hunter**: A single Edge Function (`ingest-royale-data`) fetches all endpoints.
- **Rotation Factory**: The function rotates between 20 unique Royale API keys stored in GitHub Secrets.
- **Operation**: Secret-backed Edge Functions perform "Fetch and Dump" into `substrate.` tables.

### 2. The Collection Shredder (drivers. Layer)
- **Role**: Automatically shreds `substrate.raw_*` payloads into relational molecules.
- **Logic**: A PostgreSQL `FOR` loop iterates through JSON arrays and "fans-out" into `drivers.members` and `drivers.member_snapshots`.
- **Value**: Discards noise; extracts **Assets** (Fame, Trophies, Activity).

---

## V. Strategic Migration Timeline

### Phase 1: Substrate & Isolation (Verified ✅)
- [x] Configure Supabase Project & Extensions (`pg_cron`, `pg_net`, `moddatetime`).
- [x] Create ADR-compliant schemas: `substrate`, `drivers`, `features`.
- [x] Perform clinical purge of legacy `public` and `bronze` schemas.

### Phase 2: Domain Schema (Verified ✅)
- [x] SQL: Create `substrate.raw_clan_profile` and `drivers.clans`.
- [x] SQL: Create `substrate.raw_clan_members`, `drivers.members`, and `drivers.member_snapshots`.
- [x] SQL: Implement **Collection Shredder** (Fan-out Trigger) for roster ingestion (L0 -> L2).

### Phase 3: The Binary Heartbeat (Verified ✅)
- [x] Edge Function: Implement `ingest-royale-data` with 20-Key Rotation logic.
- [x] pg_cron: Configure the 30-minute heartbeat (Implemented via SQL migration).

### Phase 4: CI/CD Pipeline (Verified ✅)
- [x] GitHub: Configure `ROYALE_API_KEYS`, `SUPABASE_PROJECT_ID`, and `SUPABASE_ACCESS_TOKEN`.
- [x] Workflow: Implement `deploy-supabase.yml` for automated secret-sync, migration push, and deployment.

---

## VI. Secret & Environment Registry
*Authoritative list of variables required to sustain the Parallel Universe.*

| Constant | Scope | Role | Content |
| :--- | :--- | :--- | :--- |
| `ROYALE_API_KEYS` | GitHub | The Key Farm. | Comma-separated list of 20 Royale API tokens. |
| `SUPABASE_ACCESS_TOKEN` | GitHub | The Bridge. | Profile-level token used by CLI for automated deployment. |
| `SUPABASE_PROJECT_ID` | GitHub | The Target. | `hucktamloykszinwbtuh` |
| `SUPABASE_DB_PASSWORD` | GitHub | The Key (Optional). | Mandatory for automated DNA sync (migrations); otherwise skips. |
| `CLAN_TAG` | Supabase | The Hunt. | The target clan identifier (e.g., `#92U0CQ`). |

---

## VII. State-of-the-Art README Seeds
*Structural metadata for the future README file.*

### 1. The Binary Stack
- **Architecture**: Clinical Medallion (Substrate -> Drivers -> Features).
- **Host**: 100% Supabase-Native.
- **Engine**: Deno (Edge Functions) + PostgreSQL (Trigger Logic).

### 2. High-Grade Features
- **Deterministic Shredding**: Automatic transformation of JSONB arrays into relational identity tables.
- **Zero-Latency Orchestration**: Database-internal scheduling via `pg_cron` eliminates external trigger overhead.
- **20-Key Rotation**: Industrial-grade rate-limit mitigation across multiple API tokens.

---
> [!IMPORTANT]
> This document remains the **Single Source of Truth** for the `Clash-Manager` Supabase infrastructure.
