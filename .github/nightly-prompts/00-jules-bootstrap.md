// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Jules UI Bootstrap Instructions

This document records the exact prompt instructions configured in the Jules UI for each stage of the Nightly pipeline.

---

## Shared Setup Script

The script below is entered verbatim in the Jules UI "Setup Script" field for
every stage. It is identical across all 13 stages. Any change applied to the
live Jules UI configuration must be reflected here in the same commit.

```bash
#!/usr/bin/env bash
set -euo pipefail

# NIGHTLY PIPELINE SETUP SCRIPT
# Runs once per Jules environment snapshot. Every tool installed
# and every file generated here is available to all 13 stage tasks.
#
# MAINTENANCE RULES:
#   - This script must never fail due to code-level issues.
#     Only genuine environment failures are valid exit reasons.
#   - /tmp/nightly/ is ephemeral. Never commit those files.
#   - pnpm global tool versions must be bumped deliberately.

# 1. CONTEXT DIRECTORY - must exist before any writes below
mkdir -p /tmp/nightly

# 1b. OUTPUT CONTAINMENT
# Jules' own harness appears to capture this script's combined stdout and
# re-execute it as a command somewhere downstream. Any tool's normal chatter
# (git status lines, nvm/npm/pnpm progress and hook messages, warning boxes)
# can therefore crash that unrelated downstream step, e.g.:
#   bash: line 101: Already: command not found
# To make that impossible, every noisy command below is redirected into a
# log file instead of stdout. Only the deliberate "echo" lines in this
# script ever reach stdout. On a genuine failure the ERR trap below prints
# the log tail so real environment problems are still visible.
SETUP_LOG=/tmp/nightly/setup.log
: > "$SETUP_LOG"
trap 'echo "Setup FAILED. Last 40 lines of $SETUP_LOG:"; tail -n 40 "$SETUP_LOG"' ERR

# 2. BRANCH CORRECTION
# Jules clones --depth 1 -b Stable. Nightly does not exist as a local branch.
# git checkout -B creates or resets the local branch to the fetched FETCH_HEAD.
{
  git remote prune origin || true
  git fetch origin Nightly --depth 100
  git checkout -B Nightly FETCH_HEAD
  git pull origin Nightly
} >> "$SETUP_LOG" 2>&1
echo "Branch: $(git branch --show-current) @ $(git rev-parse --short HEAD)"

# 3. NON-INTERACTIVE MODE
export CI=true
export DEBIAN_FRONTEND=noninteractive

# 4. NODE 24 VIA NVM
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
{
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install 24 --no-progress
  nvm alias default 24
  nvm use 24
} >> "$SETUP_LOG" 2>&1

# 5. PNPM + DEPENDENCY INSTALL
# dependency-cruiser (depcruise binary) is a catalog devDependency.
# All stages invoke it as: pnpm exec depcruise
{
  npm install -g pnpm@10.32.1
  pnpm install --frozen-lockfile
} >> "$SETUP_LOG" 2>&1

# 6. NATIVE BINARY COMPILATION
{ pnpm rebuild esbuild sharp || true; } >> "$SETUP_LOG" 2>&1

# 7. DENO npm: SYMLINKS
# Versions resolved dynamically from installed packages, never hardcoded.
# valibot and supabase-js live in Frontend-PWA/node_modules (PWA dependencies).
# p-limit lives in the root node_modules (root devDependency).
NODE_MODULES="/app/Frontend-PWA/node_modules"
ROOT_MODULES="/app/node_modules"
VALIBOT_VER=$(node -e "try{console.log(require('${NODE_MODULES}/valibot/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
SUPABASE_VER=$(node -e "try{console.log(require('${NODE_MODULES}/@supabase/supabase-js/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
PLIMIT_VER=$(node -e "try{console.log(require('${ROOT_MODULES}/p-limit/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
{
  ln -sfn "${NODE_MODULES}/valibot" "${NODE_MODULES}/npm:valibot@${VALIBOT_VER}" || true
  mkdir -p "${NODE_MODULES}/npm:@supabase"
  ln -sfn "${NODE_MODULES}/@supabase/supabase-js" "${NODE_MODULES}/npm:@supabase/supabase-js@${SUPABASE_VER}" || true
  ln -sfn "${ROOT_MODULES}/p-limit" "${ROOT_MODULES}/npm:p-limit@${PLIMIT_VER}" || true
} >> "$SETUP_LOG" 2>&1

# 8. NIGHTLY CONTEXT SEED
# Create the directory and write basic seeds.
# The actual rich context is generated dynamically at execution time
# by running ./.github/scripts/update-nightly-context.sh immediately
# after git checkout and pull to prevent multi-stage staggering drift.
date -u +"%Y-%m-%d" > /tmp/nightly/TODAY
echo "Seeded placeholder TODAY: $(cat /tmp/nightly/TODAY)"

# Write minimal empty placeholder files so bootstrap checks don't fail before run
touch /tmp/nightly/recent-commits.txt
touch /tmp/nightly/changed-files.txt
touch /tmp/nightly/pending-migrations.txt
echo "PASS" > /tmp/nightly/baseline-test-state.txt
echo "Skipped in bootstrap" > /tmp/nightly/baseline-test-output.txt
touch /tmp/nightly/dep-violations.txt
echo "setup-seeded: true" > /tmp/nightly/toolchain.txt

echo "Setup complete. Environment is ready for snapshotting."
echo "Placeholder context seeded in /tmp/nightly/"

```

