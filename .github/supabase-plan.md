---
title: Supabase Binary Stack Migration Plan
status: Live
version: 1.8.0
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
- **Career Engine**: A high-fidelity telemetry model tracking player progress (Gold, Cards, Wins) across daily snapshots.

---

## II. Project Layers (Database Substrate)
- **Cloud Provider**: Supabase (Postgres 17.6).
- **Project Ref**: `hucktamloykszinwbtuh` (Region: `eu-central-1`).
- **Orchestration**:
    - **PWA (Frontend)**: Reads from `features.` views via `anon` key + Realtime.
    - **Edge Functions (Backend)**: Ingests raw state, dumps into `substrate.` via `service_role` key.
    - **GitHub (Pipeline)**: Automated deployment and secret sync via `deploy-supabase.yml`.
    - **pg_cron (Database)**: Triggers the heartbeat for 15-minute ingestion cycles.

---

## III. Repository Structure (Authoritative Root: /Backend)
| Target Component | Source Path | Role |
| :--- | :--- | :--- |
| **Edge Functions** | `Backend/supabase/functions/` | Deno-native business logic. |
| **SQL Migrations** | `Backend/supabase/migrations/` | Relational DNA and triggers. |
| **Project Config** | `Backend/supabase/config.toml` | Identity mapping and schema configuration. |

---

## IV. The Clinical Ingestion Strategy (v1.8.0)

### 1. Ingestion Gate (substrate. Layer)
- **The Hunter**: A single Edge Function (`ingest-royale-data`) fetches all endpoints.
- **Proxy Protocol**: Uses `proxy.royaleapi.dev` to bypass IP-whitelisting constraints.
- **Quad-Stage Pipe**: Sequentially fetches **Clan Profile**, **Members**, **War Activity**, and **War Log**. (GAS Parity).

### 2. The Collection Shredder (drivers. Layer)
- **Single Source of Truth**: `drivers.members` accumulates every daily heartbeat (L2 Archive/Database).
- **War History**: `drivers.war_history` tracks **52 weeks** of historical fame (Career Performance).
- **War Activity**: `drivers.war_activity` tracks daily deck usage and participation status.

### 3. Feature Presentation (features. Layer) — Minimalist UI
- **Roster View**: `features.roster_view` (Custom sorting + Dynamic Labeling: `5m`, `2h`, `3d`).
- **War Analytics**: `features.war_activity_view` (Whos missing battles?).
- **War Loyalty**: `features.war_loyalty_view` (Historical fame averaging).

---

## V. Strategic Migration Timeline

### Phase 1: Substrate & Isolation (Verified ✅)
- [x] ADR-compliant schemas created: `substrate`, `drivers`, `features`.

### Phase 2: Domain Schema & Telemetry (Verified ✅)
- [x] SQL: Consolidated L2 drivers into a Single Source of Truth (`drivers.members`).
- [x] SQL: Established deep telemetry (Best Trophies, War Wins, Progress Stats).
- [x] SQL: Implemented Automated Tenure logic (`joined_at` fact + dynamic view).

### Phase 3: The Binary Heartbeat (Verified ✅)
- [x] Edge Function: Implemented with **RoyaleAPI Proxy** and **True Round-Robin** rotation.
- [x] pg_cron: Configured 15-minute heartbeat via migrations.

### Phase 4: Schema Hardening & Security (Verified ✅)
- [x] SQL: Clinical Documentation applied to all tables/columns.
- [x] SQL: RLS Lockdown (Deny-by-default).
- [x] SQL: Realtime Activation for live PWA dashboard broadcasts.

### Phase 5: Deep Ingestion & Historical War (Verified ✅)
- [x] Edge Function: Upgraded to Quad-Stage (Profile, Members, War Activity, War Log).
- [x] SQL: Implemented 52-week Historical Archive (`drivers.war_history`).

### Phase 6: Storage Maintenance & Janitor (Verified ✅)
- [x] SQL: Unified `maintenance_janitor()` to prune obsolete L0/L2 data.
- [x] SQL: Registered Weekly Cron for 500MB Free-Tier safety.

### Phase 7: PWA Dashboard Integration (PENDING) [NEXT]
- [ ] PWA: Migrate Roster Feature to source from `features.roster_view`.
- [ ] PWA: Implement War Participation dashboard from `features.war_activity_view`.

---

## VI. Secret & Environment Registry
| Constant | Scope | Role | Content |
| :--- | :--- | :--- | :--- |
| `ROYALE_API_KEYS` | GitHub Secret | The Key Farm. | 20 Supercell JWTs (Sanitized). |
| `CLAN_TAG` | GitHub Variable | The Hunt. | Targeted Clan Tag (SSOT). |

---

> [!IMPORTANT]
> This document remains the **Single Source of Truth** for the `Clash-Manager` Supabase infrastructure.
> ↴ *Last Updated: 2026-04-05 by Antigravity*
