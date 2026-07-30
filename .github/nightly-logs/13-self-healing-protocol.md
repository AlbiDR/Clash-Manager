# Self-Healing Protocol Plan

## Section 1: Stability Failures (Priority 1)

* Stage 4 (Optimization: Substrate Hygiene):
  - Session: sessions/8509760645131525900
  - State: [RESOLVED - monitor] (July 18, 2026)
  - Symptom: No log entry for 2026-07-17 in 04-optimization-coverage.log.
  - Root Cause: The stage instructions referenced get_advisors as a primary tool, but this Supabase MCP tool was not configured in mcp_config.json, leading to a tool execution failure.
  - Recommended Fix: Update the Stage 4 prompt file (.github/nightly-prompts/04-optimization.md) to remove get_advisors from primary-tools or configure the Supabase MCP server in mcp_config.json.
  - Resolution Details: Prompt corrected in commit 041c945. Verified that the get_advisors tool reference was successfully pruned.

* Stage 10 (APK and PWA Wrapper Integrity Auditor):
  - Session: sessions/5273144977358147736
  - State: [RESOLVED - monitor] (July 18, 2026)
  - Symptom: No log entry for 2026-07-17 in 10-apk-integrity-coverage.log.
  - Root Cause: The verification checks required clashmanager.apk by default, but the compiled output is versioned as clashmanager-v14.31.2.apk, and the pipeline environment lacked Android SDK build tools like aapt2.
  - Recommended Fix: Modify Stage 10 instructions to locate versioned APKs dynamically and add safety checks for local build-tools dependencies.
  - Resolution Details: Resolved in today's run. Stage 10 executed cleanly and logged a CLEAN audit pass for 2026-07-18.

* Stage 12 (Hybrid Shell UX and UI Auditor):
  - Session: sessions/2588879370329790963
  - State: [RESOLVED - monitor] (July 18, 2026)
  - Symptom: No log entry for 2026-07-17 in 12-apk-ux-coverage.log.
  - Root Cause: Global frontend sweeps failed if build checks or dependency-cruiser boundary checks failed under Node 22+ without appropriate bypass flags.
  - Recommended Fix: Harden validation steps in Stage 12 prompt (.github/nightly-prompts/12-apk-ux.md) to handle missing tool environments gracefully.
  - Resolution Details: Resolved in today's run. Stage 12 executed cleanly and logged a CHANGED pass for TargetPicker.vue on 2026-07-18.

* Missing-Run Events (Stage 1, Stage 3, Stage 4, Stage 9) on 2026-07-18:
  - State: [RESOLVED - monitor] (July 20, 2026)
  - Symptom: No log entries for 2026-07-18 in 01-hardening-coverage.log, 03-baseline-consolidation-coverage.log, 04-optimization-coverage.log, or 09-refactor-proposals-coverage.log.
  - Root Cause: These stages were not triggered or execution did not complete during today's automation cycle, possibly skipped due to zero-diff preconditions or trigger scheduling.
  - Recommended Fix: Monitor tomorrow's pipeline execution to ensure these stages recover and resume logging correctly.

* Missing-Run / Failed Events on 2026-07-21:
  - Stages: Stage 1, Stage 2, Stage 4, Stage 6, Stage 11.
  - State: [RESOLVED - monitor] (July 22, 2026)
  - Symptom: No log entries for 2026-07-21 in 01-hardening-coverage.log, 02-verification-coverage.log, 04-optimization-coverage.log, 06-documentation-tsdoc-coverage.log, or 11-apk-optimization-coverage.log.
  - Root Cause: These stages were not triggered, skipped, or failed to complete their execution cycles.
  - Recommended Fix: Monitor subsequent runs. Stages 1, 4, and 6 recovered successfully on July 22, 2026. Stage 2 and Stage 11 did not recover and are promoted to [RECURRING] status under July 22 events.

