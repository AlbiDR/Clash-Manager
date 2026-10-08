// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { decideBaselineCompleteness } from './baseline-completeness.mjs';
import { checkFoldState } from './fold-state.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function fixture(migration) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fold-state-'));
  await writeFile(path.join(directory, '20260531232406_master_migration.sql'), `
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.items (
  id bigint GENERATED ALWAYS AS IDENTITY,
  label text,
  CONSTRAINT items_pkey PRIMARY KEY (id)
);
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN app.items.label IS 'Display label';
CREATE OR REPLACE VIEW app.item_labels AS SELECT label FROM app.items;
GRANT SELECT ON app.item_labels TO authenticated;
`);
  await writeFile(path.join(directory, '20260531232407_change.sql'), migration);
  return directory;
}

test('tracks definitions, comments, grants, RLS, columns, constraints, and identity', async t => {
  const directory = await fixture(`
CREATE TABLE app.items (
  id bigint GENERATED ALWAYS AS IDENTITY,
  label text,
  CONSTRAINT items_pkey PRIMARY KEY (id)
);
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.items ADD COLUMN label text;
ALTER TABLE app.items ADD CONSTRAINT items_pkey PRIMARY KEY (id);
ALTER TABLE app.items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
COMMENT ON COLUMN app.items.label IS 'Display label';
CREATE OR REPLACE VIEW app.item_labels AS SELECT label FROM app.items;
GRANT SELECT ON app.item_labels TO authenticated;
`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.status, 'FOLDED');
  assert.equal(report.counts.unfolded, 0);
  assert.ok(report.counts.reconciled >= 3);
});

test('reports catalog drift as unfolded', async t => {
  const directory = await fixture("COMMENT ON COLUMN app.items.label IS 'Different';\n");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.status, 'UNFOLDED');
  assert.equal(report.objects[0].reason, 'DIVERGENT');
});

test('reports unclassified SQL as degraded instead of clean', async t => {
  const directory = await fixture('VACUUM app.items;\n');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.status, 'DEGRADED');
  assert.equal(report.unsupported.length, 1);
});

test('ALTER TABLE ... SET (storage parameters) is classified, not reported unsupported', async () => {
  const directory = await fixture('ALTER TABLE app.items SET (autovacuum_vacuum_scale_factor = 0.05);\n');
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, [], 'storage parameters must not read as unsupported');
  assert.equal(report.status, 'UNFOLDED', 'the baseline lacks it, so unfolded rather than degraded');
  await rm(directory, { recursive: true, force: true });
});

test('a storage parameter the baseline already carries counts as folded', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fold-state-storage-'));
  const statement = 'ALTER TABLE app.items SET (autovacuum_vacuum_scale_factor = 0.05);\n';
  await writeFile(path.join(directory, '20260531232406_master_migration.sql'),
    'CREATE TABLE IF NOT EXISTS app.items (id bigint);\n' + statement);
  await writeFile(path.join(directory, '20260531232407_change.sql'), statement);
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, []);
  assert.equal(report.status, 'FOLDED');
  await rm(directory, { recursive: true, force: true });
});

test('SET SCHEMA and ALTER COLUMN ... SET are not mistaken for storage parameters', async () => {
  const directory = await fixture('ALTER TABLE app.items ALTER COLUMN label SET NOT NULL;\n');
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.unsupported.length, 1, 'still unsupported, and honestly reported as such');
  assert.equal(report.status, 'DEGRADED');
  await rm(directory, { recursive: true, force: true });
});

test('a DROP TRIGGER / CREATE TRIGGER recreate collapses to the trigger being present', async () => {
  const directory = await fixture([
    'DROP TRIGGER IF EXISTS trg_items ON app.items;',
    'CREATE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
  ].join('\n') + '\n');
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, [], 'DROP TRIGGER must not read as unsupported');
  assert.ok(report.objects.some((o) => o.key === 'TRIGGER:trg_items@app.items'));
  await rm(directory, { recursive: true, force: true });
});

