# Win Rate Recalculation -- SSOT Plan

```
SPDX-License-Identifier: GPL-3.0-only
Copyright (C) 2026 AlbiDR
```

**Status:** ACTIVE PLAN  
**Priority:** CRITICAL -- win_rate is a core input to the RPeS algorithm grading every player  
**Scope:** Members (clan roster) + All recruit populations (ACTIVE, BENCHED, QUEUE, BLACKLISTED)

---

## 1. Problem Statement

Two classes of invalid win rate values have been observed in production:

- **0% win rate:** Players with a verifiably non-zero battle history are displaying 0%, indicating their win rate was never computed or never persisted.
- **Impossible 100%+ win rate:** Some players show a win rate at or above 100%, which is mathematically impossible under a plain wins/battles ratio, and statistically implausible as a battlefield record.

Since `win_rate` is now a first-class input to the RPeS (Raw Potential Score) formula -- the primary merit signal driving ranking, grading, and recruitment decisions -- any stale, zero, or inflated value corrupts the output for every person evaluated against it:

- A 0% win rate artificially deflates a player's RPeS, potentially burying qualified candidates.
- A >100% win rate falsely inflates RPeS, potentially surfacing unqualified candidates above stronger ones.
- The normalization denominator in `features.headhunter_view` (`max_corpus_score`) and `features.scoring_view` (`performance_score`) is itself derived from the corpus, so corrupted values in either pool contaminate the ranking of every other player in that pool, not just the individual.

---

## 2. Root Cause Analysis

### 2.1 Members: 0% Win Rate

**Path:** `features.roster_view` computes `win_rate` via a LEFT JOIN against `drivers.player_battles`:

```sql
battle_stats AS (
    SELECT player_tag,
           count(*)                              AS battle_count,
           count(*) FILTER (WHERE win_status)   AS wins
    FROM drivers.player_battles
    GROUP BY player_tag
)
...
COALESCE(bs.wins::numeric / NULLIF(bs.battle_count, 0)::numeric, 0::numeric) AS win_rate
```

When a member has no rows in `drivers.player_battles`, the LEFT JOIN produces NULL for both `wins` and `battle_count`, and `COALESCE(..., 0)` silently returns 0. This hits:

- Members who joined the clan after their first `deep-depth.ts` run but before the next one fetched their battles.
- Members whose battle log fetch failed silently (non-200 HTTP, API rate limit, validation rejection).
- Members who are active but very infrequent players, whose battles all fall outside the rolling 100-battle or 1-month window enforced by `ingest_player_battles()`.

**Diagnosis:** The roster view cannot distinguish between "0 battles played ever" and "battles not yet fetched." Both produce `win_rate = 0`.

### 2.2 Members: Impossible 100% Win Rate

**Path:** `ingest_player_battles()` applies a filter at the source:

```sql
WHERE item->>'battleTime' IS NOT NULL
  AND item->'opponent' IS NOT NULL
```

Battle types without an `opponent` field (e.g. friendly challenges, some training battles) are silently excluded from ingestion. If a member's recent battle log contains a disproportionate mix of friendly/training battles alongside their competitive wins, only the competitive subset lands in `drivers.player_battles`. If that subset happens to be entirely wins (e.g. the member played 3 ranked battles this month and won all 3), `win_rate = 3/3 = 1.0 = 100%`.

This is not arithmetically impossible per the stored data -- it is statistically implausible only if you assume the full battle history is represented. The stored history is a filtered, rolling sample.

**Diagnosis:** Sample bias caused by the opponent-present filter. Small sample sizes amplify this to extreme values.

**Secondary diagnosis (recruits):** `calculateWeightedWinRate()` in `_shared/utils.ts` computes:

```typescript
const performanceWins = (wins - three_crown_wins) + (three_crown_wins * RPOS_THREE_CROWN_MULT);
return battle_count > 0 ? performanceWins / battle_count : 0;
```

