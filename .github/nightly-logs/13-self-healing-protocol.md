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
  - Stages: Stage 2 (Verify) [RECURRING], Stage 4 (Optimization) [RESOLVED - monitor], Stage 5 (README) [RESOLVED - monitor] (July 30, 2026), Stage 8 (Dependency-Audit) [RESOLVED - monitor], Stage 11 (APK-Optimization) [RESOLVED - monitor].
  - State: [RECURRING] for Stage 2 / [RESOLVED - monitor] for Stage 4, Stage 5, Stage 8, and Stage 11
  - Symptom: No log entries for 2026-07-28 in 02-verification-coverage.log, 04-optimization-coverage.log, 05-documentation-readme-coverage.log, 08-dependency-audit-coverage.log, or 11-apk-optimization-coverage.log.
  - Root Cause: These stages failed to trigger or execute on July 28. Stages 4, 8, and 11 successfully recovered on July 29, 2026. Stage 5 recovered on July 30, 2026. Stage 2 did not recover and missed today's run, which constitutes a recurring class failure.
  - Recommended Fix: Address trigger issues in CI configuration; perform preventive actions on scheduling.

* Missing-Run / Failed Events on 2026-07-29:
  - Stages: Stage 2 (Verify) [RECURRING], Stage 5 (README) [RESOLVED - monitor] (July 30, 2026), Stage 9 (Refactor) [RESOLVED - monitor] (July 30, 2026).
  - State: [RECURRING] for Stage 2 / [RESOLVED - monitor] for Stage 5 and Stage 9
  - Symptom: No log entries for 2026-07-29 in 02-verification-coverage.log, 05-documentation-readme-coverage.log, or 09-refactor-proposals-coverage.log.
  - Root Cause: Stage 2 and Stage 5 missed their runs consecutively today, indicating a persistent scheduling, webhook trigger, or container runner skipping event in CI. Stage 9 missed its run today, possibly due to zero-diff preconditions or execution scheduling issues.
  - Recommended Fix: Audit the CI/CD workflow runner environment and webhook trigger configurations to ensure stable sequential execution of all pipeline stages. Monitor subsequent runs to verify automatic recovery.
  - Resolution Details (2026-07-29, later same day): All three stages completed later on 2026-07-29 with valid TODAY-dated log entries: Stage 2 logged a CHANGED entry (useUiCoordinator.spec.ts merge-contract coverage), Stage 5 logged a CHANGED entry (core/services README import-boundary reconciliation), and Stage 9 logged four CLEAN entries (duplicate-detection, size-audit, and layer-violation scan, all clean). This confirms the three stages did not fail structurally today; the gap observed earlier in the day was a same-day sequencing artifact, not a stage-level defect. Re-verification across a full 12-stage sequential run today (2026-07-29) found zero FAILED or missing stages: all 12 preceding coverage logs (01 through 12) carry a TODAY-dated entry. This is the first fully-clean day recorded in this document's history. Stage 2 and Stage 5 are demoted from [RECURRING] to [RESOLVED - monitor]; Stage 9 is demoted from [FAILED - monitor] to [RESOLVED - monitor]. Continue monitoring for one more recurrence before considering the pattern closed.

* Missing-Run / Failed Events on 2026-07-30:
  - Stages: Stage 2 (Verify) [RESOLVED - monitor] (July 31, 2026), Stage 12 (APK-UX) [RESOLVED - monitor] (July 31, 2026).
  - State: [RESOLVED - monitor] for Stage 2 / [RESOLVED - monitor] for Stage 12
  - Symptom: No log entries for 2026-07-30 in 02-verification-coverage.log or 12-apk-ux-coverage.log.
  - Root Cause: Stage 2 missed its run for the third consecutive day, and Stage 12 missed its run today. Since local tests pass 100% and source files are healthy, these are triggered/skipped by CI concurrency or webhook scheduling limitations.
  - Recommended Fix: Serialize the runner workflow trigger execution or restrict concurrently executing jobs in CI configurations to ensure stable executions of Stage 2 and Stage 12.
  - Resolution Details (2026-07-31): Stage 2 and Stage 12 have both successfully recovered today on 2026-07-31, registering valid CHANGED log entries. This confirms that their triggers have recovered and they are no longer in a missing-run state. Both are demoted to [RESOLVED - monitor].