test('a standalone function call is data, not a declared object', async () => {
  const directory = await fixture('SELECT app.apply_something();\n');
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, []);
  assert.ok(!report.objects.some((o) => o.key.includes('apply_something')), 'must not be tracked as an object');
  await rm(directory, { recursive: true, force: true });
});

test('cron.schedule is still declarative state, not swallowed as data', async () => {
  const directory = await fixture("SELECT cron.schedule('j', '*/5 * * * *', 'SELECT 1');\n");
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, []);
  assert.ok(report.objects.some((o) => o.key.startsWith('SCHEDULE:')), 'schedules must stay tracked');
  await rm(directory, { recursive: true, force: true });
});

/** Baseline and incremental both parameterised, for the trigger idempotency cases. */
async function triggerFixture(baselineTrigger, migrationTrigger) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fold-state-trigger-'));
  await writeFile(path.join(directory, '20260531232406_master_migration.sql'), `
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.items (id bigint, CONSTRAINT items_pkey PRIMARY KEY (id));
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
${baselineTrigger}
`);
  await writeFile(path.join(directory, '20260531232407_change.sql'), `${migrationTrigger}\n`);
  return directory;
}

const triggerOf = report => report.objects.find(item => item.key === 'TRIGGER:trg_items@app.items');

test('a baseline trigger differing only by OR REPLACE is folded, not divergent', async () => {
  // Folding into the baseline REQUIRES the idempotency guard, because the
  // release gate rejects a bare CREATE TRIGGER there. Before this, the two
  // checkers demanded opposite things and Stage 3 was handed an object whose
  // only resolution was to revert the gate fix. It attempted exactly that on
  // 2026-09-10.
  const directory = await triggerFixture(
    'CREATE OR REPLACE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
    'CREATE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
  );
  const report = await checkFoldState({ migrationsDir: directory });
  const trigger = triggerOf(report);
  assert.equal(trigger.status, 'reconciled');
  assert.match(trigger.reason, /idempotency guard added for baseline replay/);
  assert.equal(report.counts.unfolded, 0);
  await rm(directory, { recursive: true, force: true });
});

test('OR REPLACE is the ONLY tolerated difference on a trigger', async () => {
  // Guards the reconciliation against over-reach: a genuinely changed trigger
  // must still be reported, or this rule would hide real drift.
  const directory = await triggerFixture(
    'CREATE OR REPLACE TRIGGER trg_items AFTER INSERT OR DELETE ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
    'CREATE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
  );
  const report = await checkFoldState({ migrationsDir: directory });
  const trigger = triggerOf(report);
  assert.equal(trigger.status, 'unfolded');
  assert.equal(trigger.reason, 'DIVERGENT');
  await rm(directory, { recursive: true, force: true });
});

test('a verbatim trigger match still folds without needing reconciliation', async () => {
  const definition = 'CREATE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();';
  const directory = await triggerFixture(definition, definition);
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(triggerOf(report).status, 'folded');
  await rm(directory, { recursive: true, force: true });
});

test('a bare baseline trigger against an OR REPLACE incremental is not silently accepted', async () => {
  // The reverse direction is not reconciliation: the baseline would be the
  // non-replayable side, which is what the release gate rejects.
  const directory = await triggerFixture(
    'CREATE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
    'CREATE OR REPLACE TRIGGER trg_items AFTER INSERT ON app.items FOR EACH STATEMENT EXECUTE FUNCTION app.noop();',
  );
  const report = await checkFoldState({ migrationsDir: directory });
  assert.notEqual(triggerOf(report).status, 'reconciled');
  await rm(directory, { recursive: true, force: true });
});

function foldReport(status, objects, unsupported = []) {
  const counts = { folded: 0, reconciled: 0, unfolded: 0, 'semantic-only': 0 };
  for (const object of objects) counts[object.status] += 1;
  return {
    version: 1,
    status,
    baseline: '20260531232406_master_migration.sql',
    migrationsReplayed: 3,
    counts,
    objects,
    unsupported,
  };
}

