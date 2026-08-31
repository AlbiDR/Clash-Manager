#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

set -euo pipefail

CONTEXT_DIR="${NIGHTLY_CONTEXT_DIR:-/tmp/nightly}"
mkdir -p "$CONTEXT_DIR"

for REQUIRED_COMMAND in date git node pnpm; do
  if ! command -v "$REQUIRED_COMMAND" >/dev/null 2>&1; then
    echo "ERROR: required command is unavailable: ${REQUIRED_COMMAND}" >&2
    exit 1
  fi
done

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "ERROR: update-nightly-context.sh must run inside a git repository." >&2
  exit 1
}
cd "$REPO_ROOT"

run_bounded() {
  local timeout_seconds="$1"
  shift
  # JavaScript template interpolation is intentional in the single-quoted source.
  # shellcheck disable=SC2016
  node -e '
    const { spawnSync } = require("node:child_process");
    const [timeoutSeconds, command, ...args] = process.argv.slice(1);
    const result = spawnSync(command, args, {
      stdio: "inherit",
      timeout: Number(timeoutSeconds) * 1000,
    });
    if (result.error) console.error(`bounded command failed: ${result.error.message}`);
    process.exit(Number.isInteger(result.status) ? result.status : 124);
  ' "$timeout_seconds" "$@"
}

REQUESTED_STAGE_NUM="${NIGHTLY_STAGE_NUM:-}"
FORCE_TESTS="false"
FORCE_DEPCRUISE="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --stage)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --stage requires a stage number." >&2
        exit 2
      fi
      REQUESTED_STAGE_NUM="$2"
      shift 2
      ;;
    --force-tests)
      FORCE_TESTS="true"
      shift
      ;;
    --force-depcruise)
      FORCE_DEPCRUISE="true"
      shift
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -n "$REQUESTED_STAGE_NUM" ] && ! echo "$REQUESTED_STAGE_NUM" | grep -Eq '^([1-9]|1[0-3])$'; then
  echo "ERROR: invalid stage number: ${REQUESTED_STAGE_NUM}" >&2
  exit 2
fi

# 1. Date Mandate
date -u +"%Y-%m-%d" > "$CONTEXT_DIR/TODAY"
TODAY=$(cat "$CONTEXT_DIR/TODAY")
echo "Dynamic context date set to: $TODAY"

# 2. Resolve the stage before generating stage-specific context
CURRENT_BRANCH=$(git branch --show-current || echo "")
if [ -n "$REQUESTED_STAGE_NUM" ]; then
  STAGE_NUM="$REQUESTED_STAGE_NUM"
else
  STAGE_NUM=$(echo "$CURRENT_BRANCH" | grep -oE 'stage-[0-9]+' | cut -d'-' -f2 || echo "0")
fi
echo "Detected Stage Number: ${STAGE_NUM}"

# 3. Git logs & diffs
git log --format="%h %ad %s" --date=short -50 > "$CONTEXT_DIR/recent-commits.txt" \
  || : > "$CONTEXT_DIR/recent-commits.txt"
git diff --name-only HEAD~30 HEAD 2>/dev/null | sort -u > "$CONTEXT_DIR/changed-files.txt" || touch "$CONTEXT_DIR/changed-files.txt"
echo "Git logs and diffs generated dynamically."

# 4. Pending migrations (Stage 3 only)
#
# "Pending" means genuinely unfolded, not merely newer than the baseline. Listing
# every post-baseline filename made this signal permanently non-zero: it never
# shrank no matter how much folding work was completed, so Stage 3 was handed the
# same 17 filenames every night and the operational debt threshold in
# 00-pipeline-intelligence.md Section I was always tripped. A warning that is
# always on is a warning that gets ignored.
#
# fold-state.mjs replays the migrations chronologically and compares each
# resulting object against the baseline's definition, so an empty file here now
# genuinely means there is no folding work to do.
BASELINE_PREFIX="20260531232406"
FOLD_CHECK=".github/scripts/fold-state.mjs"
MIGRATION_AUDIT=".github/scripts/audit-migrations.mjs"
APK_UX_AUDIT=".github/scripts/audit-apk-ux.mjs"
CLEAN_CALIBRATION=".github/scripts/nightly/nightly-clean-calibration.mjs"
: > "$CONTEXT_DIR/pending-migrations.txt"

