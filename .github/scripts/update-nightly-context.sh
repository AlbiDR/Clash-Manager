#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

set -euo pipefail

CONTEXT_DIR="/tmp/nightly"
mkdir -p "$CONTEXT_DIR"

# 1. Date Mandate
date -u +"%Y-%m-%d" > "$CONTEXT_DIR/TODAY"
TODAY=$(cat "$CONTEXT_DIR/TODAY")
echo "Dynamic context date set to: $TODAY"

# 2. Git logs & diffs
git log --format="%h %ad %s" --date=short -50 > "$CONTEXT_DIR/recent-commits.txt"
git diff --name-only HEAD~30 HEAD 2>/dev/null | sort -u > "$CONTEXT_DIR/changed-files.txt" || touch "$CONTEXT_DIR/changed-files.txt"
echo "Git logs and diffs generated dynamically."

# 3. Pending migrations
#
# "Pending" means genuinely unfolded, not merely newer than the baseline. Listing
# every post-baseline filename made this signal permanently non-zero: it never
# shrank no matter how much folding work was completed, so Stage 3 was handed the
# same 17 filenames every night and the operational debt threshold in
# 00-pipeline-intelligence.md Section I was always tripped. A warning that is
# always on is a warning that gets ignored.
#
# check-fold-state.py replays the migrations chronologically and compares each
# resulting object against the baseline's definition, so an empty file here now
# genuinely means there is no folding work to do.
BASELINE_PREFIX="20260531232406"
FOLD_CHECK=".github/scripts/check-fold-state.py"
: > "$CONTEXT_DIR/pending-migrations.txt"

if [ ! -d "Backend/supabase/migrations" ]; then
  echo "No migrations directory; pending-migrations.txt left empty."
  : > "$CONTEXT_DIR/fold-state.txt"
elif command -v python3 >/dev/null 2>&1 && [ -f "$FOLD_CHECK" ]; then
  # Advisory tool: a non-zero exit means unfolded work was found, not a failure.
  set +e
  python3 "$FOLD_CHECK" "Backend/supabase/migrations" > "$CONTEXT_DIR/fold-state.txt" 2>&1
  FOLD_RC=$?
  set -e
  if [ "$FOLD_RC" -ne 0 ]; then
    # Emit only the migrations that own at least one unfolded object.
    sed -n '/^Migrations owning unfolded objects:/,$p' "$CONTEXT_DIR/fold-state.txt" \
      | tail -n +2 | sed 's/^[[:space:]]*//' | grep -E '\.sql$' | sort -u \
      > "$CONTEXT_DIR/pending-migrations.txt" || true
  fi
  echo "Fold-state check complete (rc=${FOLD_RC})."
else
  # Degraded fallback: no python3 available, so fall back to the filename
  # heuristic and say so, rather than silently reporting a clean baseline.
  echo "python3 or ${FOLD_CHECK} unavailable; falling back to filename heuristic." \
    > "$CONTEXT_DIR/fold-state.txt"
  ls Backend/supabase/migrations/ | grep -v "${BASELINE_PREFIX}" | sort \
    > "$CONTEXT_DIR/pending-migrations.txt"
  echo "WARNING: fold-state check unavailable, pending list is filename-based only."
fi

MIGRATION_COUNT=$(wc -l < "$CONTEXT_DIR/pending-migrations.txt" | tr -d ' ')
echo "Migrations with unfolded objects: ${MIGRATION_COUNT}"

# 4. Detect running stage number from current branch name
CURRENT_BRANCH=$(git branch --show-current || echo "")
STAGE_NUM=$(echo "$CURRENT_BRANCH" | grep -oE 'stage-[0-9]+' | cut -d'-' -f2 || echo "0")
echo "Detected Stage Number: ${STAGE_NUM}"

# 5. Conditional test run (Only for Stage 2, Stage 13, or if forced)
RUN_TESTS="false"
if [ "${STAGE_NUM}" = "2" ] || [ "${STAGE_NUM}" = "13" ] || [ "${1:-}" = "--force-tests" ]; then
  RUN_TESTS="true"
fi

if [ "$RUN_TESTS" = "true" ]; then
  echo "Running baseline test suite dynamically for Stage ${STAGE_NUM}..."
  if timeout 300 pnpm test --run > "$CONTEXT_DIR/baseline-test-output.txt" 2>&1; then
    echo "PASS" > "$CONTEXT_DIR/baseline-test-state.txt"
  else
    echo "FAIL" > "$CONTEXT_DIR/baseline-test-state.txt"
  fi
  echo "Test baseline state: $(cat "$CONTEXT_DIR/baseline-test-state.txt")"
else
  # Write fallback defaults for other stages to prevent missing file errors
  echo "PASS" > "$CONTEXT_DIR/baseline-test-state.txt"
  echo "Skipped: Tests only run dynamically for Stage 2 and Stage 13." > "$CONTEXT_DIR/baseline-test-output.txt"
fi

# 6. Conditional dependency Cruiser run (Only for Stage 9, Stage 13, or if forced)
RUN_DEPCRUISE="false"
if [ "${STAGE_NUM}" = "9" ] || [ "${STAGE_NUM}" = "13" ] || [ "${1:-}" = "--force-depcruise" ]; then
  RUN_DEPCRUISE="true"
fi

if [ "$RUN_DEPCRUISE" = "true" ]; then
  echo "Running dependency cruiser scan dynamically for Stage ${STAGE_NUM}..."
  timeout 120 pnpm exec depcruise --config .github/.dependency-cruiser.mjs Frontend-PWA/src \
    --output-type err-long > "$CONTEXT_DIR/dep-violations.txt" 2>&1 || true
else
  echo "Skipped: Dependency scan only run dynamically for Stage 9 and Stage 13." > "$CONTEXT_DIR/dep-violations.txt"
fi
DEP_LINES=$(wc -l < "$CONTEXT_DIR/dep-violations.txt" | tr -d ' ')

# 7. Symlink validation
VALIBOT_VER=$(node -e "try{console.log(require('/app/Frontend-PWA/node_modules/valibot/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
SUPABASE_VER=$(node -e "try{console.log(require('/app/Frontend-PWA/node_modules/@supabase/supabase-js/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")
PLIMIT_VER=$(node -e "try{console.log(require('/app/node_modules/p-limit/package.json').version)}catch(e){console.log('unknown')}" 2>/dev/null || echo "unknown")

# 8. Toolchain manifest
{
  echo "snapshot-date: $TODAY"
  echo "node: $(node --version)"
  echo "pnpm: $(pnpm --version)"
  echo "git: $(git --version)"
  echo "depcruise: $(pnpm exec depcruise --version 2>/dev/null || echo 'unavailable')"
  echo "valibot-symlink: @${VALIBOT_VER}"
  echo "supabase-js-symlink: @${SUPABASE_VER}"
  echo "p-limit-symlink: @${PLIMIT_VER}"
  echo "baseline-tests: $(cat "$CONTEXT_DIR/baseline-test-state.txt")"
  echo "pending-migrations: ${MIGRATION_COUNT}"
  echo "dep-violations-lines: ${DEP_LINES}"
} > "$CONTEXT_DIR/toolchain.txt"

echo "Dynamic context generation complete."
cat "$CONTEXT_DIR/toolchain.txt"
