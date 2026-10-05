// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArchitectureReport, compareSnapshots, equivalentIndexes, migrationSources, renderArchitectureHtml, safeEmbeddedJson } from './db-architecture.mjs';

const index = { id: 'drivers.test_pkey', table: 'drivers.test', name: 'test_pkey', bytes: 8192,
  valid: true, primary: true, unique: true, constraintBacked: true, method: 'btree',
  key: '1 2', keyCount: 2, opclasses: '1 1', collations: '0 0', options: '0 0', predicate: null, expressions: null, scans: 0 };
const snapshot = () => ({ version: 1, projectRef: 'project', observedAt: '2026-10-05T22:00:00Z', serverStartedAt: '2026-10-05T21:00:00Z',
  databaseBytes: 100000, databaseStatsResetAt: null, statementStatsResetAt: '2026-10-05T21:00:00Z',
  tables: [{ id: 'drivers.test', bytes: 10000, plannerRows: 104000, statisticsRows: 110, inserted: 110 }],
  indexes: [index], foreignKeys: [], views: [], viewDependencies: [], routines: [], triggers: [], jobs: [], queries: [], columns: [], policies: [], retentionConfig: [], migrations: [],
});

test('an empty statistics counter cannot hide data or become an exact row count', () => {
  const data = snapshot();
  data.tables = [{ id: 'drivers.player_battles', bytes: 10000, plannerRows: 104000, statisticsRows: 0 }];
  data.lifecycle = { battles: { rows: 104089 } };
  const report = buildArchitectureReport(data, { catalog: { 'drivers.player_battles': { purpose: 'Battle detail', lifecycle: 'Fold before prune' } } });
  assert.equal(report.snapshot.tables[0].exactRows, 104089);
  assert.equal(report.checks.estimateDisagreements[0].statisticsEstimate, 0);
  const uncounted = buildArchitectureReport(snapshot());
  assert.equal(uncounted.snapshot.tables[0].exactRows, null);
});

test('zero scans do not create a removable index finding', () => {
  assert.deepEqual(equivalentIndexes([index]), []);
  const report = buildArchitectureReport(snapshot());
  assert.ok(!report.findings.some(finding => /unused|remove.*index/i.test(finding.title)));
});

test('equivalent lookup keys preserve primary and unique constraints', () => {
  const redundant = { ...index, id: 'drivers.copy', primary: false, unique: false, constraintBacked: false };
  const [group] = equivalentIndexes([index, redundant]);
  assert.deepEqual(group.protected, ['drivers.test_pkey']);
  assert.deepEqual(group.reviewCandidates, ['drivers.copy']);
  assert.match(group.action, /No automatic removal/);
  assert.deepEqual(equivalentIndexes([index, { ...redundant, predicate: 'active = true' }]), []);
  assert.deepEqual(equivalentIndexes([index, { ...redundant, key: '1 2 3' }]), []);
  assert.deepEqual(equivalentIndexes([index, { ...redundant, options: '0 1' }]), []);
  assert.deepEqual(equivalentIndexes([index, { ...redundant, valid: false }]), []);
});

test('incomplete index evidence cannot be labeled equivalent', () => {
  assert.deepEqual(equivalentIndexes([{ valid: true, id: 'a' }, { valid: true, id: 'b' }]), []);
});

test('growth requires an earlier snapshot from the same project', () => {
  const current = snapshot();
  assert.equal(compareSnapshots(current).status, 'NO_BASELINE');
  assert.equal(compareSnapshots(current, current).status, 'NOT_COMPARABLE');
  assert.equal(compareSnapshots(current, { ...current, projectRef: 'other', observedAt: '2026-10-04T22:00:00Z' }).status, 'NOT_COMPARABLE');
  const prior = { ...current, observedAt: '2026-10-04T22:00:00Z', databaseBytes: 90000, tables: [{ ...current.tables[0], bytes: 8000, inserted: 100 }] };
  const comparison = compareSnapshots(current, prior);
  assert.equal(comparison.seconds, 86400);
  assert.equal(comparison.databaseDeltaBytes, 10000);
  assert.equal(comparison.tables[0].deltaBytes, 2000);
  assert.equal(comparison.tables[0].insertedSinceBaseline, 10);
});

test('restarts and per-table resets suppress misleading workload deltas', () => {
  const current = snapshot();
  const prior = { ...current, observedAt: '2026-10-05T21:30:00Z', serverStartedAt: '2026-10-05T20:00:00Z', tables: [{ ...current.tables[0], inserted: 100 }] };
  assert.equal(compareSnapshots(current, prior).countersReset, true);
  assert.equal(compareSnapshots(current, prior).tables[0].insertedSinceBaseline, null);
  prior.serverStartedAt = current.serverStartedAt;
  prior.tables[0].inserted = 500;
  assert.equal(compareSnapshots(current, prior).tables[0].insertedSinceBaseline, null);
});

test('missing query or relationship evidence fails instead of reporting a clean audit', () => {
  const data = snapshot();
  delete data.queries;
  assert.throws(() => buildArchitectureReport(data), /evidence unavailable: queries/);
  assert.throws(() => buildArchitectureReport({}), /Invalid architecture snapshot/);
});

test('source navigation includes incremental migrations without claiming replay equivalence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cm-architecture-'));
  try {
    const directory = path.join(root, 'Backend/supabase/migrations');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, '20260101000000_master.sql'), 'CREATE TABLE drivers.test (id int);');
    await writeFile(path.join(directory, '20260102000000_index.sql'), 'CREATE INDEX test_index ON drivers.test (id);');
    const sources = await migrationSources(root);
    assert.equal(sources.fileCount, 2);
    assert.deepEqual(sources.objects['indexes:test_index'], ['Backend/supabase/migrations/20260102000000_index.sql']);
    assert.match(sources.scope, /not replayed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('catalog text cannot escape an embedded JSON script or execute HTML', async () => {
  const hostile = '</script><script>globalThis.stolen=true</script>&\u2028\u2029';
  const encoded = safeEmbeddedJson({ hostile });
  assert.ok(!encoded.includes('<'));
  assert.deepEqual(JSON.parse(encoded), { hostile });
  const data = snapshot();
  data.tables[0].comment = hostile;
  const html = await renderArchitectureHtml(buildArchitectureReport(data));
  assert.ok(!html.includes(hostile));
  assert.ok(!html.includes('__ARCHITECTURE_DATA__'));
  assert.match(html, /textContent/);
});

test('an undocumented live table remains visible as incomplete coverage', () => {
  const report = buildArchitectureReport(snapshot());
  assert.equal(report.coverage.purposeMap, 'INCOMPLETE');
  assert.deepEqual(report.checks.unknownTables, ['drivers.test']);
  assert.equal(report.coverage.executionPlans, 'NOT_CAPTURED');
  assert.equal(report.coverage.recoveryRehearsal, 'NOT_PERFORMED');
});

test('missing runtime retention cannot report an empty backlog as healthy', () => {
  const data = snapshot();
  data.lifecycle = { battleRetention: { keepDays: null, purgeBatchRows: null, oldRowsWithoutSummary: 0 } };
  const report = buildArchitectureReport(data);
  assert.ok(report.findings.some(finding => finding.id === 'battle-retention-config'));
});
