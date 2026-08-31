#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
SOURCE_SUPABASE="${REPO_ROOT}/Backend/supabase"
BASELINE=$(find "${SOURCE_SUPABASE}/migrations" -maxdepth 1 -type f -name '*_master_migration.sql' -print -quit)

if ! command -v supabase >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "DB-UNAVAILABLE: supabase CLI and a running Docker daemon are required." >&2
  exit 2
fi
if [[ -z "${BASELINE}" ]]; then
  echo "Database baseline migration is missing." >&2
  exit 1
fi

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

prepare_project baseline
start_project
schema_snapshot "${TEMP_ROOT}/baseline-first.sql"
run_database_tests
apply_baseline_again
schema_snapshot "${TEMP_ROOT}/baseline-second.sql"
if ! diff -u "${TEMP_ROOT}/baseline-first.sql" "${TEMP_ROOT}/baseline-second.sql" > "${TEMP_ROOT}/idempotency.diff"; then
  echo "Baseline is not idempotent; second application changed catalog state." >&2
  cat "${TEMP_ROOT}/idempotency.diff" >&2
  exit 1
fi
stop_project

find "${TEMP_ROOT}/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -delete
prepare_project full
start_project
run_database_tests
schema_snapshot "${TEMP_ROOT}/full-replay.sql"
if ! diff -u "${TEMP_ROOT}/baseline-first.sql" "${TEMP_ROOT}/full-replay.sql" > "${TEMP_ROOT}/catalog.diff"; then
  echo "Baseline-only and full migration replay catalogs differ." >&2
  cat "${TEMP_ROOT}/catalog.diff" >&2
  exit 1
fi

echo "Database baseline semantic verification PASS: idempotent, pgTAP-clean, and catalog-equivalent."
