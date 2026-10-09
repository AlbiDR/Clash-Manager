// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditMigrations } from './audit-migrations.mjs';

async function fixture({
  migrationComment = '-- concise',
  migrationBody = "COMMENT ON TABLE app.items IS 'items';",
  expiry = '2099-01-01',
  baselineExtra = '',
  serviceRoleOnlyFunctions = [],
} = {}) {
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
${baselineExtra}
`);
  const migrationPath = 'Backend/supabase/migrations/20260102000000_change.sql';
  const migrationSource = `${migrationComment}\n${migrationBody}\n`;
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
    serviceRoleOnlyFunctions,
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

test('rejects a retained view migration that removes a baseline output column', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE VIEW app.heartbeat AS SELECT h.component_id, h.last_success_at, h.status FROM app.heartbeats h;',
    migrationBody: 'CREATE OR REPLACE VIEW app.heartbeat AS SELECT h.component_id, h.last_success_at FROM app.heartbeats h;',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(report.viewHistoryViolations, [
    'Backend/supabase/migrations/20260102000000_change.sql: CREATE OR REPLACE VIEW app.heartbeat changes existing output columns [component_id, last_success_at, status] to [component_id, last_success_at]',
  ]);
});

test('allows a retained view migration to append output columns', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE VIEW app.heartbeat AS SELECT h.component_id, h.last_success_at FROM app.heartbeats h;',
    migrationBody: 'CREATE OR REPLACE VIEW app.heartbeat AS SELECT h.component_id, h.last_success_at, h.status FROM app.heartbeats h;',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.viewHistoryViolations, []);
});

test('detects a CTE-form replacement that removes a retained output column', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE VIEW app.v AS SELECT a, b FROM app.source_rows;',
    migrationBody: 'CREATE OR REPLACE VIEW app.v AS WITH q AS (SELECT a, b FROM app.source_rows) SELECT a FROM q;',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.viewHistoryViolations.join('\n'), /app\.v changes existing output columns \[a, b\] to \[a\]/);
});

test('keeps quoted mixed-case view identity distinct from an unquoted name', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE VIEW app.v AS SELECT a, b FROM app.source_rows;',
    migrationBody: 'DROP VIEW IF EXISTS app."V"; CREATE OR REPLACE VIEW app.v AS SELECT a FROM app.source_rows;',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.viewHistoryViolations.join('\n'), /app\.v changes existing output columns \[a, b\] to \[a\]/);
});

test('matches quoted lowercase identifiers with their PostgreSQL unquoted identity', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE VIEW app.v AS SELECT a, b FROM app.source_rows;',
    migrationBody: 'DROP VIEW IF EXISTS app."v"; CREATE OR REPLACE VIEW app.v AS SELECT a FROM app.source_rows;',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.viewHistoryViolations, []);
});

test('models documented DROP VIEW lists, CASCADE, view options, explicit names and CTE replacements', async t => {
  const root = await fixture({
    baselineExtra: `CREATE OR REPLACE VIEW app.v (a, b) AS SELECT s.a, s.b FROM app.source_rows s;
CREATE OR REPLACE VIEW app.other AS SELECT s.a, s.b FROM app.source_rows s;`,
    migrationBody: `DROP VIEW IF EXISTS app.v, app.other CASCADE;
CREATE VIEW app.v WITH (security_barrier = true) AS WITH q AS (SELECT s.a, s.b FROM app.source_rows s) SELECT a, b FROM q;`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.viewHistoryViolations, []);
});

test('models CASCADE removal of tracked dependent views before replacement', async t => {
  const root = await fixture({
    baselineExtra: `CREATE OR REPLACE VIEW app.base AS SELECT a, b FROM app.source_rows;
CREATE OR REPLACE VIEW app.dependent AS SELECT a, b FROM app.base;`,
    migrationBody: `DROP VIEW IF EXISTS app.base CASCADE;
CREATE OR REPLACE VIEW app.base AS SELECT a FROM app.source_rows;
CREATE OR REPLACE VIEW app.dependent AS SELECT a FROM app.base;`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.viewHistoryViolations, []);
});

test('fails closed for an ordinary view query form outside the bounded projection model', async t => {
  const root = await fixture({ migrationBody: 'CREATE VIEW app.values_view AS VALUES (1), (2);' });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.viewHistoryViolations.join('\n'), /cannot prove ordinary CREATE VIEW output columns/);
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

test('fails a baseline whose trigger cannot be replayed', async t => {
  // Regression guard for 2026-09-08: a fold copied a bare CREATE TRIGGER into
  // the baseline, this audit reported PASS with 0 violations, and the release
  // gate then blocked every PWA deploy from that branch. Both now read the
  // same rules from baseline-rules.mjs.
  const root = await fixture({
    baselineExtra: 'CREATE TRIGGER t_items AFTER INSERT ON app.items FOR EACH ROW EXECUTE FUNCTION app.ping();',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.baseline.violations.includes('Trigger at line 7 missing OR REPLACE'));
});

test('passes the same baseline once the trigger is re-runnable', async t => {
  const root = await fixture({
    baselineExtra: 'CREATE OR REPLACE TRIGGER t_items AFTER INSERT ON app.items FOR EACH ROW EXECUTE FUNCTION app.ping();',
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
});

test('enforces service-role-only execution for privileged RPCs', async t => {
  const root = await fixture({
    serviceRoleOnlyFunctions: ['app.ping()'],
    migrationBody: `
REVOKE ALL ON FUNCTION app.ping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ping() TO service_role;`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.securityViolations, []);
});

test('enforces multiline service-role-only privilege statements', async t => {
  const root = await fixture({
    serviceRoleOnlyFunctions: ['app.ping()'],
    baselineExtra: 'GRANT EXECUTE ON FUNCTION app.ping() TO anon, authenticated;',
    migrationBody: `
REVOKE ALL ON FUNCTION app.ping()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ping()
  TO service_role;`,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.securityViolations, []);
});

test('rejects a privileged RPC left executable by PUBLIC', async t => {
  const root = await fixture({ serviceRoleOnlyFunctions: ['app.ping()'] });
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = await auditMigrations({ repoRoot: root });
  assert.equal(report.status, 'FAIL');
  assert.match(report.securityViolations.join(' '), /PUBLIC can execute/);
  assert.match(report.securityViolations.join(' '), /service_role cannot execute/);
});
