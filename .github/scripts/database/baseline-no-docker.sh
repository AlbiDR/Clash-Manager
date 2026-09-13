#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR
#
# Semantic baseline verification WITHOUT docker, using a throwaway PostgreSQL
# cluster from a local install.
#
# WHY THIS EXISTS
# test:database-baseline needs `supabase start`, which needs docker. Stage 3 has
# therefore reported DB-UNAVAILABLE on every night it has ever run, and its
# prompt defers the semantic gate to "required CI" - which has failed on every
# intel-checks run since June, so nothing has verified the baseline in months.
#
# The baseline needs exactly one contrib extension (moddatetime), three roles
# and a handful of Supabase platform objects that stock PostgreSQL lacks. Those
# are stubbed structurally below: shapes only, no behaviour, enough for DDL to
# resolve.
#
# WHAT THIS DOES AND DOES NOT PROVE
# Proves: the baseline applies, it is idempotent, and replaying the full
# migration history produces the same catalog. Does NOT run pgTAP, which needs
# the extension a Supabase stack provides. That gap is PRINTED, never implied:
# a partial pass that reads like a full one is the failure mode this whole
# script exists to correct.

set -uo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
MIGRATIONS="${REPO_ROOT}/Backend/supabase/migrations"
BASELINE=$(find "${MIGRATIONS}" -maxdepth 1 -type f -name '*_master_migration.sql' -print -quit)
PORT=${BASELINE_PG_PORT:-55433}

PGBIN=""
for candidate in "$(dirname "$(command -v pg_ctl 2>/dev/null || echo /nonexistent)")" \
                 /opt/homebrew/opt/postgresql@17/bin /usr/lib/postgresql/17/bin /usr/lib/postgresql/16/bin; do
  if [[ -x "${candidate}/initdb" && -x "${candidate}/pg_ctl" && -x "${candidate}/pg_dump" ]]; then PGBIN="${candidate}"; break; fi
done

if [[ -z "${PGBIN}" ]]; then
  echo "PG-UNAVAILABLE: no local PostgreSQL binaries (initdb, pg_ctl, pg_dump) were found." >&2
  echo "This is NOT a pass. Nothing was verified." >&2
  exit 2
fi
if [[ -z "${BASELINE}" ]]; then
  echo "Database baseline migration is missing." >&2
  exit 1
fi

DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/clash-pg.XXXXXX")
cleanup() {
  "${PGBIN}/pg_ctl" -D "${DATA_DIR}/pg" -w -t 20 stop -m immediate >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

SHIM="${DATA_DIR}/shim.sql"
cat > "${SHIM}" <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint PRIMARY KEY, schedule text, command text, nodename text,
  nodeport integer, database text, username text, active boolean, jobname text);
CREATE TABLE IF NOT EXISTS cron.job_run_details (
  jobid bigint, runid bigint, job_pid integer, database text, username text,
  command text, status text, return_message text,
  start_time timestamptz, end_time timestamptz);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY, name text, secret text,
  description text, created_at timestamptz DEFAULT now());
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret AS decrypted_secret, created_at FROM vault.secrets;
CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
  headers jsonb DEFAULT '{}', timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
SQL

fresh_cluster() {
  "${PGBIN}/pg_ctl" -D "${DATA_DIR}/pg" -w -t 20 stop -m immediate >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}/pg"
  LANG=C LC_ALL=C "${PGBIN}/initdb" -D "${DATA_DIR}/pg" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null 2>&1
  LANG=C LC_ALL=C "${PGBIN}/pg_ctl" -D "${DATA_DIR}/pg" -w -t 30 \
    -o "-p ${PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
    -l "${DATA_DIR}/pg.log" start >/dev/null 2>&1
  psql -h 127.0.0.1 -p "${PORT}" -U postgres -q -v ON_ERROR_STOP=1 -f "${SHIM}" >/dev/null 2>&1
}

apply() { psql -h 127.0.0.1 -p "${PORT}" -U postgres -q -v ON_ERROR_STOP=1 -f "$1" > "${DATA_DIR}/apply.log" 2>&1; }

# Comments and punctuation spacing are normalised away. Folding reflows a
# body's whitespace, so a byte comparison reports a formatting difference as a
# schema difference, which is how a real drift would get lost in the noise.
snapshot() {
  "${PGBIN}/pg_dump" -h 127.0.0.1 -p "${PORT}" -U postgres -d postgres --schema-only --no-owner \
    --quote-all-identifiers --schema substrate --schema drivers --schema features --schema public \
  | sed -e '/^\\restrict /d' -e '/^\\unrestrict /d' -e 's/--.*$//' | tr '\n' ' ' | tr -s ' \t' ' ' \
  | sed -e 's/ *, */,/g' -e 's/ *( */(/g' -e 's/ *) */)/g' -e 's/; */;\n/g' \
  | sed -e 's/^ *//' -e 's/ *$//' | grep -v '^$' | sort
}

FAILED=0

echo "[1/3] baseline applies"
fresh_cluster
if apply "${BASELINE}"; then echo "  PASS"; else echo "  FAIL"; tail -3 "${DATA_DIR}/apply.log"; FAILED=1; fi
snapshot > "${DATA_DIR}/first.sql"

echo "[2/3] baseline is idempotent"
if apply "${BASELINE}"; then
  snapshot > "${DATA_DIR}/second.sql"
  if diff -q "${DATA_DIR}/first.sql" "${DATA_DIR}/second.sql" >/dev/null; then echo "  PASS"; else
    echo "  FAIL: a second application changed the catalog"; diff -u "${DATA_DIR}/first.sql" "${DATA_DIR}/second.sql" | head -20; FAILED=1
  fi
else echo "  FAIL: second application errored"; tail -3 "${DATA_DIR}/apply.log"; FAILED=1; fi

echo "[3/3] full migration replay matches the baseline"
fresh_cluster
REPLAYED=0
for migration in "${MIGRATIONS}"/*.sql; do
  if apply "${migration}"; then REPLAYED=$((REPLAYED + 1)); else
    echo "  FAIL at $(basename "${migration}")"; grep -m1 ERROR "${DATA_DIR}/apply.log" || true; FAILED=1; break
  fi
done
if [[ ${FAILED} -eq 0 ]]; then
  snapshot > "${DATA_DIR}/replay.sql"
  if diff -q "${DATA_DIR}/first.sql" "${DATA_DIR}/replay.sql" >/dev/null; then
    echo "  PASS: ${REPLAYED} migrations, $(wc -l < "${DATA_DIR}/first.sql" | tr -d ' ') statements identical"
  else
    echo "  FAIL: baseline-only and full replay differ"; diff -u "${DATA_DIR}/first.sql" "${DATA_DIR}/replay.sql" | head -20; FAILED=1
  fi
fi

echo
echo "NOT RUN: pgTAP (Backend/supabase/tests/database/). It needs the pgtap extension"
echo "         that a Supabase stack provides. Use pnpm test:database-baseline for that."

if [[ ${FAILED} -ne 0 ]]; then echo "Baseline verification FAILED." >&2; exit 1; fi
echo "Baseline verification PASS: applies, idempotent, catalog-equivalent. pgTAP not covered."