* Missing-Run / Failed Events on 2026-07-22:
  - Stages: Stage 2 (Verify) [RESOLVED - monitor] (July 25, 2026), Stage 11 (APK-Optimization) [RECURRING] (July 25, 2026).
  - State: [RESOLVED - monitor] for Stage 2 / [RECURRING] for Stage 11
  - Symptom: No log entries for 2026-07-22 in 02-verification-coverage.log or 11-apk-optimization-coverage.log.
  - Root Cause: These stages failed to log or execute their nightly run. Since they left no trace in the logs or PR history, the exact failure modes are unobservable. Stage 2 and Stage 11 have now missed multiple consecutive runs, indicating a scheduling or environment blocker.
  - Recommended Fix: Re-verify scheduling and webhook triggers in CI configurations, and audit local build wrappers or dependency constraints for any silent environment crashes.

* Missing-Run / Failed Events on 2026-07-23:
  - Stages: Stage 2 (Verify) [RESOLVED - monitor] (July 25, 2026), Stage 11 (APK-Optimization) [RECURRING] (July 25, 2026).
  - State: [RESOLVED - monitor] for Stage 2 / [RECURRING] for Stage 11
  - Symptom: No log entries for 2026-07-23 in 02-verification-coverage.log or 11-apk-optimization-coverage.log.
  - Root Cause: These stages failed to log or execute their nightly runs today. However, a major discovery was made: during pre-flight loading, when Jules is initialized, connecting to the Supabase MCP server caused massive context explosions and silent crashes before any output could be written. This blocked both stages completely.
  - Recommended Fix: AlbiDR applied a critical pipeline hardening fix in commit `b81469c` on July 22, 2026, moving the MCP prohibition exception directly into the Base 2 instructions so that the prohibition is read at the very start of tool initialization, preventing silent crashes. Subsequent runs should be monitored closely to ensure Stage 2 and Stage 11 recover successfully now that the Base 2 MCP prohibition is active.

* Missing-Run / Failed Events on 2026-07-24:
  - Stages: Stage 2 (Verify) [RESOLVED - monitor] (July 25, 2026), Stage 11 (APK-Optimization) [RECURRING] (July 25, 2026).
  - State: [RESOLVED - monitor] for Stage 2 / [RECURRING] for Stage 11
  - Symptom: No log entries for 2026-07-24 in 02-verification-coverage.log or 11-apk-optimization-coverage.log.
  - Root Cause: These stages failed to log or execute their nightly runs today. Since they left no trace in the logs or PR history, the exact failure modes are unobservable. Stage 2 and Stage 11 have now missed multiple consecutive runs, indicating a scheduling, trigger, or environment blocker.
  - Recommended Fix: Re-verify scheduling and webhook triggers in CI configurations, and audit local build wrappers or dependency constraints for any silent environment crashes.

* Missing-Run / Failed Events on 2026-07-25:
  - Stages: Stage 1 (Harden) [RESOLVED - monitor] (July 26, 2026), Stage 11 (APK-Optimization) [RESOLVED - monitor] (July 26, 2026).
  - State: [RESOLVED - monitor] for Stage 1 / [RESOLVED - monitor] for Stage 11
  - Symptom: No log entries for 2026-07-25 in 01-hardening-coverage.log or 11-apk-optimization-coverage.log.
  - Root Cause: Stage 1 did not execute or write logs today, possibly skipped due to zero-diff preconditions or trigger scheduling. Stage 11 continues to miss runs consecutively, indicating a persistent scheduling, webhook trigger, or environment constraint in CI (such as missing ANDROID_HOME or native build tools in the runner).
  - Recommended Fix: For Stage 1, monitor tomorrow's run for automatic recovery. For Stage 11, audit the CI workflow logs to check for runner environment capabilities and webhook/cron scheduler trigger definitions.
  - Resolution Details for Stage 1 and Stage 11: Both Stage 1 and Stage 11 successfully ran and recovered today on July 26, 2026, logging clean audit passes. This confirms scheduling/environment alignment has been restored for these stages.
  - Resolution Details for Stage 2: Stage 2 (Verify) successfully ran and recovered today on July 25, 2026, logging standard CHANGED test updates. This confirms that moving the MCP prohibition directly into the Base 2 instructions successfully resolved its silent crashes during pre-flight tool initialization.

