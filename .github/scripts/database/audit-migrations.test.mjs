// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditMigrations } from './audit-migrations.mjs';

async function fixture({ migrationComment = '-- concise', expiry = '2099-01-01' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'migration-audit-'));
  await mkdir(path.join(root, '.github/nightly-config'), { recursive: true });
  await mkdir(path.join(root, 'Backend/supabase/migrations'), { recursive: true });
  const baselinePath = 'Backend/supabase/migrations/20260101000000_master_migration.sql';
  await writeFile(path.join(root, baselinePath), `
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.items (id bigint PRIMARY KEY);
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION app.ping() RETURNS boolean
LANGUAGE sql SET search_path TO app AS $$ SELECT true $$;
`);
  const migrationPath = 'Backend/supabase/migrations/20260102000000_change.sql';
  const migrationSource = `${migrationComment}\nCOMMENT ON TABLE app.items IS 'items';\n`;
  await writeFile(path.join(root, migrationPath), migrationSource);
  await writeFile(path.join(root, '.github/nightly-config/migration-quality.json'), `${JSON.stringify({
    version: 1,
    baseline: baselinePath,
    budgets: {
      smallStatementLimit: 5,
      smallCommentLines: 6,
      largeCommentLines: 12,
      ratioMinimumNonblankLines: 16,
      maximumCommentRatio: 0.4,
    },
    allowedSeedTargets: [],
    immutableFileHashes: {
      [migrationPath]: createHash('sha256').update(migrationSource).digest('hex'),
    },
    exemptions: expiry ? [] : [{
      path: migrationPath,
      reason: 'A sufficiently specific operational exception.',
      maxCommentLines: 20,
      maxCommentRatio: 0.8,
      expiresOn: expiry,
    }],
  }, null, 2)}\n`);
  return root;
}

test('passes a concise migration and a declarative baseline', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.equal(report.summary.migrationsExamined, 1);
});

test('fails comment budget and baseline purity violations', async t => {
  const root = await fixture({ migrationComment: Array(8).fill('-- narrative').join('\n') });
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Backend/supabase/migrations/20260101000000_master_migration.sql'), `
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.items (id bigint PRIMARY KEY);
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
UPDATE app.items SET id = 2;
`);
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.migrations[1].violations.join(' '), /comment lines/);
  assert.match(report.baseline.violations.join(' '), /historical repair/);
});

test('reports unsupported baseline statements as degraded', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Backend/supabase/migrations/20260101000000_master_migration.sql'), 'VACUUM;\n');
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'DEGRADED');
  assert.equal(report.unsupportedStatements.length, 1);
});

test('requires policies for direct application-role table grants', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Backend/supabase/migrations/20260101000000_master_migration.sql'), `
CREATE SCHEMA IF NOT EXISTS app;
CREATE TABLE IF NOT EXISTS app.items (id bigint PRIMARY KEY);
ALTER TABLE app.items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE app.items TO authenticated;
`);
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.baseline.violations.join(' '), /no RLS policy/);
});

test('rejects edits to immutable historical migrations', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Backend/supabase/migrations/20260102000000_change.sql'), "COMMENT ON TABLE app.items IS 'changed';\n");
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.migrations[1].violations.join(' '), /immutable hash/);
});

test('rejects stale destructive baseline statements', async t => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'Backend/supabase/migrations/20260101000000_master_migration.sql'), `
CREATE SCHEMA IF NOT EXISTS app;
DROP VIEW IF EXISTS app.retired_view;
`);
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.baseline.violations.join(' '), /stale destructive residue/);
});
