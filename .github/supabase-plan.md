---
title: Supabase Binary Stack Migration Plan
status: Live
version: 14.0.0
license: GPL-3.0-only
copyright: Copyright (C) 2026 AlbiDR
---

# Supabase Migration Plan - Binary Unitary Architecture (CleanStack)

This document is the **Single Source of Truth** for the transition of the `Clash-Manager` stack from Google Apps Script (GAS) to a **Supabase**-native environment. It follows the **CleanStack Authoritative Design Reference (ADR)** by strictly mapping database domains to project layers.

---

## I. The Vision: "Clash Manager - Redux"
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

## IV. The Clinical Ingestion Strategy (v14.0.0)

### 1. Ingestion Gate (substrate. Layer)
- **The Hunter**: A single Edge Function (`ingest-royale-data`) fetches all endpoints.
- **Proxy Protocol**: Uses `proxy.royaleapi.dev` to bypass IP-whitelisting constraints.
- **Penta-Stage Pipe**: Sequentially fetches **Clan Profile**, **Members**, **War Activity**, **War Log**, and **Deep-Depth Battle Logs**.
- **Rate Limit Defense**: Batch-processing (5 players per batch) for battle logs to respect RoyaleAPI quotas.

### 2. The Collection Shredder (drivers. Layer)
- **The Point (Persistence over Ephemerality)**: `drivers.war_history` is an **Infinite Career Ledger**. It discovery-syncs 52 weeks but **never prunes**, building a 10-year heritage.
- **Battle Depth**: `drivers.player_battles` maintains a **100-sample rolling window** per resident for high-fidelity PeS/Inertia scoring.
- **Single Source of Truth**: `drivers.members` accumulates every daily heartbeat (L2 Archive/Database).

### 3. Feature Presentation (features. Layer) - Minimalist UI
- **Roster View**: `features.roster_view` (Custom sorting + Dynamic Labeling: `5m`, `2h`, `3d`).
- **War Analytics**: `features.war_activity_view` (Whos missing battles?).
- **War Loyalty**: `features.war_loyalty_view` (Historical fame averaging over years).

---

## V. Strategic Migration Timeline

### Phase 1-4: Substrate & Core (Verified ✅)

### Phase 5: Deep Ingestion & Career History (Verified ✅)
- [x] Edge Function: Upgraded to Penta-Stage (Profile, Members, War Activity, War Log, Battles).
- [x] SQL: Established **Infinite Career Ledger** logic for `drivers.war_history`.
- [x] SQL: Implemented **100-Sample Battle Sampling** window for deep scoring.

### Phase 6: Operational Security & Janitor (Verified ✅)
- [x] SQL: Unified `maintenance_janitor()` to prune volatile JSON/Opponent data.
- [x] SQL: Hard-Exempted career history (war_history) from pruning cycles.
- [x] SQL: Registered Weekly Cron for 500MB Free-Tier safety (~60MB plateau after 10 years).

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

## VII. Storage Logic (Aggressive-Lean Refined)
| Layer | Domain | Policy | Rationale |
| :--- | :--- | :--- | :--- |
| **L0** | Raw JSON | 7-Day Prune | Volatile transit only. |
| **L2** | War History | **Never Prune** | Infinite Career Heritage. |
| **L2** | Snapshots | 365-Day Pruned | Maintain annual momentum. |
| **L2** | Opponents | 7-Day Pruned | Zero noise for dead data. |
| **L2** | Battles | 100-Sample Window | Deep Performance Fidelity. |
| **L2** | **Leavers** | **Total Purge (7d)** | 7-day "Heritage Zero" guard. |

---

> [!IMPORTANT]
> This document remains the **Single Source of Truth** for the `Clash-Manager` Supabase infrastructure.
> ↴ *Last Updated: 2026-04-05 by Antigravity*