test('baseline completeness distinguishes complete from pending fold debt', () => {
  const complete = foldReport('FOLDED', [
    { key: 'TABLE:app.items', source: '20260531232407_change.sql', status: 'folded' },
    { key: 'COLUMN:app.items.label', source: '20260531232408_change.sql', status: 'reconciled' },
  ]);
  assert.deepEqual(decideBaselineCompleteness(complete), {
    status: 'FOLDED', mode: 'complete', pendingObjectCount: 0, pendingMigrationCount: 0,
    semanticOnlyObjectCount: 0, unsupportedStatementCount: 0,
    baselinePgTap: true, fullReplayPgTap: true, catalogEquivalence: true,
  });

  const partial = foldReport('UNFOLDED', [
    { key: 'COLUMN:app.items.label', source: '20260531232408_change.sql', status: 'unfolded', reason: 'DIVERGENT' },
    { key: 'FUNCTION:app.read_items()', source: '20260531232408_change.sql', status: 'unfolded', reason: 'ABSENT' },
  ]);
  const decision = decideBaselineCompleteness(partial);
  assert.equal(decision.mode, 'partial');
  assert.equal(decision.pendingObjectCount, 2);
  assert.equal(decision.pendingMigrationCount, 1);
  assert.equal(decision.baselinePgTap, false);
  assert.equal(decision.fullReplayPgTap, true, 'partial mode still requires full-history behavior tests');
  assert.equal(decision.catalogEquivalence, false);
});

test('baseline completeness fails closed for malformed, unsupported, or contradictory fold-state', () => {
  assert.throws(() => decideBaselineCompleteness(null), /malformed fold-state/i);
  assert.throws(() => decideBaselineCompleteness({ version: 2, status: 'FOLDED' }), /unsupported or malformed/i);
  assert.throws(() => decideBaselineCompleteness(foldReport('DEGRADED', [])), /DEGRADED/);

  const malformedCount = foldReport('UNFOLDED', [
    { key: 'COLUMN:app.items.label', source: 'change.sql', status: 'unfolded', reason: 'ABSENT' },
  ]);
  malformedCount.counts.unfolded = 0;
  assert.throws(() => decideBaselineCompleteness(malformedCount), /count mismatch/i);

  const contradictoryComplete = foldReport('FOLDED', [
    { key: 'COLUMN:app.items.label', source: 'change.sql', status: 'unfolded', reason: 'DIVERGENT' },
  ]);
  assert.throws(() => decideBaselineCompleteness(contradictoryComplete), /contradictory FOLDED/i);

  const unsupportedObjectStatus = foldReport('UNFOLDED', [
    { key: 'COLUMN:app.items.label', source: 'change.sql', status: 'unfolded', reason: 'ABSENT' },
  ]);
  unsupportedObjectStatus.objects[0].status = 'future-state';
  assert.throws(() => decideBaselineCompleteness(unsupportedObjectStatus), /unsupported fold-state object/i);

  const unsupportedCountSchema = foldReport('FOLDED', []);
  unsupportedCountSchema.counts.future = 0;
  assert.throws(() => decideBaselineCompleteness(unsupportedCountSchema), /unsupported fold-state count schema/i);

  const divergentClaimedFolded = foldReport('FOLDED', [
    { key: 'COLUMN:app.items.label', source: 'change.sql', status: 'folded', reason: 'DIVERGENT' },
  ]);
  assert.throws(() => decideBaselineCompleteness(divergentClaimedFolded), /contradictory folded-object reason/i);
});

