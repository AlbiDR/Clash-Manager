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

---

## III. Scope Coverage Map

Files and modules that have been recently or repeatedly touched. Use this to
detect drift, avoid duplication, and understand current saturation.

> Entries follow the format: `[file/module] -- last touched [Stage N, YYYY-MM-DD] -- [reason]`

* `Frontend-PWA/src/app/sw.ts` -- Stage 11, 2026-07-12 -- SW cache consolidation
* `Frontend-PWA/src/app/App.vue` -- Stage 9, 2026-07-11 -- PWA lifecycle centralization
* `android/` (APK wrapper) -- Stage 10 + 11 + 12, 2026-07-13 -- recurring APK hardening
* `Backend-Worker/src/services/` -- Stage 1, recurring -- hardening boundary checks
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

---

## V. Stage-Specific Context

Current focus areas, recent findings, and files flagged for revisiting per stage.

### Stage 1 -- Hardening
* Current focus: Layer boundary enforcement, security header validation.
* Pre-flight responsibility: 00-pr-history.md aging pass (runs before all other work).
* Flagged for next pass: Backend-Worker RPC boundary validation.

### Stage 2 -- Verification
* Current focus: Test coverage saturation for Layer 1 utilities.
* Recent additions: `assets.ts`, `normalizeTag`, backend royale schemas.
* Gap area: Edge Function integration tests remain sparse.
* [2026-07-24] [Stage 2] NotificationSettings: Injected comprehensive unit tests into NotificationSettings.spec.ts to fully cover user interaction pathways, toggles, and threshold badge-preview outputs.
* [2026-07-25] [Stage 2] useProgressiveList: Saturating unit tests inside useProgressiveList.spec.ts to fully verify empty lists, rapid updates, and requestAnimationFrame numeric deadline callbacks.

### Stage 3 -- Baseline Consolidation
* Current focus: Migration folding after each Supabase schema change.
* Trigger: Any run where `supabase/migrations/` contains more than three files
  not yet folded into the master baseline.

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

### WebView Performance and Security

* **WebView Rendering:** `setOffscreenPreRaster(true)` is established for SDK >= 23 to improve scrolling fluidity in the hybrid wrapper. *(Established: PR #PENDING, 2026-07-15)*

* **Safe Browsing:** `setSafeBrowsingEnabled(false)` is used for SDK >= 26 to reduce initialization overhead and privacy-related network calls, as the wrapper targets a known, internal PWA origin. *(Established: PR #PENDING, 2026-07-15)*

* **WebView Hardening:** Disabling form data saving (`setSaveFormData(false)`), zoom controls (`setSupportZoom(false)`), and deprecated Web SQL (`setDatabaseEnabled(false)`) is established to minimize wrapper footprint and lock the hybrid UI. *(Established: PR #PENDING, 2026-07-16)*

* **WebView Haptics & Interaction Latency:** Explicitly enabling haptic feedback on the WebView view-level (`setHapticFeedbackEnabled(true)`), auto-loading images (`setLoadsImagesAutomatically(true)`), and disabling media playback user gesture requirements (`setMediaPlaybackRequiresUserGesture(false)`) ensures tactile events can propagate instantly and prevents gesture validation overhead. *(Established: PR #PENDING, 2026-07-17)*
### [2026-07-16] [Stage 12] SelectionBar Modernization
* Integrated  directive for declarative haptic feedback on the primary `.morph-btn`.
* Increased `.selection-bar` height to 56px and interactive elements (`.morph-btn`, `.count-pill`) to 48px (Target B.2).
* Verified zero layout regressions via `depcruise` and production PWA build. [SUPERSEDED by PR #PENDING]
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
