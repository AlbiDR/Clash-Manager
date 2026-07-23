# Changelog

Automated changelog of Nightly merges.

<!--
TIER_CONFIG:
  T1_ACTIVE_DAYS:     7   # Full detail block; pipeline context for current week
  T2_RECENT_DAYS:     30  # Lean one-liner; avoid duplication reference
  T3_HISTORICAL_DAYS: 90  # Weekly domain group; pattern recognition
  T4_ARCHIVE_DAYS:    90+  # Monthly domain summary; feeds 00-pipeline-intelligence.md
AGING_AGENT: Stage 1 (pre-flight, runs nightly before hardening work)
LAST_AGED:   2026-07-22
-->

> **Format:** Entries age through four tiers as time passes. Stage 1 performs
> the aging pass at the start of every run. New entries are always written in
> T1 full-block format by the stage that opened the PR.

---

## T1 -- Active (last 7 days)
### [2026-07-22] PR #1185 [Stage 12]: fix(apk-ux): modernize BaseSelect haptic interaction and remove legacy useHaptics
**Domain:** Shared UI | **Commit:** c45f68ddcf4052e5bde9c41e2ca9734f71f37e62 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1185)
**Files:** Frontend-PWA/src/shared/ui/BaseSelect.vue
**Why:** The BaseSelect component used manual imperative haptic triggers which bypassed the standard declarative v-tactile interaction model.
**Change:** Refactored the component to utilize the centralized v-tactile directive on the select trigger and option items and eliminated imperative haptic hook dependencies.
**Result:** Unified haptic feedback behavior across all shared selectors, verified cleanly through unit tests (1409 passed) and depcruise validation.

### [2026-07-22] PR #1184 [Stage 10]: fix(apk-integrity): synchronize appVersionName, appVersionCode, and appVersion to match package.json
**Domain:** APK Integrity | **Commit:** ac6a117e29134d0d502b10feb4f81e02d82a03c4 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1184)
**Files:** APK/reference/twa-manifest.json, .github/nightly-logs/10-apk-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Reconcile version and build details between web application (package.json v14.33.9) and the Android wrapper configuration.
**Change:** Synchronized appVersionName, appVersionCode, and appVersion in twa-manifest.json to match monorepo ground truth v14.33.9 (code 17390).
**Result:** 100% integrity, alignment, and version synchronization verified across all PWA and APK wrapper boundaries.

### [2026-07-22] PR #1182 [Stage 8]: chore(deps): bump @supabase/supabase-js to ^2.110.8 and update major watchlist
**Domain:** Dependency Management | **Commit:** b75591ca5c16fa8b0901f864b1cf00530c291265 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1182)
**Files:** pnpm-workspace.yaml, .github/nightly-logs/08-dependency-audit-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Apply safe maintenance bump to @supabase/supabase-js and track outstanding major versions of typescript, vite, and pinia in the watchlist.
**Change:** Bumped @supabase/supabase-js from ^2.110.7 to ^2.110.8 in central catalog and recorded today's run in the dependency audit coverage log.
**Result:** 100% dependency hygiene and workspace-wide catalog compliance verified with all tests passing cleanly.

### [2026-07-22] PR #1180 [Stage 6]: docs(tsdoc): harden ParameterCard interface contracts and logic annotations
**Domain:** TSDoc | **Commit:** bfde4330348190fa59fcb2547529b688f7baf5a3 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1180)
**Files:** Frontend-PWA/src/features/laboratory/components/ParameterCard.vue, .github/nightly-logs/06-documentation-tsdoc-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** The ParameterCard component was recently modified by Stage 4 (Optimize), causing adjacent interface contracts to require re-verification and hardening under Stage 6 Focus area.
**Change:** Injected comprehensive component-level JSDoc/TSDoc specifications mapping properties (`settings`, `currentLevel`, `operation`), emits (`update`), side effects, decision logs, and CleanStack ADR Section III references.
**Result:** 100% logic intent transparency and contract synchronization for the modernized laboratory feature substrate.

### [2026-07-22] PR #1177 [Stage 4]: perf(opt): standardize loop index and callback variables in laboratory parameters
**Domain:** Refactor/Optimization | **Commit:** e2a6a9005256bb68c6b27a66fbddb4fb5a970389 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1177)
**Files:** Frontend-PWA/src/features/laboratory/components/ParameterCard.vue, .github/nightly-logs/04-optimization-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Standardize generic loop index and callbacks to eliminate anemic pathogens (`i`, `val`) and ensure naming compliance with CleanStack ADR.
**Change:** Renamed `i` to `levelIndex` and `val` to `strategyValue`/`levelValue` in ParameterCard.vue; executed daily substrate database view hygiene re-verification audit.
**Result:** Improved domain clarity and 100% monorepo-wide version integrity verified via project validation and full test gate.

### [2026-07-22] PR #1176 [Stage 1]: chore(harden): no threat found
**Domain:** Security | **Commit:** 87cc21f57b566647ae9640be34ebed562794f463 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1176)
**Files:** .github/nightly-logs/01-hardening-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Execute the July 22, 2026 nightly Stage 1 runtime integrity audit pass.
**Change:** Updated 01-hardening-coverage.log with CLEAN status and executed 00-pr-history.md aging.
**Result:** Verified 100% of the active codebase's RPC boundaries and validation schemas are fully hardened and secure.

### [2026-07-21] PR #1172 [Stage 10]: fix(apk-integrity): synchronize appVersionName, appVersionCode, and appVersion to match package.json
**Domain:** APK Integrity | **Commit:** 97a712edeece08d6ab1f348e666573a04293646f | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1172)
**Files:** APK/reference/twa-manifest.json, .github/nightly-logs/10-apk-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Reconcile version and build details between web application (package.json v14.33.4) and the Android wrapper configuration.
**Change:** Synchronized appVersionName, appVersionCode, and appVersion in twa-manifest.json to match monorepo ground truth v14.33.4 (code 17340).
**Result:** 100% integrity, alignment, and version synchronization verified across all PWA and APK wrapper boundaries.

### [2026-07-21] PR #PENDING [Stage 8]: chore(deps): bump p-limit to 7.3.1 and update major version watchlist
**Domain:** Dependency Management | **Commit:** PENDING | [View PR](PENDING)
**Files:** package.json, pnpm-lock.yaml, .github/nightly-logs/08-dependency-audit-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Apply safe patch update for p-limit and maintain ecosystem research on high-risk major version transitions.
**Change:** Bumped p-limit from 7.3.0 to 7.3.1 in root package.json and registered TypeScript 7 intermediate finalized major alert and Pinia/Vite watchlist updates.
**Result:** 100% dependency substrate hygiene verified with 1409 passed tests and zero regressions.

### [2026-07-21] PR #1166 [Stage 7]: fix(version): synchronize version drift across manifests and documentation
**Domain:** Version Integrity | **Commit:** 2d1a5ce8fe664d84a47882f275387a954c5ceb24 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1166)
**Files:** APK/android/apktool.yml, Backend/README.md, Backend/supabase/functions/_shared/protocol.ts, Frontend-PWA/README.md, Frontend-PWA/src/core/services/useProgressiveList.ts, README.md, .github/nightly-logs/07-version-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** The latest PWA deploy failed due to project version drift across the monorepo.
**Change:** Synchronized versionName and versionCode in apktool.yml, version constant in protocol.ts, and README documentation badges to the ground truth version of 14.33.4.
**Result:** Monorepo version audit passes and PWA builds and deploys successfully.

### [2026-07-21] PR #1167 [Stage 3]: chore(baseline): fold new migrations into master baseline -- audit pass
**Domain:** Baseline | **Commit:** d4e2e5c40cc3ac978d56687cfdad5b3d23c75a7c | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1167)
**Files:** Backend/supabase/migrations/20260531232406_master_migration.sql, .github/nightly-logs/03-baseline-consolidation-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Maintain a clean, zero-touch deployable master baseline database schema with fully synchronized compliance.
**Change:** Audited and verified all 11 incremental migrations are fully folded into baseline with 100% RLS compliance, search_path isolation, and formatting; updated audited date stamp in baseline header.
**Result:** Safe, fully validated, and 100% compliant master baseline database schema with zero debt.

