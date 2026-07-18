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
  * State: PENDING - monitor
  * Symptom: No log entries for 2026-07-18 in 01-hardening-coverage.log, 03-baseline-consolidation-coverage.log, 04-optimization-coverage.log, or 09-refactor-proposals-coverage.log.
  * Root Cause: These stages were not triggered or execution did not complete during today's automation cycle, possibly skipped due to zero-diff preconditions or trigger scheduling.
  * Recommended Fix: Monitor tomorrow's pipeline execution to ensure these stages recover and resume logging correctly.

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

## Section 3: No-Diff and Low-Value Audit (Priority 3)

* Stage 10 (APK-Integrity):
  * Consecutive No-Diff Days: 4 (July 14, 15, 16, 18)
  * Analysis: Genuinely stable manifest and wrapper files with zero drift detected. This represents expected saturation by design; no corrective action required.

* Stage 8 (Dependency Audit):
  * Consecutive No-Diff Days: 1 (July 18)
  * Analysis: Codebase dependencies are fully aligned with the central catalogs. Intermediate watchlist updated appropriately. Expect normal active/clean oscillation.

* Stage 6 (TSDoc):
  * Consecutive No-Diff Days: 1 (July 18)
  * Analysis: High interface contract coverage achieved. Expect active/clean oscillation following refactoring phases.

* Stage 1 (Harden), Stage 3 (Baseline), Stage 4 (Optimize), Stage 9 (Refactor):
  * Consecutive No-Diff Days: 0 (Missing runs/skipped today, no reset on counter but tracked under Section 1).

* Stage 2 (Verify), Stage 5 (README), Stage 7 (Version), Stage 11 (APK-Opt), Stage 12 (APK-UX):
  * Consecutive No-Diff Days: 0 (Active changes logged on 2026-07-18).
