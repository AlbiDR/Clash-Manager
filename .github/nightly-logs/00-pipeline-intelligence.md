# Pipeline Intelligence

> This document is the active memory of the nightly pipeline.
> Every stage reads it at the start of its run to gain operational context.
> Every stage appends to it when a new pattern, pitfall, constraint, or scope
> finding is discovered. Entries are never deleted; superseded entries are
> marked `[SUPERSEDED by PR #N]`.

---

## I. Proven Patterns

* **April 2026 Automated Pipeline Consolidation:** Extracted and condensed 34 PRs across all domains (Hardening, Verification, Version Integrity, etc.) to T4 Archive, confirming historical system state convergence. *(Aged: 2026-07-20)*

Approaches that have been validated through execution. Follow these when applicable.

### APK and WebView

* **WebView cache topology:** `LOAD_CACHE_ELSE_NETWORK` is the established cache
  mode for the Android WebView. Produces sub-second cold boot startup. Do not
  revert to `LOAD_DEFAULT`. *(Established: PR #1103, 2026-07-13)*

* **SW cache consolidation:** Duplicate route registrations in `sw.ts` are a
  recurring source of cache bloat. Each Stage 11 run should verify that no route
  is registered more than once. *(Pattern: PR #1082, #1093)*

* **Touch targets:** All interactive APK elements must meet the 48px minimum.
  The `BackendRefresher`, `StatusPill`, and score selector components have each
  been corrected at least once. Treat any new APK component as a touch-target
  audit candidate on first Stage 12 pass. *(Pattern: PR #1072, #1083, #1094)*

* **Haptics brokering:** All haptic calls must go through `useHaptics.ts` (Layer 2).
  Direct `navigator.vibrate` calls are an ADR violation (Anti-Pattern #5).
  Stage 12 is the enforcement point. *(Established: PR #1064)*

* **Direct raw download path:** Binary APK files must be referenced directly via raw.githubusercontent.com instead of github.com raw redirects to prevent 404s/redirection failures in WebViews, and fall back to the release directory on resolution failure. *(Established: Stage 12, 2026-08-03)*

### Refactor and Optimization

* **Centralized constants:** Timing constants and PWA lifecycle flags were
  extracted from scattered components into a single authoritative location.
  Do not re-introduce inline timing literals. *(Established: PR #1102, 2026-07-13)*

* **Game asset resolution:** Asset path logic is centralized. Do not resolve
  game asset paths inline in feature components. *(Established: PR #1091, 2026-07-12)*

* **Naming standardization:** Headhunter scanner naming was standardized in
  PR #1097. Any new scanner utility must follow the same convention.
  *(Established: PR #1097, 2026-07-13)*

* **Monolithic utility decomposition:** Large utility files have been decomposed
  in multiple passes (PR #1080, #1091). When a utility file exceeds its single
  responsibility, Stage 9 is the correct stage to propose extraction.

### Testing and Verification

* **Mocking Deno inside Node/Vitest:** Edge functions targeting the Deno/Supabase
  runtime can be fully executed and tested under Node/Vitest by injecting a
  simulated `globalThis.Deno` environment and creating temporary `node_modules` symlinks
  for `npm:` prefixed specs, avoiding logic/environment divergence. *(Established: PR #PENDING, 2026-07-17)*

* **Deno `npm:` package resolution:** For testing Deno Edge Functions natively under Node/Vitest, map `npm:` prefixed packages in `/app/node_modules/` (such as `npm:valibot@1.4.2` and nested structures like `npm:@supabase/supabase-js@2.110.6`) via symlinks to their workspace counterparts. This resolves package loading smoothly without altering production source imports. *(Established: PR #PENDING, 2026-07-18)*

* **Dynamic url-matching mock routing:** When writing unit/integration tests for complex Edge Functions in Vitest, use a route-matching map in `mockFetch` sorted by pattern length descending rather than sequential `.mockResolvedValueOnce()` to dynamically route concurrent requests and prevent transient 5000ms test timeouts on parallel/fallback queries. *(Established: Stage 2, 2026-07-19)*

### Version and Dependency Management

* **Catalog protocol is mandatory:** All internal package references must use
  `catalog:`. Discrete version strings in `package.json` files are a violation.
  Version drift is detected by Stage 7 and corrected by Stage 8.
  *(ADR Section II -- Unitary Versioning)*

* **Supabase-js drift pattern:** `@supabase/supabase-js` has drifted from the
  catalog multiple times (PR #1061, #1069). This package requires extra attention
  on each Stage 8 dependency audit. *(Pattern: PR #1061, #1069)*

* **Pinned backend imports:** Backend services often use pinned `npm:` imports
  (e.g., `npm:p-limit@7.3.0`) which may result in `knip` reporting the equivalent
  catalog entry as unused. Verify usage in `Backend/` before pruning catalog.
  *(Pattern: PR #PENDING, 2026-07-14)*

* **Migration folding cadence:** New migrations accumulate rapidly. Stage 3
  should fold them into `master_migration.sql` on every run rather than
  letting them accumulate. Allowing more than three unfolded migrations
  is an operational debt signal. *(Pattern: PR #1085, #1096)*

* **Sequential execution eliminates the shared-file merge-conflict class:** When
  all 13 stages run in one sequential session against one working tree (pull,
  audit, fix, commit, repeat) instead of as 13 concurrent PRs against a shared
  `Nightly` branch, the recurring "concurrent shared-file conflict" failure class
  (Section 2 of the self-healing protocol, recurred on PR #1169, #1171, #1245,
  #1250) cannot occur -- there is only ever one HEAD to diverge from.
  *(Established: Stage 13, 2026-07-29)*
  **[SUPERSEDED by PR #PENDING, 2026-07-30]:** the "more than three unfolded
  migrations" signal was measured by filename count (every post-baseline
  migration, forever), not by fold state, so it could never reach zero and
  was permanently tripped regardless of how much folding work was done. Stage
  3 now runs `.github/scripts/check-fold-state.py`, which replays migrations
  chronologically and diffs each resulting object against the baseline. Use
  its `pending-migrations.txt` output (now genuinely fold-state-aware) instead
  of a raw filename count. See Section V Stage 3 for the reconciliation rules
  it applies (search_path widening to house convention, inline FK hoisting to
  the constraint block) so a correctly-folded object is not misreported as
  drift.

* **Stage 1 audit-pass atomic commit format:** On log-only (no-threat) runs,
  Stage 1 must commit `00-pr-history.md` (the aging pass output) and
  `01-hardening-coverage.log` (the CLEAN log entry) together in a single
  atomic commit. Committing only one of these files causes the built-in
  reviewer to flag the PR as a non-functional whitespace edit and block the
  merge. Verified failure mode: 2026-08-02, PR blocked after four retry
  attempts, each adding only blank lines to `00-pr-history.md`.
  *(Established: human operator, 2026-08-02)*

---

## II. Known Pitfalls

Anti-patterns encountered in execution. Avoid these approaches.

* **Do not hardcode `LOAD_DEFAULT` or any WebView cache mode literal.**
  The correct value is `LOAD_CACHE_ELSE_NETWORK`. See Section I.

* **Do not open a PR that only appends a log entry with zero diff on source files
  when there is actual actionable work available.** The Zero-Diff PR exemption
  exists for audit-pass runs only, not as a way to skip difficult work.

* **Do not register the same SW route more than once.** This creates cache
  inconsistency and inflates the cache manifest. Deduplicate before writing.

* **Do not leave boolean soft-delete flags in migrations.** The ADR (Section XI)
  explicitly forbids them. Use `expires_at TIMESTAMPTZ` for expiry semantics.

* **Do not skip the `npx depcruise` check.** Layer boundary violations introduced
  without this check have been missed and required subsequent PRs to fix.

* **Do not modify files in `.github/nightly-prompts/` from within a nightly run.**
  That directory is the pipeline's administrative control surface. Only a human
  or an explicit prompt-engineering session may modify it.

* **Do not replace `localeCompare` with a hoisted `Intl.Collator`.** This looks
  like a textbook win and is a measured 3.24x regression on V8. Benchmark on
  node v26.5.0, 1000 names x 200 sorts, order alternated over 3 rounds:
  `localeCompare` 27.0 ms mean vs hoisted collator 87.4 ms mean. Ordering is
  identical (499500 pairwise comparisons, 0 sign mismatches), so only the cost
  differs. V8 has a dedicated fast path for `String.prototype.localeCompare` that
  a user-constructed collator does not reach, and the APK runtime is Android
  WebView on the same engine. Attempted and reverted by Stage 4.
  *(Disproven: Stage 4, 2026-07-29)*

* **Do not prune what `knip` calls unused without checking the ADR first.** Two
  standing false positives: `Backend/supabase/database.types.ts` is an
  ADR-mandated type-generation-parity artifact that is intentionally imported by
  nothing, and `Frontend-PWA/src/features/roster/components/index.ts` is imported
  by `RosterView.vue` via `"../components"`. Deno entry points and `npm:`
  specifiers under `Backend/supabase/functions/` are also permanent knip noise.
  *(Classified: Stage 4, 2026-07-29)*

* **Do not commit only `00-pr-history.md` without a matching `01-hardening-coverage.log`
  CLEAN entry in Stage 1.** This produces a whitespace-only diff that the
  built-in reviewer will block as non-functional. Both files must appear in the
  same atomic commit. See the ATOMIC COMMIT RULE in `01-hardening.md` Step 4.
  *(Established: human operator, 2026-08-02 post-mortem)*

* **Do not retry a Stage 12 fix more than twice if `pnpm test` is still failing.**
  The Two-Strike Rule applies: after the second failure, revert the component
  file, write a SKIPPED log entry, and open a log-only PR immediately. A
  log-only PR is always better than a 60-minute timeout with no PR opened.
  See the TWO-STRIKE RULE and 30-MINUTE BUDGET GATE in `12-apk-ux.md` Step 2.
  *(Established: human operator, 2026-08-02 post-mortem)*

---

## III. Scope Coverage Map

Files and modules that have been recently or repeatedly touched. Use this to
detect drift, avoid duplication, and understand current saturation.

> Entries follow the format: `[file/module] -- last touched [Stage N, YYYY-MM-DD] -- [reason]`

* `Frontend-PWA/src/app/sw.ts` -- Stage 11, 2026-07-12 -- SW cache consolidation
* `Frontend-PWA/src/app/App.vue` -- Stage 9, 2026-07-11 -- PWA lifecycle centralization
* `android/` (APK wrapper) -- Stage 10 + 11 + 12, 2026-07-13 -- recurring APK hardening
* `Backend/supabase/functions/` -- Stage 1, recurring -- hardening boundary checks.
  **[CORRECTED 2026-07-30]:** this row previously read
  `Backend-Worker/src/services/`, a directory that does not exist anywhere in
  this repository. There is no separate worker service; the Edge Functions
  under `Backend/supabase/functions/` are the actual hardening boundary. The
  stale path was never caught because Stage 1 has no step that verifies its
  own scope map against the real filesystem before acting on it -- it read the
  phantom path, found nothing to scan, and moved on without flagging the
  mismatch. Stage 1 should `test -d` (or equivalent) each path in this Scope
  Coverage Map at the start of a run and log a CLEAN entry with a correction
  note if a path no longer exists, rather than silently no-op'ing on it.
* `supabase/migrations/` -- Stage 3, recurring -- baseline consolidation
* `Frontend-PWA/src/core/` -- Stage 6, recurring -- TSDoc interface contracts
* `pnpm-workspace.yaml` + `package.json` -- Stage 7 + 8, recurring -- version and dep management
* `Frontend-PWA/src/features/headhunter/` -- Stage 4 + 9, 2026-07-13 -- naming + decomposition
* `Frontend-PWA/src/features/laboratory/components/TargetPicker.vue` -- Stage 12, 2026-07-18 -- Modernized target-picker (48px footprint) and integrated v-tactile haptic feedback.

---

## IV. Open Constraints

Operational boundaries discovered at runtime that are not explicitly stated in the ADR.

* **GitHub API rate limits apply during PR creation.** If a stage is running as
  part of a full 12-stage night, space PR creation calls. Rapid sequential calls
  have caused transient 429 responses in past runs.

* **`npx depcruise` must complete before the PR is opened.** It is a blocking
  pre-commit gate. If it reports violations, they must be resolved in the same PR.

* **The `master_migration.sql` baseline file must remain the canonical SQL entry
  point.** Any migration added without being folded in will cause the baseline to
  diverge from the applied schema.

* **Stage 1 is responsible for the 00-pr-history.md aging pass.** If Stage 1 is
  skipped or fails, the aging pass does not run. No other stage should attempt
  to perform aging to avoid concurrent write conflicts.

* **Stage 10 local compilation constraint:** In local/Jules sandbox runtimes, Java
  tooling (Gradle caches or SDK build-tools) can be incomplete or present JDK mismatches.
  A source-level configuration audit and manual synchronization of the release pointers
  (e.g., `latest.json` and release APK renaming) is the approved sufficient fallback
  when native compiler tools cannot fully execute locally.

---

## V. Stage-Specific Context

Current focus areas, recent findings, and files flagged for revisiting per stage.

### Stage 1 -- Hardening
* Current focus: Layer boundary enforcement, security header validation.
* Pre-flight responsibility: 00-pr-history.md aging pass (runs before all other work).
* [2026-07-30] [Stage 1] RPC/trust-boundary audit of `Backend/supabase/functions/`
  performed (the "Backend-Worker RPC boundary validation" item referred to a
  directory that does not exist -- corrected in Section III). Findings and fixes:
  DB read errors that were silently coerced into empty result sets instead of
  failing the stage (profiler.ts); RPC calls whose `error` return was discarded,
  letting success counters advance on failed writes (ghost-purge.ts, scanner.ts,
  tournament-finder.ts); a two-phase player/recruit registry write that was not
  gated, so a failed first phase let the second phase run anyway and silently
  lose harvested leads (deep-depth.ts, discovery.ts); a Valibot gate
  (`RoyaleFlexibleListSchema`) that asserted only "array of objects" while its
  audit log claimed full validation (clan-sync.ts); unbounded tag strings
  reaching persistence before use; a single malformed `battleTime` record
  aborting an entire otherwise-valid battle log fan-out; no typed error shape
  anywhere in the backend, so internal detail (including API key-pool size)
  could leak across the trust boundary in a 500 response; telemetry rows that
  could get stuck IN_PROGRESS forever on a handler throw; a malformed request
  body silently coerced to `{}` instead of a 400; and a non-constant-time bearer
  comparison at the sole auth boundary for five unauthenticated-reachable
  functions. See `_shared/errors.ts` (new) for the typed error contract.
  Separately and deliberately out of this fix set: three functions
  (sync-player-cards, query-royale-api, fetch-player-battlelog) accept the
  browser-shipped publishable key as a valid bearer credential, with
  `verify_jwt = false`, `Access-Control-Allow-Origin: *`, and no rate limiting,
  because the PWA has no authentication system to issue a real user JWT from.
  Decision: keep the access (removing it breaks the frontend) but bound it --
  per-IP/per-tag rate limiting, hard payload and fan-out caps, CORS locked to
  known origins. Tracked separately, do not re-flag as a fresh finding.
* Flagged for next pass: none outstanding from this audit at time of writing;
  confirm the rate-limiting/CORS follow-up above has landed before closing.

### Stage 2 -- Verification
* Current focus: Test coverage saturation for Layer 1 utilities.
* Recent additions: `assets.ts`, `normalizeTag`, backend royale schemas.
* Gap area: Edge Function integration tests remain sparse.
* [2026-07-24] [Stage 2] NotificationSettings: Injected comprehensive unit tests into NotificationSettings.spec.ts to fully cover user interaction pathways, toggles, and threshold badge-preview outputs.
* [2026-07-25] [Stage 2] useProgressiveList: Saturating unit tests inside useProgressiveList.spec.ts to fully verify empty lists, rapid updates, and requestAnimationFrame numeric deadline callbacks.

### Stage 3 -- Baseline Consolidation
* Current focus: Migration folding after each Supabase schema change.
* Trigger: `.github/scripts/check-fold-state.py` reports at least one object
  as `ABSENT` or `DIVERGENT` (exit code 1). Do not trigger on raw
  post-baseline file count -- see Section I Migration folding cadence for why
  that measure was replaced.
* Reconciliation rules the checker applies before calling something drift (do
  not re-fold these, they are already correctly represented in the baseline):
  (1) an inline `FOREIGN KEY` in a migration's `CREATE TABLE` that the
  baseline instead declares in the dedicated post-table constraint block
  (Topological Sorting Safeguard step 5); (2) a function `search_path` that
  the baseline widens to the house convention
  (`'public', 'features', 'drivers', 'substrate', 'pg_temp'`) versus a
  narrower one in the source migration.
* [2026-07-30] [Stage 3] Folded the 17 post-baseline migrations current at
  that date. 21 of 23 final-state objects matched verbatim; 2 matched only
  after the reconciliation rules above; 0 were genuinely absent or divergent.
  Also removed two non-declarative residues that had been carried into the
  baseline from folded migrations: (a) a DROP IDENTITY / renumber / ADD
  IDENTITY sequence that was a schema no-op (the table already declares
  `GENERATED ALWAYS AS IDENTITY`) but whose `UPDATE ... SET id = 4 WHERE id =
  5` is a live-data hazard that re-arms if voyage id 5 is ever reused; (b) a
  one-time `last_scan` rescan backfill that forces a full re-profile of every
  zero-win-rate recruit on every fresh deploy, which is both a no-op-that-
  isn't (state-dependent) and a hardcoded business threshold. See the
  Declarative Purity Contract note at the top of
  `20260531232406_master_migration.sql` for the full reasoning.

### Stage 4 -- Optimization
* Current focus: Variable naming consistency, dead code elimination.
* Recent: Headhunter scanner naming standardized (PR #1097).
* Watch area: `Frontend-PWA/src/features/` for residual inline magic numbers.

### Stage 5 -- Documentation (README)
* Current focus: Keeping README files synchronized with implementation truth.
* Recurring pattern: Drift appears fastest in backend deployment docs and
  core delegation descriptions.

### Stage 6 -- Documentation (TSDoc)
* Current focus: Interface contract hardening for Layer 1 core services.
* Recurring: `@core/api/` and `@shared/ui/` interfaces drift after refactors.

### Stage 7 -- Version Integrity
* Current focus: Monorepo-wide version alignment.
* Watch: `@supabase/supabase-js` has drifted multiple times.

### Stage 8 -- Dependency Audit
* Current focus: Major version watchlist, patch-level bumps.
* Major watchlist: `tsx`, `dependency-cruiser`, `knip`, `@formkit/auto-animate`.

### Stage 9 -- Refactor Proposals
* Current focus: Structural decomposition proposals for oversized modules.
* Recent: XP math extraction (PR #1080), game asset centralization (PR #1091).

### Stage 10 -- APK Integrity
* Current focus: Wrapper consistency, navigation theme color alignment.
* Watch: Brand theme colors drift after APK build config changes.

### Stage 11 -- APK Optimization
* Current focus: WebView cache topology, SW cache manifest de-duplication.
* Established: LOAD_CACHE_ELSE_NETWORK is canonical. Do not revert.

### Stage 12 -- APK UX
* Current focus: Touch target compliance, haptics brokering.
* Recurring: New interactive components frequently miss 48px minimum.

### Runtime and Security
* **Temporal parsing safety:** External battleTime strings must be validated via
  regex and wrapped in explicit try-catch blocks for Temporal.Instant.from
  narrowing to prevent unhandled runtime crashes. *(Pattern: PR #PENDING, 2026-07-15)*

* **Singleton merge direction:** When merging a partial update into a module-level
  reactive singleton, iterate the *target's* keys, never the caller's. Iterating
  the caller's keys requires an `as any` index write, which silently permits
  arbitrary keys to be grafted onto state that never resets. Derive the parameter
  type from `typeof theSingleton` so the contract cannot drift from the state it
  writes into. *(Established: Stage 1, 2026-07-29, useUiCoordinator.ts)*

* **Stage 1 scope note:** The `Backend/supabase/functions/` tree reaches audit
  saturation quickly (full sweep inside a 7-day window). When it is excluded,
  Stage 1's remaining live surface is Target B (cross-layer/cross-feature
  isolation) and Target C (`any` at Frontend-PWA write boundaries), not Target A.
  *(Scope finding: Stage 1, 2026-07-29)*

### WebView Performance and Security

* **WebView Rendering:** `setOffscreenPreRaster(true)` is established for SDK >= 23 to improve scrolling fluidity in the hybrid wrapper. *(Established: PR #PENDING, 2026-07-15)*

* **Safe Browsing:** `setSafeBrowsingEnabled(true)` is used for SDK >= 26. `MainActivity.java` line 103 confirms `true`, not `false`. [SUPERSEDED by a security hardening pass not tracked with a PR number]. This entry previously claimed `false` "to reduce initialization overhead," which is the wrong tradeoff for a WebView that loads content over the open internet: Safe Browsing is a security control, not a cache setting, and disabling it to shave startup time would be a regression Stage 11 must never propose. *(Corrected: Stage 11, 2026-07-29)*

* **WebView Hardening:** Disabling form data saving (`setSaveFormData(false)`), zoom controls (`setSupportZoom(false)`), and deprecated Web SQL (`setDatabaseEnabled(false)`) is established to minimize wrapper footprint and lock the hybrid UI. *(Established: PR #PENDING, 2026-07-16)*

* **WebView Haptics & Interaction Latency:** Explicitly enabling haptic feedback on the WebView view-level (`setHapticFeedbackEnabled(true)`), auto-loading images (`setLoadsImagesAutomatically(true)`), and disabling media playback user gesture requirements (`setMediaPlaybackRequiresUserGesture(false)`) ensures tactile events can propagate instantly and prevents gesture validation overhead. *(Established: PR #PENDING, 2026-07-17)*
### [2026-07-16] [Stage 12] SelectionBar Modernization
* Integrated `v-tactile` directive for declarative haptic feedback on the primary `.morph-btn`.
* Increased `.selection-bar` height to 56px and interactive elements (`.morph-btn`, `.count-pill`) to 48px (Target B.2).
* Verified zero layout regressions via `depcruise` and production PWA build. [SUPERSEDED by PR #PENDING]

### [2026-07-18] [Stage 12] TargetPicker Modernization
* Modernized TargetPicker heights (.input-box, .player-label) to 48px, lock-btn to 40px, applied user-select containment, and integrated v-tactile directive.
* Verified zero layout regressions via `depcruise` and production PWA build.

### [2026-07-24] [Stage 12] SelectionFab Modernization
* Modernized SelectionFab by removing manual haptic triggers and replacing them with the declarative v-tactile directive.
* Verified zero layout regressions and complete monorepo test compliance.

### [2026-07-25] [Stage 12] VoyageSetupForm Modernization
* Modernized VoyageSetupForm by replacing manual, programmatic haptics in the useVoyageForm composable with declarative v-tactile haptic brokering on all interactive buttons.
* Verified zero layout regressions and complete monorepo test compliance.

### [2026-07-29] [Stage 12] ParameterCard Modernization
* Modernized ParameterCard Allow Gem Spending toggle with declarative v-tactile haptic feedback brokering and removed manual useHaptics trigger.
* Verified zero layout regressions and complete monorepo test compliance with zero failures.

### Pipeline Health and Audit

* **Stage 1 UTC midnight timing:** Stage 1 (Harden) is the first pipeline stage and
  structurally starts before UTC midnight on most nights. When this happens, its coverage
  log entry carries the previous UTC date (e.g., `[2026-08-03]`) while all later stages
  carry the current pipeline day date (e.g., `[2026-08-04]`). Stage 13's completion check
  must use a two-date window (TODAY and YESTERDAY) when scanning coverage logs to avoid
  a false RECURRING failure classification for Stage 1. Any audit logic using a strict
  single TODAY-date match will misclassify Stage 1 as missing on any night it runs before
  UTC midnight. Step 9 of the Stage 13 prompt has been updated to enforce this window.
  *(Established: 2026-08-04, corrected via manual fix after PR #1329 misclassification)*
