# Self-Healing Protocol Plan

## Section 1: Stability Failures (Priority 1)

* Stage 4 (Optimization: Substrate Hygiene):
  * Session: sessions/8509760645131525900
  * State: FAILED
  * Symptom: No log entry for 2026-07-17 in 04-optimization-coverage.log.
  * Root Cause: The stage instructions reference get_advisors as a primary tool, but this Supabase MCP tool is not configured in mcp_config.json, leading to a tool execution failure.
  * Recommended Fix: Update the Stage 4 prompt file (.github/nightly-prompts/04-optimization.md) to remove get_advisors from primary-tools or configure the Supabase MCP server in mcp_config.json.

* Stage 10 (APK and PWA Wrapper Integrity Auditor):
  * Session: sessions/5273144977358147736
  * State: FAILED
  * Symptom: No log entry for 2026-07-17 in 10-apk-integrity-coverage.log.
  * Root Cause: The verification checks require clashmanager.apk by default, but the compiled output is versioned as clashmanager-v14.31.2.apk, and the pipeline environment lacks Android SDK build tools like aapt2.
  * Recommended Fix: Modify Stage 10 instructions to locate versioned APKs dynamically and add safety checks for local build-tools dependencies.

* Stage 12 (Hybrid Shell UX and UI Auditor):
  * Session: sessions/2588879370329790963
  * State: FAILED
  * Symptom: No log entry for 2026-07-17 in 12-apk-ux-coverage.log.
  * Root Cause: Global frontend sweeps fail if build checks or dependency-cruiser boundary checks fail under Node 22+ without appropriate bypass flags.
  * Recommended Fix: Harden validation steps in Stage 12 prompt (.github/nightly-prompts/12-apk-ux.md) to handle missing tool environments gracefully.

## Section 2: Cross-Stage Coherence Bugs (Priority 2)

* Duplicate Merge Failure Blocks in 00-pr-history.md:
  * Symptom: The merge failure records for PR #1113, PR #1111, and PR #1108 are appended in redundant duplicate blocks in the active T1 section.
  * Root Cause: Multiple concurrent or sequential stages append merge failure messages without checking if the exact PR block is already present for that day.
  * Recommended Fix: Update the log-writing script to perform duplicate checking prior to writing.

* Deviation from Standard Log Format in Stage 2 and Stage 4:
  * Symptom: Stage 2 and Stage 4 write log entries using "Target: Codebase" instead of the standard "CHANGED:" or "CLEAN:" status prefixes.
  * Root Cause: Custom prompt instructions for Stage 2 and Stage 4 specify their own log formats, overriding the Base 4 log format requirements.
  * Recommended Fix: Reconcile Stage 2 and Stage 4 prompts with the standard log format prefix instructions.

## Section 3: No-Diff and Low-Value Audit (Priority 3)

* Stage 2 (Verify):
  * Consecutive No-Diff Days: 34 (Note: Custom formatting makes all runs appear as "Target: Codebase" instead of "CLEAN" or "CHANGED", masking actual status).
  * Analysis: Genuinely stable test suite, but lacks scope coverage adjustments.

* Stage 4 (Optimize):
  * Consecutive No-Diff Days: 23 (Note: Custom formatting masks actual changes).
  * Analysis: High saturation on current optimization targets.

* Stage 10 (APK-Integrity):
  * Consecutive No-Diff Days: 19
  * Analysis: No manifest or version drift detected during successful checks.