With `RPOS_THREE_CROWN_MULT = 1.25`, a player whose every victory was a three-crown win yields a `performanceWins` numerator greater than their raw `wins`, producing `win_rate > 1.0`. This is by design for the RPeS formula (the inflated numerator rewards decisive play), but is displayed directly as a percentage on the Recruit Card, causing the "impossible 100%+" display on the front end.

### 2.3 Recruits: 0% Win Rate (Pipeline Cohorts)

Three sub-causes exist across the recruit pipeline populations:

**Sub-cause A -- Pre-migration rows (ACTIVE, BENCHED, QUEUE):** Migration `20260727000000_rpos_rescan_backfill.sql` backdated `last_scan` to force a rescan, but only for rows where `win_rate = 0`. Rows that were rescanned after the formula migration but before the rescan stage ran may have had `win_rate` set to a genuine 0 (zero-battle profile). They pass the `AND win_rate = 0` filter a second time and are perpetually re-queued, but the rescan stage fetches a live CR API profile. If the API returns `battleCount = 0`, `win_rate = 0` is the correct persisted value for that player. The 0 is valid but indistinguishable from the migration artifact.

**Sub-cause B -- SHADOW leads (ACTIVE, BENCHED):** `deep-depth.ts` inserts SHADOW leads via `sync_recruits` with no win_rate field in the payload. `public.sync_recruits()` uses `COALESCE((val->>'win_rate')::NUMERIC, 0.0)`, so `win_rate` is always 0.0 for every shadow lead, regardless of that player's actual battle record. These leads are never re-profiled by the rescan stage unless they happen to be selected by the rescan's `get_stale_recruits` RPC, which only fetches rows whose `last_scan` is older than 48 hours. Since shadow leads are inserted with `last_scan = NOW()`, they sit at 0 for 48 hours minimum.

**Sub-cause C -- BLACKLISTED recruits:** `report_dead_recruit` and the blacklist trigger only transfer `raw_potential_score` to `recruit_blacklist`. The `win_rate` at eviction time is NOT written to `recruit_blacklist.snapshot`. The `snapshot` JSONB column was intended to hold historical fields, but the write path does not include `win_rate`. Blacklisted entries therefore always show the default `raw_potential_score` that was current at eviction, but the win rate inside `headhunter_view`'s `benchmarking_context` (which reads `max(recruit_blacklist.raw_potential_score)`) may reflect an RPoS computed from a stale or zero win rate.

### 2.4 Recruits: Impossible >100% Win Rate

As described in Section 2.2, `calculateWeightedWinRate()` is designed to return values above 1.0 for players with high three-crown ratios. This is correct behavior for the RPeS term (it feeds into `weightedWinRate * winRateWeight` inside `calculateRpos()`), but the same value is also persisted to `drivers.recruits.win_rate` and displayed raw on the Recruit Card as a percentage. A value of 1.10 is rendered as "110.0%" by `formatNumber(winRate, { style: 'percent' })`.

**Diagnosis:** The `win_rate` column serves dual purpose -- it is both an RPeS formula input (where >1.0 is intentional) and a display metric (where >1.0 is confusing). The fix must cap only the display layer without breaking the RPeS formula term.

---

## 3. Scope of Impact

| Population | Table | Approximate Count | Priority |
|---|---|---|---|
| Active clan members | `drivers.members` via `features.roster_view` | ~50 rows | P0 -- direct RPeS grading |
| Active recruits | `drivers.recruits` (status = ACTIVE) | ~100-500 rows | P0 -- headhunter ranking |
| Benched recruits | `drivers.recruits` (status = BENCHED) | ~50-200 rows | P1 -- re-promotion candidate pool |
| Queued recruits | `drivers.recruits` (status = QUEUE) | ~200-1000 rows | P1 -- future active candidates |
| Blacklisted recruits | `drivers.recruit_blacklist` | ~100-500 rows | P2 -- historical integrity |

---

## 4. Decision Log

### D1: Members win rate source remains `drivers.player_battles`