async function dockerVerifierFixture(t, {
  folded = false,
  failBaselinePgTap = false,
  failFullPgTap = false,
  failBaselineIdempotency = false,
  failCatalogEquality = false,
  runtimeSchemas = 'public,storage,graphql_public,features',
  runtimeSchemasUnavailable = false,
  roleSchemaOverride = null,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'baseline-verifier-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const databaseScripts = path.join(repo, '.github/scripts/database');
  const migrations = path.join(repo, 'Backend/supabase/migrations');
  const databaseTests = path.join(repo, 'Backend/supabase/tests/database');
  const bin = path.join(root, 'bin');
  await Promise.all([
    mkdir(databaseScripts, { recursive: true }),
    mkdir(migrations, { recursive: true }),
    mkdir(databaseTests, { recursive: true }),
    mkdir(path.join(repo, '.github/nightly-config'), { recursive: true }),
    mkdir(bin),
  ]);
  for (const file of ['test-database-baseline.sh', 'baseline-completeness.mjs', 'fold-state.mjs', 'audit-migrations.mjs', 'sql-lexer.mjs', 'baseline-rules.mjs']) {
    await cp(path.join(REPO_ROOT, '.github/scripts/database', file), path.join(databaseScripts, file));
  }
  await cp(path.join(REPO_ROOT, '.github/nightly-config/migration-quality.json'), path.join(repo, '.github/nightly-config/migration-quality.json'));
  await writeFile(path.join(repo, 'Backend/supabase/config.toml'), 'project_id = "fixture"\n[api]\nport = 54321\n[db]\nport = 54322\n');
  await writeFile(path.join(migrations, '20260531232406_master_migration.sql'), 'CREATE TABLE public.items (id bigint);\n');
  await writeFile(path.join(migrations, '20260531232407_add_label.sql'), folded
    ? 'CREATE TABLE public.items (id bigint);\n'
    : 'ALTER TABLE public.items ADD COLUMN label text;\n');
  await writeFile(path.join(databaseTests, 'fixture.test.sql'), 'SELECT 1;\n');
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  const roleSchemaFile = path.join(root, 'authenticator-schema-setting.txt');
  if (roleSchemaOverride !== null) await writeFile(roleSchemaFile, `${roleSchemaOverride}\n`);

  const supabase = path.join(bin, 'supabase');
  await writeFile(supabase, `#!/usr/bin/env bash
set -euo pipefail
cmd=$1
shift || true
if [[ "$cmd" == start ]]; then
  if [[ "${'${'}FAKE_ROLE_SCHEMA_INITIAL_SET:-0}" == 1 ]]; then printf '%s\n' "$FAKE_ROLE_SCHEMA_INITIAL" > "$FAKE_ROLE_SCHEMA_FILE"; else rm -f "$FAKE_ROLE_SCHEMA_FILE"; fi
  count=$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')
  mode=baseline
  [[ "$count" -eq 1 ]] || mode=full
  printf '%s' "$mode" > "$FAKE_DB_MODE"
  echo "start:$mode" >> "$FAKE_DB_LOG"
elif [[ "$cmd" == stop ]]; then
  echo stop >> "$FAKE_DB_LOG"
elif [[ "$cmd" == test ]]; then
  mode=$(cat "$FAKE_DB_MODE")
  echo "pgtap:$mode" >> "$FAKE_DB_LOG"
  if [[ -s "$FAKE_ROLE_SCHEMA_FILE" ]] && grep -Eq '(^|,)substrate(,|$)' "$FAKE_ROLE_SCHEMA_FILE"; then exit 21; fi
  if [[ "$mode" == baseline && "${'${'}FAKE_BASELINE_PGTAP_FAIL:-0}" == 1 ]]; then exit 17; fi
  if [[ "$mode" == full && "${'${'}FAKE_FULL_PGTAP_FAIL:-0}" == 1 ]]; then exit 19; fi
fi
`);
  await chmod(supabase, 0o755);
  const docker = path.join(bin, 'docker');
  await writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == info ]]; then exit 0; fi
mode=$(cat "$FAKE_DB_MODE")
if [[ "$1" == inspect && "$*" == *supabase_rest_clash_baseline_* && "$*" == *PGRST_DB_SCHEMAS* ]]; then
  echo "read:runtime-schemas" >> "$FAKE_DB_LOG"
  if [[ "${'${'}FAKE_RUNTIME_UNAVAILABLE:-0}" == 1 ]]; then exit 31; fi
  printf 'PGRST_DB_SCHEMAS=%s\n' "$FAKE_RUNTIME_SCHEMAS"
