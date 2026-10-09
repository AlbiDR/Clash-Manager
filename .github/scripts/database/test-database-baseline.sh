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
POSTGREST_CONTAINER="supabase_rest_${PROJECT_ID}"

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

configure_database_test_schema_context() {
  local runtime_schemas role_schema_override setting schema_value first_schema=""
  local schema_csv_pattern='^[[:space:]]*[a-z_][a-z0-9_]*(,[[:space:]]*[a-z_][a-z0-9_]*)*[[:space:]]*$'
  if ! runtime_schemas=$(docker inspect --format '{{range .Config.Env}}{{if eq (index (split . "=") 0) "PGRST_DB_SCHEMAS"}}{{println .}}{{end}}{{end}}' "${POSTGREST_CONTAINER}" | sed -n 's/^PGRST_DB_SCHEMAS=//p'); then
    echo "Unable to read PGRST_DB_SCHEMAS from the temporary PostgREST container." >&2
    return 1
  fi
  if [[ ! "${runtime_schemas}" =~ ${schema_csv_pattern} ]]; then
    echo "Temporary PostgREST PGRST_DB_SCHEMAS is missing or malformed; refusing to run the schema exposure probe." >&2
    return 1
  fi
  runtime_schemas=${runtime_schemas//[[:space:]]/}

  if ! role_schema_override=$(docker exec "${CONTAINER}" psql \
      --set ON_ERROR_STOP=1 --tuples-only --no-align \
      --username postgres --dbname postgres \
      --command "SELECT config.setting FROM pg_db_role_setting AS s JOIN pg_roles AS r ON r.oid = s.setrole CROSS JOIN LATERAL unnest(s.setconfig) AS config(setting) WHERE r.rolname = 'authenticator' AND (s.setdatabase = 0 OR s.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())) AND config.setting LIKE 'pgrst.db_schemas=%'"); then
    echo "Unable to inspect the temporary authenticator schema GUC." >&2
    return 1
  fi
  if [[ -n "${role_schema_override}" ]]; then
    while IFS= read -r setting; do
      schema_value=${setting#pgrst.db_schemas=}
      if [[ "${setting}" != pgrst.db_schemas=* || ! "${schema_value}" =~ ${schema_csv_pattern} ]]; then
        echo "Temporary authenticator schema override is missing or malformed; refusing to run the exposure probe." >&2
        return 1
      fi
      schema_value=${schema_value//[[:space:]]/}
      if [[ -n "${first_schema}" && "${first_schema}" != "${schema_value}" ]]; then
        echo "Temporary authenticator has conflicting applicable schema overrides; refusing to run the exposure probe." >&2
        return 1
      fi
      first_schema=${schema_value}
    done <<<"${role_schema_override}"
    echo "Preserving the temporary authenticator pgrst.db_schemas override for the exposure probe."
    return 0
  fi

  # This role setting supplies test context in the disposable CLI stack only.
  # Derive it from the running PostgREST container; never mask exposed schemas.
  if ! docker exec "${CONTAINER}" psql \
      --set ON_ERROR_STOP=1 --username postgres --dbname postgres \
      --command "ALTER ROLE authenticator SET pgrst.db_schemas = '${runtime_schemas}'" >/dev/null; then
    echo "Unable to apply measured PostgREST schemas as temporary test context." >&2
    return 1
  fi
  echo "Applied measured PostgREST schemas as temporary pgTAP context."
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

  BASELINE_SCHEMA_CONTEXT_READY=0
  if [[ "${BASELINE_PGTAP}" == "true" ]]; then
    if configure_database_test_schema_context; then
      BASELINE_SCHEMA_CONTEXT_READY=1
    else
      status=$?
      record_failure "baseline PostgREST schema context" "${status}"
    fi
  fi

  if [[ "${BASELINE_PGTAP}" == "true" && "${BASELINE_SCHEMA_CONTEXT_READY}" == "1" ]]; then
    if run_database_tests; then :; else
      status=$?
      record_failure "baseline-only pgTAP" "${status}"
    fi
  elif [[ "${BASELINE_PGTAP}" != "true" ]]; then
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
  if configure_database_test_schema_context; then
    if run_database_tests; then :; else
      status=$?
      record_failure "full-history pgTAP" "${status}"
    fi
  else
    status=$?
    record_failure "full-history PostgREST schema context" "${status}"
  fi
  if schema_snapshot "${TEMP_ROOT}/full-replay.sql"; then
    FULL_REPLAY_READY=1
  else
    status=$?
    record_failure "full-history catalog snapshot" "${status}"
  fi
  # Optional CI artifact: generate the complete candidate types from the same
  # disposable database that passed replay, rather than from production before
  # its new migration has been deployed.
  if [[ "${VERIFICATION_STATUS}" -eq 0 && -n "${DATABASE_TYPES_OUTPUT:-}" ]]; then
    (cd "${TEMP_ROOT}" && supabase gen types typescript --local \
      --schema substrate,drivers,features,public) > "${DATABASE_TYPES_OUTPUT}"
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