* Missing-Run / Failed Events on 2026-07-26:
  - Stages: Stage 9 (Refactor) [RESOLVED - monitor] (July 27, 2026).
  - State: [RESOLVED - monitor]
  - Symptom: No log entry for 2026-07-26 in 09-refactor-proposals-coverage.log on the Nightly branch.
  - Root Cause: Stage 9 successfully ran and opened a branch/PR, but because of execution sequencing or a delay in the merge pipeline, the branch was not merged back to Nightly before Stage 13 executed.
  - Recommended Fix: Verify the automated merger runner execution order. Wait for the auto-merge workflow to complete or serialize pipeline stages.
  - Resolution Details: Stage 9 successfully ran and was merged, and registered clean passes on July 27, 2026.

* Missing-Run / Failed Events on 2026-07-27:
  - Stages: Stage 11 (APK-Optimization) [FAILED - monitor] (July 27, 2026).
  - State: [FAILED - monitor]
  - Symptom: No log entry for 2026-07-27 in 11-apk-optimization-coverage.log.
  - Root Cause: Stage 11 was not triggered or did not write logs today, likely skipped due to a scheduling, webhook trigger, or container runner skipping event in CI.
  - Recommended Fix: Monitor subsequent runs to verify automatic recovery.

* Missing-Run / Failed Events on 2026-07-28:
  - Stages: Stage 2 (Verify) [RECURRING], Stage 4 (Optimization) [RESOLVED - monitor], Stage 5 (README) [RECURRING], Stage 8 (Dependency-Audit) [RESOLVED - monitor], Stage 11 (APK-Optimization) [RESOLVED - monitor].
  - State: [RECURRING] for Stage 2 and Stage 5 / [RESOLVED - monitor] for Stage 4, Stage 8, and Stage 11
  - Symptom: No log entries for 2026-07-28 in 02-verification-coverage.log, 04-optimization-coverage.log, 05-documentation-readme-coverage.log, 08-dependency-audit-coverage.log, or 11-apk-optimization-coverage.log.
  - Root Cause: These stages failed to trigger or execute on July 28. Stages 4, 8, and 11 successfully recovered on July 29, 2026. Stages 2 and 5 did not recover and missed today's run, which constitutes a recurring class failure.
  - Recommended Fix: Address trigger issues in CI configuration; perform preventive actions on scheduling.

* Missing-Run / Failed Events on 2026-07-29 [SUPERSEDED - see resolution below]:
  - Stages: Stage 2 (Verify) [RECURRING], Stage 5 (README) [RECURRING], Stage 9 (Refactor) [FAILED - monitor].
  - State: [RECURRING] for Stage 2 and Stage 5 / [FAILED - monitor] for Stage 9
  - Symptom: No log entries for 2026-07-29 in 02-verification-coverage.log, 05-documentation-readme-coverage.log, or 09-refactor-proposals-coverage.log.
  - Root Cause: Stage 2 and Stage 5 missed their runs consecutively today, indicating a persistent scheduling, webhook trigger, or container runner skipping event in CI. Stage 9 missed its run today, possibly due to zero-diff preconditions or execution scheduling issues.
  - Recommended Fix: Audit the CI/CD workflow runner environment and webhook trigger configurations to ensure stable sequential execution of all pipeline stages. Monitor subsequent runs to verify automatic recovery.
  - Resolution Details (2026-07-29, later same day): All three stages completed later on 2026-07-29 with valid TODAY-dated log entries: Stage 2 logged a CHANGED entry (useUiCoordinator.spec.ts merge-contract coverage), Stage 5 logged a CHANGED entry (core/services README import-boundary reconciliation), and Stage 9 logged four CLEAN entries (duplicate-detection, size-audit, and layer-violation scan, all clean). This confirms the three stages did not fail structurally today; the gap observed earlier in the day was a same-day sequencing artifact, not a stage-level defect. Re-verification across a full 12-stage sequential run today (2026-07-29) found zero FAILED or missing stages: all 12 preceding coverage logs (01 through 12) carry a TODAY-dated entry. This is the first fully-clean day recorded in this document's history. Stage 2 and Stage 5 are demoted from [RECURRING] to [RESOLVED - monitor]; Stage 9 is demoted from [FAILED - monitor] to [RESOLVED - monitor]. Continue monitoring for one more recurrence before considering the pattern closed.

