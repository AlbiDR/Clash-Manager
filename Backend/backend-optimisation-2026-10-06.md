// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Backend optimisation programme, October 6-7, 2026

Handoff written at the end of a one-night, multi-session effort. It records
what shipped, what is committed but not yet pushed, what was measured, the
ranked backlog, the designs that were approved but not built, and the rules
the night taught. Everything here is the single place a future session should
start from; nothing of it lives in agent memory.

## 1. State at handoff

Shipped to Beta tonight (v14.51.2 to v14.51.4):

- Blitz harvest scope fix and honest region labels; all-404 verification is an outage, not "nobody clanless".
- Back button closes the open sheet, dialog or popup instead of leaving the app.
- Database sync served from materialized snapshots (features.roster_materialized, features.headhunter_materialized); publication narrowed to recruit_blacklist, clan_voyage, clan_voyage_contributions.
- Unused HeaderInfoOverlay removed; new audit `pnpm audit:dead-components` guards barrel-exported components (knip never sees an SFC's implicit default export).
- Android UX audit reads tags past a quoted ">" and requires per-element haptic evidence; four GhostBenchmarkHost buttons gained haptics.
- knip and eslint taught the repo's intentional patterns (p-limit is a real runtime dep; BLITZ_DWELL_MIN and BLITZ_DWELL_DEFAULT are two things).

Committed locally and pushed as v14.51.5 if the ADR gate cleared the stack (see the git log; if these are absent from origin/Beta they were not pushed):

- fix(nav): closing an overlay after a replace no longer bounces to the old page.
- fix(nav): let the router see every Back on WebKit and Gecko. The capture-phase listener and stopImmediatePropagation were removed: on WebKit and Gecko a capture listener on window runs before vue-router's, hid the pop, and produced a Back that bounced and skipped a tab on iOS. Verified in a real WKWebView.
- fix(sync): withhold recruits dismissed since the headhunter snapshot was refreshed (regression from the snapshot change).
- fix(bones): skeleton capture on a hermetic page with a ready signal, not networkidle; 37 s to 5 s, byte-identical output; empty groups are recorded as not captured, never cached fresh.
- fix(sync): no retry on reads the database timed out (57014), full-jitter backoff, poll backs off on consecutive failures; requests per failed sync 15 to 4.
- fix(sync): freshness comes from the pipeline heartbeat's last_success_at, not roster rows (prerequisite for W1 below).
- fix(edge): do less, not more, when a gating read fails; ping writes nothing.
- perf(edge): write a run's telemetry once, as counts plus failures.

Incident hypothesis, not a confirmed root cause: the Database session and Chat 6 reported these observations around the morning stalls: the Nano instance has 406 MB RAM, 467 MB of 1 GB swap in use, swap activity of 1.5-3 MB/s in both directions, disk reads of 14-26 MB/s, iowait of 31-79%, CPU under 8%, and steal of 0. They also recorded pg_cron `job startup timeout` on every job from 05:00-10:50 UTC on October 4, 5, and 6. The available evidence does not establish that a daily disk I/O budget was depleted or that depletion caused the stalls. The 99.99% Postgres buffer hit rate does not by itself attribute disk reads to OS swap, and the cited evidence has no CPU-credit metrics with which to rule that mechanism out. Correlated incident-time host, database, PostgREST, and cron evidence, together with provider I/O budget or burst-balance history, is needed to test these explanations. Storage was 137 MiB of 500 MB in the cited sample, which does not indicate capacity exhaustion. A paid plan is ruled out by the owner, so the proposals below are demand-side mitigations; that constraint does not establish the outage cause.

## 2. Rules the night taught

- One session talks to the database at a time. The CLI hangs when run in parallel.
- Every migration is dry-run in a rolled-back transaction before it is committed: BEGIN; SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '60s'; body; assertions into a temp table; a final DO block that RAISEs EXCEPTION carrying the assertion text. Bodies with top-level transaction statements, CONCURRENTLY, VACUUM, ALTER SYSTEM, dblink, pg_terminate_backend or session advisory locks cannot be dry-run this way. CI applies migrations on push, so the dry run is the only safety net.
- Every commit passes an ADR compliance review before a push slot opens. On the first pass the gate blocked 6 of 8 commits, mostly on verb-list names and command-query separation, and found two real defects (a stale cached address; a failed read still yielding 0 instead of unknown).
- A detector that cannot answer must not answer "no": ask of every query, capture, guard or audit whether its output would differ if it could not run at all. Tonight this caught: the skeleton capture reporting "Capture complete" over zero bones; the scanner feeding top50=0 after a failed fate read; the epoch guard arming three rescans on that zero; ping returning 503 and the app retrying it four times.
- New migrations must be registered by sha256 in .github/nightly-config/migration-quality.json. fold-state exits 1 (UNFOLDED) today with a 119-entry backlog that predates this work.
- Two unique indexes that ON CONFLICT depends on exist only in the live database: uq_player_battle(player_tag, battle_time) and member_snapshots unique(player_tag, snapshot_date). A rebuild from migrations would break the ingest until they are declared.
- The host metrics endpoint (customer/v1/privileged/metrics, basic auth with the service_role key, cached about 60 s, so sample at least 120 s apart) is the only way to see swap and I/O. The service_role key is obtained from the Management API using the CLI login token held in the macOS keychain item "Supabase CLI". Never print or store either value.

## 3. Ranked backlog (merged from the five audit lanes)


## Sources and status

| Lane | Source | What it covered |
|---|---|---|
| Chat 6 | measurements, 20:50-21:01 UTC | Live database, read-only. Partial: no host metrics, no advisors. |
| Chat 8 | edge functions audit | Partial. |
| Chat 9 | schema audit | Partial, read from the repo only. |
| Chat 10 | app client audit | Partial, no network measurement. |
| Chat 7 | backend-load-plan-PARTIAL.md | Repo only. |
| DB handoff | the closed Database session | Memory and swap observations; their causal role in the stalls remains unverified here. |

**Verified in the repo for this merge**
- `ingest_raw_*` inserts every payload without comparing it to the last one (master_migration `ingest_raw_war_log`).
- `shred_war_log` then upserts war_history, players, members and war_activity with no change test.
- The snapshot trigger already refreshes the roster only after the ingestor or nightly maintenance (20261006204000:94-101).
- `purge_orphan_players` does not read players.updated_at (baseline definition), which answers Chat 9 Q7 from the repo.
- The app treats the roster's `last_ingested_at` as evidence of freshness (Frontend-PWA/src/core/api/SupabaseClient.ts:576-592).

**What is supported**
- The Database session reported high swap use and activity in its samples. This makes memory and I/O pressure plausible contributors, but the available evidence does not show that RAM exhaustion depleted a daily I/O budget or caused the job startup timeouts.
- Chat 6 measured a 99.99% Postgres buffer hit rate (222.7M hits against 23.7k reads since restart) and statement time of 5.1% of one backend. These measurements describe that sample; they do not attribute host disk reads to OS swap or establish that CPU credits were not involved in the outage.
- Storage was 136.7 MiB of 500 MB (27%) in the cited sample, which does not indicate capacity exhaustion.
- The candidates target fewer resident processes, less write I/O, and fewer backend forks as demand-side levers. Their effect on recurrence needs correlated before-and-after evidence.

## Candidates, ranked by effect per unit of risk

Effect column: R = RAM and resident backends, W = writes, WAL and autovacuum I/O, F = backend forks per day. H, M and L mean high, medium and low.

| # | Id | Change | Layer | Evidence (lane, number) | Expected effect | Risk | Guard | Proof it worked |
|---|---|---|---|---|---|---|---|---|
| 1 | W1 | Skip rewrites of unchanged rows. Add `WHERE (cols) IS DISTINCT FROM (EXCLUDED cols)` on the DO UPDATE in shred_clan_members, shred_war_log, sync_players, sync_recruits, the scanner writers and the discovery_cache upsert. Narrow the members triggers: exclusion sync to INSERT/DELETE only; heritage to `UPDATE OF is_active WHEN (OLD.is_active AND NOT NEW.is_active)`. | schema | Chat 6, 23.5 h: players 114,065 updates on 8,039 rows, 33% HOT. recruits 15,291, 20% HOT. discovery_cache 11,286, 0% HOT. members 29,475 on 306 rows, 80% HOT. war_activity 26,996 on 1,987 rows. Chat 9: the players upserts rewrite the name and updated_at unconditionally, and the two member triggers make about 57k needless plpgsql calls a day. | W: H. R: indirect (fewer dirty pages, less autovacuum). F: none. | L-M. Members `last_ingested_at` is app freshness evidence, so move freshness to the heartbeat first (see Dependencies). | pgTAP: the same payload ingested twice gives zero n_tup_upd on every target table. Trigger test with track_functions on. | 24 h delta of n_tup_upd and n_tup_hot_upd per table; pg_stat_wal bytes per day; autovacuum_count. |
| 2 | W2 | Ingest a raw payload only when it changed. `ingest_raw_*` compares a hash of the payload with the latest row for the same clan and source and skips the insert, and with it the shred, when they are equal. The event is the source actually changing. | schema | Chat 6: ingest_raw_war_log was 38% of all WAL in the window, 1,025 KB in a single call. raw_war_log is 8.0 MiB, 7.9 of it TOAST, for 62 rows (about 130 KB each), 37% dead. War data changes weekly but is ingested about 35-48 times a day (Chat 6 cron). Repo: no hash or dedupe anywhere in the raw path. | W: H (the largest WAL producer per cycle, plus the shred rewrites). R: indirect. | L. The same freshness dependency as W1, because shred_war_log writes members.last_ingested_at. If the API payload carries volatile fields, the gate never fires (Q4). | pgTAP: the same payload twice gives one raw row and zero war_activity, war_history and players updates. | Raw inserts per day per table; WAL share of ingest_raw_*; war_activity n_tup_upd. |
| 3 | R1 | Retire Realtime postgres_changes (the blacklist and voyage-updates channels). Changes reach other devices through C1 and S1 instead. | client + schema | Chat 6, after the publication was narrowed: Realtime was 29.7% of statement time, 1,193 polls in 608 s (about 2/s, about 170k a day), 6 Realtime client backends plus 1 walsender, two logical slots, and only 2 subscriptions (both recruit_blacklist). DB handoff: 24% over 22 h. Chat 10: the Android WebView drops the socket in the background and every rejoin triggers a full refresh; voyage row events refetch with no debounce. | R: M (the poll loop, possibly some Realtime backends, Q3). W: none. F: none. | M. Blacklist and voyage edits reach other devices one poll later (5 min). The voyage banner relies on the countdown plus the poll. | Update Backend/supabase/tests/database/06_blacklist_realtime.test.sql and .github/scripts/database/verify-app-availability.mjs in the same change. Add an audit that fails when the publication lists a table no client subscribes to, or a client subscribes to a table it does not list. | Realtime caller share in a pg_stat_statements delta near 0; realtime_* backend count; swap in/out (Q1). |
| 4 | T1 | Slim the telemetry. One row per run, written at start and at end; a summary of counts instead of the `results` arrays (harvest list, battle log, card list); audit entries appended, not rewriting the whole JSONB on every heartbeat; check update_telemetry errors. | edge + schema | Chat 6: governance_telemetry is the largest relation at 42.5 MiB, 38.4 MiB of it TOAST, for 3,398 rows. DB handoff: HEADHUNTER_SCAN rows about 20 KB. Chat 8: at least 4 RPCs per invocation, plus a full JSONB rewrite per heartbeat (3 for the ingest, 5 for the scanner); update_telemetry errors are never checked. | W: M (TOAST rewrite WAL). R: L. Storage: the largest table shrinks. | L. Keep every field the watchdog, resource_health_view and pipeline_heartbeat_view read. | A typed contract in protocol.ts that forbids result arrays in metadata, plus a unit test. | Growth per day of governance_telemetry total and TOAST size; WAL share of update_telemetry. |
| 5 | A1 | Stop amplifying load during a stall. Client: no retry on a statement timeout (57014), jittered backoff, and the poll backs off after consecutive failures. Ping: no DB writes. Ingest: if get_latest_battle_times fails, abort stage 6 instead of re-ingesting every target. Scanner: if the fate or recent-scan checks fail, do not report top50 = 0. | client + edge | Chat 10: a server timeout (6 s) is retried up to 3 more times, so one sync can run the same expensive read 4 times. Chat 8: ping makes 4 DB writes and returns 503 when the DB is down; the app retries up to 5 times, so up to 20 writes per app open. A false top50 = 0 makes the epoch guard run up to 3 extra full scans. | W, R and F: H during a stall (cuts positive feedback), none at quiet times. | L | Unit tests that inject DB failures and count requests and writes. | Requests per failed sync with the DB blocked (Chat 10's method); scans per epoch window; ping writes per app open. |
| 6 | S1 | Refresh snapshots only when their inputs changed. Statement triggers on the source tables mark a snapshot dirty; COMPLETED refreshes only dirty snapshots. A recruit_blacklist write marks the headhunter snapshot dirty and refreshes it, which fixes the 991da3349 regression. Publish a refreshed_at marker. | schema | Repo 20261006204000:94-101: roster refreshes on ingest and nightly (about 49 a day), headhunter on all four components (about 121 a day), whether or not anything changed. Each refresh runs the live view (Chat 6: roster_view 820 ms, headhunter_view 466 ms). Chat 8: the ingest reports SUCCESS even when stages fail, so it still refreshes. Chat 10: a dismissed recruit reappears after reload or on another device until the next scan. | W: L-M. R: L. Fixes a functional regression. | L-M | pgTAP: no refresh when clean; dismiss, then the headhunter snapshot excludes the recruit; the marker advances on every refresh. | MATERIALIZED_REFRESH count and duration per day; pg_stat_statements REFRESH total time. |
| 7 | C1 | Gate each sync on a change marker. Read the one-row marker from S1 (or the heartbeat last_success_at); skip the roster and headhunter reads when it has not moved. Remove the recruit_blacklist_view read, whose result is never used. | client | Chat 10: 4 GETs per sync every 5 min, select=*, and the snapshots change only when a pipeline completes (about every 30 min). The blacklist result is never read. Chat 6: app reads were 5.4% of statement time in the window. | R: L (fewer parallel requests, smaller PostgREST pool peak). Egress: M. | L | Unit test: unchanged marker, no snapshot request. | roster_materialized calls and bytes per hour, before and after. |
| 8 | K1 | Event-gate headhunter-epoch-guard. update_epoch_state arms the job with cron.alter_job when top50 = 0 and disarms it on success or when the window ends. This is the pattern voyage jobs 38 and 42 already use: both are inactive now. Also check whether rotate-recruits-cron is redundant with the tr_rotate_recruits statement trigger. | cron | Chat 6, 24 h: the epoch guard ran 285 times, 52% of 548 cron launches (Chat 9: 553 against a manifest budget of 600). It failed 67 times in the stall. rotate_recruits took 902 ms and wrote 445 KB of WAL in one run (16.5% of window WAL). Chat 6: 4,771 sessions since restart, and each cron launch forks a backend. | F: H (about 288 fewer forks a day). W: L. | M. Save each cron.job definition with a SELECT first; the schedules live only in the DB and the manifest. | audit:cron rule: no timer job polls for a condition that a writer could signal. Keep cron-schedule.json as the single source of truth. | Cron launches and sessions per day; scanner retries per window. |
| 9 | E1 | Fewer edge-to-DB round trips. Cache vault secrets per isolate and fetch every key in one RPC. Batch the per-item loops: ingest_player_battles per target, report_discovery per tournament, upsert_discovery_cache up to 1,800 calls, purge_recruits per tag (an array RPC already exists). Cap the scanner's DB concurrency. | edge + schema | Chat 6: ingest_player_battles made 39 calls in the window, mean 293 ms, 36% of all statement time. There were 83 per-request set_config preambles. Chat 8: 2-4 vault RPCs on every request, OPTIONS included; up to 750 concurrent scanner RPCs against 8 PostgREST backends. DB handoff: ingest hit WORKER_RESOURCE_LIMIT (546) at 04:00 UTC. | R: M (lower pool peak, less edge memory). W: L. | M. Large payloads, transaction size, partial-failure semantics. | Unit test counting RPCs per run against a mock client; a lint or grep audit for `.rpc(` inside per-item loops. | PostgREST edge calls per run; peak postgrest backends during a scan; 546 errors per day. |
| 10 | R2 | Stop the recruit churn. Admit a recruit only if it would rank inside the retained set, comparing against the current set rather than a literal (the purge keeps `OFFSET 500`, a literal). Orphaned ledger rows then stop being written only to be deleted. | schema + edge | Chat 6: recruits had 4,844 inserts and 2,988 deletes on 4,172 rows; recruit_ledger had 21,656 inserts and 15,715 deletes (orphan cleanup, master_migration:1619); sync_recruits was 21% of window WAL. Repo: log_recruit_event writes only on insert, on status change, or on a score move of 5% or more, so the churn comes from admissions and rotation, not no-op updates. | W: M | M. What discovery admits is a product decision. | pgTAP: a candidate below the retained set writes no recruit or ledger row. | recruits and recruit_ledger inserts and deletes per day; sync_recruits WAL share. |
| 11 | N1 | Make the nightly fold and purge sargable. Use a battle_time range instead of `(battle_time AT TIME ZONE 'UTC')::date`, and decide fold eligibility per (player, date, type). | schema | Chat 9: full scans every night; this is also the 840-row late-arrival backlog bug. Chat 6: nightly maintenance took 35.8 s; player_battles is 39.7 MiB (23.3 MiB of it indexes) and was autovacuumed at 03:01. | W: M at night. It may bear on the daily I/O budget (Q2). | M (totals must not change) | pgTAP fold totals; a plan test asserting an index scan. | Nightly duration; blocks read during maintenance. |
| 12 | X1 | Index hygiene. Declare the two required uniques with IF NOT EXISTS: uq_player_battle, and member_snapshots (player_tag, snapshot_date). Drop the duplicates: war_history's double unique, war_activity's implied unique, idx_ledger_tag (0 scans), idx_members_tag_date_stats (0 scans). Reconsider idx_discovery_cache_scanned_at: it blocks HOT updates and has only 117 scans. | schema | Chat 9: the two uniques are ON CONFLICT targets declared in no migration, so a rebuild from migrations would break the ingest. Chat 6: index usage (see Disagreements); discovery_cache 0 of 11,286 updates HOT. | W: L | L to declare. M to drop. | All three baseline checkers; a rebuild-from-migrations test. | Index bytes; discovery_cache HOT ratio. |
| 13 | M1 | Memory settings, last. Size shared_buffers from a measured working set (pg_buffercache), not a guess. Correct effective_cache_size, which is set larger than physical RAM. Find the queries that spill (temp_blks_written). | config | Chat 6: shared_buffers 96 MiB with a 99.99% hit rate; effective_cache_size 480 MiB on a 406 MB box; work_mem about 2 MiB; 185 MB of temp files in 53 files since restart. | R: M, uncertain | M-H. Restart required; reads may rise. | free-plan-postgres-config.toml as the single source, with its derivation documented. | Swap in/out and MemAvailable before and after (Q1). |

**Not recommended now**
- Retention changes: storage is at 27% of the cap.
- player_battle_daily, which Chat 9 calls unbounded, is scoring history and stays, under the no-windowing rule.
- Any compute upgrade, which the owner has ruled out.

## Where lanes disagree

1. **How often each member row is rewritten.**
   - DB handoff: "about 12x per cycle".
   - Chat 6: 29,475 updates in 23.5 h on 306 rows, with the ingest at 0,30 (48 cycles a day). That is about 2 updates per member per cycle, and 80% of them are HOT.
   - I trust Chat 6. Members is a smaller target than the handoff implied. Players is the big one (114k updates, 33% HOT).
2. **Resident backends.**
   - DB handoff: 22-24 resident, PostgREST up to 11, Realtime 6.
   - Chat 6: 20 client and 29 total; PostgREST 8, all alive since the restart; Realtime 6 plus 1 walsender.
   - I trust Chat 6 for the quiet state and treat 11 as a plausible peak, since the pool grows under bursts and stays grown. This is not a real conflict.
3. **Realtime's share of statement time.**
   - DB handoff: 24% over 22 h, before the narrowing.
   - Chat 6: 29.7% in a 10-minute window after it.
   - Both are right. Narrowing did not reduce the poll, because the poll runs per subscription, not per published table. The 10-minute window is small, so confirm over 24 h.
4. **recruit_ledger growth.**
   - Chat 9: append-only, slow growth.
   - Chat 6: 21,656 inserts and 15,715 deletes a day.
   - I trust Chat 6: the ledger churns heavily.
5. **idx_player_battle_daily_player_date.**
   - Chat 9: redundant, a prefix of the primary key.
   - Chat 6: 21,047 scans.
   - Both are true. Drop it only after EXPLAIN shows the primary key serves the same plans. It is worth only 624 KiB, so it is not ranked.
6. **Table sizes.**
   - Chat 9 quotes the 2026-10-05 audit (raw_war_log 9.8 MiB, recruit_ledger 6.9 MiB).
   - Chat 6 measured live (8.0 and 7.1).
   - I trust Chat 6.
7. **My own partial plan against Chat 6.**
   - I proposed event-driving job 38 and finalize-expired-voyages. Both are already inactive (active=false), so that part is withdrawn.
   - My kill criterion for retiring Realtime (under 5% of statement time) is not met at 29.7%, so the candidate stands.
8. **Snapshot refresh scope.** My partial plan said both snapshots refresh on every completion. The repo shows the roster is already scoped to the ingestor and nightly maintenance. S1 is corrected to match.

## Dependencies (what must land before what)

1. **Baseline first.** Chat 6 did not capture host metrics. Take Q1 before any change. Then ship one change per measurement window, or the before and after cannot be attributed.
2. **Freshness before W1 and W2.**
   - The app reads roster `last_ingested_at` as freshness evidence (SupabaseClient.ts:576-592). Guarded member rows would stop advancing it.
   - So freshness must come from the heartbeat alone, or last_ingested_at is excluded from the change test and written by one set-based statement per run.
   - Do this first, or the app shows STALE.
3. **S1, then C1, then R1.** The marker must advance on every refresh, including blacklist writes, before the client can rely on it. Realtime can retire only once both exist. The R1 commit also changes pgTAP 06 and verify-app-availability.mjs.
4. **A1's scanner fail-closed before K1.** Otherwise an event-gated guard still fires on false zeros.
5. **W1 before E1's batching.** The batched RPC should carry the guarded upsert, not reintroduce the unguarded one.
6. **X1 (declare uniques) before N1** and before any rebuild-from-migrations test.
7. **T1 is independent.** So is E1's vault cache.
8. **M1 last**, once a new measurement shows what swap remains after demand has dropped.
9. **Every schema change:**
   - read the live definition (pg_get_functiondef) before CREATE OR REPLACE, because live bodies diverge from the repo
   - pass audit:migrations, the gate, and fold-state.

## Open questions for the next measurement pass

1. **Host metrics.** Swap in/out, MemAvailable, disk read bytes and iowait, in two samples at least 120 s apart, at a quiet moment and inside 05:00-10:50 UTC. Per-process RSS if obtainable (Realtime BEAM, PostgREST, Postgres). This is the baseline for every row.
2. **The daily I/O budget hypothesis.** Retrieve the provider's disk I/O budget or burst balance for 72 h and test whether it drains on a daily rhythm, starting from the 03:00 nightly maintenance and reaching a low point around the 05:00 stall start. The Nano's disk baseline is reported as about 43 Mbps, with a burst that refills over the day; verify those provider limits and refill behavior against the source metrics. No lane has established that the balance drains or explains why the stall starts and ends at the same hours each day. That evidence decides N1's rank.
3. **Does Realtime idle when nobody subscribes?** With every client closed for 10 min: does the poll stop, and do the realtime_* backends exit? Are the about 97 schema reloads a day driven by the Broadcast partitions (pgoutput slot) whatever postgres_changes does?
4. **Is the raw payload stable?** Count distinct md5(payload::text) per clan over the retained raw_war_log, raw_river_race, raw_clan_members and raw_clan_profile rows. If every row differs, W2 needs a normalised hash.
5. **Chat 9's drift questions.**
   - the exact definition of uq_player_battle
   - the member_snapshots unique
   - the 19 undeclared indexes, with scans
   - all RLS policies
   - the live body of purge_orphan_players (does it read updated_at, as the repo says it does not)
6. **Refreshes.** MATERIALIZED_REFRESH counts and durations per day, per snapshot.
7. **Temp spills.** Which statements wrote the 185 MB of temp files (temp_blks_written per queryid)?
8. **Rollbacks and the deadlock.** Who produces the 15,405 rollbacks (8% of 183,432 commits), and what was the 1 deadlock?
9. **WAL over 24 h.** pg_stat_wal and per-statement WAL across 24 h. The 10-minute window had one ingest and no scan.
10. **Advisors.** Run `supabase db advisors --linked --type all`, which Chat 6 skipped.
11. **PostgREST pool peak.** Backend count during a scanner run (15 or 45 past the hour) against 8 at a quiet moment.
12. **Edge function failures.** How often WORKER_RESOURCE_LIMIT (546) happens and in which stage. Is fetch-player-battlelog ever invoked (Chat 8 found no caller)?
13. **Egress.** Real response sizes of the snapshot reads, which Chat 10 did not measure.
14. **Old app builds.** How many clients still read the live views (Chat 6 saw roster_view at 820 ms from a build older than v14.51.4)?

## Summary for the owner

Memory and I/O pressure are plausible contributors to the October 4, 5, and 6 morning stalls, but the available evidence does not establish a root cause. In particular, it does not show that a daily I/O budget was depleted, that swap caused the reported host disk reads, or that CPU credits were not involved. Treat these as hypotheses pending correlated incident-time host and service evidence and provider I/O balance history. The storage sample does not indicate capacity exhaustion. The demand-reduction proposals below remain candidates for mitigation, not proof of cause correction.

**Evidence clarification, 10 October 2026 (Europe/Rome):** Four saved health captures from 17:10:56 to 17:18:17 reported current reachability and successful app-facing reads. Each capture returned roster_materialized (46 rows), headhunter_materialized (250 rows), and recruit_blacklist_view (562 rows), for 12 successful read samples. One valid resource interval of 228.75 seconds reported 6.84% I/O wait, 333.36 swap-in pages/s, and 299.65 swap-out pages/s; a shorter comparison was degraded because CPU counters did not advance. Rolling 24-hour history still showed 139-141 cron startup timeouts, latest at 14:30 UTC. These short daytime observations do not establish the cause of the earlier outages or sustained recovery.

A bigger plan is off the table, so the fix is to make the database do less:
- **The data import re-saves things that have not changed.** Every half hour it saves the same weekly war log again (about 1 MB of disk writes each time) and re-saves player and member rows that are identical. There are about 114,000 player updates a day, most of them re-saving the same names.
- **The live-update feature asks "anything new?" twice a second, all day,** even though the app already refreshes every 5 minutes.
- **The diagnostic log rewrites large records several times per run.**

None of these changes touch scores or delete history. Two would change what you see: a dismissed recruit, or a voyage edit, would reach your other devices within 5 minutes instead of instantly. A side fix also stops dismissed recruits reappearing, a bug the last update introduced.

Before anything ships, one more measurement of memory and swap should be taken, so each change can be shown to help.

## Addendum 2026-10-07 01:15 (Administrator, from Chat 9 and Chat 10)

- discovery_cache HOT updates: every upsert really changes scanned_at, so an IS DISTINCT FROM guard cannot help; 0% HOT means full pages. Lever: ALTER TABLE substrate.discovery_cache SET (fillfactor = ...), applied to new pages until a rewrite; derive the value from measured row size and update rate. Table at master_migration.sql near line 265; writer public.upsert_discovery_cache.
- raw_clan_members and raw_river_race stay ungated: shred_clan_members writes the day's member_snapshots row on the first ingest of each calendar day (ON CONFLICT DO NOTHING); an identical roster across midnight would be skipped and that day would get no snapshot. Gating needs a timer-free once-per-day capture first. River-race edge: its Tier 3 week key uses now(), only relevant with no seasonId and an empty raw_war_log.
- Expose a snapshot refreshed_at to the client (Chat 10): a failed snapshot refresh still moves heartbeat last_success_at, so the app can overstate freshness until the snapshot carries its own timestamp.
- Realtime tenant restarts (~19/day) each run partition DDL with ALTER TABLE OWNER, forcing PostgREST schema reloads; Broadcast does not change this; foreground-only subscriptions may increase restarts (Chat 5).
- Laboratory capture groups never render during skeleton capture; now recorded as not captured and warned on every build (Chat 3).
- An armed epoch guard still spends its retry budget after the fail-closed change (Chat 8).

## 4. Approved design, not built: low-cost live updates (Chat 5)


Read-only design for Administrator. No DB access, no repo edits. Code read on
Beta at cb34eba8d. Sources: Supabase docs (WebFetch / search_docs) and the
supabase/realtime server source on GitHub (main).

## 0. Corrections to the brief

1. "The Android wrapper drops the socket in background": not in wrapper code.
   APK/src/com/albidr/clashmanager/MainActivity.java has only onResume (line
   781: power saving + overlay permission). No onPause/onStop/pauseTimers.
   The drop comes from Android freezing the backgrounded WebView: heartbeats
   stop and the server closes the socket. It is documented at
   Frontend-PWA/src/core/api/RecruitClient.ts:380-390. Desktop browsers do NOT
   drop it: a hidden desktop tab keeps its subscription, so an open desktop tab
   is the likely 24/7 source of the WAL poll.

2. "Daily partition DDL": the server source says it is per tenant START, not
   per day. lib/realtime/tenants/connect.ex runs, on every tenant connect,
   Migrations.run_migrations and Tenants.create_messages_partitions.
   lib/realtime/tenants.ex create_messages_partitions loops yesterday..today+3
   (5 dates) and for each runs, in its own transaction:
     CREATE TABLE IF NOT EXISTS realtime.messages_YYYY_MM_DD PARTITION OF ...
     ALTER TABLE realtime.messages_YYYY_MM_DD OWNER TO supabase_realtime_admin
   The ALTER runs unconditionally, even when the table exists. ALTER TABLE is
   in the command list of Supabase's PostgREST event trigger
   (extensions.pgrst_ddl_watch), so each tenant start can emit up to 5
   NOTIFY pgrst 'reload schema'. 97/day is about 19-20 tenant starts x 5.
   Source-derived, NOT measured: Chat 6 should confirm (section 6).
   A tenant stops after ~10 min with zero connected clients (connect.ex:
   check every 60 s, shutdown when a 10-bucket window is all zero), so the
   next client after a quiet gap is a new start.
   Consequence: Broadcast does not change this cost at all, and
   foreground-only subscriptions can RAISE it (more cold starts).

3. "Fall back to the 5-minute poll, which stays regardless": true for the
   blacklist (main.ts:249 calls clashDataStore.startBackgroundSync, which
   reloads the headhunter snapshot), FALSE for the voyage. Nothing in the poll
   or the visibility refresh touches useVoyageStore. Voyage refresh() runs
   only on VoyageBanner/EventManagement mount (VoyageBanner sits in RosterView
   under KeepAlive, so it mounts once), countdown expiry (useVoyageStatus),
   own actions, and Realtime events. The voyage channel also has no status
   callback, so events missed while the socket was down are never recovered
   until the next event. This must be fixed in Step 1.

4. Unverified side note: migration 20260915192014 dropped the voyage read
   policies, claiming broader policies cover them. If anon cannot SELECT the
   voyage tables under RLS, today's voyage postgres_changes delivers nothing
   to anon while still costing the poll. Chat 6 can check pg_policies.

## 1. What costs what (docs + source)

Docs, Realtime Concepts, "Database connections" (Nano row):
- Broadcast from database: 1 connection, "always started"
- Authorization pool: 2, "always started"
- Postgres Changes: subscription management 2, cleanup 2, WAL pull 2,
  "only started if you use Postgres Changes"
The 2+2+2 Postgres-Changes-only pools match the measured 6 backends.
"Always started" means while the tenant is up, i.e. while >= 1 client is
connected (connect.ex starts the replication connection unconditionally on
tenant connect).

Postgres Changes poll: lib/extensions/postgres_cdc_rls/replication_poller.ex
reads via realtime.list_changes (wal2json over a TEMPORARY slot), polls at
poll_interval_ms and backs off x5 when idle. Default 100 ms x 5 = 500 ms,
which matches the measured "about twice a second". It is SQL, so it lands in
pg_stat_statements. The CDC extension starts only when a channel joins with a
postgres_changes config (cdc_rls.ex) and stops 10 min after its last
subscriber leaves (subscription_manager.ex: @check_no_users_interval 60_000,
@stop_after 600_000).

Broadcast from database: lib/realtime/tenants/replication_connection.ex
streams (START_REPLICATION ... pgoutput) from publication
supabase_realtime_messages_publication over a TEMPORARY slot. Push, not poll,
no SQL statements per tick. It exists TODAY already whenever a client is
connected, so Broadcast adds no new connection. Caveat: a walsender decodes
all WAL while connected (pgoutput filters to realtime.messages), CPU that does
not show in pg_stat_statements.

Docs (postgres-changes page): every change is authorized against each
subscriber and processed on a single thread; recommends Broadcast to stream
database changes at scale. Docs (subscribing-to-database-changes): Broadcast
is "the recommended method for scalability and security".

## 2. Answers to the direct questions

Does a Broadcast-only channel keep a Realtime backend resident?
Yes, while at least one client is connected: the replication walsender (1)
plus up to 2 authorization connections. These exist today too. The 6 CDC
connections and the twice-a-second list_changes poll disappear entirely.

Idle cost with zero clients?
About 10 min after the last client leaves, the tenant shuts down: 0 Realtime
backends, temporary slot dropped, no WAL retention. What remains is the
trigger: one INSERT into realtime.messages per changing write statement,
rows kept 72 h to 4 days (partition drop). If no partition exists for that
day (no client for ~4 days, since connect pre-creates yesterday..today+3),
realtime.send swallows the error with a WARNING ("captures errors to prevent
the trigger from breaking", Concepts page), so the business write still
commits.

Which function exists on this project's Realtime version?
Both realtime.send and realtime.broadcast_changes are created by Realtime's
own tenant migrations, which run on every tenant connect; realtime-js 2.117.1
(node_modules) already supports private channels, httpSend and replay.
Not verified against the DB (no access). The migration must guard:
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL
  THEN RAISE EXCEPTION ...
Chat 6 can confirm in pg_proc beforehand.
Use realtime.send, not broadcast_changes: send carries a custom minimal
payload; broadcast_changes ships whole NEW/OLD rows (recruit_blacklist carries
a snapshot jsonb) and is shaped for per-row triggers.

## 3. Step 1: foreground-only subscriptions (client only)

Files:
- Frontend-PWA/src/core/utils/visibility.ts: add one shared primitive, e.g.
  onForegroundChange(cb: (visible: boolean) => void): () => void, next to
  registerVisibilityRefresh.
- Frontend-PWA/src/core/api/RecruitClient.ts: keep the subscriber-lease API
  (subscribeToBlacklist unchanged for callers). The physical channel follows
  visibility: hidden -> removeChannel (subscribers set kept); visible ->
  open a new channel. Serialize: the next open awaits the pending
  removeChannel. That replaces the topic-generation trick
  (nextBlacklistChannelName), which Step 2 cannot keep because a Broadcast
  topic must equal the DB topic. Resync: today onResync fires only after an
  interruption (wasInterrupted); also fire it on the first SUBSCRIBED after a
  deliberate hidden-close. Not on the first subscribe of the app lifetime (the
  initial load covers it).
- Frontend-PWA/src/shared/composables/useVoyageStore.ts: subscribe only when
  status is ACTIVE/PENDING AND visible; hidden -> removeChannel (not
  unsubscribe, so the socket closes when no channel remains:
  RealtimeClient.removeChannel disconnects when the list is empty); add a
  subscribe status callback that calls refresh() on every SUBSCRIBED after a
  gap; make refresh() single-flight with one trailing rerun (event-derived
  coalescing, no timer), because today every row event triggers a full
  2-query refresh.

How the gap is covered:
- Blacklist: SUBSCRIBED after reopen -> notifyBlacklistResync
  (RecruitClient.ts:94) -> useHeadhunter.ts:150 onResync ->
  clashDataStore.refreshFromSupabase(). On Android this already happens on
  every return today (the frozen WebView drops the socket, wasInterrupted is
  set), so Step 1 adds no reads there; on desktop it adds one snapshot read
  per tab re-show, cheap since 991da3349 serves the sync from materialized
  snapshots.
- Voyage: the new SUBSCRIBED -> refresh() path (did not exist).
- Backstop: 5-min foreground poll (blacklist only) and
  registerVisibilityRefresh after 30 min hidden.

Optional later: Broadcast replay (private channels only, max 25 messages,
retention 72 h..4 d, meta.replayed) could replace the resync read, but there
is no end-of-replay marker, so proving a gap was fully covered needs a
heuristic. Not recommended now.

Route scoping (blacklist only on the Headhunter view) is possible but the
badge count is app-wide; visibility scoping is the simple win.

## 4. Step 2: Broadcast from the database

Migration A (ship with the client switch):
Backend/supabase/migrations/<ts>_broadcast_live_updates.sql

  -- guard: realtime.send must exist
  CREATE OR REPLACE FUNCTION drivers.broadcast_live_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
  AS $$
  DECLARE v_payload jsonb;
  BEGIN
    -- Branch by TG_OP: a transition table only exists for the op that
    -- captured it, and PL/pgSQL parses each statement lazily.
    IF TG_OP = 'DELETE' THEN
      IF NOT EXISTS (SELECT 1 FROM changed_old) THEN RETURN NULL; END IF;
      v_payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP);
    ELSE
      IF NOT EXISTS (SELECT 1 FROM changed_new) THEN RETURN NULL; END IF;
      v_payload := jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP);
      IF TG_TABLE_NAME = 'recruit_blacklist' THEN
        v_payload := v_payload || jsonb_build_object(
          'tags', (SELECT jsonb_agg(player_tag) FROM changed_new));
      END IF;
    END IF;
    PERFORM realtime.send(v_payload, TG_OP, TG_ARGV[0], true);
    RETURN NULL;
  END $$;

  Triggers, statement level with transition tables (one message per
  statement, zero-row statements send nothing):
  - drivers.recruit_blacklist: AFTER INSERT REFERENCING NEW TABLE AS
    changed_new; AFTER DELETE REFERENCING OLD TABLE AS changed_old;
    arg 'cm:blacklist'. INSERT/DELETE only, parity with today's listeners.
    purge_expired_blacklist (bulk DELETE) becomes 1 message, where today it
    is N postgres_changes events and N full refreshes on every device.
  - drivers.clan_voyage and drivers.clan_voyage_contributions: AFTER INSERT
    OR UPDATE OR DELETE, REFERENCING OLD TABLE AS changed_old NEW TABLE AS
    changed_new, arg 'cm:voyage'. Note contributions are updated once per
    battle by the battle trigger path, so an ingest batch is still several
    messages; the client's single-flight refresh absorbs that.

  Authorization (anon, private channel):
  CREATE POLICY "anon receives cm live broadcasts" ON realtime.messages
    FOR SELECT TO anon
    USING (realtime.messages.extension = 'broadcast'
           AND (SELECT realtime.topic()) IN ('cm:blacklist', 'cm:voyage'));
  No INSERT policy, so no client can send on these private topics; only the
  SECURITY DEFINER trigger publishes. Private and public channels with the
  same topic are distinct (Concepts page), so a spoofed public
  'cm:blacklist' never reaches our subscribers even if "Allow public access"
  stays on.
  Role resolution: SupabaseClient.ts:110 sets accessToken: async () => null,
  so the join carries no access_token and Realtime falls back to the
  publishable apikey, i.e. anon. Today's anon postgres_changes RLS works the
  same way, which is good evidence, but a private join with a non-JWT
  publishable key is the top risk: verify on a branch or with a throwaway
  topic before the client switch. Fallback if refused: public channel
  (realtime.send(..., false), no policy), client treats every payload as a
  hint only and does the single-flight refresh, so a spoofed event costs one
  snapshot read per device.

Client (same release as migration A):
- RecruitClient.ts: supabase.channel('cm:blacklist', { config: { private:
  true } }).on('broadcast', { event: 'INSERT' } ...).on('broadcast',
  { event: 'DELETE' } ...). INSERT -> onInsert per tag (local removal, as
  today); DELETE -> onDelete (full refresh, as today, but once per statement).
  Keep the refusal-vs-drop logic.
- RecruitSchemas.ts: BlacklistBroadcastSchema (valibot) for {table, op,
  tags?}.
- useVoyageStore.ts: channel 'cm:voyage', private, any broadcast event ->
  single-flight refresh().
- Frontend-PWA/src/core/api/README.md line 33 mentions the postgres payload
  validation; update.

Migration B (later, after the new client is verified live):
  ALTER PUBLICATION supabase_realtime DROP TABLE drivers.recruit_blacklist,
    drivers.clan_voyage, drivers.clan_voyage_contributions (guarded like
    20261006203000);
  ALTER TABLE drivers.recruit_blacklist REPLICA IDENTITY DEFAULT;
  This is what forces any stale client's CDC to stop and ends the extra WAL
  from REPLICA IDENTITY FULL. Keep it separate so rollback before B is a pure
  client revert.

## 5. Rollback

- Step 1: revert the client commit.
- Step 2 before migration B: revert the client commit; the publication still
  carries the tables, postgres_changes works at once. Triggers and policy can
  stay (inert: one small insert per write statement) or be dropped later.
- After migration B: new migration re-adding the tables (the body of
  20261004105808 is idempotent) plus REPLICA IDENTITY FULL, then client
  revert.
- Runtime misbehaviour (join refused): the existing refusal path reports once
  (RecruitClient.ts:407-412); blacklist converges via the 5-min poll; voyage
  converges only if Step 1's voyage resync has landed (see correction 3).
- A Realtime outage cannot fail a dismissal or an ingest: realtime.send
  catches its own errors.

## 6. Risks

1. Anon private join with a publishable (non-JWT) key: verify first.
2. Partition DDL and schema reloads are unchanged by Step 2 and can rise with
   Step 1 (each foreground after a >= 10 min quiet gap is a tenant cold start:
   run_migrations + 5 ALTER TABLE OWNER). Not fixable from the repo: the
   event trigger and Realtime's partition code are Supabase-managed.
3. Fixed Broadcast topic: open must await the previous removeChannel, or
   channel(topic) returns the leaving instance (the reason the generation
   suffix exists today).
4. Trigger runs inside business transactions: cost one INSERT per changing
   statement; errors swallowed by realtime.send.
5. Baseline checkers: run all three (audit:migrations, gate step 5,
   fold-state) since the migration adds triggers and a policy on the
   Supabase-managed realtime schema.
6. pgTAP in CI: realtime.messages has no partition unless Realtime connected;
   the test must create today's partition inside its rolled-back transaction
   before asserting message rows.

## 7. Tests

pgTAP (rewrite Backend/supabase/tests/database/06_blacklist_realtime.test.sql,
which asserts publication membership and REPLICA IDENTITY 'f', both of which
flip with migration B):
- function is SECURITY DEFINER with search_path ''; triggers exist on the
  three tables at statement level
- policy exists for anon SELECT on realtime.messages; no anon INSERT policy
- one dismiss of 3 tags -> exactly 1 message, topic cm:blacklist, private,
  event INSERT, payload tags has 3 entries
- bulk DELETE of N rows -> 1 message; zero-row UPDATE/DELETE on
  contributions -> 0 messages
- after migration B: tables absent from supabase_realtime
Vitest:
- RecruitClient.spec.ts: channel opens on visible, removed on hidden, reopen
  awaits pending removal (replaces the generation test near line 548),
  resync fires after a hidden-close and after an interruption but not on the
  first subscribe, refusal still reported once, payload validation.
- useVoyageStore.spec.ts: subscribes only when active/pending and visible;
  refresh on SUBSCRIBED after a gap; N events -> at most 2 refreshes.
Device (apk-device-testing skill): dismiss on the emulator, see it on a
desktop tab instantly; background CM Dev, dismiss elsewhere, resume, change
applied. Never force-stop CM Dev.

## 8. Measurement for Chat 6 (before/after each step separately)

Read pg_stat_statements as deltas over equal windows.
1. Realtime statement share: realtime.list_changes plus realtime.subscription
   queries as a share of total exec time. Expect ~0 after Step 2.
2. Backends: pg_stat_activity grouped by application_name and backend_type,
   sampled with a client connected and 15 min after the last client hides.
   Expect after Step 2: <= 3 (1 walsender + <= 2 auth) with a client,
   0 without.
3. pg_replication_slots: CDC slot absent after Step 2; messages slot only
   while a client is connected.
4. Tenant starts vs schema reloads: count Realtime log lines "Creating
   partitions for realtime.messages" and PostgREST schema-cache reloads per
   day; expect roughly 1:5. This confirms correction 2 and is the one metric
   that may get worse under Step 1.
5. realtime.messages rows per day = number of changing write statements on
   the three tables.
6. Functional: dismiss-to-other-device latency stays sub-second.

## 5. Other parked work

- W1, unchanged-row guards (sync_players, sync_recruits, the clan-members, river-race and war-log shredders): migration and 12-assertion pgTAP test were drafted and held, never dry-run. Players skipped when the name is unchanged; roster members skipped when no data column changed; inactive members keep being touched so purge_inactive_members (keyed on updated_at) still works. discovery_cache needs no guard: scanned_at really changes every upsert; its 0% HOT comes from full pages, lever is fillfactor.
- W2 for raw_clan_members and raw_river_race stays deferred: shred_clan_members writes the day's member_snapshots row on the first ingest of each calendar day; an identical roster across midnight would skip that day's snapshot. Needs a timer-free once-per-day capture first.
- Expose a snapshot refreshed_at to the client: a failed snapshot refresh still moves heartbeat last_success_at.
- Dock closes open overlays before navigating (Chat 2 design, approved): export deleteOverlayEntries(): Promise<void> from useDismissOnBack; NavigationDock awaits it before navigateToTab; the promise must never hang the dock (resolve at once when history.state carries no open id; the next popstate of any kind or the next call settles an earlier promise; navigate even on rejection). Fixes the case where a dock tap to Roster from Laboratory lands on Headhunter after a replace-while-open.
- When Back itself closes an overlay, the entry is never recorded as dead, so after a replace-and-push sequence one later Back is wasted (ADR Compliance, WKWebView).
- Laboratory skeleton capture groups never render on /laboratory; LaboratorySkeleton always uses fallbacks. Now a visible warning on every build.
- An armed epoch guard still spends its retry budget after the fail-closed change.
- Client: PGRST003 (pool timeout) is still retried; the app's own 8 s read deadline is still retried. A dismissal arriving by realtime does not add the tag to data.blacklist, so a failed blacklist read can let it reappear until a good read; caches written before the fix may hold an empty blacklist.
- Telemetry: on an API outage the failures-only log is still unbounded (about 2000 entries); the final update_telemetry error is discarded.
- Realtime tenant restarts (about 19 a day) each run partition DDL with ALTER TABLE OWNER, forcing PostgREST schema reloads. Neither Broadcast nor foreground-only subscriptions change this; foreground-only may increase it.
- The ingest edge function hit WORKER_RESOURCE_LIMIT (546) at 04:00 UTC on Oct 6, before the stall.
- The "Database sync errors" session's live checks: both snapshots answer anon reads in 0.44-0.77 s; MATERIALIZED_REFRESH_LOCK_TIMEOUT=5s; trigger tr_pipeline_completed_refresh enabled.

## Appendix A. Parked W1 migration (drafted, never dry-run, never committed)

Planned path: Backend/supabase/migrations/20261006220000_skip_unchanged_player_member_rewrites.sql. Before committing: get the live name of the member_snapshots (player_tag, snapshot_date) unique index and declare it IF NOT EXISTS; run Chat 6's rolled-back dry run; register the sha256 in .github/nightly-config/migration-quality.json.

```sql
-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- Upserts into drivers.players and drivers.members rewrote every row they
-- matched, changed or not (players about 114k updates a day, 33% HOT), and each
-- members rewrite also fired its heritage and exclusion triggers. Each upsert
-- now updates only when a stored value differs. Inactive members are still
-- touched by the race and war shredders, because purge_inactive_members ages
-- them by updated_at. Rationale in the commit message.

CREATE OR REPLACE FUNCTION public.sync_players(p_players jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT (val->>'player_tag')::TEXT, (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_players) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET player_name = EXCLUDED.player_name
    WHERE drivers.players.player_name IS DISTINCT FROM EXCLUDED.player_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name = EXCLUDED.player_name,
        updated_at = NOW()
    WHERE drivers.players.player_name IS DISTINCT FROM EXCLUDED.player_name;

    INSERT INTO drivers.recruits (
        player_tag,
        player_name,
        trophies,
        donations,
        war_wins,
        win_rate,
        cards,
        raw_potential_score,
        score_composition,
        source,
        status,
        last_scan
    )
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT,
        COALESCE((val->>'trophies')::INTEGER, 0),
        COALESCE((val->>'donations')::INTEGER, 0),
        COALESCE((val->>'war_wins')::INTEGER, 0),
        COALESCE((val->>'win_rate')::NUMERIC, 0.0),
        COALESCE((val->>'cards')::INTEGER, 0),
        (val->>'raw_potential_score')::NUMERIC,
        NULLIF(val->'score_composition', 'null'::jsonb),
        COALESCE(NULLIF((val->>'source')::TEXT, ''), 'TOURNAMENT'),
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    WHERE (val->>'raw_potential_score') IS NOT NULL
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name         = EXCLUDED.player_name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        war_wins            = EXCLUDED.war_wins,
        win_rate            = EXCLUDED.win_rate,
        cards               = EXCLUDED.cards,
        raw_potential_score = EXCLUDED.raw_potential_score,
        score_composition   = EXCLUDED.score_composition,
        source              = drivers.recruits.source,
        status              = EXCLUDED.status,
        last_scan           = NOW()
    WHERE
        drivers.recruits.trophies IS DISTINCT FROM EXCLUDED.trophies OR
        drivers.recruits.donations IS DISTINCT FROM EXCLUDED.donations OR
        drivers.recruits.war_wins IS DISTINCT FROM EXCLUDED.war_wins OR
        drivers.recruits.win_rate IS DISTINCT FROM EXCLUDED.win_rate OR
        drivers.recruits.cards IS DISTINCT FROM EXCLUDED.cards OR
        drivers.recruits.raw_potential_score IS DISTINCT FROM EXCLUDED.raw_potential_score OR
        drivers.recruits.score_composition IS DISTINCT FROM EXCLUDED.score_composition OR
        drivers.recruits.status IS DISTINCT FROM EXCLUDED.status OR
        drivers.recruits.last_scan < NOW() - INTERVAL '15 minutes';
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_clan_tag TEXT;
    v_recruit_tag TEXT;
BEGIN
    -- Identify the target clan
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- 1. UPSERT participants into universal players registry first to satisfy FKs
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT
        m->>'tag',
        m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now()
    WHERE drivers.players.player_name IS DISTINCT FROM EXCLUDED.player_name;

    -- 2. UPSERT current members into drivers.members
    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies,
        donations, donations_received, clan_rank, last_seen_at,
        last_ingested_at, is_active, updated_at, current_clan_tag
    )
    SELECT
        m->>'tag',
        m->>'name',
        m->>'role',
        (m->>'expLevel')::INT,
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'clanRank')::INT,
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        now(),
        TRUE,
        now(),
        v_clan_tag
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name          = EXCLUDED.player_name,
        role                 = EXCLUDED.role,
        exp_level            = EXCLUDED.exp_level,
        trophies             = EXCLUDED.trophies,
        donations            = EXCLUDED.donations,
        donations_received   = EXCLUDED.donations_received,
        clan_rank            = EXCLUDED.clan_rank,
        -- [FIX] Monotonic guard: never allow last_seen_at to move backwards.
        -- The CR API lastSeen field is event-triggered, not polled. A sync may
        -- return an older timestamp than what is already stored (API cache lag).
        -- GREATEST ensures we keep the most recent known activity timestamp.
        last_seen_at         = GREATEST(drivers.members.last_seen_at, EXCLUDED.last_seen_at),
        last_ingested_at     = EXCLUDED.last_ingested_at,
        is_active            = TRUE,
        current_clan_tag     = EXCLUDED.current_clan_tag,
        updated_at           = now()
    -- last_ingested_at is left out of the comparison: an unchanged roster
    -- entry is not rewritten just to restamp it.
    WHERE (drivers.members.player_name, drivers.members.role, drivers.members.exp_level,
           drivers.members.trophies, drivers.members.donations, drivers.members.donations_received,
           drivers.members.clan_rank, drivers.members.last_seen_at, drivers.members.is_active,
           drivers.members.current_clan_tag)
          IS DISTINCT FROM
          (EXCLUDED.player_name, EXCLUDED.role, EXCLUDED.exp_level,
           EXCLUDED.trophies, EXCLUDED.donations, EXCLUDED.donations_received,
           EXCLUDED.clan_rank, GREATEST(drivers.members.last_seen_at, EXCLUDED.last_seen_at), EXCLUDED.is_active,
           EXCLUDED.current_clan_tag);

    -- 2.5. Capture today's daily snapshot for growth/trend tracking. Fires
    -- once per member per calendar day: only the first ingestion of the day
    -- inserts a row, later same-day ingestions are no-ops via ON CONFLICT.
    INSERT INTO drivers.member_snapshots (
        player_tag, trophies, donations, donations_received, last_seen,
        snapshot_date, snapshot_at
    )
    SELECT
        m->>'tag',
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        CURRENT_DATE,
        now()
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag, snapshot_date) DO NOTHING;

    -- 3. DEACTIVATE LEAVERS
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND current_clan_tag = v_clan_tag
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM jsonb_array_elements(NEW.payload->'items') AS elem
      );

    -- 4. CLEANUP RECRUITS (Harmonization)
    -- If an active member is found in the recruits table, they have "joined us".
    -- We delete them from the active recruitment pool and log the event.
    FOR v_recruit_tag IN
        SELECT r.player_tag
        FROM drivers.recruits r
        JOIN jsonb_array_elements(NEW.payload->'items') AS m ON (m->>'tag' = r.player_tag)
    LOOP
        -- Log the transition
        INSERT INTO drivers.recruit_ledger (player_tag, event_type, description)
        VALUES (v_recruit_tag, 'JOINED_US', 'Recruit detected in active roster payload.');

        -- Delete from recruits
        DELETE FROM drivers.recruits WHERE player_tag = v_recruit_tag;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.shred_river_race()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_live_season_id   TEXT;
    current_season_id  TEXT;
    target_week_id     TEXT;
    v_clan_tag         TEXT;
BEGIN
    v_clan_tag := NEW.payload->'clan'->>'tag';

    -- Tier 1: Read seasonId directly from the live race payload.
    -- The /currentriverrace API returns seasonId at the top level on every
    -- active-war response. Using this as the primary source guarantees the
    -- week_id format matches what shred_war_log() will produce once the war
    -- ends, eliminating the ghost-row risk at season boundaries.
    v_live_season_id := NEW.payload->>'seasonId';

    IF v_live_season_id IS NOT NULL THEN
        target_week_id := v_live_season_id || '-' || (NEW.payload->>'sectionIndex');

    ELSE
        -- Tier 2 (existing logic): Fall back to the most recently ingested
        -- completed war's seasonId from raw_war_log.
        -- [THREAT:] Cross-table read introduces a dependency on ingestion order.
        -- Acceptable because this path only fires when seasonId is absent from
        -- the live payload (e.g. training-day warm-up state, or an unexpected
        -- API response shape change).
        SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
        FROM substrate.raw_war_log
        ORDER BY ingested_at DESC LIMIT 1;

        IF current_season_id IS NOT NULL THEN
            target_week_id := current_season_id || '-' || (NEW.payload->>'sectionIndex');

        ELSE
            -- Tier 3 (last resort): ISO calendar week.
            -- Only reached when no war has ever completed in this database
            -- instance and the live payload also lacks a seasonId.
            -- [THREAT:] Produces a week_id that will not match the canonical
            -- format once the first war completes. Acceptable as a safety net
            -- for edge-case cold starts; the conflict key ensures no real data
            -- is lost -- a new row is simply inserted under a transient key.
            target_week_id := to_char(now(), 'YYYY-"W"WW');

        END IF;
    END IF;

    -- 1. Ensure players exist in universal registry (L2 Players)
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT p->>'tag', p->>'name'
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now()
    WHERE drivers.players.player_name IS DISTINCT FROM EXCLUDED.player_name;

    -- 2. Ensure members exist (L2 Members) - Lazy creation to satisfy FK
    -- Default is_active to FALSE. Roster Sync will toggle it TRUE if they are
    -- actually in the clan.
    INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
    SELECT p->>'tag', p->>'name', v_clan_tag, FALSE, now()
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name      = EXCLUDED.player_name,
        current_clan_tag = EXCLUDED.current_clan_tag,
        -- is_active = EXCLUDED.is_active, -- REMOVED: Do not override active status here
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at       = now()
    -- Inactive rows are still touched every time: purge_inactive_members ages
    -- them by updated_at, and that clock must keep its meaning.
    WHERE drivers.members.is_active IS NOT TRUE
       OR (drivers.members.player_name, drivers.members.current_clan_tag)
          IS DISTINCT FROM (EXCLUDED.player_name, EXCLUDED.current_clan_tag);

    -- 3. Update war activity for participants
    INSERT INTO drivers.war_activity (
        player_tag, player_name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT
        p->>'tag', p->>'name', target_week_id, (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT, (p->>'decksUsedToday')::INT, (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        decks_used       = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame             = EXCLUDED.fame,
        updated_at       = now();

    -- 4. Sync back high-level metrics to members table
    UPDATE drivers.members m
    SET
        decks_used_today  = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame         = p.p_fame,
        current_clan_tag  = v_clan_tag,
        last_ingested_at  = now()
    FROM (
        SELECT
            p->>'tag'                   AS p_tag,
            (p->>'fame')::INT           AS p_fame,
            (p->>'decksUsed')::INT      AS p_decks_used,
            (p->>'decksUsedToday')::INT AS p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag
      AND (m.is_active IS NOT TRUE
           OR (m.decks_used_today, m.decks_used_weekly, m.week_fame, m.current_clan_tag)
              IS DISTINCT FROM (p.p_decks_used_today, p.p_decks_used, p.p_fame, v_clan_tag));

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.shred_war_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_item JSONB;
    v_standing JSONB;
    v_participant JSONB;
    v_week_id TEXT;
BEGIN
    -- 1. Update Clan History (Standings) for all clans in the log
    -- This provides benchmarking data for opponents.
    INSERT INTO drivers.war_history (clan_tag, clan_name, week_id, fame, rank, clan_points)
    SELECT
        (standing->'clan'->>'tag')::TEXT,
        (standing->'clan'->>'name')::TEXT,
        (item->>'seasonId')::TEXT || '-' || (item->>'sectionIndex')::TEXT,
        (standing->'clan'->>'fame')::INTEGER,
        (standing->>'rank')::INTEGER,
        (standing->'clan'->>'clanScore')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE (standing->'clan'->>'tag') IS NOT NULL
    ON CONFLICT (clan_tag, week_id) DO UPDATE SET
        clan_name    = EXCLUDED.clan_name,
        fame         = EXCLUDED.fame,
        rank         = EXCLUDED.rank,
        clan_points  = EXCLUDED.clan_points,
        updated_at   = NOW();

    -- 2. Extract and Shred Participants for the targeted clan
    -- We loop through items to ensure we handle the nested structure correctly and satisfy FKs
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.payload->'items')
    LOOP
        v_week_id := (v_item->>'seasonId') || '-' || (v_item->>'sectionIndex');
        
        FOR v_standing IN SELECT * FROM jsonb_array_elements(v_item->'standings')
        LOOP
            -- Only process participants for the clan that owns this log entry
            IF (v_standing->'clan'->>'tag') = NEW.clan_tag THEN
                
                -- A. Ensure players exist in universal registry
                INSERT INTO drivers.players (player_tag, player_name)
                SELECT p->>'tag', p->>'name'
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    updated_at  = now()
                WHERE drivers.players.player_name IS DISTINCT FROM EXCLUDED.player_name;

                -- B. Ensure members exist (Lazy creation to satisfy war_activity FK)
                -- We set is_active to FALSE by default; the roster sync will set it TRUE if they are currently in the clan.
                INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
                SELECT p->>'tag', p->>'name', NEW.clan_tag, FALSE, now()
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    updated_at = now()
                -- Inactive rows are still touched, as in shred_river_race.
                WHERE drivers.members.is_active IS NOT TRUE
                   OR drivers.members.player_name IS DISTINCT FROM EXCLUDED.player_name;

                -- C. Upsert War Activity
                INSERT INTO drivers.war_activity (
                    player_tag, player_name, week_id, section_index,
                    decks_used, fame
                )
                SELECT
                    p->>'tag',
                    p->>'name',
                    v_week_id,
                    (v_item->>'sectionIndex')::INTEGER,
                    (p->>'decksUsed')::INTEGER,
                    (p->>'fame')::INTEGER
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag, week_id) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    decks_used  = EXCLUDED.decks_used,
                    fame        = EXCLUDED.fame,
                    updated_at  = NOW();
            END IF;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$function$;

COMMIT;
```

### Appendix A.1 pgTAP test (planned Backend/supabase/tests/database/11_skip_unchanged_rewrites.test.sql)

```sql
-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

-- A rewritten row gets a new ctid even inside one transaction, so ctid shows
-- whether an upsert touched a row; pg_stat_xact_user_tables counts the rest.
CREATE TEMP TABLE versions (step text, player_tag text, member_ctid tid, player_ctid tid,
  last_seen_at timestamptz, members_upd bigint, players_upd bigint);
CREATE TEMP VIEW versions_now AS
SELECT m.player_tag, m.ctid AS member_ctid, p.ctid AS player_ctid, m.last_seen_at,
  (SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid = 'drivers.members'::regclass) AS members_upd,
  (SELECT n_tup_upd FROM pg_stat_xact_user_tables WHERE relid = 'drivers.players'::regclass) AS players_upd
FROM drivers.members AS m
JOIN drivers.players AS p USING (player_tag)
WHERE m.player_tag IN ('#Q0G0G0G2', '#Q0G0G0G8');

-- #Q0G0G0G8 left the clan earlier: an inactive member the shredders still see.
INSERT INTO drivers.players (player_tag, player_name) VALUES ('#Q0G0G0G8', 'Guard Leaver');
INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active)
VALUES ('#Q0G0G0G8', 'Guard Leaver', '#Q0G0G0G0', false);

INSERT INTO substrate.raw_clan_members (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"items": [{"tag": "#Q0G0G0G2", "name": "Guard Probe", "role": "member", "expLevel": 50, "trophies": 9000, "donations": 10, "donationsReceived": 5, "clanRank": 1, "lastSeen": "2026-10-06T10:00:00Z"}]}');
INSERT INTO versions SELECT 'roster_first', * FROM versions_now;

INSERT INTO substrate.raw_clan_members (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"items": [{"tag": "#Q0G0G0G2", "name": "Guard Probe", "role": "member", "expLevel": 50, "trophies": 9000, "donations": 10, "donationsReceived": 5, "clanRank": 1, "lastSeen": "2026-10-06T10:00:00Z"}]}');
INSERT INTO versions SELECT 'roster_same', * FROM versions_now;

INSERT INTO substrate.raw_clan_members (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"items": [{"tag": "#Q0G0G0G2", "name": "Guard Probe", "role": "member", "expLevel": 50, "trophies": 9000, "donations": 10, "donationsReceived": 5, "clanRank": 1, "lastSeen": "2026-10-06T09:00:00Z"}]}');
INSERT INTO versions SELECT 'roster_older_seen', * FROM versions_now;

INSERT INTO substrate.raw_clan_members (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"items": [{"tag": "#Q0G0G0G2", "name": "Guard Probe", "role": "member", "expLevel": 50, "trophies": 9000, "donations": 10, "donationsReceived": 5, "clanRank": 1, "lastSeen": "2026-10-06T11:00:00Z"}]}');
INSERT INTO versions SELECT 'roster_newer_seen', * FROM versions_now;

SELECT ok(
  (SELECT s.members_upd = f.members_upd AND s.players_upd = f.players_upd
   FROM versions f JOIN versions s USING (player_tag)
   WHERE f.step = 'roster_first' AND s.step = 'roster_same' AND f.player_tag = '#Q0G0G0G2'),
  'an identical roster response updates no member and no player row'
);
SELECT ok(
  (SELECT s.member_ctid = f.member_ctid AND s.player_ctid = f.player_ctid
   FROM versions f JOIN versions s USING (player_tag)
   WHERE f.step = 'roster_first' AND s.step = 'roster_same' AND f.player_tag = '#Q0G0G0G2'),
  'the unchanged member and player keep their row versions'
);
SELECT ok(
  (SELECT o.member_ctid = s.member_ctid AND o.last_seen_at = '2026-10-06T10:00:00Z'::timestamptz
   FROM versions s JOIN versions o USING (player_tag)
   WHERE s.step = 'roster_same' AND o.step = 'roster_older_seen' AND s.player_tag = '#Q0G0G0G2'),
  'an older lastSeen neither rewrites the member nor moves last_seen_at back'
);
SELECT ok(
  (SELECT n.member_ctid <> o.member_ctid AND n.last_seen_at = '2026-10-06T11:00:00Z'::timestamptz
   FROM versions o JOIN versions n USING (player_tag)
   WHERE o.step = 'roster_older_seen' AND n.step = 'roster_newer_seen' AND o.player_tag = '#Q0G0G0G2'),
  'a newer lastSeen still updates the member'
);

-- The player-registry bridges used by the Edge Functions.
SELECT public.sync_players('[{"player_tag": "#Q0G0G0G2", "player_name": "Guard Probe"}]');
INSERT INTO versions SELECT 'sync_players_same', * FROM versions_now;
SELECT public.sync_recruits('[{"player_tag": "#Q0G0G0G2", "player_name": "Guard Probe"}]');
INSERT INTO versions SELECT 'sync_recruits_same', * FROM versions_now;
SELECT public.sync_players('[{"player_tag": "#Q0G0G0G2", "player_name": "Guard Probe Renamed"}]');
INSERT INTO versions SELECT 'sync_players_renamed', * FROM versions_now;

SELECT ok(
  (SELECT a.player_ctid = b.player_ctid FROM versions b JOIN versions a USING (player_tag)
   WHERE b.step = 'roster_newer_seen' AND a.step = 'sync_players_same' AND b.player_tag = '#Q0G0G0G2'),
  'sync_players leaves an unchanged player row alone'
);
SELECT ok(
  (SELECT a.player_ctid = b.player_ctid FROM versions b JOIN versions a USING (player_tag)
   WHERE b.step = 'sync_players_same' AND a.step = 'sync_recruits_same' AND b.player_tag = '#Q0G0G0G2'),
  'sync_recruits leaves an unchanged player row alone'
);
SELECT ok(
  (SELECT a.player_ctid <> b.player_ctid FROM versions b JOIN versions a USING (player_tag)
   WHERE b.step = 'sync_recruits_same' AND a.step = 'sync_players_renamed' AND b.player_tag = '#Q0G0G0G2')
  AND (SELECT player_name = 'Guard Probe Renamed' FROM drivers.players WHERE player_tag = '#Q0G0G0G2'),
  'a renamed player is still updated'
);

-- River race: the active member is skipped when unchanged; the leaver is
-- still touched, so purge_inactive_members keeps ageing it from its last sighting.
INSERT INTO substrate.raw_river_race (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"seasonId": 999, "sectionIndex": 0, "clan": {"tag": "#Q0G0G0G0", "participants": [{"tag": "#Q0G0G0G2", "name": "Guard Probe Renamed", "decksUsed": 4, "decksUsedToday": 1, "fame": 800}, {"tag": "#Q0G0G0G8", "name": "Guard Leaver", "decksUsed": 2, "decksUsedToday": 0, "fame": 300}]}}');
INSERT INTO versions SELECT 'race_first', * FROM versions_now;
INSERT INTO substrate.raw_river_race (clan_tag, payload) VALUES ('#Q0G0G0G0',
  '{"seasonId": 999, "sectionIndex": 0, "clan": {"tag": "#Q0G0G0G0", "participants": [{"tag": "#Q0G0G0G2", "name": "Guard Probe Renamed", "decksUsed": 4, "decksUsedToday": 1, "fame": 800}, {"tag": "#Q0G0G0G8", "name": "Guard Leaver", "decksUsed": 2, "decksUsedToday": 0, "fame": 300}]}}');
INSERT INTO versions SELECT 'race_same', * FROM versions_now;

SELECT ok(
  (SELECT s.member_ctid = f.member_ctid AND s.player_ctid = f.player_ctid
   FROM versions f JOIN versions s USING (player_tag)
   WHERE f.step = 'race_first' AND s.step = 'race_same' AND f.player_tag = '#Q0G0G0G2'),
  'an identical river race rewrites no active member or player row'
);
SELECT ok(
  (SELECT s.member_ctid <> f.member_ctid
   FROM versions f JOIN versions s USING (player_tag)
   WHERE f.step = 'race_first' AND s.step = 'race_same' AND f.player_tag = '#Q0G0G0G8'),
  'an inactive participant is still touched, keeping the purge clock'
);
SELECT is(
  (SELECT week_fame FROM drivers.members WHERE player_tag = '#Q0G0G0G2'), 800,
  'river race metrics still reach the member row'
);

-- The voyage trigger still credits an active member after skipped rewrites.
INSERT INTO drivers.clans (clan_tag, clan_name, last_ingested_at)
VALUES ('#Q0G0G0G0', 'Guard Clan', now())
ON CONFLICT (clan_tag) DO NOTHING;
INSERT INTO drivers.clan_voyage (clan_tag, target_crowns, start_at, end_at, status)
VALUES ('#Q0G0G0G0', 100, now() - interval '1 hour', now() + interval '1 hour', 'ACTIVE');
INSERT INTO drivers.player_battles (player_tag, battle_time, battle_type, team_crowns, opponent_crowns, win_status)
VALUES ('#Q0G0G0G2', now() - interval '10 minutes', 'PvP', 3, 0, true);

SELECT is(
  (SELECT c.total_voyage_crowns FROM drivers.clan_voyage_contributions c
   JOIN drivers.clan_voyage v ON v.id = c.voyage_id
   WHERE v.clan_tag = '#Q0G0G0G0' AND c.player_tag = '#Q0G0G0G2'),
  6,
  'a battle in the active voyage still credits the member'
);
SELECT is(
  (SELECT c.player_name FROM drivers.clan_voyage_contributions c
   JOIN drivers.clan_voyage v ON v.id = c.voyage_id
   WHERE v.clan_tag = '#Q0G0G0G0' AND c.player_tag = '#Q0G0G0G2'),
  'Guard Probe Renamed',
  'the voyage credit carries the member name the guarded shredders kept current'
);

SELECT * FROM finish();
ROLLBACK;
```

### Appendix A.2 Draft commit message

```
fix(db): stop rewriting unchanged player and member rows on every ingest

Cause: every upsert into drivers.players and drivers.members ended in an
unconditional ON CONFLICT DO UPDATE, so each ingest rewrote every row it
matched whether or not anything changed: about 114k player updates a day
(33% HOT) and every roster member several times per cycle. Each members
rewrite also fired the heritage and exclusion row triggers. On the Nano
instance that is WAL, dead tuples and vacuum work for no new information.

Fix: each upsert updates only when a stored value differs.
- Players (sync_players, sync_recruits and the clan-members, river-race
  and war-log shredders): only when player_name changed.
- Roster members (shred_clan_members): only when a data column changed.
  last_seen_at is compared through the same GREATEST monotonic guard it is
  written with, so an older lastSeen neither rewrites nor regresses the
  row. last_ingested_at is not compared: since 55a2ceea6 the app takes
  freshness from the pipeline heartbeat, not from roster rows.
- River-race and war-log shredders skip unchanged ACTIVE members but still
  touch INACTIVE ones every time. purge_inactive_members ages ex-members by
  updated_at; guarding them would purge ex-members still present in the war
  log after 30 days and re-create them with the next weekly log, cascading
  their war_activity each time.
- substrate.discovery_cache is left alone: the scanner only refreshes tags
  already past their cache window, so every upsert genuinely changes
  scanned_at and report_discovery is already DO NOTHING. Its 0% HOT rate
  comes from full pages, a storage-parameter question kept as a backlog item.

How we know:
- pgTAP 11_skip_unchanged_rewrites (12 assertions): an identical roster,
  river race, sync_players or sync_recruits call leaves the row versions
  (ctid) and the transaction's update counters unchanged; an older lastSeen
  is a no-op, a newer one and a rename still update; an inactive participant
  is still touched; race metrics still reach the member; the voyage trigger
  still credits the member, with the guarded name.
- Chat 6 dry-ran the migration on the live database in a rolled-back
  transaction with the same assertions (voyage part excluded there to avoid
  locking live cron.job rows).
- audit:migrations PASS; test:migration-audit 88/88; fold-state exits 1
  (UNFOLDED, the pre-existing backlog) with only this migration's 5
  redefinitions added.
```

## Appendix B. Parked W2 migration (dry run requested, result not received before handoff)

If a commit named store_unchanged_raw_responses_once exists on Beta, this appendix is superseded. Before committing: fix the header comment (the reason the two other raw tables are deferred is the midnight member_snapshots gap, not freshness), register the sha256 in .github/nightly-config/migration-quality.json, run the rolled-back dry run.

```sql
-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- Store a raw war log or clan profile response only when it differs from the
-- newest one stored for that clan. An identical response is already held in
-- full, so storing and shredding it again only rewrote timestamps (the war log
-- alone was 38% of WAL on 2026-10-06). raw_clan_members and raw_river_race stay
-- ungated while members.last_ingested_at is the app's freshness signal.
-- Retention keeps the newest row per clan of the two gated tables: it is the
-- comparison baseline and shred_river_race's seasonId fallback. Rationale in
-- the commit message.

CREATE OR REPLACE FUNCTION public.ingest_raw_war_log(p_clan_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT stored.payload
            FROM substrate.raw_war_log AS stored
            WHERE stored.clan_tag IS NOT DISTINCT FROM p_clan_tag
            ORDER BY stored.id DESC
            LIMIT 1
        ) AS newest
        WHERE newest.payload = p_payload
    ) THEN
        RETURN;
    END IF;

    INSERT INTO substrate.raw_war_log (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$function$;

COMMENT ON FUNCTION public.ingest_raw_war_log(text, jsonb) IS
    'Stores a /riverracelog response, firing trg_shredder_war_log, only when it '
    'differs from the newest response stored for the same clan. An identical '
    'response is a no-op. See 20261006213500_store_unchanged_raw_responses_once.sql.';

CREATE OR REPLACE FUNCTION public.ingest_raw_clan_profile(p_clan_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT stored.payload
            FROM substrate.raw_clan_profile AS stored
            WHERE stored.clan_tag IS NOT DISTINCT FROM p_clan_tag
            ORDER BY stored.id DESC
            LIMIT 1
        ) AS newest
        WHERE newest.payload = p_payload
    ) THEN
        RETURN;
    END IF;

    INSERT INTO substrate.raw_clan_profile (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$function$;

COMMENT ON FUNCTION public.ingest_raw_clan_profile(text, jsonb) IS
    'Stores a clan profile response, firing trg_shredder_profile, only when it '
    'differs from the newest response stored for the same clan. An identical '
    'response is a no-op. See 20261006213500_store_unchanged_raw_responses_once.sql.';

CREATE OR REPLACE FUNCTION substrate.purge_raw_logs(p_retention_hours integer DEFAULT 24)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    -- Gated tables: a row past retention goes only once a newer row for the
    -- same clan supersedes it, so the newest stays as the comparison baseline.
    DELETE FROM substrate.raw_clan_profile AS expired
    WHERE expired.ingested_at < (now() - (p_retention_hours || ' hours')::interval)
      AND EXISTS (
          SELECT 1 FROM substrate.raw_clan_profile AS newer
          WHERE newer.clan_tag IS NOT DISTINCT FROM expired.clan_tag
            AND newer.id > expired.id
      );
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_river_race   WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_war_log AS expired
    WHERE expired.ingested_at < (now() - (p_retention_hours || ' hours')::interval)
      AND EXISTS (
          SELECT 1 FROM substrate.raw_war_log AS newer
          WHERE newer.clan_tag IS NOT DISTINCT FROM expired.clan_tag
            AND newer.id > expired.id
      );

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('SYSTEM_PURGE', 'SUCCESS',
            'Raw logs older than ' || p_retention_hours || ' hours successfully evicted.');
END; $function$;

COMMIT;
```

### Appendix B.1 pgTAP test (Backend/supabase/tests/database/10_raw_response_gate.test.sql)

```sql
-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

-- Writes are read from this transaction's own table statistics, so "nothing
-- rewritten" is measured directly rather than inferred from timestamps, which
-- now() pins for the whole transaction anyway.
CREATE TEMP TABLE gate_counts (
  ordinal integer PRIMARY KEY,
  step text NOT NULL UNIQUE,
  raw_war_log_ins bigint,
  war_history_writes bigint,
  war_history_upd bigint,
  raw_clan_profile_ins bigint,
  clans_writes bigint,
  clans_upd bigint
);

CREATE TEMP VIEW gate_now AS
SELECT
  COALESCE(sum(n_tup_ins) FILTER (WHERE relid = 'substrate.raw_war_log'::regclass), 0) AS raw_war_log_ins,
  COALESCE(sum(n_tup_ins + n_tup_upd) FILTER (WHERE relid = 'drivers.war_history'::regclass), 0) AS war_history_writes,
  COALESCE(sum(n_tup_upd) FILTER (WHERE relid = 'drivers.war_history'::regclass), 0) AS war_history_upd,
  COALESCE(sum(n_tup_ins) FILTER (WHERE relid = 'substrate.raw_clan_profile'::regclass), 0) AS raw_clan_profile_ins,
  COALESCE(sum(n_tup_ins + n_tup_upd) FILTER (WHERE relid = 'drivers.clans'::regclass), 0) AS clans_writes,
  COALESCE(sum(n_tup_upd) FILTER (WHERE relid = 'drivers.clans'::regclass), 0) AS clans_upd
FROM pg_stat_xact_user_tables;

-- Each step's writes, relative to the step before it.
CREATE TEMP VIEW gate_steps AS
SELECT step,
  raw_war_log_ins - lag(raw_war_log_ins) OVER w AS raw_war_log_ins,
  war_history_writes - lag(war_history_writes) OVER w AS war_history_writes,
  war_history_upd - lag(war_history_upd) OVER w AS war_history_upd,
  raw_clan_profile_ins - lag(raw_clan_profile_ins) OVER w AS raw_clan_profile_ins,
  clans_writes - lag(clans_writes) OVER w AS clans_writes,
  clans_upd - lag(clans_upd) OVER w AS clans_upd
FROM gate_counts
WINDOW w AS (ORDER BY ordinal);

INSERT INTO gate_counts SELECT 1, 'start', * FROM gate_now;

-- War log: stored once, skipped while identical, stored again once it changes.
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 100, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 2, 'war_first', * FROM gate_now;

-- Same response with its keys in another order: equal as jsonb.
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"standings": [{"clan": {"participants": [], "clanScore": 1000, "fame": 100, "name": "Gate Probe", "tag": "#Q0G0G0G0"}, "rank": 1}], "sectionIndex": 0, "seasonId": 999}]}');
INSERT INTO gate_counts SELECT 3, 'war_same', * FROM gate_now;

SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 200, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 4, 'war_changed', * FROM gate_now;

SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_first'), 1::bigint,
  'the first war log response is stored');
SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_same'), 0::bigint,
  'an identical war log response stores no row');
SELECT is((SELECT war_history_writes FROM gate_steps WHERE step = 'war_same'), 0::bigint,
  'an identical war log response rewrites no war history');
SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_changed'), 1::bigint,
  'a changed war log response is stored');
SELECT is((SELECT war_history_upd FROM gate_steps WHERE step = 'war_changed'), 1::bigint,
  'a changed war log response is shredded into war history');

-- Clan profile: the same rule.
SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 1, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 5, 'profile_first', * FROM gate_now;

SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 1, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 6, 'profile_same', * FROM gate_now;

SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 2, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 7, 'profile_changed', * FROM gate_now;

SELECT is((SELECT raw_clan_profile_ins FROM gate_steps WHERE step = 'profile_first'), 1::bigint,
  'the first clan profile response is stored');
SELECT ok((SELECT raw_clan_profile_ins = 0 AND clans_writes = 0 FROM gate_steps WHERE step = 'profile_same'),
  'an identical clan profile response stores nothing and rewrites no clan row');
SELECT ok((SELECT raw_clan_profile_ins = 1 AND clans_upd = 1 FROM gate_steps WHERE step = 'profile_changed'),
  'a changed clan profile response is stored and shredded');

-- Retention: age only the probe rows past a window no real row can reach.
UPDATE substrate.raw_war_log SET ingested_at = now() - interval '10 years' WHERE clan_tag = '#Q0G0G0G0';
UPDATE substrate.raw_clan_profile SET ingested_at = now() - interval '10 years' WHERE clan_tag = '#Q0G0G0G0';
INSERT INTO substrate.raw_river_race (clan_tag, payload, ingested_at)
VALUES ('#Q0G0G0G0', '{}', now() - interval '10 years');

SELECT substrate.purge_raw_logs(24 * 365 * 5);

SELECT ok(
  (SELECT count(*) = 1 AND bool_and(payload #>> '{items,0,standings,0,clan,fame}' = '200')
   FROM substrate.raw_war_log WHERE clan_tag = '#Q0G0G0G0'),
  'retention keeps only the newest war log row of a clan, however old'
);
SELECT ok(
  (SELECT count(*) = 1 AND bool_and(payload ->> 'members' = '2')
   FROM substrate.raw_clan_profile WHERE clan_tag = '#Q0G0G0G0'),
  'retention keeps only the newest clan profile row of a clan, however old'
);
SELECT is(
  (SELECT count(*) FROM substrate.raw_river_race WHERE clan_tag = '#Q0G0G0G0'), 0::bigint,
  'ungated raw tables still expire purely by age'
);

INSERT INTO gate_counts SELECT 8, 'purged', * FROM gate_now;
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 200, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 9, 'war_after_purge', * FROM gate_now;

SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_after_purge'), 0::bigint,
  'an unchanged war log is still skipped after retention ran');

SELECT * FROM finish();
ROLLBACK;
```

### Appendix B.2 Draft commit message

```
fix(db): store a raw war log or clan profile only when it changed

Cause: public.ingest_raw_war_log inserted the whole /riverracelog response
(about 1 MB, 38% of all WAL measured on 2026-10-06) on every 30-minute
ingest, although that log only changes when a war ends. Each insert also
fired shred_war_log, which rewrote identical war_history, war_activity,
players and members rows. If swap activity consumes the Nano's disk I/O budget,
this write volume could add to that pressure. The available evidence has not
established budget depletion or its causal role in the outages.

Fix:
- ingest_raw_war_log and ingest_raw_clan_profile compare the incoming
  payload with the newest one stored for the same clan (jsonb equality, no
  new column) and return without inserting when they are equal, so the
  shredder does not run either. A changed payload is stored and shredded
  exactly as before.
- raw_clan_members and raw_river_race are not gated in this commit. Their
  shredders stamp drivers.members.last_ingested_at, which the app read as
  its freshness signal until Chat 10 moved freshness to the pipeline
  heartbeat; they follow as a separate change, which must also keep the
  first-of-day member_snapshots capture.
- substrate.purge_raw_logs keeps the newest row per clan in the two gated
  tables even past retention; a newer row still supersedes it. That row is
  the comparison baseline, and shred_river_race's seasonId fallback reads
  the newest raw_war_log row. The river race is shredded before the war log
  in each ingest, so a war log table emptied by nightly maintenance would
  have sent that fallback to the ISO-week key.
- purge_inactive_members ages members by updated_at, which shred_war_log
  bumps, so ex-members still in the 12-war log are now refreshed weekly
  instead of every 30 minutes and are only purged if the log stays
  unchanged for 30 days or more.

How we know:
- pgTAP 10_raw_response_gate (12 assertions): an identical payload (also
  with reordered keys) inserts no raw row and rewrites no war_history or
  clans row, measured from pg_stat_xact_user_tables; a changed payload is
  stored and shredded; retention keeps only the newest gated row however
  old, still expires ungated tables by age, and the skip survives it.
- Chat 6 dry-ran the migration on the live database in a rolled-back
  transaction: re-ingesting the newest real war log was a no-op, and all
  14 assertions passed. Chat 6 measures pg_stat_wal before and after
  deployment.
- audit:migrations PASS; test:migration-audit 88/88; fold-state exits 1
  (UNFOLDED), the pre-existing 119-entry backlog, and the only additions
  are this migration's 5 redefinitions.
```
