#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
SOURCE_SUPABASE="${REPO_ROOT}/Backend/supabase"
BASELINE=$(find "${SOURCE_SUPABASE}/migrations" -maxdepth 1 -type f -name '*_master_migration.sql' -print -quit)
if [[ -z "${BASELINE}" ]]; then
  echo "Database baseline migration is missing." >&2
  exit 1
fi
FOLD_DECISION=$(node "${REPO_ROOT}/.github/scripts/database/baseline-completeness.mjs" "${SOURCE_SUPABASE}/migrations")
read -r FOLD_STATUS PENDING_OBJECTS PENDING_MIGRATIONS SEMANTIC_ONLY UNSUPPORTED BASELINE_PGTAP CATALOG_EQUIVALENCE <<<"$(node -e '
const decision = JSON.parse(process.argv[1]);
console.log([
  decision.status,
  decision.pendingObjectCount,
  decision.pendingMigrationCount,
  decision.semanticOnlyObjectCount,
  decision.unsupportedStatementCount,
  decision.baselinePgTap,
  decision.catalogEquivalence,
].join(" "));
' "${FOLD_DECISION}")"

if ! command -v supabase >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "DB-UNAVAILABLE: supabase CLI and a running Docker daemon are required." >&2
  exit 2
fi
echo "Fold-state: ${FOLD_STATUS}; pending objects=${PENDING_OBJECTS}; pending migrations=${PENDING_MIGRATIONS}; semantic-only objects=${SEMANTIC_ONLY}; unsupported statements=${UNSUPPORTED}."

TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/clash-baseline.XXXXXX")
PROJECT_ID="clash_baseline_${$}"
PORT_OFFSET=$(( ($$ % 400) * 10 ))
API_PORT=$(( 55000 + PORT_OFFSET % 8000 ))
DB_PORT=$(( API_PORT + 1 ))
CONTAINER="supabase_db_${PROJECT_ID}"

cleanup() {
  if [[ -d "${TEMP_ROOT}/supabase" ]]; then
    (cd "${TEMP_ROOT}" && supabase stop --no-backup >/dev/null 2>&1) || true
  fi
  rm -rf -- "${TEMP_ROOT}"
}
trap cleanup EXIT

prepare_project() {
  local mode=$1
  mkdir -p "${TEMP_ROOT}/supabase/migrations" "${TEMP_ROOT}/supabase/tests/database"
  cp "${SOURCE_SUPABASE}/config.toml" "${TEMP_ROOT}/supabase/config.toml"
  cp "${SOURCE_SUPABASE}/tests/database/"*.sql "${TEMP_ROOT}/supabase/tests/database/"
  sed -i.bak \
    -e "s/^project_id = .*/project_id = \"${PROJECT_ID}\"/" \
    -e "s/^port = 54321$/port = ${API_PORT}/" \
    -e "s/^port = 54322$/port = ${DB_PORT}/" \
    "${TEMP_ROOT}/supabase/config.toml"
  rm -f -- "${TEMP_ROOT}/supabase/config.toml.bak"
  if [[ "${mode}" == "baseline" ]]; then
    cp "${BASELINE}" "${TEMP_ROOT}/supabase/migrations/$(basename "${BASELINE}")"
  else
    cp "${SOURCE_SUPABASE}/migrations/"*.sql "${TEMP_ROOT}/supabase/migrations/"
  fi
}

start_project() {
  (cd "${TEMP_ROOT}" && supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor)
}

stop_project() {
  (cd "${TEMP_ROOT}" && supabase stop --no-backup)
}

run_database_tests() {
  (cd "${TEMP_ROOT}" && supabase test db)
}

apply_baseline_again() {
  docker exec -i "${CONTAINER}" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres < "${BASELINE}"
}

schema_snapshot() {
  local output=$1
  docker exec "${CONTAINER}" pg_dump \
    --username postgres \
    --dbname postgres \
    --schema-only \
    --no-owner \
    --quote-all-identifiers \
    --schema substrate \
    --schema drivers \
    --schema features \
    --schema public \
    | sed \
        -e '/^\\restrict /d' \
        -e '/^\\unrestrict /d' \
        -e '/^-- Dumped /d' \
        -e '/^-- Started on /d' \
        -e '/^-- Completed on /d' \
        -e '/^SET transaction_timeout/d' \
    > "${output}"
}