if [ "${STAGE_NUM}" != "3" ]; then
  echo "SKIPPED" > "$CONTEXT_DIR/fold-state-status.txt"
  echo "Skipped: fold-state analysis runs dynamically only for Stage 3." > "$CONTEXT_DIR/fold-state.txt"
elif [ ! -d "Backend/supabase/migrations" ]; then
  echo "SKIPPED" > "$CONTEXT_DIR/fold-state-status.txt"
  echo "No migrations directory; pending-migrations.txt left empty."
  echo "Skipped: migrations directory is unavailable." > "$CONTEXT_DIR/fold-state.txt"
elif command -v node >/dev/null 2>&1 && [ -f "$FOLD_CHECK" ]; then
  set +e
  node "$FOLD_CHECK" --json "Backend/supabase/migrations" > "$CONTEXT_DIR/fold-state.json" 2>&1
  FOLD_RC=$?
  node "$FOLD_CHECK" "Backend/supabase/migrations" > "$CONTEXT_DIR/fold-state.txt" 2>&1
  set -e
  if [ "$FOLD_RC" -eq 1 ]; then
    node -e '
      const report = require(process.argv[1]);
      const names = [...new Set(report.objects.filter(item => item.status === "unfolded").map(item => item.source))].sort();
      process.stdout.write(names.join("\n") + (names.length ? "\n" : ""));
    ' "$CONTEXT_DIR/fold-state.json" > "$CONTEXT_DIR/pending-migrations.txt"
  fi
  if [ "$FOLD_RC" -eq 0 ]; then
    echo "CLEAN" > "$CONTEXT_DIR/fold-state-status.txt"
  elif [ -s "$CONTEXT_DIR/pending-migrations.txt" ]; then
    echo "PENDING" > "$CONTEXT_DIR/fold-state-status.txt"
  else
    echo "DEGRADED" > "$CONTEXT_DIR/fold-state-status.txt"
  fi
  echo "Fold-state check complete (rc=${FOLD_RC})."
else
  # Degraded fallback: no Node available, so fall back to the filename
  # heuristic and say so, rather than silently reporting a clean baseline.
  echo "node or ${FOLD_CHECK} unavailable; falling back to filename heuristic." \
    > "$CONTEXT_DIR/fold-state.txt"
  find Backend/supabase/migrations -maxdepth 1 -type f -name '*.sql' \
    ! -name "${BASELINE_PREFIX}*" -exec basename {} \; | sort \
    > "$CONTEXT_DIR/pending-migrations.txt" || true
  echo "DEGRADED" > "$CONTEXT_DIR/fold-state-status.txt"
  echo "WARNING: fold-state check unavailable, pending list is filename-based only."
fi

MIGRATION_COUNT=$(wc -l < "$CONTEXT_DIR/pending-migrations.txt" | tr -d ' ')
echo "Migrations with unfolded objects: ${MIGRATION_COUNT}"

if [ "${STAGE_NUM}" != "3" ]; then
  echo "SKIPPED" > "$CONTEXT_DIR/migration-quality-status.txt"
  echo '{"version":1,"status":"SKIPPED"}' > "$CONTEXT_DIR/migration-quality.json"
elif command -v node >/dev/null 2>&1 && [ -f "$MIGRATION_AUDIT" ]; then
  set +e
  node "$MIGRATION_AUDIT" --json > "$CONTEXT_DIR/migration-quality.json" 2>&1
  MIGRATION_AUDIT_RC=$?
  set -e
  case "$MIGRATION_AUDIT_RC" in
    0) echo "PASS" > "$CONTEXT_DIR/migration-quality-status.txt" ;;
    1) echo "FAIL" > "$CONTEXT_DIR/migration-quality-status.txt" ;;
    *) echo "DEGRADED" > "$CONTEXT_DIR/migration-quality-status.txt" ;;
  esac
else
  echo "DEGRADED" > "$CONTEXT_DIR/migration-quality-status.txt"
  echo '{"version":1,"status":"DEGRADED","error":"migration audit unavailable"}' > "$CONTEXT_DIR/migration-quality.json"