elif [[ "$1" == exec && "$2" == supabase_db_clash_baseline_* && "$*" == *"pg_db_role_setting"* ]]; then
  echo "read:authenticator-role-setting" >> "$FAKE_DB_LOG"
  if [[ -s "$FAKE_ROLE_SCHEMA_FILE" ]]; then sed 's/^/pgrst.db_schemas=/' "$FAKE_ROLE_SCHEMA_FILE"; fi
elif [[ "$1" == exec && "$2" == supabase_db_clash_baseline_* && "$*" == *"ALTER ROLE authenticator SET pgrst.db_schemas"* ]]; then
  schema=$(sed -n "s/.*SET pgrst.db_schemas = '\\([^']*\\)'.*/\\1/p" <<<"$*")
  [[ -n "$schema" ]] || exit 32
  printf '%s\n' "$schema" > "$FAKE_ROLE_SCHEMA_FILE"
  echo "set:authenticator-schema-context" >> "$FAKE_DB_LOG"
elif [[ "$*" == *pg_dump* ]]; then
  echo "dump:$mode" >> "$FAKE_DB_LOG"
  if [[ "${'${'}FAKE_CATALOG_MISMATCH:-0}" == 1 ]]; then echo "catalog-$mode";
  elif [[ "${'${'}FAKE_COMPLETE:-0}" == 1 ]]; then echo catalog-complete;
  else echo "catalog-$mode"; fi
elif [[ "$*" == *psql* ]]; then
  cat >/dev/null
  echo "psql:$mode" >> "$FAKE_DB_LOG"
  if [[ "$mode" == baseline && "${'${'}FAKE_BASELINE_IDEMPOTENCY_FAIL:-0}" == 1 ]]; then exit 23; fi
else
  echo "unexpected docker command: $*" >&2
  exit 20
