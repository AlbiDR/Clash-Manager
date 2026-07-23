# Self-Healing Protocol Plan

## Section 1: Stability Failures (Priority 1)

* Stage 4 (Optimization: Substrate Hygiene):
  * Session: sessions/8509760645131525900
  * State: [RESOLVED - monitor] (July 18, 2026)
  * Symptom: No log entry for 2026-07-17 in 04-optimization-coverage.log.
  * Root Cause: The stage instructions referenced get_advisors as a primary tool, but this Supabase MCP tool was not configured in mcp_config.json, leading to a tool execution failure.
  * Recommended Fix: Update the Stage 4 prompt file (.github/nightly-prompts/04-optimization.md) to remove get_advisors from primary-tools or configure the Supabase MCP server in mcp_config.json.
  * Resolution Details: Prompt corrected in commit 041c945. Verified that the get_advisors tool reference was successfully pruned.

* Stage 10 (APK and PWA Wrapper Integrity Auditor):
  * Session: sessions/5273144977358147736
  * State: [RESOLVED - monitor] (July 18, 2026)
  * Symptom: No log entry for 2026-07-17 in 10-apk-integrity-coverage.log.
  * Root Cause: The verification checks required clashmanager.apk by default, but the compiled output is versioned as clashmanager-v14.31.2.apk, and the pipeline environment lacked Android SDK build tools like aapt2.
  * Recommended Fix: Modify Stage 10 instructions to locate versioned APKs dynamically and add safety checks for local build-tools dependencies.
  * Resolution Details: Resolved in today's run. Stage 10 executed cleanly and logged a CLEAN audit pass for 2026-07-18.

* Stage 12 (Hybrid Shell UX and UI Auditor):
  * Session: sessions/2588879370329790963
  * State: [RESOLVED - monitor] (July 18, 2026)
  * Symptom: No log entry for 2026-07-17 in 12-apk-ux-coverage.log.
  * Root Cause: Global frontend sweeps failed if build checks or dependency-cruiser boundary checks failed under Node 22+ without appropriate bypass flags.
  * Recommended Fix: Harden validation steps in Stage 12 prompt (.github/nightly-prompts/12-apk-ux.md) to handle missing tool environments gracefully.
  * Resolution Details: Resolved in today's run. Stage 12 executed cleanly and logged a CHANGED pass for TargetPicker.vue on 2026-07-18.

* Missing-Run Events (Stage 1, Stage 3, Stage 4, Stage 9) on 2026-07-18:
  * State: [RESOLVED - monitor] (July 20, 2026)
  * Symptom: No log entries for 2026-07-18 in 01-hardening-coverage.log, 03-baseline-consolidation-coverage.log, 04-optimization-coverage.log, or 09-refactor-proposals-coverage.log.
  * Root Cause: These stages were not triggered or execution did not complete during today's automation cycle, possibly skipped due to zero-diff preconditions or trigger scheduling.
  * Recommended Fix: Monitor tomorrow's pipeline execution to ensure these stages recover and resume logging correctly.

* Missing-Run / Failed Events on 2026-07-21:
  * Stages: Stage 1, Stage 2, Stage 4, Stage 6, Stage 11.
  * State: [RESOLVED - monitor] (July 22, 2026)
  * Symptom: No log entries for 2026-07-21 in 01-hardening-coverage.log, 02-verification-coverage.log, 04-optimization-coverage.log, 06-documentation-tsdoc-coverage.log, or 11-apk-optimization-coverage.log.
  * Root Cause: These stages were not triggered, skipped, or failed to complete their execution cycles.
  * Recommended Fix: Monitor subsequent runs. Stages 1, 4, and 6 recovered successfully on July 22, 2026. Stage 2 and Stage 11 did not recover and are promoted to [RECURRING] status under July 22 events.

* Missing-Run / Failed Events on 2026-07-22:
  * Stages: Stage 2 (Verify), Stage 11 (APK-Optimization).
  * State: [RECURRING] (July 22, 2026)
  * Symptom: No log entries for 2026-07-22 in 02-verification-coverage.log or 11-apk-optimization-coverage.log.
  * Root Cause: These stages failed to log or execute their nightly run. Since they left no trace in the logs or PR history, the exact failure modes are unobservable. Stage 2 and Stage 11 have now missed multiple consecutive runs, indicating a scheduling or environment blocker.
  * Recommended Fix: Re-verify scheduling and webhook triggers in CI configurations, and audit local build wrappers or dependency constraints for any silent environment crashes.

* Missing-Run / Failed Events on 2026-07-23:
  * Stages: Stage 2 (Verify), Stage 11 (APK-Optimization).
  * State: [RECURRING] (July 23, 2026)
  * Symptom: No log entries for 2026-07-23 in 02-verification-coverage.log or 11-apk-optimization-coverage.log.
  * Root Cause: These stages failed to log or execute their nightly runs today. However, a major discovery was made: during pre-flight loading, when Jules is initialized, connecting to the Supabase MCP server caused massive context explosions and silent crashes before any output could be written. This blocked both stages completely.
  * Recommended Fix: AlbiDR applied a critical pipeline hardening fix in commit `b81469c` on July 22, 2026, moving the MCP prohibition exception directly into the Base 2 instructions so that the prohibition is read at the very start of tool initialization, preventing silent crashes. Subsequent runs should be monitored closely to ensure Stage 2 and Stage 11 recover successfully now that the Base 2 MCP prohibition is active.