## Section 2: Cross-Stage Coherence Bugs (Priority 2)

* Duplicate Merge Failure Blocks in 00-pr-history.md:
  - Symptom: The merge failure records for PR #1113, PR #1111, and PR #1108 are appended in redundant duplicate blocks in the active T1 section (e.g. 10 duplicate blocks for PR #1113).
  - Root Cause: Since the merge-nightly-prs workflow is triggered on pull_request events, multiple pipeline stages opening PRs concurrently trigger multiple concurrent instances of the merge workflow. Each concurrent run executes merge-nightly-prs.ts, checks if the fail marker is in the checked-out main branch (it is not yet), appends the failure, and rebases via "git pull origin Nightly --rebase" before pushing. This rebase stacks the duplicates sequentially.
  - Recommended Fix: Update the log-writing script `merge-nightly-prs.ts` to perform a git pull/fetch and re-read the file immediately prior to checking for the presence of the fail marker and writing. Alternatively, serialize or restrict merge-nightly-prs workflow triggers to scheduled crons only rather than triggering on every concurrent pull request event.

* Deviation from Standard Log Format in Stage 2 and Stage 4:
  - Symptom: Stage 2 and Stage 4 wrote log entries using "Target: Codebase" instead of the standard "CHANGED:" or "CLEAN:" status prefixes.
  - Root Cause: Custom prompt instructions for Stage 2 and Stage 4 specified their own log formats, overriding the Base 4 log format requirements.
  - Recommended Fix: Reconcile Stage 2 and Stage 4 prompts with the standard log format prefix instructions.
  - State: [RESOLVED] (Stage 2 successfully logged standard "CHANGED:" prefix on July 18, 2026. Stage 4 prompt instructions have been reconciled).