VERIFICATION_STATUS=0
record_failure() {
  local description=$1
  local status=$2
  if [[ "${status}" -eq 0 ]]; then status=1; fi
  if [[ "${VERIFICATION_STATUS}" -eq 0 ]]; then VERIFICATION_STATUS=${status}; fi
  echo "FAIL: ${description} (exit status ${status})." >&2
}

prepare_project baseline
BASELINE_STARTED=0
if start_project; then
  BASELINE_STARTED=1
else
  status=$?
  record_failure "baseline database start" "${status}"
fi

if [[ "${BASELINE_STARTED}" == "1" ]]; then
  BASELINE_FIRST_READY=0
  BASELINE_SECOND_READY=0
  if schema_snapshot "${TEMP_ROOT}/baseline-first.sql"; then
    BASELINE_FIRST_READY=1
  else
    status=$?
    record_failure "baseline catalog snapshot" "${status}"
  fi

  if [[ "${BASELINE_PGTAP}" == "true" ]]; then
    if run_database_tests; then :; else
      status=$?
      record_failure "baseline-only pgTAP" "${status}"
    fi
  else
    echo "BASELINE-ONLY pgTAP PENDING: fold-state ${FOLD_STATUS} has ${PENDING_OBJECTS} pending objects owned by ${PENDING_MIGRATIONS} migrations."
  fi

  if apply_baseline_again; then
    if schema_snapshot "${TEMP_ROOT}/baseline-second.sql"; then
      BASELINE_SECOND_READY=1
    else
      status=$?
      record_failure "baseline post-reapply catalog snapshot" "${status}"
    fi
  else
    status=$?
    record_failure "baseline idempotency reapply" "${status}"
  fi

  if [[ "${BASELINE_FIRST_READY}" == "1" && "${BASELINE_SECOND_READY}" == "1" ]]; then
    if diff -u "${TEMP_ROOT}/baseline-first.sql" "${TEMP_ROOT}/baseline-second.sql" > "${TEMP_ROOT}/idempotency.diff"; then :; else
      status=$?
      echo "Baseline is not idempotent; second application changed catalog state." >&2
      cat "${TEMP_ROOT}/idempotency.diff" >&2
      record_failure "baseline idempotency catalog comparison" "${status}"
    fi
  fi

  if stop_project; then :; else
    status=$?
    record_failure "baseline database stop" "${status}"
  fi
fi

find "${TEMP_ROOT}/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -delete
prepare_project full
FULL_STARTED=0
if start_project; then
  FULL_STARTED=1
else
  status=$?
  record_failure "full-history database start" "${status}"
fi

FULL_REPLAY_READY=0
if [[ "${FULL_STARTED}" == "1" ]]; then
  if run_database_tests; then :; else
    status=$?
    record_failure "full-history pgTAP" "${status}"
  fi
  if schema_snapshot "${TEMP_ROOT}/full-replay.sql"; then
    FULL_REPLAY_READY=1
  else
    status=$?
    record_failure "full-history catalog snapshot" "${status}"
  fi
fi

if [[ "${CATALOG_EQUIVALENCE}" == "true" && "${BASELINE_FIRST_READY:-0}" == "1" && "${FULL_REPLAY_READY}" == "1" ]]; then
  if diff -u "${TEMP_ROOT}/baseline-first.sql" "${TEMP_ROOT}/full-replay.sql" > "${TEMP_ROOT}/catalog.diff"; then :; else
    status=$?
    echo "Baseline-only and full migration replay catalogs differ." >&2
    cat "${TEMP_ROOT}/catalog.diff" >&2
    record_failure "strict baseline/full catalog equality" "${status}"
  fi
fi

if [[ "${VERIFICATION_STATUS}" -ne 0 ]]; then
  echo "Database baseline semantic verification FAILED (first required check exit status ${VERIFICATION_STATUS})." >&2
  exit "${VERIFICATION_STATUS}"
fi

if [[ "${CATALOG_EQUIVALENCE}" != "true" ]]; then
  echo "BASELINE-ONLY behavior and baseline/full catalog equivalence PENDING: ${PENDING_OBJECTS} objects owned by ${PENDING_MIGRATIONS} migrations remain to fold."
  echo "Database baseline semantic verification PASS (partial): baseline apply and idempotency passed; full-history replay pgTAP passed. No baseline-equivalence claim."
else
  echo "Database baseline semantic verification PASS: baseline applies idempotently; baseline and full replay pass pgTAP and have equivalent catalogs."
fi