fi

if [ "${STAGE_NUM}" != "3" ]; then
  echo "SKIPPED" > "$CONTEXT_DIR/database-verification-status.txt"
elif command -v supabase >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "DB-AVAILABLE" > "$CONTEXT_DIR/database-verification-status.txt"
else
  echo "DB-UNAVAILABLE" > "$CONTEXT_DIR/database-verification-status.txt"
fi

if [ "${STAGE_NUM}" != "12" ]; then
  echo "SKIPPED" > "$CONTEXT_DIR/apk-ux-audit-status.txt"
  echo '{"version":1,"status":"SKIPPED"}' > "$CONTEXT_DIR/apk-ux-audit.json"
  echo "Skipped: APK UX audit runs dynamically only for Stage 12." > "$CONTEXT_DIR/apk-ux-audit.txt"
elif command -v node >/dev/null 2>&1 && [ -f "$APK_UX_AUDIT" ]; then
  set +e
  node "$APK_UX_AUDIT" --json > "$CONTEXT_DIR/apk-ux-audit.json" 2>&1
  APK_UX_AUDIT_RC=$?
  node "$APK_UX_AUDIT" > "$CONTEXT_DIR/apk-ux-audit.txt" 2>&1
  set -e
  case "$APK_UX_AUDIT_RC" in
    0) echo "PASS" > "$CONTEXT_DIR/apk-ux-audit-status.txt" ;;
    1) echo "FAIL" > "$CONTEXT_DIR/apk-ux-audit-status.txt" ;;
    *) echo "DEGRADED" > "$CONTEXT_DIR/apk-ux-audit-status.txt" ;;
  esac
else
  echo "DEGRADED" > "$CONTEXT_DIR/apk-ux-audit-status.txt"
  echo '{"version":1,"status":"DEGRADED","error":"APK UX audit unavailable"}' > "$CONTEXT_DIR/apk-ux-audit.json"
  echo "APK UX audit unavailable." > "$CONTEXT_DIR/apk-ux-audit.txt"
fi

# BASELINE_TEST_STAGE=2
# 5. Conditional baseline test run (Stage 2 only, or explicitly forced)
RUN_TESTS="false"
if [ "${STAGE_NUM}" = "2" ] || [ "$FORCE_TESTS" = "true" ]; then
  RUN_TESTS="true"
fi

if [ "$RUN_TESTS" = "true" ]; then
  echo "Running baseline test suite dynamically for Stage ${STAGE_NUM}..."
  if run_bounded 300 pnpm test --run > "$CONTEXT_DIR/baseline-test-output.txt" 2>&1; then
    echo "PASS" > "$CONTEXT_DIR/baseline-test-state.txt"
  else
    echo "FAIL" > "$CONTEXT_DIR/baseline-test-state.txt"
  fi
  echo "Test baseline state: $(cat "$CONTEXT_DIR/baseline-test-state.txt")"
else
  echo "SKIPPED" > "$CONTEXT_DIR/baseline-test-state.txt"
  echo "Skipped: Baseline tests run dynamically only for Stage 2." > "$CONTEXT_DIR/baseline-test-output.txt"
fi

# DEPENDENCY_CRUISER_STAGE=9
# 6. Conditional dependency-cruiser run (Stage 9 only, or explicitly forced)
RUN_DEPCRUISE="false"
if [ "${STAGE_NUM}" = "9" ] || [ "$FORCE_DEPCRUISE" = "true" ]; then
  RUN_DEPCRUISE="true"
fi

if [ "$RUN_DEPCRUISE" = "true" ]; then
  echo "Running dependency cruiser scan dynamically for Stage ${STAGE_NUM}..."
  set +e
  run_bounded 120 pnpm exec depcruise --config .github/.dependency-cruiser.mjs Frontend-PWA/src \
    --output-type err-long > "$CONTEXT_DIR/dep-violations.txt" 2>&1
  DEPCRUISE_RC=$?
  set -e
  if [ "$DEPCRUISE_RC" -eq 0 ]; then
    echo "PASS" > "$CONTEXT_DIR/depcruise-state.txt"
  else
    echo "FAIL" > "$CONTEXT_DIR/depcruise-state.txt"
  fi