* Concurrent Shared-File Conflicts Leading to Merge Failures (July 21, 2026) [RECURRING - escalated]:
  - Symptom: Stage 5 (PR #1169) and Stage 9 (PR #1171) failed to auto-merge on July 21, 2026 due to hard merge conflicts (State: dirty). The identical failure mode recurred twice more: PR #1245 (`chore(apk-optimization): no optimization required`, July 27, 2026) and PR #1250 (`perf(opt): standardize Layer 1 Core catch block parameter naming`, July 28, 2026), both recorded in `00-pr-history.md` as `MERGE FAILED ... Merge conflicts (state: dirty)`.
  - Root Cause: Unchanged from the original diagnosis. Multiple automated stages execute and open PRs in parallel or rapid succession. Each stage appends its run record to shared files such as `00-pr-history.md` and their respective coverage logs. When one stage's PR is merged, `Nightly` advances, causing all other outstanding PRs that modified the same lines in `00-pr-history.md` to instantly develop hard merge conflicts, aborting their auto-merge workflows. Two more occurrences six and seven days after the original diagnosis confirm the recommended fix below was never applied -- this is now a confirmed [RECURRING] pipeline defect, not an isolated incident.
  - Recommended Fix (unchanged, now higher priority): Update the CI/CD pipeline to serialize the execution of the 13 stages to run sequentially instead of concurrently (so each stage pulls the latest merged work from the previous stage before starting). Alternatively, update the auto-merge workflow to automatically rebase outstanding stage PRs on the latest `Nightly` HEAD and resolve conflicts programmatically before attempting auto-merge. This session (2026-07-29) executed all 13 stages strictly sequentially in one working tree, pulling/rebasing onto `origin/Beta` before each stage and committing directly rather than opening 13 parallel PRs -- zero merge conflicts resulted. This is empirical evidence the serialization fix works; the remaining work is to encode it into the actual CI/CD trigger configuration rather than relying on sequential execution happening to occur.

## Section 3: No-Diff and Low-Value Audit (Priority 3)

* Stage 1 (Harden):
  - Consecutive No-Diff Days: 4 (CLEAN logged on 2026-07-26, 2026-07-27, 2026-07-28, and 2026-07-29)
  - Analysis: Today's run (2026-07-29) actually produced a CHANGED entry -- closed a global-singleton `as any` write in `useUiCoordinator.ts` -- but the log carries both the earlier CLEAN pass and this later CHANGED fix for the same date. Treating the day as its most significant outcome (CHANGED), the streak resets to 0 as of this write. Prior to today, the 4-day CLEAN streak reflected the Backend Edge Function tree reaching audit saturation within its 7-day re-audit window (per pipeline-intelligence Stage 1 scope note added today): once that tree is excluded, Stage 1's only remaining live surface is Target B/C (layer isolation, `any` boundaries) in Frontend-PWA, which is a narrower, slower-refilling pool. Saturation by design, not a scoping defect.

* Stage 2 (Verify):
  - Consecutive No-Diff Days: 0 (CHANGED logged on 2026-07-29 -- see Section 1 resolution)
  - Analysis: Recovered today. Closed the coverage gap on the merge contract Stage 1 hardened in the same cycle (falsy-value and off-contract-key traps), and proved non-triviality by reverting the implementation and observing 2 of 4 new specs fail. No missed-opportunity signal; Recent-Change Priority correctly routed to the highest-value target.

* Stage 3 (Baseline Consolidation):
  - Consecutive No-Diff Days: 1 (CLEAN logged on 2026-07-29 -- 0 unfolded objects across all 17 post-baseline migrations)
  - Analysis: Genuine saturation, not a scoping defect: a fold-state replay (chronological DDL diff against the baseline) is the authoritative signal here, not a filename heuristic, and it reports zero folding work pending. One real deviation was found and deliberately deferred (a non-declarative identity/UPDATE residue) because a concurrent session already held a broader in-flight fix for the same block; recorded as SKIPPED with full reasoning rather than silently passed over.

* Stage 4 (Optimization):
  - Consecutive No-Diff Days: 0 (CHANGED logged earlier on 2026-07-29 by a prior run today; a second CLEAN pass was logged later the same day)
  - Analysis: The later pass investigated a plausible-looking bottleneck (hoisting `Intl.Collator` over `localeCompare` in the list comparators), implemented it, and disproved it by measurement: 3.24x slower on V8, reverted in full. This is the correct behaviour Stage 4 should exhibit more often -- optimization hypotheses are measured, not assumed. Recorded as a Known Pitfall so no future run re-attempts it.

* Stage 5 (README):
  - Consecutive No-Diff Days: 0 (CHANGED logged on 2026-07-29 -- see Section 1 resolution)
  - Analysis: Recovered today. Found and fixed a real drift: the core/services README under-declared its own import boundary (omitted `@core/config` and `@core/types`, both in active use), which would have read as a false prohibition to any agent following it. Recent-Change routing (Stage 1 touched an adjacent file) correctly surfaced this.

* Stage 6 (TSDoc):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-29)
  - Analysis: Recent-Change Priority correctly followed Stage 1's hardening work into the same file and closed a real gap (`setFabVisible` missing `@param` and the dockVisible/toastOffset coupling note).

* Stage 7 (Version Integrity):
  - Consecutive No-Diff Days: 4 (CLEAN logged on 2026-07-26, 2026-07-27, 2026-07-28, and 2026-07-29)
  - Analysis: Audited root, PWA, and backend manifests; confirmed zero version drift across monorepo v14.40.0, corroborated independently by `pnpm run audit:version` (PASS). Saturation by design -- Stage 8 owns the actual version-changing work, so a clean Stage 7 run is the expected steady state, not a missed opportunity.

