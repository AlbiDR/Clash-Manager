// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkFoldState } from './fold-state.mjs';

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