The member roster win rate is intentionally derived from the rolling battle log (plain wins/battles, not the three-crown-weighted formula). This is documented in migration `20260727020000_roster_win_rate_lifetime_kpi.sql`. The fix for members is to ensure the battle log is populated for every active member before the win rate is read, NOT to change the formula or source.

### D2: Recruit win_rate column stores the weighted ratio, including values above 1.0

`calculateWeightedWinRate()` is intentionally allowed to return values above 1.0 (the three-crown multiplier raises the effective numerator). This value is the correct RPeS formula input. Capping it in the database would require compensating adjustments to `calculateRpos()`, which calls `calculateWeightedWinRate()` independently. The fix is therefore a **display-only cap** at the frontend layer, not a database schema change. The stored value remains the raw weighted ratio.

### D3: Backfilling member win rate requires forced battle log ingestion

Members cannot be "rescanned" like recruits because there is no member equivalent of `sync_recruits`. The member win rate is computed on read from `drivers.player_battles`. The only way to fix 0% member win rates is to ensure every active member has at least one battle ingested. The fix is a migration that identifies members with no battle log rows and forces their `next_poll_at` to NULL (meaning "poll immediately"), which causes the next `deep-depth.ts` run to fetch their battle logs.

### D4: Recruits with genuine battleCount = 0 should not be re-queued indefinitely

The rescan backfill condition `AND win_rate = 0` does not distinguish between "never fetched" and "genuinely zero battles." The new backfill must use a smarter signal: `win_rate = 0 AND raw_potential_score > 0`. If `raw_potential_score > 0`, the player has trophies and/or donations, meaning they are an active player whose battle count was never fetched (zero battles is implausible for a player with 4000+ trophies). This is not a guarantee, but it significantly reduces false positives.

### D5: Blacklist win_rate is a snapshot enhancement, not a schema change

Adding a `win_rate` column to `drivers.recruit_blacklist` would require a migration, a schema change to every blacklist INSERT path. The blacklist already carries a flexible `snapshot JSONB` column. The fix is to include `win_rate` in the `snapshot` payload at eviction time -- a targeted change to the relevant SQL functions, not a schema change. This is P2 and deferred to Phase 4.

---

## 5. Implementation Plan

### Phase 1 (CRITICAL -- Members): Force battle log re-ingestion for all zero-battle-log members

**File:** New migration `Backend/supabase/migrations/20260801000000_member_battle_log_backfill.sql`

**What it does:**

For every active member (`drivers.members.is_active = true`) who has no rows in `drivers.player_battles`, set `drivers.members.next_poll_at = NULL`. A NULL value means "poll immediately on the next ingestion run" (documented in the `next_poll_at` column comment). The `get_ingestion_targets` RPC used by `deep-depth.ts` selects members with `next_poll_at IS NULL OR next_poll_at <= NOW()`, so these members are fetched on the very next `ingest-royale-data` invocation.

**SQL:**

```sql
UPDATE drivers.members
   SET next_poll_at = NULL
 WHERE is_active = true
   AND player_tag NOT IN (
       SELECT DISTINCT player_tag FROM drivers.player_battles
   );
```

**Why not a direct UPDATE to win_rate on members?** `drivers.members` has no `win_rate` column. Win rate is computed on read from `player_battles` inside `roster_view`. This is correct architecture -- it keeps the source of truth in the event-sourced `player_battles` table.

**Verification:** After the next `ingest-royale-data` run (runs on pg_cron every 30 minutes), query:

```sql
SELECT count(*) FROM features.roster_view WHERE win_rate = 0;
```

The count should drop significantly. Residual 0% members are genuine zero-battle players or players who genuinely lose every ingested battle.

---

### Phase 2 (CRITICAL -- Recruits): Force rescan for stale/shadow-lead recruits

**File:** New migration `Backend/supabase/migrations/20260801010000_recruit_win_rate_backfill.sql`

**What it does:**