* Stage 8 (Dependency Audit):
  - Consecutive No-Diff Days: 0 (CHANGED logged on 2026-07-29)
  - Analysis: Bumped @supabase/supabase-js (Tier 1 minor), added jsdom to the major watchlist as a new entry, and refreshed the vite watchlist entry's latest-version figure (8.1.5 -> 8.2.0). Healthy cadence.

* Stage 9 (Refactor):
  - Consecutive No-Diff Days: 8 (CLEAN logged on every date from 2026-07-22 through 2026-07-29, unbroken)
  - Analysis: [MISSED-OPPORTUNITY SIGNAL] This is the longest unbroken CLEAN streak of any stage in this document and warrants scrutiny rather than a rubber-stamp "saturation by design." Today's run did find two files over the 400-line threshold (`profiler.ts` at 452 lines, `royaleSchemas.ts` at 407) and explicitly rejected both: `profiler.ts` because it is a single tightly-coupled orchestration function in a live data-ingestion Edge Function where a mechanical split carries real regression risk for low structural gain, and `royaleSchemas.ts` because splitting a single cohesive schema file barely over threshold would be over-engineering. Both rejections are individually defensible, but an 8-day streak of "found candidates, rejected all of them" is itself evidence that Stage 9's Priority List (Duplicate Detection, Size Audit, Layer Violation) is tuned to a risk tolerance that structurally cannot produce a PR against a codebase this well-maintained. Recommended prompt change: add a fourth, lower-risk priority item to `09-refactor-proposals.md` Section 3 -- "Test-Only or Doc-Only Structural Cleanup" (e.g. consolidating duplicate spec files, splitting a purely-declarative schema/type file with no runtime coupling) -- so the stage has a safe-to-attempt tier below "split a live orchestration function" once that tier is exhausted. Do not lower the bar on the risky tier; add a safer one alongside it.

* Stage 10 (APK-Integrity):
  - Consecutive No-Diff Days: 8 (CLEAN logged on 2026-07-22 [CHANGED] then 2026-07-23 through 2026-07-29 CLEAN -- 7 consecutive CLEAN days, now 8 counting today)
  - Analysis: Audited manifest parity, Digital Asset Links fingerprints, and Android native layer security configurations via the automated `audit-wrapper-integrity.mjs` script, which reports a binary PASS/FAIL rather than a graded finding. Saturation by design: this stage's own tooling is authoritative and exhaustive, so a long CLEAN streak here means the audited surface is actually stable, not that the scan is too narrow.

* Stage 11 (APK-Optimization):
  - Consecutive No-Diff Days: 2 (CLEAN logged on 2026-07-29; note the log also shows a break on 2026-07-28, so this counts only the current unbroken run)
  - Analysis: Found and corrected a real documentation defect today: `00-pipeline-intelligence.md`'s WebView Security section claimed `setSafeBrowsingEnabled(false)` was established practice, but the actual code (`MainActivity.java:103`) sets it to `true`. No Gradle/ProGuard pipeline exists in this project (confirmed via `build-apk.sh`, which compiles via `javac` + `d8` directly), so Target A (R8/ProGuard minification) is structurally inapplicable here and should not be treated as an unaddressed gap in future audits.

* Stage 12 (APK-UX):
  - Consecutive No-Diff Days: 0 (CHANGED logged on 2026-07-29)
  - Analysis: Found and fixed a genuine touch-target gap in `NetworkSettings.vue` (edit/save/cancel controls at 40px or undeclared dimensions, below the 48px minimum) that had escaped seven-plus prior runs. This suggests Priority 4 (Touch Target Compliance) scanning in prior runs concentrated on higher-traffic feature views (Roster, Headhunter, Laboratory) and under-swept Settings sub-components; worth widening the sweep pattern rather than a prompt change.

* Stage 13 (Self-Healing):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-29)
  - Analysis: This run recomputed all 12 no-diff counters directly from full per-stage per-day log history (rather than incrementally trusting the previous day's cached counters), and found two counters had drifted from what a literal increment would have produced. Recommend this direct-recomputation method become the standing procedure for Step 4 rather than an occasional check.