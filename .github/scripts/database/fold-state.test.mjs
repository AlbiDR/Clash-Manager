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