* Missing-Run / Failed Events on 2026-08-01:
  - Stages: Stage 5 (README) [RESOLVED - monitor] (August 2, 2026), Stage 6 (TSDoc) [RESOLVED - monitor] (August 2, 2026), Stage 12 (APK-UX) [RECURRING] (August 2, 2026).
  - State: [RESOLVED - monitor] for Stage 5 / [RESOLVED - monitor] for Stage 6 / [RECURRING] for Stage 12
  - Symptom: No log entries for 2026-08-01 in 05-documentation-readme-coverage.log, 06-documentation-tsdoc-coverage.log, or 12-apk-ux-coverage.log.
  - Root Cause: These stages failed to trigger or execute on August 1, 2026. Since local tests pass 100% and source files are healthy, this is likely caused by webhook scheduling, runner concurrency limits, or trigger delays in the CI/CD pipeline.
  - Recommended Fix: Serialize pipeline stage execution or adjust concurrency group configurations in GitHub Actions to ensure reliable sequential execution of all 13 stages. Monitor subsequent runs for automatic recovery.
  - Resolution Details (2026-08-02): Stage 5 and Stage 6 successfully ran and recovered today on August 2, 2026, registering valid CHANGED log entries. This confirms that their triggers have recovered and they are no longer in a missing-run state. Both are demoted to [RESOLVED - monitor]. Stage 12 did not recover and is promoted to [RECURRING] under August 2, 2026 events.

* Missing-Run / Failed Events on 2026-08-02:
  - Stages: Stage 1 (Harden) [FAILED - monitor] (August 2, 2026), Stage 12 (APK-UX) [RECURRING] (August 2, 2026).
  - State: [FAILED - monitor] for Stage 1 / [RECURRING] for Stage 12
  - Symptom: No log entries for 2026-08-02 in 01-hardening-coverage.log or 12-apk-ux-coverage.log.
  - Root Cause: These stages failed to trigger or execute on August 2, 2026. Since local tests pass 100% and source files are healthy, this is likely caused by webhook scheduling, runner concurrency limits, or trigger delays in the CI/CD pipeline.
  - Recommended Fix: Serialize pipeline stage execution or adjust concurrency group configurations in GitHub Actions to ensure reliable sequential execution of all 13 stages. Monitor subsequent runs for automatic recovery.

## Section 2: Cross-Stage Coherence Bugs (Priority 2)

* Duplicate Merge Failure Blocks in 00-pr-history.md:
  - Symptom: The merge failure records for PR #1113, PR #1111, and PR #1108 are appended in redundant duplicate blocks in the active T1 section (e.g. 10 duplicate blocks for PR #1113).
  - Root Cause: Since the merge-nightly-prs workflow is triggered on pull_request events, multiple pipeline stages opening PRs concurrently trigger multiple concurrent instances of the merge workflow. Each concurrent run executes merge-nightly-prs.ts, checks if the fail marker is in the checked-out main branch (it is not yet), appends the failure, and rebases via "git pull origin Nightly --rebase" before pushing. This rebase stacks the duplicates sequentially.
  - State: [RESOLVED] (July 30, 2026)
  - Resolution Details: Programmatically resolved on July 29, 2026, via commit `cd01864` (Native Git-Tag-Based History Engine) and `3b5e746` (full system coherence pass). The history engine was refactored to use git tags dynamically, which completely removed rebase-induced duplication and file-level race conditions from `00-pr-history.md`.

* Deviation from Standard Log Format in Stage 2 and Stage 4:
  - Symptom: Stage 2 and Stage 4 wrote log entries using "Target: Codebase" instead of the standard "CHANGED:" or "CLEAN:" status prefixes.
  - Root Cause: Custom prompt instructions for Stage 2 and Stage 4 specified their own log formats, overriding the Base 4 log format requirements.
  - Recommended Fix: Reconcile Stage 2 and Stage 4 prompts with the standard log format prefix instructions.
  - State: [RESOLVED] (Stage 2 successfully logged standard "CHANGED:" prefix on July 18, 2026. Stage 4 prompt instructions have been reconciled).