## Section 2: Cross-Stage Coherence Bugs (Priority 2)

* Duplicate Merge Failure Blocks in 00-pr-history.md:
  * Symptom: The merge failure records for PR #1113, PR #1111, and PR #1108 are appended in redundant duplicate blocks in the active T1 section (e.g. 10 duplicate blocks for PR #1113).
  * Root Cause: Since the merge-nightly-prs workflow is triggered on pull_request events, multiple pipeline stages opening PRs concurrently trigger multiple concurrent instances of the merge workflow. Each concurrent run executes merge-nightly-prs.ts, checks if the fail marker is in the checked-out main branch (it is not yet), appends the failure, and rebases via "git pull origin Nightly --rebase" before pushing. This rebase stacks the duplicates sequentially.
  * Recommended Fix: Update the log-writing script `merge-nightly-prs.ts` to perform a git pull/fetch and re-read the file immediately prior to checking for the presence of the fail marker and writing. Alternatively, serialize or restrict merge-nightly-prs workflow triggers to scheduled crons only rather than triggering on every concurrent pull request event.

* Deviation from Standard Log Format in Stage 2 and Stage 4:
  * Symptom: Stage 2 and Stage 4 wrote log entries using "Target: Codebase" instead of the standard "CHANGED:" or "CLEAN:" status prefixes.
  * Root Cause: Custom prompt instructions for Stage 2 and Stage 4 specified their own log formats, overriding the Base 4 log format requirements.
  * Recommended Fix: Reconcile Stage 2 and Stage 4 prompts with the standard log format prefix instructions.
  * State: [RESOLVED] (Stage 2 successfully logged standard "CHANGED:" prefix on July 18, 2026. Stage 4 prompt instructions have been reconciled).

* Concurrent Shared-File Conflicts Leading to Merge Failures (July 21, 2026):
  * Symptom: Stage 5 (PR #1169) and Stage 9 (PR #1171) failed to auto-merge today due to hard merge conflicts (State: dirty).
  * Root Cause: Multiple automated stages execute and open PRs in parallel or rapid succession. Each stage appends its run record to shared files such as `00-pr-history.md` and their respective coverage logs. When one stage's PR is merged, `Nightly` advances, causing all other outstanding PRs that modified the same lines in `00-pr-history.md` to instantly develop hard merge conflicts, aborting their auto-merge workflows.
  * Recommended Fix: Update the CI/CD pipeline to serialize the execution of the 13 stages to run sequentially instead of concurrently (so each stage pulls the latest merged work from the previous stage before starting). Alternatively, update the auto-merge workflow to automatically rebase outstanding stage PRs on the latest `Nightly` HEAD and resolve conflicts programmatically before attempting auto-merge.

## Section 3: No-Diff and Low-Value Audit (Priority 3)

* Stage 1 (Harden):
  * Consecutive No-Diff Days: 3 (CLEAN logged on 2026-07-21, 2026-07-22, and 2026-07-23)
  * Analysis: Codebase endpoints are fully hardened with zero active threats detected.

* Stage 3 (Baseline Consolidation):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Standardized search_path for public.get_vault_secret in the master baseline to ensure perfect Postgres 17 alignment.

* Stage 4 (Optimization):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Standardized realtime subscription error callback parameter naming in RecruitClient.ts.

* Stage 5 (README):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Reconciled RecruitClient README to document realtime subscription parameter standardizations.

* Stage 6 (TSDoc):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Hardened RecruitClient, useProgressiveList, and BaseSelect interface contracts and JSDoc annotations.

* Stage 7 (Version Integrity):
  * Consecutive No-Diff Days: 2 (CLEAN logged on 2026-07-22 and 2026-07-23)
  * Analysis: Audited manifests; confirmed monorepo-wide version synchronization at v14.33.11.

* Stage 8 (Dependency Audit):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Bumped knip to ^6.29.0 and vue-tsc to ^3.3.8 in the central catalog.

* Stage 9 (Refactor):
  * Consecutive No-Diff Days: 2 (CLEAN logged on 2026-07-22 and 2026-07-23)
  * Analysis: Audited features feature views and structural health boundaries; certified zero structural debt.

* Stage 10 (APK-Integrity):
  * Consecutive No-Diff Days: 1 (CLEAN logged on 2026-07-23)
  * Analysis: Audited manifest parity, Digital Asset Links fingerprints, and Android native layer security configurations.

* Stage 12 (APK-UX):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-23)
  * Analysis: Modernized threshold-btn, enable-btn, and action-btn sizes and integrated v-tactile directive in NotificationSettings.vue.

* Stage 2 (Verify), Stage 11 (APK-Opt):
  * Consecutive No-Diff Days: 0 (Failed/missing today, tracked under Section 1).