fi
`);
  await chmod(docker, 0o755);
  return {
    repo,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_DB_LOG: path.join(root, 'calls.log'),
      FAKE_DB_MODE: path.join(root, 'mode.txt'),
      FAKE_ROLE_SCHEMA_FILE: roleSchemaFile,
      ...(roleSchemaOverride !== null ? { FAKE_ROLE_SCHEMA_INITIAL: roleSchemaOverride, FAKE_ROLE_SCHEMA_INITIAL_SET: '1' } : {}),
      FAKE_RUNTIME_SCHEMAS: runtimeSchemas ?? '',
      ...(runtimeSchemasUnavailable ? { FAKE_RUNTIME_UNAVAILABLE: '1' } : {}),
      ...(folded ? { FAKE_COMPLETE: '1' } : {}),
      ...(failBaselinePgTap ? { FAKE_BASELINE_PGTAP_FAIL: '1' } : {}),
      ...(failFullPgTap ? { FAKE_FULL_PGTAP_FAIL: '1' } : {}),
      ...(failBaselineIdempotency ? { FAKE_BASELINE_IDEMPOTENCY_FAIL: '1' } : {}),
      ...(failCatalogEquality ? { FAKE_CATALOG_MISMATCH: '1' } : {}),
    },
  };
}

test('Docker verifier skips baseline-only pgTAP under fold debt and always tests full replay', async t => {
  const fixture = await dockerVerifierFixture(t);
  execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
    cwd: fixture.repo,
    env: fixture.env,
    stdio: 'pipe',
  });
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  assert.match(calls, /start:baseline/);
  assert.doesNotMatch(calls, /pgtap:baseline/);
  assert.match(calls, /start:full/);
  assert.match(calls, /pgtap:full/);
  assert.match(calls, /set:authenticator-schema-context/);
});

test('Docker verifier copies measured PostgREST schemas into absent role context without masking exposure', async t => {
  const exposedSchemas = 'public,storage,graphql_public,features,substrate';
  const fixture = await dockerVerifierFixture(t, { runtimeSchemas: exposedSchemas });
  let failure;
  try {
    execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
      cwd: fixture.repo,
      env: fixture.env,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 21, 'an actually exposed substrate schema still fails the pgTAP probe');
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  const roleSchemas = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_ROLE_SCHEMA_FILE, 'utf8');
  assert.equal(roleSchemas.trim(), exposedSchemas, 'the measured runtime list is applied without replacing substrate');
  assert.match(calls, /read:runtime-schemas/);
  assert.match(calls, /set:authenticator-schema-context/);
  assert.match(calls, /pgtap:full/);
});

test('Docker verifier preserves existing authenticator schema override and fails on exposed substrate', async t => {
  const override = 'public,features,substrate';
  const fixture = await dockerVerifierFixture(t, {
    runtimeSchemas: 'public,storage,graphql_public,features',
    roleSchemaOverride: override,
  });
  let failure;
  try {
    execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
      cwd: fixture.repo,
      env: fixture.env,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 21);
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  const roleSchemas = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_ROLE_SCHEMA_FILE, 'utf8');
  assert.equal(roleSchemas.trim(), override, 'existing role GUC remains authoritative');
  assert.match(calls, /Preserving|read:authenticator-role-setting/);
  assert.doesNotMatch(calls, /set:authenticator-schema-context/);
});

test('Docker verifier fails closed when runtime schema evidence is unavailable or malformed', async t => {
  for (const scenario of [
    { name: 'unavailable', runtimeSchemasUnavailable: true },
    { name: 'malformed', runtimeSchemas: 'public,,features' },
  ]) {
    await t.test(scenario.name, async t => {
      const fixture = await dockerVerifierFixture(t, scenario);
      let failure;
      try {
        execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
          cwd: fixture.repo,
          env: fixture.env,
          stdio: 'pipe',
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.status, 1, 'missing runtime evidence fails the verifier');
      const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
      assert.doesNotMatch(calls, /set:authenticator-schema-context/);
      assert.doesNotMatch(calls, /pgtap:full/);
      assert.doesNotMatch(`${failure.stdout}\n${failure.stderr}`, /semantic verification PASS/);
    });
  }
});

test('Docker verifier fails closed on empty, malformed, or conflicting authenticator overrides', async t => {
  for (const scenario of [
    { name: 'empty override cannot hide runtime exposure', roleSchemaOverride: '', runtimeSchemas: 'public,features,substrate' },
    { name: 'malformed override', roleSchemaOverride: 'public,,features' },
    { name: 'conflicting applicable overrides', roleSchemaOverride: 'public,features\npublic,features,substrate' },
  ]) {
    await t.test(scenario.name, async t => {
      const fixture = await dockerVerifierFixture(t, scenario);
      let failure;
      try {
        execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
          cwd: fixture.repo,
          env: fixture.env,
          stdio: 'pipe',
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.status, 1, 'invalid role evidence fails the verifier');
      const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
      assert.match(calls, /read:authenticator-role-setting/);
      assert.doesNotMatch(calls, /set:authenticator-schema-context/);
      assert.doesNotMatch(calls, /pgtap:full/);
      assert.doesNotMatch(`${failure.stdout}\n${failure.stderr}`, /semantic verification PASS/);
    });
  }
});

test('Docker verifier propagates a genuine full-replay pgTAP failure', async t => {
  const fixture = await dockerVerifierFixture(t, { failFullPgTap: true });
  let failure;
  try {
    execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
      cwd: fixture.repo,
      env: fixture.env,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 19);
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  assert.match(calls, /pgtap:full/);
  assert.doesNotMatch(calls, /pgtap:baseline/);
});

test('complete-mode baseline pgTAP failure still runs idempotency, full replay and strict catalog check, then fails without PASS', async t => {
  const fixture = await dockerVerifierFixture(t, { folded: true, failBaselinePgTap: true, failCatalogEquality: true });
  let failure;
  try {
    execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
      cwd: fixture.repo,
      env: fixture.env,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 17, 'retain the baseline pgTAP exit status');
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  assert.ok(calls.indexOf('pgtap:baseline') < calls.indexOf('psql:baseline'));
  assert.ok(calls.indexOf('psql:baseline') < calls.indexOf('start:full'));
  assert.ok(calls.indexOf('start:full') < calls.indexOf('pgtap:full'));
  assert.match(calls, /dump:full/);
  assert.doesNotMatch(`${failure.stdout}\n${failure.stderr}`, /\bPASS\b/);
  assert.match(`${failure.stdout}\n${failure.stderr}`, /catalogs differ/);
});

test('complete-mode idempotency failure does not bypass full replay and ends failed without PASS', async t => {
  const fixture = await dockerVerifierFixture(t, { folded: true, failBaselineIdempotency: true });
  let failure;
  try {
    execFileSync('bash', ['.github/scripts/database/test-database-baseline.sh'], {
      cwd: fixture.repo,
      env: fixture.env,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.status, 23, 'retain the baseline reapply failure status');
  const calls = await (await import('node:fs/promises')).readFile(fixture.env.FAKE_DB_LOG, 'utf8');
  assert.match(calls, /pgtap:baseline/);
  assert.match(calls, /start:full/);
  assert.match(calls, /pgtap:full/);
  assert.match(calls, /dump:full/);
  assert.doesNotMatch(`${failure.stdout}\n${failure.stderr}`, /\bPASS\b/);
});

// --- Routine settings, dropped policies, and what DEGRADED may hide ----------
//
// Added 2026-10-04. Until then ALTER FUNCTION ... SET/RESET and DROP POLICY
// were "unsupported", and any unsupported or semantic-only statement made the
// whole report DEGRADED, which hid 74 unfolded objects from Stage 3.

async function fixtureWith(baseline, migration) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fold-state-'));
  await writeFile(path.join(directory, '20260531232406_master_migration.sql'), baseline);
  await writeFile(path.join(directory, '20260531232407_change.sql'), migration);
  return directory;
}

const ROUTINES = `
CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.touch(p_id bigint, p_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'app', 'pg_temp'
    AS $$ BEGIN PERFORM 1; END; $$;
CREATE OR REPLACE FUNCTION app.plain(p_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$ BEGIN EXECUTE 'SET search_path TO evil'; END; $$;
CREATE OR REPLACE FUNCTION app.pair(p_id bigint) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
CREATE OR REPLACE FUNCTION app.pair(p_id text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
CREATE POLICY "app read access" ON app.items FOR SELECT USING (true);
`;

const configOf = (report, fragment) => report.objects.find(item => item.key.startsWith('FUNCTION_CONFIG:') && item.key.includes(fragment));
const policyOf = report => report.objects.find(item => item.key.startsWith('POLICY:'));

test('a routine setting the baseline already carries is reconciled, whatever the quoting', async t => {
  // The real 2026-09-15 shape: unquoted in the ALTER, single-quoted in the
  // baseline, and a type-only signature with a multi-word type.
  const directory = await fixtureWith(ROUTINES, 'ALTER FUNCTION app.touch(bigint, timestamp with time zone) SET search_path TO public, app, pg_temp;\n');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.deepEqual(report.unsupported, []);
  assert.equal(configOf(report, 'app.touch').status, 'reconciled');
  assert.equal(report.status, 'FOLDED');
});

test('a routine setting the baseline lacks or contradicts is unfolded', async t => {
  const directory = await fixtureWith(ROUTINES, [
    'ALTER FUNCTION app.touch(bigint, timestamp with time zone) SET search_path TO app, public, pg_temp;',
    'ALTER FUNCTION app.plain(bigint) SET search_path TO evil;',
  ].join('\n'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(configOf(report, 'app.touch').status, 'unfolded', 'search_path order is meaningful');
  assert.equal(configOf(report, 'app.plain').status, 'unfolded', "a SET inside a body is not the routine's own");
  assert.equal(report.status, 'UNFOLDED');
});

test('RESET expects the baseline routine to carry no such setting', async t => {
  const directory = await fixtureWith(ROUTINES, [
    'ALTER FUNCTION app.plain(bigint) RESET search_path;',
    'ALTER FUNCTION app.touch(bigint, timestamp with time zone) RESET search_path;',
  ].join('\n'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(configOf(report, 'app.plain').status, 'reconciled');
  assert.equal(configOf(report, 'app.touch').status, 'unfolded');
});

test('a later redefinition withdraws an earlier setting, and a later reset overrides it', async t => {
  // The real 2026-09-17 shape: RESET plan_cache_mode, then CREATE OR REPLACE
  // of the same routine, which sets its whole configuration again.
  const directory = await fixtureWith(ROUTINES, [
    'ALTER FUNCTION app.plain(bigint) SET plan_cache_mode = force_custom_plan;',
    "CREATE OR REPLACE FUNCTION app.plain(p_id bigint) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'SET search_path TO evil'; END; $$;",
    'ALTER FUNCTION app.touch(bigint, timestamp with time zone) SET plan_cache_mode = force_custom_plan;',
    'ALTER FUNCTION app.touch(bigint, timestamp with time zone) RESET plan_cache_mode;',
  ].join('\n'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(configOf(report, 'app.plain'), undefined, 'the redefinition sets the final configuration');
  assert.equal(configOf(report, 'app.touch').status, 'reconciled', 'set then reset leaves nothing to carry');
});

test('an ALTER FUNCTION the checker cannot pin to one routine is left to a database, never folded', async t => {
  // Reporting it unfolded would send Stage 3 to fold a routine the checker
  // could not identify.
  const directory = await fixtureWith(ROUTINES, [
    'ALTER FUNCTION app.pair(integer) SET search_path TO public;',
    'ALTER FUNCTION app.missing(bigint) SET search_path TO public;',
  ].join('\n'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(configOf(report, 'app.pair').status, 'semantic-only');
  assert.equal(configOf(report, 'app.missing').status, 'unfolded', 'the baseline lacks the routine altogether');
  assert.equal(configOf(report, 'app.missing').reason, 'ABSENT');
});

test('SET FROM CURRENT and RESET ALL stay unsupported', async t => {
  const directory = await fixtureWith(ROUTINES, 'ALTER FUNCTION app.plain(bigint) SET search_path FROM CURRENT;\nALTER FUNCTION app.plain(bigint) RESET ALL;\n');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.unsupported.length, 2, 'their final value depends on the session, not the text');
  assert.equal(report.status, 'DEGRADED');
});

test('a dropped policy is checked against quoted names with spaces, never vacuously', async t => {
  // identifyDefinition cannot read "app read access", so an absence check on
  // its keys would report every dropped policy folded.
  const kept = await fixtureWith(ROUTINES, 'DROP POLICY IF EXISTS "app read access" ON app.items;\n');
  const gone = await fixtureWith(ROUTINES, 'DROP POLICY IF EXISTS "app write access" ON app.items;\n');
  t.after(() => Promise.all([kept, gone].map(directory => rm(directory, { recursive: true, force: true }))));
  assert.equal(policyOf(await checkFoldState({ migrationsDir: kept })).status, 'unfolded', 'the baseline still creates a dropped policy');
  assert.equal(policyOf(await checkFoldState({ migrationsDir: gone })).status, 'folded');
});

test('known folding work is never hidden behind work only a database can check', async t => {
  const directory = await fixture(`
CREATE TABLE app.extra (id bigint);
DO $$ BEGIN PERFORM 1; END $$;
`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await checkFoldState({ migrationsDir: directory });
  assert.equal(report.counts['semantic-only'], 1);
  assert.equal(report.counts.unfolded, 1);
  assert.equal(report.status, 'UNFOLDED', 'DEGRADED here hid the pending list from Stage 3 for weeks');
});