For ACTIVE, BENCHED, and QUEUE recruits whose `raw_potential_score > 0` AND `win_rate = 0`, backdate `last_scan` past the 48-hour staleness threshold. This triggers the existing rescan stage to re-profile these players and populate `win_rate` from the live CR API. Same pattern as `20260727000000_rpos_rescan_backfill.sql`, with the added `raw_potential_score > 0` guard (D4).

The `raw_potential_score > 0` guard ensures recruits with a genuine zero-battle profile are not perpetually re-queued.

**SQL:**

```sql
UPDATE drivers.recruits
   SET last_scan = NOW() - INTERVAL '49 hours'
 WHERE status IN ('ACTIVE', 'BENCHED', 'QUEUE')
   AND win_rate = 0
   AND raw_potential_score > 0;
```

**Verification:** After 2-4 headhunter-scanner cycles (~2 hours total), query:

```sql
SELECT count(*) FROM drivers.recruits
 WHERE status IN ('ACTIVE', 'BENCHED', 'QUEUE')
   AND win_rate = 0
   AND raw_potential_score > 0;
```

This count should converge toward 0. Residual rows are players whose CR API profile genuinely returns `battleCount = 0`.

---

### Phase 3 (CRITICAL -- Display): Cap win rate display at 100% on the frontend

**Files:**
- `Frontend-PWA/src/features/headhunter/components/RecruitCard.vue`
- `Frontend-PWA/src/features/roster/components/MemberCard.vue`

**What it does:**

Both cards pass `winRate` directly to `formatNumber(..., { style: 'percent' })`. Since `calculateWeightedWinRate()` intentionally returns values above 1.0 (D2), the display layer must cap at 1.0 before formatting. The raw value fed to `useBenchmarking` is NOT capped, preserving the benchmark comparison against the true weighted ratio.

**RecruitCard.vue:**

```diff
- :value="formatNumber(props.recruit.d.winRate, { style: 'percent', maximumFractionDigits: 1 })"
+ :value="formatNumber(Math.min(props.recruit.d.winRate, 1), { style: 'percent', maximumFractionDigits: 1 })"
```

**MemberCard.vue:**

Same pattern. (Members source win_rate from `roster_view` which is plain `wins/battle_count` -- always 0 to 1.0 -- so the cap is defensive for members but critically needed for recruits.)

**Verification:** After PWA deployment, any recruit with `win_rate > 1.0` should display "100.0%" rather than "110.0%". The benchmark badge beside it should still reflect the true raw ratio.

---

### Phase 4 (IMPORTANT -- Structural): Include win_rate in blacklist snapshot at eviction time

**File:** New migration `Backend/supabase/migrations/20260801020000_blacklist_win_rate_snapshot.sql`

**What it does:**

Identifies every SQL function and trigger path that INSERTs or UPSERTs into `drivers.recruit_blacklist` (specifically `report_dead_recruit` and `purge_recruits`) and adds `win_rate` to the `snapshot` JSONB payload. No schema change to `recruit_blacklist` is required -- only the function bodies are updated.

**Why this matters:** The `headhunter_view` `benchmarking_context` includes `max(drivers.recruit_blacklist.raw_potential_score)` in its corpus maximum. That `raw_potential_score` was computed including a win_rate term. If the persisted snapshot does not include `win_rate`, any future audit or retroactive score display for a blacklisted player cannot reconstruct the full formula input.

**Verification:** After the migration, blacklist a test player and verify `snapshot->>'win_rate'` is populated in `drivers.recruit_blacklist`.

---

### Phase 5 (MONITOR -- Health signal): Add win_rate field health check to rescan stage

**File:** `Backend/supabase/functions/headhunter-scanner/stages/rescan.ts`

**What it does:**

After the `refreshedRecruitBatch` is assembled and before `sync_recruits` is called, check whether any entries still have `win_rate = 0` despite `raw_potential_score > 0`. If so, emit a `console.warn` and a `logAudit` entry with action `integrity_checked` / `passed: false`. This mirrors the field health check already present in `profiler.ts` lines 225-254.