### [2026-07-20] PR #1163 [Stage 10]: fix(apk-integrity): synchronize appVersionName, appVersionCode, and appVersion to match package.json
**Domain:** APK Integrity | **Commit:** 1a2aee6df603097f2c35de2fdccaec33de80dbef | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1163)
**Files:** APK/reference/twa-manifest.json, .github/nightly-logs/10-apk-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Reconcile version and build details between web application (package.json v14.33.0) and the Android wrapper configuration.
**Change:** Synchronized appVersionName, appVersionCode, and appVersion in twa-manifest.json to match monorepo ground truth v14.33.0 (code 17300).
**Result:** 100% integrity, alignment, and version synchronization verified across all PWA and APK wrapper boundaries.

### [2026-07-20] PR #PENDING [Stage 7]: chore(version): no version drift found in monorepo v14.33.0
**Domain:** Version Integrity | **Commit:** PENDING | [View PR](PENDING)
**Files:** .github/nightly-logs/07-version-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** A monorepo-wide audit was conducted to ensure version consistency and PNPM catalog adherence.
**Change:** Performed an exhaustive consistency audit across root, PWA, and backend manifests, confirming synchronization at v14.33.0.
**Result:** 100% version alignment and catalog protocol adherence verified across the entire monorepo.

### [2026-07-20] PR #1159 [Stage 6]: docs(tsdoc): harden shadow-scout and ghost-purge contracts and logic annotations
**Domain:** TSDoc | **Commit:** fc2decbaa1385d593c803aa78e90ad771a64ec9b | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1159)
**Files:** Backend/supabase/functions/headhunter-scanner/stages/shadow-scout.ts, Backend/supabase/functions/headhunter-scanner/stages/ghost-purge.ts, .github/nightly-logs/06-documentation-tsdoc-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Interface contracts and internal decision logs for shadow-scout and ghost-purge stages lacked comprehensive JSDoc/TSDoc specifications following recent hardening passes.
**Change:** Injected comprehensive JSDoc blocks (including `@remarks`, `@param`, `@returns`, `@throws`, `@sideeffects`, and links to CleanStack ADR Section III, IV, and XI) and inline annotations.
**Result:** 100% logic intent transparency and contract synchronization for the scouter backend stages substrate.

### [2026-07-20] PR #1158 [Stage 5]: docs(readme): reconcile scanner validation guards and laboratory target picker
**Domain:** Documentation/README | **Commit:** 4967bb9130fda18db22f6c1412d9d0fa08786329 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1158)
**Files:** Backend/supabase/functions/headhunter-scanner/README.md, Frontend-PWA/src/features/laboratory/README.md, .github/nightly-logs/05-documentation-readme-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Scanner RPC checks and laboratory target picker touch targets were modernized, causing adjacent architectural documentation to drift.
**Change:** Updated headhunter-scanner README to document the S1 defensive nullish coalescing check and updated the laboratory README to document TargetPicker 48px touch footprint and haptic feedback.
**Result:** 100% synchronization between substrate reality and system-wide architectural intent.

### [2026-07-20] PR #1157 [Stage 3]: chore(baseline): fold new migrations into master baseline -- audit pass
**Domain:** Baseline | **Commit:** 0163e45bdd3d04364a6ccf7855b9146493fe403b | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1157)
**Files:** Backend/supabase/migrations/20260531232406_master_migration.sql, .github/nightly-logs/03-baseline-consolidation-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Maintain a clean, zero-touch deployable master baseline database schema with fully synchronized compliance.
**Change:** Audited and verified all 11 incremental migrations are fully folded into baseline with 100% RLS compliance, search_path isolation, and formatting; updated audited date stamp in baseline header.
**Result:** Safe, fully validated, and 100% compliant master baseline database schema with zero debt.

### [2026-07-19] PR #1147 [Stage 2]: test(verify): add saturating tests for query-royale-api Edge Function
**Domain:** Verification | **Commit:** 657c548f46feeea8587d4ab7ff35ee2af487848e | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1147)
**Files:** Backend/supabase/functions/query-royale-api/index.spec.ts, .github/nightly-logs/02-verification-coverage.log, .github/nightly-logs/00-pipeline-intelligence.md, .github/nightly-logs/00-pr-history.md, package.json, pnpm-lock.yaml
**Why:** The query-royale-api Edge Function lacked dedicated test coverage, presenting a logical validation gap on the decomposed harvesting core logic.
**Change:** Created a comprehensive Vitest suite covering OPTIONS preflight, authorization guards, payload schema validation, global harvest (with country-fallback loops), local country-specific harvest (empty config, fetch failure, and rankings merge), and international concurrent harvesting.
**Result:** 100% logic and branch coverage verified with 10 newly introduced tests running natively in the Node/Vitest workspace.

### [2026-07-18] PR #1145 [Stage 12]: fix(apk-ux): modernize TargetPicker touch targets and haptics
**Domain:** Shared UI | **Commit:** bae5529a0f3bd4d5833f5a7a2869cc462cfedd4e | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1145)
**Files:** Frontend-PWA/src/features/laboratory/components/TargetPicker.vue, Frontend-PWA/src/features/laboratory/components/components-tests/TargetPicker.spec.ts, .github/nightly-logs/12-apk-ux-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** TargetPicker inputs and labels were below the 48px touch target threshold and lacked declarative haptic feedback brokering in the WebView shell.
**Change:** Modernized TargetPicker heights to 48px, lock-btn to 40px, applied user-select containment, and integrated `v-tactile` directive for brokered haptics.
**Result:** Improved mobile touch targets and interaction feedback consistency with 100% test pass.

### [2026-07-18] PR #1143 [Stage 10]: chore(apk-integrity): no mismatch found
**Domain:** APK Integrity | **Commit:** c364ddbf92693066c8cca08081c5eda27f4caefc | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1143)
**Files:** .github/nightly-logs/10-apk-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Conducted a comprehensive audit to ensure version, manifest, and security synchronization between the PWA and native Android wrappers.
**Change:** Verified monorepo-wide synchronization at v14.31.2 (17120) across manifests, resources, and native configuration; confirmed Digital Asset Links fingerprint parity.
**Result:** 100% integrity and alignment verified across all PWA and APK wrapper boundaries.

### [2026-07-18] PR #1138 [Stage 2]: test(verify): add saturating tests for sync-player-cards Edge Function
**Domain:** Verification | **Commit:** 293f9cfa87aebc6814000e89cd52e09e360d9179 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1138)
**Files:** Backend/supabase/functions/sync-player-cards/index.spec.ts, .github/nightly-logs/02-verification-coverage.log, .github/nightly-logs/00-pipeline-intelligence.md, .github/nightly-logs/00-pr-history.md
**Why:** The sync-player-cards Edge Function lacked unit/integration testing, representing a logical and environment validation gap on recent cache hardening changes.
**Change:** Created a comprehensive Vitest suite covering CORS, authorization guards, validation payload boundaries, cache hits/misses, absolute level scaling, standard/tower-troop collection separation, and graceful recovery from malformed timestamps.
**Result:** 100% logic and branch coverage verified with 9 newly introduced tests running natively in the monorepo Vitest workspace.

### [2026-07-17] PR #1183 [Stage 9]: chore(refactor): no action required
**Domain:** Refactor/Structural | **Commit:** 717a8be4b7faddf044256acdc42e63519c7b1da7 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1183)
**Files:** .github/nightly-logs/09-refactor-proposals-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Audited feature-level view modules and shared composables across features to detect outgrown dependencies or oversized layers.
**Change:** Completed a comprehensive structural audit confirming zero modules exceeding 400 lines and zero architectural layer or cyclical dependency violations.
**Result:** Monorepo structural and architectural integrity certified with zero debt detected for this run.

