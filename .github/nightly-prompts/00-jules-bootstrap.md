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

# 2. BRANCH CORRECTION
# Jules clones --depth 1 -b Stable. Nightly does not exist as a local branch.
# git checkout -B creates or resets the local branch to the fetched FETCH_HEAD.
git remote prune origin 2>/dev/null || true
git fetch origin Nightly --depth 100
git checkout -B Nightly FETCH_HEAD
git pull origin Nightly
echo "Branch: $(git branch --show-current) @ $(git rev-parse --short HEAD)"

# 3. NON-INTERACTIVE MODE
export CI=true
export DEBIAN_FRONTEND=noninteractive

# 4. NODE 24 VIA NVM
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 24 --no-progress
nvm alias default 24
nvm use 24

# 5. PNPM + DEPENDENCY INSTALL
# dependency-cruiser (depcruise binary) is a catalog devDependency.
# All stages invoke it as: pnpm exec depcruise
npm install -g pnpm@10.32.1 --silent
pnpm install --frozen-lockfile

# 6. NATIVE BINARY COMPILATION
pnpm rebuild esbuild sharp 2>/dev/null || true

# 7. DENO npm: SYMLINKS
# Versions resolved dynamically from installed packages, never hardcoded.
# valibot and supabase-js live in Frontend-PWA/node_modules (PWA dependencies).
# p-limit lives in the root node_modules (root devDependency).
NODE_MODULES="/app/Frontend-PWA/node_modules"
ROOT_MODULES="/app/node_modules"
VALIBOT_VER=$(node -e "try{console.log(require('${NODE_MODULES}/valibot/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
SUPABASE_VER=$(node -e "try{console.log(require('${NODE_MODULES}/@supabase/supabase-js/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
PLIMIT_VER=$(node -e "try{console.log(require('${ROOT_MODULES}/p-limit/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
ln -sfn "${NODE_MODULES}/valibot" "${NODE_MODULES}/npm:valibot@${VALIBOT_VER}" 2>/dev/null || true
mkdir -p "${NODE_MODULES}/npm:@supabase"
ln -sfn "${NODE_MODULES}/@supabase/supabase-js" "${NODE_MODULES}/npm:@supabase/supabase-js@${SUPABASE_VER}" 2>/dev/null || true
ln -sfn "${ROOT_MODULES}/p-limit" "${ROOT_MODULES}/npm:p-limit@${PLIMIT_VER}" 2>/dev/null || true

# 8. NIGHTLY CONTEXT FILES
# /tmp/nightly/ is shared across all 13 stage tasks.
# Stages read from here instead of recomputing the same data independently.

# 8a. CANONICAL DATE - single source of date truth for the entire pipeline run
date -u +"%Y-%m-%d" > /tmp/nightly/TODAY
echo "Today: $(cat /tmp/nightly/TODAY)"

# 8b. GIT CONTEXT
git log --format="%h %ad %s" --date=short -50 > /tmp/nightly/recent-commits.txt
git diff --name-only HEAD~30 HEAD 2>/dev/null | sort -u > /tmp/nightly/changed-files.txt || touch /tmp/nightly/changed-files.txt
echo "Git context: $(wc -l < /tmp/nightly/recent-commits.txt) commits | $(wc -l < /tmp/nightly/changed-files.txt) changed files"

# 8c. PENDING MIGRATIONS - pre-computed for Stage 3
BASELINE_PREFIX="20260531232406"
if [ -d "Backend/supabase/migrations" ]; then
  ls Backend/supabase/migrations/ | grep -v "${BASELINE_PREFIX}" | sort > /tmp/nightly/pending-migrations.txt
else
  touch /tmp/nightly/pending-migrations.txt
fi
MIGRATION_COUNT=$(wc -l < /tmp/nightly/pending-migrations.txt | tr -d ' ')
echo "Pending migrations: ${MIGRATION_COUNT}"
[ "${MIGRATION_COUNT}" -gt 0 ] && sed 's/^/  - /' /tmp/nightly/pending-migrations.txt || true

# 8d. BASELINE TEST STATE
# Capped at 5 minutes. A hanging test suite must not block the snapshot.
# Result never causes setup to fail regardless of exit code or timeout.
echo "Running baseline test suite (5m cap)..."
if timeout 300 pnpm test --run > /tmp/nightly/baseline-test-output.txt 2>&1; then
  echo "PASS" > /tmp/nightly/baseline-test-state.txt
else
  echo "FAIL" > /tmp/nightly/baseline-test-state.txt
fi
echo "Baseline tests: $(cat /tmp/nightly/baseline-test-state.txt)"
tail -5 /tmp/nightly/baseline-test-output.txt

# 8e. DEPENDENCY VIOLATIONS BASELINE - pre-computed for Stage 9
# Capped at 2 minutes. Failure or timeout writes an empty file; Stage 9 handles it.
echo "Computing dependency violation baseline (2m cap)..."
timeout 120 pnpm exec depcruise --config .github/.dependency-cruiser.mjs Frontend-PWA/src \
  --output-type err-long > /tmp/nightly/dep-violations.txt 2>&1 || true
DEP_LINES=$(wc -l < /tmp/nightly/dep-violations.txt | tr -d ' ')
echo "Dependency violations file: ${DEP_LINES} lines"

# 8f. TOOLCHAIN MANIFEST - authoritative record read by Stage 13
{
  echo "snapshot-date: $(cat /tmp/nightly/TODAY)"
  echo "node: $(node --version)"
  echo "pnpm: $(pnpm --version)"
  echo "git: $(git --version)"
  echo "depcruise: $(pnpm exec depcruise --version 2>/dev/null || echo 'unavailable')"
  echo "valibot-symlink: @${VALIBOT_VER}"
  echo "supabase-js-symlink: @${SUPABASE_VER}"
  echo "p-limit-symlink: @${PLIMIT_VER}"
  echo "baseline-tests: $(cat /tmp/nightly/baseline-test-state.txt)"
  echo "pending-migrations: ${MIGRATION_COUNT}"
  echo "dep-violations-lines: ${DEP_LINES}"
} > /tmp/nightly/toolchain.txt

echo ""
echo "Setup complete. Environment is ready for snapshotting."
echo "Nightly context written to /tmp/nightly/"
cat /tmp/nightly/toolchain.txt
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

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/01-hardening.md`

---

## [Stage 2] Test Suite & Logic Verification

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/02-verification.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/02-verification.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/02-verification-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/02-verification-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/02-verification.md`

---

## [Stage 3] Database Schema & Migration Baselining

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/03-baseline-consolidation.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/03-baseline-consolidation.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/03-baseline-consolidation-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/03-baseline-consolidation-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/03-baseline-consolidation.md`

---

## [Stage 4] Performance & Hygiene Optimizer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/04-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/04-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/04-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/04-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/04-optimization.md`

---

## [Stage 5] Document-README Integration

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/05-documentation-readme.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/05-documentation-readme.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/05-documentation-readme-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/05-documentation-readme-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/05-documentation-readme.md`

---

## [Stage 6] Documentation TSDoc - Interface Contract Architect

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/06-documentation-tsdoc.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/06-documentation-tsdoc.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/06-documentation-tsdoc-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/06-documentation-tsdoc-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/06-documentation-tsdoc.md`

---

## [Stage 7] Version Integrity - Version Consistency Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/07-version-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/07-version-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/07-version-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/07-version-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/07-version-integrity.md`

---

## [Stage 8] Dependency Audit - External Health Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/08-dependency-audit.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/08-dependency-audit.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/08-dependency-audit-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/08-dependency-audit-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/08-dependency-audit.md`

---

## [Stage 9] Refactor - Structural Surgery Engineer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/09-refactor-proposals.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/09-refactor-proposals.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/09-refactor-proposals-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/09-refactor-proposals-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/09-refactor-proposals.md`

---

## [Stage 10] APK & PWA Wrapper Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/10-apk-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/10-apk-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/10-apk-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/10-apk-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/10-apk-integrity.md`

---

## [Stage 11] APK & Native Wrapper Optimizations

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/11-apk-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/11-apk-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/11-apk-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/11-apk-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/11-apk-optimization.md`

---

## [Stage 12] Hybrid Shell UX & UI Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/12-apk-ux.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/12-apk-ux.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/12-apk-ux-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/12-apk-ux-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/12-apk-ux.md`

---

## [Stage 13] Self-Healing Protocol

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/13-self-healing-protocol.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/13-self-healing-protocol.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/13-self-healing-protocol-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/13-self-healing-protocol-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/13-self-healing-protocol.md`
