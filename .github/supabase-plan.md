# Supabase Migration Plan — Architectural Pivot

This document outlines the strategic transition from a Google Apps Script (GAS) and Google Sheets backend to a robust, PostgreSQL-powered **Supabase** infrastructure.

## I. Objectives
- **Eliminate Latency**: Replace slow `SpreadsheetApp` operations with high-performance SQL queries.
- **Bypass Quotas**: Move complex logic from the restricted GAS environment (6-minute limit) to Supabase Edge Functions and the Render-hosted Backend-Worker.
- **Relational Integrity**: Transition from flat-row snapshots to normalized PostgreSQL tables.
- **Realtime UX**: Implement Supabase Realtime for instant frontend UI updates.

---

## II. Data Ingestion Arch: "The Raw Tier" (Bronze)
*Direct mapping of Royale API responses to JSONB storage. This layer preserves "Raw Truth" and allows re-processing without fetching new data.*

| Source Endpoint | Target Supabase Table | Purpose |
| :--- | :--- | :--- |
| `GET /clans/{tag}` | `clash_raw_clan_profile` | Validation & Branding |
| `GET /clans/{tag}/members` | `clash_raw_clan_members` | Core Roster Extraction |
| `GET /clans/{tag}/currentrace` | `clash_raw_clan_currentrace` | Live War Tracking |
| `GET /clans/{tag}/racelog` | `clash_raw_clan_racelog` | History Alignment |
| `GET /players/{tag}` | `clash_raw_player_profile` | Deep Scoring / Validation |
| `GET /players/{tag}/battlelog` | `clash_raw_player_battlelog` | Activity Analysis |
| `GET /tournaments/{tag}` | `clash_raw_tournament` | Recruitment Scanning |

---

## III. Domain Schema: "The Domain Tier" (Silver)
*Relational tables hydrated via SQL Triggers or Edge Functions from the Raw Tier.*

- [ ] **Members (`members`)**: Current snapshot of the 50 clan members.
    - Fields: `tag` (PK), `name`, `exp_level`, `trophies`, `current_rank`, `last_seen_at`.
- [ ] **Member Snapshots (`member_snapshots`)**: Time-series history.
    - Logic: Every 30 mins, fresh data replaces the "Current Day" entry.
    - Fields: `tag`, `date`, `trophies`, `donations`, `war_fame`.
- [ ] **Roster State (`roster_view`)**: (SQL VIEW)
    - Replaces "The Roster" sheet.
    - Aggregates snapshots to calculate **Tenure**, **Average Performance**, and runs the **Sorting Algorithm** (Weighted Scores) on-the-fly.
- [ ] **Recruitment (`prospects`)**: 
    - Replaces "The Headhunter" sheet.
    - Fields: `tag`, `name`, `source_tournament`, `score`, `invitation_status`.

---

## IV. Core Logic Migration
*Transitioning the "Brain" from JS Loops to SQL & Workers.*

- [ ] **The Ingestion Cycle**:
    - **Trigger**: Every 30 minutes via Render Worker / Edge Function.
    - **Member Retention**: Logic moved to a daily `purge_inactive` routine (Removes non-clan members who haven't been seen in 14 days).
- [ ] **The Roster Algorithm**:
    - Migrated from `Roster.ts` JS logic into a **PostgreSQL Materialized View**.
    - Factors: Trophies, War Fame (from `member_snapshots`), and Tenure (dynamic delta between joining date and now).
- [ ] **The Headhunter Scanner**:
    - Periodically triggers `/tournaments/{tag}` scans.
    - Filters result in SQL (Where `clan_tag` is NULL and `score` > threshold).

---

## V. Execution Phases (`CleanStack` ADR Compliant)

### Phase 1: Substrate & Client
- [ ] **Layer 0**: Environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- [ ] **Layer 1**: Implement `Supabase_Client.ts` (Singleton).
- [ ] **Layer 1**: Define **Valibot** schemas for inbound Raw JSONB.

### Phase 2: Schema Deployment
- [ ] Implement `migrations/` folder with SQL for Table structures and JSONB "Shredding" triggers.
- [ ] Setup RLS (Row Level Security) for public/private data access.

### Phase 3: Logic Delegation
- [ ] Refactor Render Worker to handle the 7 API endpoint calls.
- [ ] Replace `Backend-GAS/Database.ts` with calls to the Worker/Supabase RPCs.

### Phase 4: Frontend "Live" Roster
- [ ] Replace `useRosterStore` data fetching with Supabase `Subscribe`.
- [ ] Implement PWA Service Worker caching for offline member views.

---
> [!IMPORTANT]
> The framework remains a detail. All database operations must be brokered through a **Layer 2 Driver** (`Supabase_Driver.ts`) to maintain persistence ignorance in the feature modules.