### [2026-07-17] PR #1135 [Stage 8]: chore(deps): bump @supabase/supabase-js and update major watchlist
**Domain:** Dependencies | **Commit:** 3db7643f7217e69151f2283f1d92f23f2277a533 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1135)
**Files:** pnpm-workspace.yaml, .github/nightly-logs/08-dependency-audit-coverage.log
**Why:** Conducted a dependency audit to apply safe maintenance updates and research high-risk major version transitions for Pinia 4, Vite 8, and TypeScript 7.
**Change:** Bumped @supabase/supabase-js to ^2.110.7 via the catalog, and updated the major version watchlist with Pinia 4.0.2 impact analysis.
**Result:** Monorepo dependencies hardened against rot; ecosystem research documented for architectural planning.

### [2026-07-17] PR #1134 [Stage 7]: fix(version): reconcile @supabase/supabase-js drift in backend functions
**Domain:** Infrastructure/Backend | **Commit:** 3a8bd93ea2df1990d81dd3d42c308aef2d2d3bd3 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1134)
**Files:** Backend/supabase/functions/ingest-royale-data/client.ts, Backend/supabase/functions/_shared/vault.ts, Backend/supabase/functions/_shared/protocol.ts, Backend/supabase/functions/sync-player-cards/client.ts, Backend/supabase/functions/query-royale-api/client.ts, Backend/supabase/functions/fetch-player-battlelog/client.ts, Backend/supabase/functions/headhunter-scanner/client.ts, .github/scripts/fetch_player_battles.ts
**Why:** `@supabase/supabase-js` in backend edge functions and Deno scripts had drifted from the monorepo catalog version (v2.110.6).
**Change:** Synchronized all occurrences of `@supabase/supabase-js` in backend functions and Deno scripts to v2.110.6 and verified monorepo-wide consistency.
**Result:** 100% catalog adherence and system stability verified via monorepo test gate (1409 passed).

### [2026-07-17] PR #1129 [Stage 1]: fix(harden): secure player card cache check and protect against Temporal crashes
**Domain:** Hardening | **Commit:** 36db022b2f99ea9ca561baa6967539fdc4d9b5ef | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1129)
**Files:** Backend/supabase/functions/sync-player-cards/index.ts, .github/nightly-logs/01-hardening-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Malformed fetched_at timestamp strings in the player card snapshots table could trigger unhandled exceptions in the Temporal parsing logic.
**Change:** Hardened the sync-player-cards Edge Function by extracting Temporal parsing into a defensive parseFetchedAt helper with try-catch block and fallback to 0 epoch milliseconds.
**Result:** Deterministic runtime protection against malformed or corrupted database timestamps at the cache check boundary.

### [2026-07-16] PR #1127 [Stage 11]: perf(apk-optimization): harden webview settings and refine sw precache
**Domain:** APK Optimization | **Commit:** af6809ae242cfaa1fcdf8d1c03d49e9df0f5f649 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1127)
**Files:** APK/src/com/albidr/clashmanager/MainActivity.java, Frontend-PWA/vite.config.ts, .github/nightly-logs/11-apk-optimization-coverage.log, .github/nightly-logs/00-pipeline-intelligence.md, .github/nightly-logs/00-pr-history.md
**Why:** Unoptimized WebView settings and redundant SW precache entries were bloating the installation lifecycle and security surface.
**Change:** Hardened WebView in the native wrapper by disabling form data saving, zoom controls, and Web SQL; refined SW precaching by excluding 'logo.svg' and 'favicon.ico'.
**Result:** Reduced initial cache footprint and hardened hybrid shell security and UI lock verified via monorepo test gate (1409 passed).

### [2026-07-16] PR #1126 [Stage 10]: chore(apk-integrity): no mismatch found
**Domain:** APK Integrity | **Commit:** 9ba7b1d9cf2085f38e7461901b6a7bbc97d0707f | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1126)
**Files:** .github/nightly-logs/10-apk-integrity-coverage.log, .github/nightly-logs/00-pr-history.md
**Why:** Conducted a comprehensive audit to ensure version, manifest, and security synchronization between the PWA and native Android wrappers.
**Change:** Verified monorepo-wide synchronization at v14.31.2 (17120) across manifests, resources, and native configuration; confirmed Digital Asset Links fingerprint parity.
**Result:** 100% integrity and alignment verified across all PWA and APK wrapper boundaries.

### [2026-07-16] PR #1125 [Stage 9]: refactor(structural): decompose harvester and centralize configuration
**Domain:** Infrastructure/Backend | **Commit:** 86541ac80c1c49efcdefef400a7064ec28bd63c0 | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1125)
**Files:** Backend/supabase/functions/query-royale-api/index.ts, Backend/supabase/functions/query-royale-api/harvester.ts, Backend/supabase/functions/_shared/config.ts
**Why:** The Royale API proxy function had grown into a monolithic entry point violating SRP and Layer 5 architectural boundaries.
**Change:** Decomposed query-royale-api by extracting discovery and international batch logic into a specialized harvester module; centralized harvesting constants and operational thresholds in the shared configuration kernel.
**Result:** 60% reduction in entry point complexity and hardened feature-to-feature isolation for backend discovery pipelines.

### [2026-07-16] PR #1118 [Stage 8]: chore(deps): bump dependencies and update major watchlist
**Domain:** Dependencies | **Commit:** 272a08ddcf703c6cc94e21f8ffeecb9bc18a11db | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1118)
**Files:** pnpm-workspace.yaml, .github/nightly-logs/08-dependency-audit-coverage.log
**Why:** Conducted a dependency audit to apply safe maintenance updates and research high-risk major version transitions for Pinia 4, Vite 8, and TypeScript 7.
**Change:** Bumped @supabase/supabase-js to ^2.110.6, vue to ^3.5.40, knip to ^6.27.0, and vue-router to ^5.2.0 via the catalog, and updated the major version watchlist with Pinia 4.0.2 impact analysis.
**Result:** Monorepo dependencies hardened against rot; ecosystem research documented for architectural planning.