---

## [Stage 1] Hardening - Runtime Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/01-hardening.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/01-hardening.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/01-hardening-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/01-hardening-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/01-hardening.md`

---

## [Stage 2] Test Suite & Logic Verification

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/02-verification.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/02-verification.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/02-verification-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/02-verification-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/02-verification.md`

---

## [Stage 3] Database Schema & Migration Baselining

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/03-baseline-consolidation.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/03-baseline-consolidation.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/03-baseline-consolidation-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/03-baseline-consolidation-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/03-baseline-consolidation.md`

---

## [Stage 4] Performance & Hygiene Optimizer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/04-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/04-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/04-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/04-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/04-optimization.md`

---

## [Stage 5] Document-README Integration

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/05-documentation-readme.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/05-documentation-readme.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/05-documentation-readme-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/05-documentation-readme-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/05-documentation-readme.md`

---

## [Stage 6] Documentation TSDoc - Interface Contract Architect

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/06-documentation-tsdoc.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/06-documentation-tsdoc.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/06-documentation-tsdoc-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/06-documentation-tsdoc-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/06-documentation-tsdoc.md`

---

## [Stage 7] Version Integrity - Version Consistency Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/07-version-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/07-version-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/07-version-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/07-version-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/07-version-integrity.md`

---

## [Stage 8] Dependency Audit - External Health Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/08-dependency-audit.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/08-dependency-audit.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/08-dependency-audit-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/08-dependency-audit-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/08-dependency-audit.md`

---

## [Stage 9] Refactor - Structural Surgery Engineer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/09-refactor-proposals.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/09-refactor-proposals.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/09-refactor-proposals-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/09-refactor-proposals-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/09-refactor-proposals.md`

---

## [Stage 10] APK & PWA Wrapper Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/10-apk-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/10-apk-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/10-apk-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/10-apk-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/10-apk-integrity.md`

---

## [Stage 11] APK & Native Wrapper Optimizations

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/11-apk-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/11-apk-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/11-apk-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/11-apk-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/11-apk-optimization.md`

---

## [Stage 12] Hybrid Shell UX & UI Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/12-apk-ux.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/12-apk-ux.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/12-apk-ux-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/12-apk-ux-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/12-apk-ux.md`

---

## [Stage 13] Self-Healing Protocol

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/13-self-healing-protocol.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/13-self-healing-protocol.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/13-self-healing-protocol-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/13-self-healing-protocol-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions located at this repository path exactly as written: `.github/nightly-prompts/13-self-healing-protocol.md`