else
  echo "SKIPPED" > "$CONTEXT_DIR/depcruise-state.txt"
  echo "Skipped: Dependency scan runs dynamically only for Stage 9." > "$CONTEXT_DIR/dep-violations.txt"
fi
DEP_LINES=$(wc -l < "$CONTEXT_DIR/dep-violations.txt" | tr -d ' ')

# 7. CLEAN calibration state
if command -v node >/dev/null 2>&1 && [ -f "$CLEAN_CALIBRATION" ] && [ "${STAGE_NUM}" != "0" ]; then
  node "$CLEAN_CALIBRATION" --stage "$STAGE_NUM" --json > "$CONTEXT_DIR/clean-calibration.json"
  node "$CLEAN_CALIBRATION" --stage "$STAGE_NUM" > "$CONTEXT_DIR/clean-calibration.txt"
else
  echo '{"stage":null,"due":false,"consecutiveClean":0,"status":"DEGRADED"}' > "$CONTEXT_DIR/clean-calibration.json"
  echo "calibration-due: NO" > "$CONTEXT_DIR/clean-calibration.txt"
fi
CALIBRATION_DUE=$(node -e 'try{const r=require(process.argv[1]); console.log(r && r.due ? "YES" : "NO")}catch(e){console.log("NO")}' "$CONTEXT_DIR/clean-calibration.json")
CLEAN_STREAK=$(node -e 'try{const r=require(process.argv[1]); console.log(r && Number.isFinite(r.consecutiveClean) ? r.consecutiveClean : 0)}catch(e){console.log(0)}' "$CONTEXT_DIR/clean-calibration.json")

# 8. Symlink validation
VALIBOT_VER=$(node -e 'try{console.log(require(process.argv[1]).version)}catch(e){console.log("unknown")}' "${REPO_ROOT}/Frontend-PWA/node_modules/valibot/package.json" 2>/dev/null || echo "unknown")
SUPABASE_VER=$(node -e 'try{console.log(require(process.argv[1]).version)}catch(e){console.log("unknown")}' "${REPO_ROOT}/Frontend-PWA/node_modules/@supabase/supabase-js/package.json" 2>/dev/null || echo "unknown")
PLIMIT_VER=$(node -e 'try{console.log(require(process.argv[1]).version)}catch(e){console.log("unknown")}' "${REPO_ROOT}/node_modules/p-limit/package.json" 2>/dev/null || echo "unknown")

# 9. Toolchain manifest
{
  echo "snapshot-date: $TODAY"
  echo "node: $(node --version)"
  echo "pnpm: $(pnpm --version)"
  echo "git: $(git --version)"
  echo "depcruise: $(pnpm exec depcruise --version 2>/dev/null || echo 'unavailable')"
  echo "valibot-symlink: @${VALIBOT_VER}"
  echo "supabase-js-symlink: @${SUPABASE_VER}"
  echo "p-limit-symlink: @${PLIMIT_VER}"
  echo "fold-state: $(cat "$CONTEXT_DIR/fold-state-status.txt")"
  echo "migration-quality: $(cat "$CONTEXT_DIR/migration-quality-status.txt")"
  echo "database-verification: $(cat "$CONTEXT_DIR/database-verification-status.txt")"
  echo "apk-ux-audit: $(cat "$CONTEXT_DIR/apk-ux-audit-status.txt")"
  echo "baseline-tests: $(cat "$CONTEXT_DIR/baseline-test-state.txt")"
  echo "dependency-cruiser: $(cat "$CONTEXT_DIR/depcruise-state.txt")"
  echo "clean-calibration-due: ${CALIBRATION_DUE}"
  echo "clean-streak: ${CLEAN_STREAK}"
  echo "pending-migrations: ${MIGRATION_COUNT}"
  echo "dep-violations-lines: ${DEP_LINES}"
} > "$CONTEXT_DIR/toolchain.txt"

echo "Dynamic context generation complete."
cat "$CONTEXT_DIR/toolchain.txt"