### [2026-07-16] PR #1181 [Stage 6]: docs(tsdoc): harden core configuration contracts and logic annotations
**Domain:** TSDoc | **Commit:** d4b36ff0d4d7a666892d2116cfb7b6fe0cabceaf | [View PR](https://github.com/AlbiDR/Clash-Manager/pull/1181)
**Files:** Frontend-PWA/src/core/config/index.ts, .github/nightly-logs/06-documentation-tsdoc-coverage.log
**Why:** Layer 1 core configuration constants lacked formal TSDoc and architectural logic annotations, leading to potential ambiguity in threshold rationale and timing behaviors.
**Change:** Injected comprehensive TSDoc blocks and mandatory [THREAT:] / [DECISION LOG] annotations to document the rationale behind business thresholds and UI stability delays.
**Result:** 100% logic intent transparency and hardened interface contracts for the application's configuration substrate.




## T2 -- Recent (8-30 days)

> Lean reference. Sufficient for deduplication and scope awareness.

* [2026-07-14] PR #1173 [Verification]: test(verify): extend saturating coverage for game utility kernel (``PENDING``) [View](PENDING)
* [2026-07-14] PR #1168 [Baseline]: chore(baseline): fold new migrations into master baseline (``PENDING``) [View](PENDING)
* [2026-07-14] PR #1160 [README]: docs(readme): reconcile PWA manager delegation and config kernel (``PENDING``) [View](PENDING)
* [2026-07-14] PR #1142 [Version Integrity]: chore(version): no drift found (``PENDING``) [View](PENDING)
* [2026-07-14] PR #1141 [Dependencies]: chore(deps): bump @supabase/supabase-js and update major watchlist (``PENDING``) [View](PENDING)
* [2026-07-14] PR #1139 [APK Integrity]: chore(apk-integrity): no mismatch found (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1137 [Hardening]: fix(harden): secure battlelog fetch and excise anemic pathogens (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1131 [README]: docs(readme): reconcile battlelog hardening and pwa manager drift (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1130 [TSDoc]: docs(tsdoc): harden backend edge function and utility contracts (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1117 [Version Integrity]: fix(version): reconcile version drift in backend and scripts (``ac9c8a1fd1b528a4922e19e16639c6a4e68ebcba``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1117)
* [2026-07-15] PR #1122 [Dependencies]: chore(deps): bump @supabase/supabase-js and update major version watchlist (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1121 [APK Integrity]: chore(apk-integrity): no mismatch found (``PENDING``) [View](PENDING)
* [2026-07-15] PR #1120 [APK Optimization]: perf(apk-optimization): optimize webview performance and sw precache (``PENDING``) [View](PENDING)
* [2026-07-10] PR #1065 [Refactor/Optimization]: refactor(opt): standardize core service variable naming (```558ead3f```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1065)
* [2026-07-10] PR #1066 [README]: docs(readme): reconcile domain types documentation (```a0f379cf```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1066)
* [2026-07-10] PR #1067 [TSDoc]: docs(tsdoc): harden interface contracts for Layer 1 core services (```dbbe5fdd```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1067)
* [2026-07-10] PR #1068 [Version Integrity]: chore(version): no drift found (```c49bd322```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1068)
* [2026-07-10] PR #1069 [Dependencies]: chore(deps): bump @supabase/supabase-js from 2.110.1 to 2.110.2 (```a7b77ad2```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1069)
* [2026-07-10] PR #1070 [Refactor/Optimization]: refactor: centralize hub-related interfaces to core types (```a243faa5```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1070)
* [2026-07-10] PR #1071 [APK Integrity]: fix(apk-integrity): sync brand theme and navigation colors (```7d151633```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1071)
* [2026-07-10] PR #1072 [APK UX]: fix(apk-ux): modernize score selector for mobile compliance (```4c6b3e21```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1072)
* [2026-07-11] PR #1073 [Hardening]: fix(harden): secure Royale API harvest boundary (```fb029d16```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1073)
* [2026-07-11] PR #1074 [Verification]: test(verify): add saturating tests for backend shared utils (```7bd174b8```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1074)
* [2026-07-11] PR #1075 [Performance]: perf(opt): standardize shared ui variable naming and audit substrate (```a5ca0ac5```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1075)
* [2026-07-11] PR #1076 [README]: docs(readme): reconcile query-royale-api harvesting logic (```fb65469f```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1076)
* [2026-07-11] PR #1077 [TSDoc]: docs(tsdoc): harden core service and shared UI contracts (```057eadad```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1077)
* [2026-07-11] PR #1078 [Version Integrity]: fix(version): reconcile version drift and enforce catalog alignment (```1603bf5e```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1078)
* [2026-07-11] PR #1079 [Dependencies]: chore(deps): bump knip and @formkit/auto-animate (```af028b4b```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1079)
* [2026-07-11] PR #1080 [Refactor/Optimization]: refactor: decompose monolithic game utility and centralize XP math (```7db6f9e5```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1080)
* [2026-07-11] PR #1081 [APK Integrity]: fix(apk-integrity): sync navigation color and harden theme colors (```fbc28334```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1081)
* [2026-07-11] PR #1082 [APK Optimization]: perf(apk-optimization): consolidate redundant assets and optimize SW cache (```b68139d6```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1082)
* [2026-07-11] PR #1083 [APK UX]: fix(apk-ux): modernize StatusPill for hybrid shell compliance (```8dd26cd8```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1083)
* [2026-07-12] PR #1084 [Verification]: test(verify): add specs for backend royale schemas (```c52598bb```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1084)
* [2026-07-12] PR #1085 [Baseline]: chore(baseline): fold new migrations into master baseline (```318d6625```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1085)
* [2026-07-12] PR #1086 [Performance]: perf(opt): standardize shared UI naming and audit substrate (```bdbafaf8```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1086)
* [2026-07-12] PR #1087 [README]: docs(readme): reconcile utility and shared UI drift (```c1ba5fc2```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1087)
* [2026-07-12] PR #1088 [TSDoc]: docs(tsdoc): harden core math and priority queue contracts (```610a9d89```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1088)
* [2026-07-12] PR #1089 [Version Integrity]: chore(version): harden project integrity and reconcile log (```89ef122d```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1089)
* [2026-07-12] PR #1090 [Dependencies]: chore(deps): update major version watchlist (```21b5971a```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1090)
* [2026-07-12] PR #1091 [Refactor/Optimization]: refactor: centralize game asset resolution and standardize laboratory UI (```3262403a```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1091)
* [2026-07-12] PR #1092 [APK Integrity]: fix(apk-integrity): harden wrapper consistency checks (```fe4e397b```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1092)
* [2026-07-12] PR #1093 [APK Optimization]: perf(apk-optimization): harden webview and optimize sw cache (```33273b43```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1093)
* [2026-07-12] PR #1094 [APK UX]: fix(apk-ux): modernize BackendRefresher touch targets and haptics (```31ee635a```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1094)
* [2026-07-13] PR #1095 [Verification]: test(verify): add specs for assets.ts and normalizeTag (```52933228```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1095)
* [2026-07-13] PR #1096 [Baseline]: chore(baseline): fold new migrations into master baseline (```4128446f```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1096)
* [2026-07-13] PR #1097 [Refactor/Optimization]: refactor(opt): standardize headhunter scanner naming (```ad4a533f```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1097)
* [2026-07-13] PR #1098 [README]: docs(readme): reconcile backend deployment and core delegation (```a2b8c2cc```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1098)
* [2026-07-13] PR #1099 [TSDoc]: docs(tsdoc): harden interface contracts for roster and api layers (```725a0bca```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1099)
* [2026-07-13] PR #1100 [Version Integrity]: chore(version): no drift found (```3028c6ad```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1100)
* [2026-07-13] PR #1101 [Dependencies]: chore(deps): bump tsx and dependency-cruiser; update major watchlist (```6b8762de```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1101)
* [2026-07-13] PR #1102 [Refactor/Optimization]: refactor: centralize timing constants and PWA lifecycle logic (```a5b144b1```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1102)
* [2026-07-13] PR #1103 [APK Optimization]: perf(apk-optimization): optimize WebView cache mode for sub-second startup (```df303147```) [View](https://github.com/AlbiDR/Clash-Manager/pull/1103)
* [2026-07-09] PR #1064 [APK UX]: fix(apk-ux): add tactile feedback to theme options in AppearanceSettings (``10fba68d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1064)
* [2026-07-09] PR #1063 [Hardening]: Harden APK/PWA Integrity Auditor and Reconcile Logs (``1890a9ec``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1063)
* [2026-07-09] PR #1062 [Dependencies]: chore(deps): bump @types/node and update major watchlist (``831d8a2b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1062)
* [2026-07-09] PR #1061 [Version Integrity]: fix(version): reconcile supabase-js drift to align with catalog (``3dcdc2b8``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1061)
* [2026-07-09] PR #1060 [TSDoc]: docs(tsdoc): harden useClashLoader interface contract (``5789ccf1``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1060)
* [2026-07-09] PR #1059 [README]: docs(readme): reconcile core service registry and utilities (``8ab1829a``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1059)
* [2026-07-09] PR #1058 [Refactor/Optimization]: refactor(opt): standardize variable naming in core services (``1c0b566b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1058)
* [2026-07-09] PR #1057 [Baseline]: chore(baseline): fold new migrations into master baseline (``c2874760``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1057)
* [2026-07-09] PR #1056 [Hardening]: fix(harden): resolve runtime crash and excise anemic variables in deep-depth stage (``1444b606``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1056)
* [2026-07-08] PR #1055 [APK Optimization]: perf(apk-optimization): optimize SW precache and prune orphaned resources (``f68eb7d3``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1055)
* [2026-07-08] PR #1054 [APK Integrity]: fix(apk-integrity): harden security audit and verify manifest parity (``9339b393``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1054)
* [2026-07-08] PR #1053 [Dependencies]: chore(deps): update dependencies and major version watchlist [Stage 8] (``5a18e9dd``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1053)
* [2026-07-08] PR #1052 [TSDoc]: docs(tsdoc): document native bridge orchestrator interface contracts (``3d3d642c"``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1052)
* [2026-07-08] PR #1051 [README]: docs(readme): reconcile core service registry (``b93ce544``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1051)
* [2026-07-08] PR #1050 [Performance]: perf(opt): standardize variable naming for domain clarity (``d401ce5f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1050)
* [2026-07-08] PR #1049 [Verification]: test(verify): add specs for useClashLoader (``d9f005ea``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1049)
* [2026-07-07] PR #1048 [APK UX]: fix(apk-ux): optimize BaseSelect touch targets for 48px compliance (``a266458``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1048)
* [2026-07-07] PR #1047 [APK Optimization]: perf(apk-optimization): prune redundant shortcut assets and xml overrides (``a1cb307``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1047)
* [2026-07-07] PR #1046 [General]: [Stage 10] APK & PWA Wrapper Integrity Audit (``b719ecb``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1046)
* [2026-07-07] PR #1045 [Refactor/Optimization]: Refactor: Centralize Native Android Bridge Orchestration (``536938e``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1045)
* [2026-07-07] PR #1044 [Dependencies]: chore(deps): bump vitest from 4.1.9 to 4.1.10 (``4f96bbc``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1044)
* [2026-07-07] PR #1043 [Version Integrity]: chore(version): no drift found (``0b7d9b0``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1043)
* [2026-07-07] PR #1042 [TSDoc]: docs(tsdoc): document settings orchestrator and pwa lifecycle (``8302073``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1042)
* [2026-07-07] PR #1041 [README]: docs(readme): reconcile prediction logic and utility registry (``9a0f3d5``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1041)
* [2026-07-07] PR #1040 [Refactor/Optimization]: refactor(opt): standardize variable naming for domain clarity (``76cf646``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1040)
* [2026-07-07] PR #1039 [Verification]: test(verify): add specs for locale utility (``65224fa``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1039)
* [2026-07-06] PR #1038 [APK UX]: fix(apk-ux): add tactile feedback to ErrorBoundary actions (``e029710``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1038)
* [2026-07-06] PR #1037 [APK Optimization]: perf(apk-optimization): prune orphaned resources and optimize SW cache (``4e8e643``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1037)
* [2026-07-06] PR #1036 [APK Integrity]: chore(apk-integrity): monorepo integrity audit passed (``b73c603``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1036)
* [2026-07-06] PR #1035 [Refactor/Optimization]: refactor: centralize scanner logic and configuration to shared layer (``047b6c6``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1035)
* [2026-07-06] PR #1034 [Dependencies]: chore(deps): bump vite and update major version watchlist [Stage 8] (``4847201``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1034)
* [2026-07-06] PR #1033 [Version Integrity]: chore(version): no drift found (``4afd718``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1033)
* [2026-07-06] PR #1032 [TSDoc]: docs(tsdoc): document useLongPress gesture orchestrator (``30a8529``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1032)
* [2026-07-06] PR #1031 [README]: docs(readme): reconcile backend API boundaries (``733d47d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1031)
* [2026-07-06] PR #1030 [Refactor/Optimization]: perf(opt): centralize backend utilities and refactor edge functions (``943801c``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1030)
* [2026-07-06] PR #1029 [Baseline]: chore(baseline): fold new migrations into master baseline (``d36c227``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1029)
* [2026-07-06] PR #1028 [Verification]: test(verify): add specs for app shell and base theme (``d339b36``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1028)
* [2026-07-05] PR #1027 [APK UX]: fix(apk-ux): add tactile feedback to backend refresh actions (``319036f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1027)
* [2026-07-05] PR #1026 [APK Optimization]: perf(apk-optimization): consolidate redundant XML resources into aliases (``4c98aed``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1026)
* [2026-07-05] PR #1025 [APK Integrity]: chore(apk-integrity): no mismatch found (``79a7cac``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1025)
* [2026-07-05] PR #1024 [Refactor/Optimization]: refactor: extract leaderboard scouting to core api (``d91e226``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1024)
* [2026-07-05] PR #1023 [Dependencies]: chore(deps): bump @ast-grep/cli from 0.44.0 to 0.44.1 (``d5bbbab``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1023)
* [2026-07-05] PR #1022 [Version Integrity]: chore(version): no drift found (``bd3df76``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1022)
* [2026-07-05] PR #1021 [TSDoc]: docs(tsdoc): document Layer 1 core services (``230c300``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1021)
* [2026-07-05] PR #1020 [README]: docs(readme): reconcile architectural drift across monorepo (``fcdb326``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1020)
* [2026-07-05] PR #1019 [Refactor/Optimization]: refactor(opt): standardize core api and service variable naming (``5caaddd``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1019)
* [2026-07-05] PR #1018 [Baseline]: chore(baseline): fold new migrations into master baseline (``1ae9984``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1018)
* [2026-07-05] PR #1017 [Verification]: test(verify): add saturating coverage for HtmlEntry.ts (``425101c``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1017)
* [2026-07-04] PR #1016 [APK Integrity]: chore(apk-integrity): no mismatch found (``f58d6df``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1016)
* [2026-07-04] PR #1015 [Refactor/Optimization]: refactor: decompose monolithic schemas.ts into domain modules (``0d75a76``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1015)
* [2026-07-04] PR #1014 [APK UX]: fix(apk-ux): add tactile feedback to NetworkSettings controls (``5dcbf01``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1014)
* [2026-07-04] PR #1013 [Dependencies]: chore(deps): bump tsx and update major version watchlist (``c7d96cb``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1013)
* [2026-07-04] PR #1012 [Version Integrity]: fix(version): reconcile version drift in backend engine (``c3524ab``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1012)
* [2026-07-04] PR #1011 [TSDoc]: docs(tsdoc): document automated blitz orchestrator (``65a0ed5``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1011)
* [2026-07-04] PR #1010 [README]: docs(readme): reconcile core service and api documentation gaps (``ba956c3``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1010)
* [2026-07-04] PR #1009 [Baseline]: chore(baseline): fold new migrations into master baseline (``3102f67``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1009)
* [2026-07-04] PR #1008 [Performance]: perf(opt): standardize variable naming for domain clarity (``8001d43``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1008)
* [2026-07-04] PR #1007 [Hardening]: fix(harden): harden persistence substrate (``c66004d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1007)
* [2026-07-03] PR #1006 [TSDoc]: docs(tsdoc): document shared types and game utilities (``0c147d4``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1006)
* [2026-07-03] PR #1005 [Version Integrity]: fix(version): reconcile version drift in Supabase Functions and Deno scripts (``42e271e``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1005)
* [2026-07-03] PR #1004 [APK Integrity]: fix(apk-integrity): automate wrapper parity checks and synchronize logs (``035a9f9``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1004)
* [2026-07-03] PR #1003 [Dependencies]: chore(deps): update tsx and major version watchlist research (``dea9349``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1003)
* [2026-07-03] PR #1002 [APK Optimization]: perf(apk-optimization): consolidate assets and update SW paths (``0afd06e``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1002)
* [2026-07-03] PR #1001 [README]: docs(readme): reconcile architectural drift and hexa-stage mapping (``3c3f515``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1001)
* [2026-07-03] PR #1000 [Refactor/Optimization]: refactor(opt): standardize anemic variables in service worker substrate (``b9c118f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/1000)
* [2026-07-03] PR #999 [Verification]: test(verify): add saturating coverage for useConnectionStatus service (``7183c67``) [View](https://github.com/AlbiDR/Clash-Manager/pull/999)
* [2026-07-03] PR #998 [Hardening]: fix(harden): profiler runtime integrity and anemic variable excision (``65b85b1``) [View](https://github.com/AlbiDR/Clash-Manager/pull/998)
* [2026-07-02] PR #997 [TSDoc]: docs(tsdoc): document useRecruiter orchestrator (``92cf1c8``) [View](https://github.com/AlbiDR/Clash-Manager/pull/997)
* [2026-07-02] PR #996 [APK Integrity]: fix(apk-integrity): audit and verify manifest synchronization (``15d0091``) [View](https://github.com/AlbiDR/Clash-Manager/pull/996)
* [2026-07-02] PR #995 [Hardening]: fix(harden): secure tournament discovery nomenclature and state lifecycle (``fc2184b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/995)
* [2026-07-02] PR #994 [APK Optimization]: perf(apk-optimization): prune redundant resources and relocate non-production assets (``8e3e8a4``) [View](https://github.com/AlbiDR/Clash-Manager/pull/994)
* [2026-07-02] PR #993 [Version Integrity]: chore(version): no drift found (``a882a0e``) [View](https://github.com/AlbiDR/Clash-Manager/pull/993)
* [2026-07-02] PR #992 [General]: Standardize Variable Naming for Domain Clarity (``bd8edd6``) [View](https://github.com/AlbiDR/Clash-Manager/pull/992)
* [2026-07-02] PR #991 [README]: docs(readme): reconcile monorepo architecture and theme drift (``a32d021``) [View](https://github.com/AlbiDR/Clash-Manager/pull/991)
* [2026-07-02] PR #990 [Dependencies]: chore(deps): Stage 8 Dependency Audit - July 2026 (``d4280fa``) [View](https://github.com/AlbiDR/Clash-Manager/pull/990)
* [2026-07-01] PR #989 [APK UX]: fix(apk-ux): modernize VoyageSetupForm actions with tactile feedback (``68230b0``) [View](https://github.com/AlbiDR/Clash-Manager/pull/989)
* [2026-07-01] PR #988 [APK Optimization]: perf(apk-optimization): prune redundant AppCompat and legacy resources (``e23c7d8``) [View](https://github.com/AlbiDR/Clash-Manager/pull/988)
* [2026-07-01] PR #987 [APK Integrity]: chore(apk-integrity): update audit log for July 3, 2026 (``27c7df2``) [View](https://github.com/AlbiDR/Clash-Manager/pull/987)
* [2026-07-01] PR #986 [Dependencies]: chore(deps): Stage 8 Dependency Audit - Tier 1 Updates and Watchlist Reconciler (``5aa2831``) [View](https://github.com/AlbiDR/Clash-Manager/pull/986)
* [2026-07-01] PR #985 [Version Integrity]: fix(version): reconcile version drift in valibot substrate (``e3f134c``) [View](https://github.com/AlbiDR/Clash-Manager/pull/985)
* [2026-07-01] PR #984 [TSDoc]: docs(tsdoc): document core app and offline schemas (``51f50d6``) [View](https://github.com/AlbiDR/Clash-Manager/pull/984)
* [2026-07-01] PR #983 [README]: docs(readme): reconcile architecture drift across core and backend (``f022036``) [View](https://github.com/AlbiDR/Clash-Manager/pull/983)
* [2026-07-01] PR #982 [Performance]: perf(opt): standardize variable naming and audit substrate hygiene (``2bddbea``) [View](https://github.com/AlbiDR/Clash-Manager/pull/982)
* [2026-07-01] PR #981 [Baseline]: chore(baseline): fold new migrations into master baseline (``c48d190``) [View](https://github.com/AlbiDR/Clash-Manager/pull/981)
* [2026-07-01] PR #980 [Verification]: test(verify): add specs for MaintenanceSchemas (``387644e``) [View](https://github.com/AlbiDR/Clash-Manager/pull/980)
* [2026-07-01] PR #979 [Hardening]: fix(harden): secure voyage api boundary and state lifecycle (``61ab03d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/979)
* [2026-06-30] PR #978 [APK UX]: fix(apk-ux): integrate tactile feedback into SettingsCard header (``a1c3064``) [View](https://github.com/AlbiDR/Clash-Manager/pull/978)
* [2026-06-30] PR #977 [APK Optimization]: perf(apk-optimization): prune redundant test resources (``7606ab0``) [View](https://github.com/AlbiDR/Clash-Manager/pull/977)
* [2026-06-30] PR #976 [APK Integrity]: chore(apk-integrity): audit and sync manifest integrity (``7ab5967``) [View](https://github.com/AlbiDR/Clash-Manager/pull/976)
* [2026-06-30] PR #975 [Dependencies]: chore(deps): dependency audit and hygiene [Stage 8] (``aff2639``) [View](https://github.com/AlbiDR/Clash-Manager/pull/975)
* [2026-06-30] PR #974 [Version Integrity]: fix(version): reconcile version drift in Supabase Functions (``3f87f87``) [View](https://github.com/AlbiDR/Clash-Manager/pull/974)
* [2026-06-30] PR #973 [TSDoc]: docs(tsdoc): enhance ProfileSchemas and DataMappers interface contracts (``89a28d4``) [View](https://github.com/AlbiDR/Clash-Manager/pull/973)
* [2026-06-30] PR #972 [README]: docs(readme): reconcile voyage promotion and theme engine blueprints (``5fd5f6a``) [View](https://github.com/AlbiDR/Clash-Manager/pull/972)
* [2026-06-30] PR #971 [Refactor/Optimization]: perf(opt): standardize service worker naming and refactor android badge logic (``3932d23``) [View](https://github.com/AlbiDR/Clash-Manager/pull/971)
* [2026-06-30] PR #970 [Hardening]: fix(harden): secure maintenance and push subscription boundaries (``cf271b6``) [View](https://github.com/AlbiDR/Clash-Manager/pull/970)
* [2026-06-29] PR #969 [APK Optimization]: perf(apk-optimization): prune redundant assets and metadata (``3a8a946``) [View](https://github.com/AlbiDR/Clash-Manager/pull/969)
* [2026-06-29] PR #968 [APK Integrity]: fix(apk-integrity): synchronize app_name and verify wrapper integrity (``8045727``) [View](https://github.com/AlbiDR/Clash-Manager/pull/968)
* [2026-06-29] PR #967 [Refactor/Optimization]: refactor: extract BaseSegmentedControl generic molecule (``31f2f17``) [View](https://github.com/AlbiDR/Clash-Manager/pull/967)
* [2026-06-29] PR #966 [Dependencies]: chore(deps): monorepo-wide dependency audit [Stage 8] (``067fb2d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/966)
* [2026-06-29] PR #965 [Version Integrity]: fix(version): reconcile version drift in APK artifacts (``3feb124``) [View](https://github.com/AlbiDR/Clash-Manager/pull/965)
* [2026-06-29] PR #964 [TSDoc]: docs(tsdoc): document Voyage and Base schemas (``01b00c3``) [View](https://github.com/AlbiDR/Clash-Manager/pull/964)
* [2026-06-29] PR #963 [README]: docs(readme): reconcile architectural drift and document core subsystems (``2127b01``) [View](https://github.com/AlbiDR/Clash-Manager/pull/963)
* [2026-06-29] PR #962 [Baseline]: chore(baseline): fold new migrations into master baseline (``6397977``) [View](https://github.com/AlbiDR/Clash-Manager/pull/962)
* [2026-06-29] PR #961 [Verification]: test(verify): saturating coverage for swSchemas and swSync boundaries (``9feba4f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/961)
* [2026-06-29] PR #960 [Hardening]: fix(harden): secure battlelog proxy and recruitment realtime boundary (``ae8f495``) [View](https://github.com/AlbiDR/Clash-Manager/pull/960)
* [2026-06-28] PR #959 [APK Optimization]: perf(apk-optimization): prune redundant assets and optimize manifest (``4fe6b77``) [View](https://github.com/AlbiDR/Clash-Manager/pull/959)
* [2026-06-28] PR #958 [APK Integrity]: fix(apk-integrity): complete monorepo-wide integrity audit (``45468a5``) [View](https://github.com/AlbiDR/Clash-Manager/pull/958)
* [2026-06-28] PR #957 [Dependencies]: chore(deps): bump knip from 6.21.0 to 6.22.0 (``80e598a``) [View](https://github.com/AlbiDR/Clash-Manager/pull/957)
* [2026-06-28] PR #956 [Version Integrity]: fix(version): reconcile version drift in APK/android (``48da039``) [View](https://github.com/AlbiDR/Clash-Manager/pull/956)
* [2026-06-28] PR #955 [TSDoc]: docs(tsdoc): document navigation SSOT interface (``1b202b4``) [View](https://github.com/AlbiDR/Clash-Manager/pull/955)
* [2026-06-28] PR #954 [README]: docs(readme): reconcile backend proxy boundaries and UI molecules (``8d41867``) [View](https://github.com/AlbiDR/Clash-Manager/pull/954)
* [2026-06-28] PR #953 [Verification]: perf(opt): standardize core variable naming and verify substrate hygiene (``b134602``) [View](https://github.com/AlbiDR/Clash-Manager/pull/953)
* [2026-06-28] PR #952 [Verification]: test(verify): extend coverage for data mappers and core components (``eed2dbc``) [View](https://github.com/AlbiDR/Clash-Manager/pull/952)
* [2026-06-28] PR #951 [Hardening]: fix(harden): secure ingest-royale-data pipeline and discovery stage (``f864888``) [View](https://github.com/AlbiDR/Clash-Manager/pull/951)
* [2026-06-27] PR #949 [APK Optimization]: perf(apk-optimization): prune redundant resources and metadata (``c65d698``) [View](https://github.com/AlbiDR/Clash-Manager/pull/949)
* [2026-06-27] PR #948 [APK UX]: fix(apk-ux): add brokered tactile feedback to SelectionBar morph button (``9c16d3d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/948)
* [2026-06-27] PR #947 [APK Integrity]: fix(apk-integrity): sync orientation and verify wrapper integrity (``6e9a4c1``) [View](https://github.com/AlbiDR/Clash-Manager/pull/947)
* [2026-06-27] PR #946 [Dependencies]: chore(deps): bump knip and update major version watchlist (``680a239``) [View](https://github.com/AlbiDR/Clash-Manager/pull/946)
* [2026-06-27] PR #945 [Version Integrity]: chore(version): no drift found (``f535b10``) [View](https://github.com/AlbiDR/Clash-Manager/pull/945)
* [2026-06-27] PR #944 [TSDoc]: docs(tsdoc): document authoritative validation schemas (``7bb3a28``) [View](https://github.com/AlbiDR/Clash-Manager/pull/944)
* [2026-06-27] PR #943 [Baseline]: chore(baseline): fold new migrations into master baseline (``842ab6d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/943)
* [2026-06-27] PR #942 [General]: Substrate Hygiene: Variable Naming Standardization and View Audit (``532c53f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/942)
* [2026-06-27] PR #941 [Hardening]: fix(harden): secure rescan stage and excise anemic pathogens (``436aab7``) [View](https://github.com/AlbiDR/Clash-Manager/pull/941)
* [2026-06-27] PR #940 [Verification]: test(verify): saturate coverage for VoyageClient (``35e0eba``) [View](https://github.com/AlbiDR/Clash-Manager/pull/940)
* [2026-06-26] PR #939 [APK UX]: fix(apk-ux): add tactile feedback to CardActions (``a25b107``) [View](https://github.com/AlbiDR/Clash-Manager/pull/939)
* [2026-06-26] PR #938 [APK Optimization]: perf(apk-optimization): prune redundant resources and debug metadata (``9a163f9``) [View](https://github.com/AlbiDR/Clash-Manager/pull/938)
* [2026-06-26] PR #937 [APK Integrity]: fix(apk-integrity): sync manifest and verify integrity (``75380c5``) [View](https://github.com/AlbiDR/Clash-Manager/pull/937)
* [2026-06-26] PR #936 [Dependencies]: chore(deps): dependency audit and hygiene [Stage 8] (``8a47f85``) [View](https://github.com/AlbiDR/Clash-Manager/pull/936)
* [2026-06-26] PR #935 [Version Integrity]: chore(version): no drift found (``994c226``) [View](https://github.com/AlbiDR/Clash-Manager/pull/935)
* [2026-06-26] PR #934 [README]: docs(readme): reconcile architectural drift in core, app, and utils (``919ab95``) [View](https://github.com/AlbiDR/Clash-Manager/pull/934)
* [2026-06-26] PR #933 [Performance]: perf(opt): standardize variable naming for domain clarity (``71117c7``) [View](https://github.com/AlbiDR/Clash-Manager/pull/933)
* [2026-06-26] PR #932 [Hardening]: fix(harden): secure service worker background sync boundary (``e7fb940``) [View](https://github.com/AlbiDR/Clash-Manager/pull/932)
* [2026-06-25] PR #931 [APK UX]: fix(apk-ux): enhance MemberCard tactile feedback and touch targets (``c2979eb``) [View](https://github.com/AlbiDR/Clash-Manager/pull/931)
* [2026-06-25] PR #930 [APK Optimization]: perf(apk-optimization): prune redundant resources and refine SW cache policy (``546da85``) [View](https://github.com/AlbiDR/Clash-Manager/pull/930)
* [2026-06-25] PR #929 [APK Integrity]: fix(apk-integrity): sync manifest and restore assetlinks integrity (``8401557``) [View](https://github.com/AlbiDR/Clash-Manager/pull/929)
* [2026-06-25] PR #928 [Dependencies]: chore(deps): bump knip and update major version watchlist (``b421c85``) [View](https://github.com/AlbiDR/Clash-Manager/pull/928)
* [2026-06-25] PR #927 [Version Integrity]: chore(version): no drift found (``dd5b788``) [View](https://github.com/AlbiDR/Clash-Manager/pull/927)
* [2026-06-25] PR #926 [TSDoc]: docs(tsdoc): document core selection and visibility services (``9b798fb``) [View](https://github.com/AlbiDR/Clash-Manager/pull/926)
* [2026-06-25] PR #925 [README]: docs(readme): reconcile backend kernel and pwa service registry (``e00ac46``) [View](https://github.com/AlbiDR/Clash-Manager/pull/925)
* [2026-06-25] PR #924 [Performance]: perf(opt): standardize variable naming for domain clarity (``8057097``) [View](https://github.com/AlbiDR/Clash-Manager/pull/924)
* [2026-06-25] PR #923 [Baseline]: chore(baseline): fold new migrations into master baseline (``710ec50``) [View](https://github.com/AlbiDR/Clash-Manager/pull/923)
* [2026-06-25] PR #922 [Verification]: [Stage 2] Verification - Logic Integrity Auditor (``296feca``) [View](https://github.com/AlbiDR/Clash-Manager/pull/922)
* [2026-06-25] PR #921 [Hardening]: fix(harden): secure recruitment boundary and excise anemic pathogens (``bea0632``) [View](https://github.com/AlbiDR/Clash-Manager/pull/921)
* [2026-06-24] PR #920 [APK UX]: fix(apk-ux): add tactile feedback to BaseSelect (``2be5f2f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/920)
* [2026-06-24] PR #919 [APK Optimization]: perf(apk-optimization): enable asset compression and prune locales (``7e9a02b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/919)
* [2026-06-24] PR #918 [APK Integrity]: fix(apk-integrity): synchronize versioning and harden network security (``4ffc664``) [View](https://github.com/AlbiDR/Clash-Manager/pull/918)
* [2026-06-24] PR #917 [Dependencies]: chore(deps): update major version watchlist (``cc6e38f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/917)
* [2026-06-24] PR #916 [TSDoc]: docs(tsdoc): document sort options metadata (``54a9d9b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/916)
* [2026-06-24] PR #915 [Version Integrity]: chore(version): reconcile version drift in supabase plan (``c57ab4b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/915)
* [2026-06-24] PR #914 [README]: docs(readme): reconcile shared interaction directive constraints (``4429e8d``) [View](https://github.com/AlbiDR/Clash-Manager/pull/914)
* [2026-06-24] PR #913 [Verification]: test(verify): add logic proofs for backend shared schemas (``36298c3``) [View](https://github.com/AlbiDR/Clash-Manager/pull/913)
* [2026-06-24] PR #912 [Hardening]: fix(harden): excise any pathogens from vTooltip and App lifecycle (``f745366``) [View](https://github.com/AlbiDR/Clash-Manager/pull/912)
* [2026-06-23] PR #911 [APK UX]: fix(apk-ux): integrate v-tactile haptics into SettingRow (``750052a``) [View](https://github.com/AlbiDR/Clash-Manager/pull/911)
* [2026-06-23] PR #910 [APK Optimization]: perf(apk-optimization): enable hardware acceleration and prune locale resources (``b88197f``) [View](https://github.com/AlbiDR/Clash-Manager/pull/910)
* [2026-06-23] PR #909 [Dependencies]: chore(deps): bump knip from 6.17.1 to 6.18.0 (``a99f31b``) [View](https://github.com/AlbiDR/Clash-Manager/pull/909)
* [2026-06-23] PR #908 [Version Integrity]: chore(version): no drift found in monorepo v14.0.0 (``a7a1082``) [View](https://github.com/AlbiDR/Clash-Manager/pull/908)
* [2026-06-23] PR #907 [TSDoc]: docs(tsdoc): document ScoreThresholdSelector component (``4dda289``) [View](https://github.com/AlbiDR/Clash-Manager/pull/907)
* [2026-06-23] PR #906 [README]: docs(readme): reconcile shared ui and core utility drift (``675cac7``) [View](https://github.com/AlbiDR/Clash-Manager/pull/906)
* [2026-06-23] PR #905 [Performance]: perf(opt): substrate hygiene and naming standardization (``1cae397``) [View](https://github.com/AlbiDR/Clash-Manager/pull/905)
* [2026-06-23] PR #904 [Baseline]: chore(baseline): fold new migrations into master baseline (``043e70a``) [View](https://github.com/AlbiDR/Clash-Manager/pull/904)
* [2026-06-23] PR #903 [Verification]: test(verify): add specs for formatDisplayTag (``9516127``) [View](https://github.com/AlbiDR/Clash-Manager/pull/903)
* [2026-06-23] PR #902 [Hardening]: fix(harden): implement generics in BaseSelect.vue (``7169de7``) [View](https://github.com/AlbiDR/Clash-Manager/pull/902)

## T3 -- Historical (31-90 days)

> Grouped by week and domain. Use for pattern recognition.

#### 2026-W26
* 1 PR [APK Integrity]: #900
* 1 PR [APK Optimization]: #901
* 1 PR [Baseline]: #894
* 1 PR [Dependencies]: #899
* 1 PR [Hardening]: #892
* 1 PR [README]: #896
* 1 PR [Refactor/Optimization]: #895
* 1 PR [TSDoc]: #897
* 1 PR [Verification]: #893
* 1 PR [Version Integrity]: #898

#### 2026-W25
* 1 PR [APK Integrity]: #889
* 1 PR [APK Optimization]: #890
* 1 PR [APK UX]: #891
* 7 PRs [Baseline]: #837, #845, #854, #860, #866, #875, #883
* 7 PRs [Dependencies]: #842, #850, #858, #863, #871, #880, #888
* 2 PRs [General]: #867, #869
* 7 PRs [Hardening]: #836, #843, #852, #859, #864, #873, #881
* 1 PR [Performance]: #838
* 6 PRs [README]: #839, #847, #855, #868, #877, #885
* 5 PRs [Refactor/Optimization]: #846, #851, #872, #876, #884
* 6 PRs [TSDoc]: #840, #848, #856, #861, #878, #886
* 5 PRs [Verification]: #844, #853, #865, #874, #882
* 7 PRs [Version Integrity]: #841, #849, #857, #862, #870, #879, #887

#### 2026-W24
* 4 PRs [Baseline]: #781, #813, #822, #830
* 7 PRs [Dependencies]: #785, #793, #801, #809, #817, #826, #834
* 7 PRs [Hardening]: #780, #788, #795, #803, #811, #820, #828
* 4 PRs [Performance]: #787, #797, #805, #814
* 7 PRs [README]: #782, #790, #798, #806, #815, #823, #831
* 7 PRs [Refactor/Optimization]: #786, #794, #802, #810, #819, #827, #835
* 7 PRs [TSDoc]: #783, #791, #799, #807, #816, #824, #832
* 7 PRs [Verification]: #779, #789, #796, #804, #812, #821, #829
* 7 PRs [Version Integrity]: #784, #792, #800, #808, #818, #825, #833

#### 2026-W23
* 4 PRs [Baseline]: #721, #747, #762, #771
* 7 PRs [Dependencies]: #726, #734, #742, #752, #759, #769, #778
* 1 PR [General]: #756
* 7 PRs [Hardening]: #719, #728, #737, #745, #754, #763, #772
* 4 PRs [Performance]: #722, #730, #748, #765
* 7 PRs [README]: #723, #731, #736, #740, #749, #766, #775
* 9 PRs [Refactor/Optimization]: #727, #735, #739, #744, #753, #755, #760, #770, #774
* 7 PRs [TSDoc]: #724, #732, #741, #750, #757, #767, #776
* 7 PRs [Verification]: #720, #729, #738, #746, #761, #764, #773
* 7 PRs [Version Integrity]: #725, #733, #743, #751, #758, #768, #777

#### 2026-W22
* 6 PRs [Dependencies]: #680, #687, #693, #700, #710, #716
* 4 PRs [General]: #674, #682, #692, #718
* 6 PRs [Hardening]: #676, #688, #690, #695, #704, #711
* 2 PRs [Performance]: #684, #697
* 6 PRs [README]: #678, #685, #691, #698, #707, #713
* 6 PRs [Refactor/Optimization]: #681, #694, #701, #703, #706, #717
* 5 PRs [TSDoc]: #677, #686, #699, #708, #714
* 7 PRs [Verification]: #675, #683, #689, #696, #702, #705, #712
* 3 PRs [Version Integrity]: #679, #709, #715

#### 2026-W21
* 1 PR [Chore]: #668
* 7 PRs [Dependencies]: #628, #635, #643, #649, #656, #664, #672
* 4 PRs [General]: #624, #638, #665, #673
* 8 PRs [Hardening]: #622, #629, #637, #644, #646, #651, #658, #666
* 1 PR [Performance]: #653
* 6 PRs [README]: #632, #640, #647, #654, #661, #669
* 6 PRs [Refactor/Optimization]: #631, #636, #639, #650, #657, #660
* 7 PRs [TSDoc]: #626, #633, #641, #648, #655, #662, #670
* 6 PRs [Verification]: #623, #630, #645, #652, #659, #667
* 6 PRs [Version Integrity]: #625, #627, #634, #642, #663, #671

#### 2026-W20
* 7 PRs [Dependencies]: #580, #586, #591, #599, #606, #613, #620
* 5 PRs [General]: #583, #593, #600, #601, #614
* 6 PRs [Hardening]: #577, #581, #587, #594, #608, #615
* 3 PRs [Performance]: #588, #596, #617
* 7 PRs [README]: #579, #584, #589, #597, #604, #610, #618
* 3 PRs [Refactor/Optimization]: #603, #607, #621
* 6 PRs [TSDoc]: #578, #585, #590, #605, #611, #619
* 5 PRs [Verification]: #582, #595, #602, #609, #616
* 3 PRs [Version Integrity]: #592, #598, #612

#### 2026-W19
* 7 PRs [Dependencies]: #542, #548, #553, #559, #564, #570, #576
* 2 PRs [General]: #546, #573
* 6 PRs [Hardening]: #539, #543, #554, #560, #565, #571
* 1 PR [Performance]: #550
* 6 PRs [README]: #540, #545, #551, #557, #568, #574
* 3 PRs [Refactor/Optimization]: #556, #561, #567
* 7 PRs [TSDoc]: #541, #547, #552, #558, #563, #569, #575
* 6 PRs [Verification]: #544, #549, #555, #562, #566, #572

#### 2026-W18
* 6 PRs [Dependencies]: #509, #514, #520, #527, #532, #538
* 6 PRs [Hardening]: #504, #510, #515, #522, #528, #533
* 6 PRs [README]: #507, #513, #518, #525, #530, #536
* 5 PRs [Refactor/Optimization]: #506, #517, #524, #529, #535
* 6 PRs [TSDoc]: #508, #512, #519, #526, #531, #537
* 5 PRs [Verification]: #505, #511, #516, #523, #534

#### 2026-W17
* 7 PRs [Dependencies]: #467, #472, #477, #484, #490, #496, #503
* 1 PR [General]: #486
* 6 PRs [Hardening]: #462, #473, #478, #485, #492, #498
* 1 PR [Performance]: #464
* 5 PRs [README]: #469, #481, #487, #493, #500
* 2 PRs [Refactor/Optimization]: #480, #499
* 7 PRs [TSDoc]: #466, #470, #476, #482, #488, #494, #501
* 6 PRs [Verification]: #463, #468, #474, #479, #491, #497
* 7 PRs [Version Integrity]: #465, #471, #475, #483, #489, #495, #502

## T4 -- Archive (90+ days)

> Monthly domain summaries. Proven patterns extracted to 00-pipeline-intelligence.md.

