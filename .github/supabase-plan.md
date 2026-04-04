---
title: Supabase Binary Stack Migration Plan
status: Live
version: 1.0.0
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

## III. Data Arch: "The Substrate Tier" (Layer 0)
*Authoritative raw data storage. Unfiltered truth mapping from the Royale API.*

| Target Table | Source Endpoint | Role | Directory |
| :--- | :--- | :--- | :--- |
| `substrate.raw_clan_profile` | `GET /clans/{tag}` | Clan branding/validation. | `Backend/functions` |
| `substrate.raw_clan_members` | `GET /clans/{tag}/members` | The core 50-member array. | `Backend/functions` |
| `substrate.raw_clan_currentrace` | `GET /clans/{tag}/currentriverrace` | Live war/fame tracking. |
| `substrate.raw_clan_racelog` | `GET /clans/{tag}/riverracelog` | Historical analysis. |

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
- [x] GitHub: Configure `ROYALE_API_KEY`, `SUPABASE_PROJECT_ID`, and `SUPABASE_ACCESS_TOKEN`.
- [x] Workflow: Implement `deploy-supabase.yml` for automated secret-sync and deployment.

---

## VI. README Seed (State-of-The-Art Evidence)
*Data for the future README to demonstrate engineering mastery.*

### 1. Architectural Brilliance
- **No-Worker Paradigm**: 100% serverless. No server to maintain, no runtime to manage.
- **JSONB Shredding**: Near-zero latency transformation from raw API data to clean relational tables using native Postgres triggers.
- **Key-Farm Rotation**: Industrial-grade rate-limit mitigation across multiple API tokens.

### 2. Performance & Health
- **Binary Stack**: High-speed communication between GitHub and Supabase.
- **Unitary Isolation**: Zero noise between layers. A feature change at L3 cannot break an L1 Driver.

---

## VII. Secret & Environment Registry
*Authoritative list of variables required to sustain the Parallel Universe.*

| Constant | Scope | Role | Content |
| :--- | :--- | :--- | :--- |
| `ROYALE_API_KEY` | GitHub | The Key Farm. | Comma-separated list of 20 Royale API tokens. |
| `SUPABASE_ACCESS_TOKEN` | GitHub | The Bridge. | Profile-level token used by CLI for automated deployment. |
| `SUPABASE_PROJECT_ID` | GitHub | The Target. | `hucktamloykszinwbtuh` |
| `CLAN_TAG` | Supabase | The Hunt. | The target clan identifier (e.g., `#92U0CQ`). |

---

## VIII. State-of-the-Art README Seeds
*Structural metadata for the future README file.*

### 1. The Binary Stack
- **Architecture**: Clinical Medallion (Substrate -> Drivers -> Features).
- **Host**: 100% Supabase-Native.
- **Engine**: Deno (Edge Functions) + PostgreSQL (Trigger Logic).

### 2. High-Grade Features
- **Deterministic Shredding**: Automatic transformation of JSONB arrays into relational identity tables.
- **Zero-Latency Orchestration**: Database-internal scheduling via `pg_cron` eliminates external trigger overhead.
- **20-Key Rotation**: Industrial-grade API management to guarantee 100% uptime and high rate-limit tolerance.

---
> [!IMPORTANT]
> This document remains the **Single Source of Truth** for the `Clash-Manager` Supabase infrastructure.