This is a monitoring enhancement only -- no correctness change. Deferred until Phases 1-3 are verified in production.

---

## 6. Execution Order

```
Phase 1 (migration 20260801000000) -- Deploy immediately -- Forces member battle log fetch
Phase 2 (migration 20260801010000) -- Deploy immediately -- Forces recruit rescan
Phase 3 (frontend changes)         -- Deploy PWA immediately -- Caps display at 100%
Phase 4 (migration 20260801020000) -- Deploy after P1-3 verified -- Blacklist snapshot
Phase 5 (rescan.ts change)         -- Deploy after P1-3 verified -- Health signal
```

Phases 1, 2, and 3 are independent and can be deployed simultaneously. Phases 4 and 5 are structural improvements that should follow after the primary fixes are verified in production.

---

## 7. Risk Assessment

| Phase | Risk | Mitigation |
|---|---|---|
| Phase 1 | Forcing all zero-battle-log members to `next_poll_at = NULL` simultaneously may cause a large fan-out in `deep-depth.ts`. | Maximum affected count is ~50 members. With concurrency 6, this completes in a single run without resource issues. |
| Phase 2 | Re-scanning hundreds of recruits simultaneously. | `get_stale_recruits` caps to `RESCAN_BATCH_LIMIT = 250`. Multiple scanner cycles drain the queue over 2-4 hours with no action required. |
| Phase 3 | Capping display at 1.0 changes the visible percentage for some recruits. | This is the intended behavior. The raw `d.winRate` value fed to `useBenchmarking` is not capped, so benchmark comparison is unaffected. |
| Phase 4 | Modifying `report_dead_recruit` and `purge_recruits` function bodies. | The `snapshot` JSONB is additive. No existing reader of the snapshot parses `win_rate`, so no downstream breakage is possible. |
| Phase 5 | None -- monitoring only. | N/A |

---

## 8. Out of Scope

- Changing the `calculateWeightedWinRate()` formula. The three-crown multiplier is intentional and documented.
- Adding a `win_rate` column to `drivers.members`. The rolling battle log is the correct source of truth for member win rate (D1).
- Retroactively correcting `raw_potential_score` for blacklisted entries. The blacklist captures a historical snapshot; retroactive correction would require live CR API calls for potentially ghost accounts.
- Changing the 48-hour staleness threshold in `get_stale_recruits`. That threshold is an operational constant unrelated to this correctness issue.

---

## 9. Authoritative File Index

| File | Role in this fix |
|---|---|
| `Backend/supabase/migrations/20260801000000_member_battle_log_backfill.sql` | Phase 1: forces battle log fetch for all zero-battle-log members |
| `Backend/supabase/migrations/20260801010000_recruit_win_rate_backfill.sql` | Phase 2: forces rescan for all zero-win-rate recruits with non-zero RPeS |
| `Frontend-PWA/src/features/headhunter/components/RecruitCard.vue` | Phase 3: display cap at 100% for recruit win rate |
| `Frontend-PWA/src/features/roster/components/MemberCard.vue` | Phase 3: defensive display cap at 100% for member win rate |
| `Backend/supabase/migrations/20260801020000_blacklist_win_rate_snapshot.sql` | Phase 4: include win_rate in blacklist snapshot payload |
| `Backend/supabase/functions/headhunter-scanner/stages/rescan.ts` | Phase 5: add win_rate field health check to rescan telemetry |
| `Backend/supabase/functions/_shared/utils.ts` | Reference: calculateWeightedWinRate() -- NOT CHANGED |
| `Backend/supabase/functions/_shared/config.ts` | Reference: RPOS_THREE_CROWN_MULT -- NOT CHANGED |
| `Backend/supabase/migrations/20260727020000_roster_win_rate_lifetime_kpi.sql` | Reference: roster_view win_rate formula -- NOT CHANGED |
| `Backend/supabase/migrations/20260726170000_rpos_formula_restructure.sql` | Reference: headhunter_view + sync_recruits win_rate path -- NOT CHANGED |