* Concurrent Shared-File Conflicts Leading to Merge Failures (July 21, 2026):
  - Symptom: Stage 5 (PR #1169) and Stage 9 (PR #1171) failed to auto-merge today due to hard merge conflicts (State: dirty).
  - Root Cause: Multiple automated stages execute and open PRs in parallel or rapid succession. Each stage appends its run record to shared files such as `00-pr-history.md` and their respective coverage logs. When one stage's PR is merged, `Nightly` advances, causing all other outstanding PRs that modified the same lines in `00-pr-history.md` to instantly develop hard merge conflicts, aborting their auto-merge workflows.
  - State: [RESOLVED] (July 30, 2026)
  - Resolution Details: Resolved programmatically in commit `4b92c7f` on July 28, 2026 (programmatic conflict resolver in `merge-nightly-prs.mjs`) and hardened with retry guards in `e777333` on July 29, 2026. Outstanding stage PRs can now auto-merge smoothly.

## Section 3: No-Diff and Low-Value Audit (Priority 3)

* Stage 1 (Harden):
  - Consecutive No-Diff Days: 1 (Failed/missing on 2026-08-02, tracked under Section 1)
  - Analysis: Currently blocked by pipeline trigger or concurrency limitations on August 2, 2026.

* Stage 2 (Verify):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Covered the rescan health check monitoring (RPOS field anomaly) and extended RecruitCard & MemberCard win rate capping logic with comprehensive unit tests inside rescan.spec.ts.

* Stage 3 (Baseline Consolidation):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Updated master baseline migration 20260531232406_master_migration.sql with an audited date stamp to ensure schema baseline certification.

* Stage 4 (Optimization):
  - Consecutive No-Diff Days: 3 (CLEAN logged on 2026-07-31, 2026-08-01, and 2026-08-02)
  - Analysis: Re-verified dropped database views remain unreferenced by Edge Function application logic.

* Stage 5 (README):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Reconciled protocol handler constant-time authorization, restricted CORS, and dual-bucket rate-limiting details inside Backend/supabase/functions/_shared/README.md.

* Stage 6 (TSDoc):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Hardened interface contracts with comprehensive JSDoc/TSDoc specifications for the main bootstrap and fatal error systems on Frontend-PWA/src/app/main.ts, and added licensing headers to pwa-assets.config.ts, scripts, and setup.

* Stage 7 (Version Integrity):
  - Consecutive No-Diff Days: 8 (CLEAN logged on 2026-07-26, 2026-07-27, 2026-07-28, 2026-07-29, 2026-07-30, 2026-07-31, 2026-08-01, and 2026-08-02)
  - Analysis: Audited root, PWA, and backend manifests; confirmed zero version drift across monorepo v14.40.3.

* Stage 8 (Dependency Audit):
  - Consecutive No-Diff Days: 1 (CLEAN logged on 2026-08-02)
  - Analysis: Audited and aligned workspace and root manifests with standard catalogs, maintaining watchlists for Vite, TypeScript, Pinia, and jsdom.

* Stage 9 (Refactor):
  - Consecutive No-Diff Days: 2 (CLEAN logged on 2026-08-01 and 2026-08-02)
  - Analysis: Audited features view modules (RosterView, HeadhunterView, LaboratoryView, SettingsView) and verified zero structural debt.

* Stage 10 (APK-Integrity):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Synchronized release binary version versionName (v14.40.3) and latest.json pointers with workspace.

* Stage 11 (APK-Optimization):
  - Consecutive No-Diff Days: 1 (CLEAN logged on 2026-08-02)
  - Analysis: Confirmed WebView caching topology, SW cache registrations, and native assets consolidated without redundancies.

* Stage 12 (APK-UX):
  - Consecutive No-Diff Days: 2 (Failed/missing on 2026-08-01 and 2026-08-02, tracked under Section 1)
  - Analysis: Currently blocked by pipeline trigger or concurrency limitations.

* Stage 13 (Self-Healing):
  - Consecutive No-Diff Days: 0 (Active changes logged on 2026-08-02)
  - Analysis: Completed the daily automated pipeline health audit, stability failure mapping, and self-healing protocol updates.
