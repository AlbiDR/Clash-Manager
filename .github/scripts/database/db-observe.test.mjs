// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildFreshnessEvidence, buildHealthReport, compareDatabaseCounters, compareResourceReports } from './db-health.mjs';
import { runObserver, runObserverCli, unavailableSample } from './db-observe.mjs';

const modes = ['idle', 'iowait', 'irq', 'nice', 'softirq', 'steal', 'system', 'user'];
function fixture(at, advance = 0, statsReset = '2026-10-12T00:00:00Z') {
  const started = new Date(at).toISOString();
  const completed = new Date(at + 1500).toISOString();
  const database = { status: 'SUCCESS', data: {
    postmasterStart: '2026-10-10T14:35:40Z', databaseStats: {
      statsReset, numBackends: 1, xactCommit: 10 + advance, xactRollback: 1, blocksRead: 2, blocksHit: 100 + advance,
      tempFiles: 1, tempBytes: 512, deadlocks: 0,
    }, snapshotPublication: [{ snapshotName: 'roster', generation: 4, refreshedAt: new Date(at - 60000).toISOString() },
      { snapshotName: 'headhunter', generation: 4, refreshedAt: new Date(at - 60000).toISOString() }],
    ingestion: { component_id: 'ROYALE_DATA_INGESTOR' },
    heartbeats: ['ROYALE_DATA_INGESTOR', 'HEADHUNTER_SCANNER'].map(component_id => ({ component_id, status: 'COMPLETED',
      last_success_at: new Date(at - 120000).toISOString(), last_triggered_at: null, last_failure_at: null,
      is_data_perfect: true, stages_called: [], stages_run: [], integrity_checks: [] })),
  } };
  const resources = { status: 'SUCCESS', data: {
    hostId: 'abcdefghijklmnopqrst', hostBootTimeSeconds: 1, sampleStartedAt: started,
    sampleCompletedAt: completed, cpuSeconds: ['0', '1'].flatMap(cpu => modes.map(mode => ({ cpu, mode,
      seconds: 100 + (mode === 'idle' ? advance * 0.8 : mode === 'iowait' ? advance * 0.2 : 0) }))),
    lifetimeSwapInPages: 10 + advance, lifetimeSwapOutPages: 20 + advance,
  } };
  return { ...buildHealthReport({ observedAt: completed, database, resources, reads: [
    { label: 'roster_materialized', status: 'SUCCESS', data: { rows: 2 } },
  ] }), databaseEvidenceStatus: 'AVAILABLE' };
}

test('database deltas require shared non-null reset epoch, same postmaster, and monotonic counters', () => {
  const before = fixture(1000, 0);
  const after = fixture(2000, 3);
  const delta = compareDatabaseCounters(before, after);
  assert.equal(delta.status, 'SUCCESS');
  assert.equal(delta.resetQualified, true);
  assert.equal(delta.counters.xactCommit, 3);
  assert.equal(compareDatabaseCounters(before, fixture(2000, 3, null)).status, 'UNAVAILABLE');
  assert.match(compareDatabaseCounters(before, fixture(2000, 3, '2026-10-13T00:00:00Z')).issues.join(), /shared non-null/);
  const decreased = fixture(2000, 3);
  decreased.database.data.databaseStats.blocksRead = 0;
  assert.equal(compareDatabaseCounters(before, decreased).status, 'DEGRADED');
  decreased.database.data.postmasterStart = '2026-10-13T00:00:00Z';
  assert.match(compareDatabaseCounters(before, decreased).issues.join(), /postmaster start changed/);
  assert.equal(compareDatabaseCounters(before, { database: { status: 'UNAVAILABLE' } }).status, 'UNAVAILABLE');
});

test('freshness keeps publication distinct from heartbeat and handles missing, stale, and future ages', () => {
  const result = buildFreshnessEvidence('2026-10-13T12:00:00Z', [
    { snapshotName: 'roster', generation: 2, refreshedAt: '2026-10-13T11:00:00Z' },
    { snapshotName: 'headhunter', generation: 0, refreshedAt: null },
    { snapshotName: 'future', refreshedAt: '2026-10-13T12:01:00Z' },
  ], [{ component_id: 'INGESTOR', last_success_at: '2026-10-13T11:30:00Z' }]);
  assert.equal(result.publication[0].ageSeconds, 3600);
  assert.equal(result.publication[1].status, 'NEVER_PUBLISHED');
  assert.equal(result.publication[2].status, 'AGE_UNAVAILABLE');
  assert.equal(result.heartbeats[0].lastSuccessAgeSeconds, 1800);
  assert.equal(result.publication[0].snapshotName, 'roster');
});

test('two samples are spaced by the requested bounded interval and use canonical resource comparison', async () => {
  let clock = 1_000_000;
  let count = 0;
  let saved;
  const result = await runObserver({ output: 'capture.json', intervalSeconds: 120 }, {
    now: () => clock,
    wait: async ms => { clock += ms; },
    collect: async () => { const report = fixture(clock, count++ ? 10 : 0); clock += 1000; return report; },
    collectLogs: async () => ({ status: 'SUCCESS', window: {}, sourceCoverage: {}, aggregates: {},
      failedDataApiRequests: { records: [] }, rpcTraces: { records: [] }, unknowns: [] }),
    save: async (_output, evidence) => { saved = evidence; },
  });
  assert.equal(saved.sampleCount, 2);
  assert.ok(saved.comparison.sampleStartSeparationSeconds >= 120);
  assert.equal(saved.comparison.resourceInterval.status, 'SUCCESS');
  assert.equal(saved.comparison.databaseCounters.counters.xactCommit, 10);
  assert.equal(saved.providerLogs.status, 'SUCCESS');
  assert.equal(result.exitCode, 0);
});

test('partial failures still save both sample records and exit degraded', async () => {
  let clock = 5_000_000;
  let calls = 0;
  let saved;
  const result = await runObserver({ output: '/tmp/partial.json', intervalSeconds: 120 }, {
    now: () => clock, wait: async ms => { clock += ms; },
    collect: async () => { calls += 1; if (calls === 1) throw new Error('configured project unavailable'); return fixture(clock, 10); },
    save: async (file, evidence) => { saved = { file, evidence }; },
    env: { GITHUB_SHA: 'abc123', RELEASE_VERSION: '14.54.4' },
  });
  assert.equal(saved.file, '/tmp/partial.json');
  assert.equal(saved.evidence.samples.length, 2);
  assert.equal(saved.evidence.samples[0].database.status, 'UNAVAILABLE');
  assert.equal(saved.evidence.samples[0].provenance.checkout.commit, 'abc123');
  assert.equal(result.exitCode, 1);
  assert.equal(result.evidence.comparison.resourceInterval.status, 'UNAVAILABLE');
});

test('whole-sample fallback drops arbitrary setup errors from every artifact projection', async () => {
  let clock = 5_500_000;
  let calls = 0;
  let saved;
  const result = await runObserver({ output: '/tmp/partial-secret.json', intervalSeconds: 120 }, {
    now: () => clock, wait: async ms => { clock += ms; },
    collect: async () => { calls += 1; throw new Error('https://host.invalid/?secret=fixture'); },
    collectLogs: async () => ({ status: 'UNAVAILABLE' }),
    save: async (_file, evidence) => { saved = evidence; }, env: { GITHUB_SHA: 'deadbeef' },
  });
  assert.equal(result.exitCode, 1);
  assert.ok(saved.samples.every(sample => sample.database.errorCategory === 'SETUP_UNAVAILABLE'));
  assert.ok(saved.samples.every(sample => sample.unavailableEvidence.every(item => item.reason === 'SETUP_UNAVAILABLE')));
  assert.doesNotMatch(JSON.stringify(saved), /host\.invalid|secret|fixture/);
  const standalone = unavailableSample(new Error('token=fixture'), new Date(clock).toISOString(), {});
  assert.doesNotMatch(JSON.stringify(standalone), /token=|fixture/);
});

test('CLI failure text is fixed and does not echo hostile argument-derived errors', () => {
  const script = fileURLToPath(new URL('./db-observe.mjs', import.meta.url));
  const hostile = '?secret=fixture';
  const run = spawnSync(process.execPath, [script, '--bad-option', hostile], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Observer failed \(setup, usage, or output unavailable\)\./);
  assert.doesNotMatch(run.stderr, /secret|fixture|bad-option/);
});

test('one unavailable pair-level logs result is saved without aborting health captures or returning success', async () => {
  let clock = 9_000_000;
  let healthCalls = 0;
  let logCalls = 0;
  let saved;
  const result = await runObserver({ output: 'pair.json', intervalSeconds: 120 }, {
    now: () => clock, wait: async ms => { clock += ms; },
    collect: async () => { const report = fixture(clock, healthCalls ? 10 : 0); healthCalls += 1; clock += 1000; return report; },
    collectLogs: async () => { logCalls += 1; return { status: 'UNAVAILABLE', unavailable: 'API HTTP 200 query error' }; },
    save: async (_output, evidence) => { saved = evidence; },
  });
  assert.equal(healthCalls, 2);
  assert.equal(logCalls, 1);
  assert.equal(saved.samples.length, 2);
  assert.equal(saved.providerLogs.status, 'UNAVAILABLE');
  assert.equal(result.exitCode, 1);
});

test('observer rejects unbounded/short intervals before collecting and CLI enforces usage', async () => {
  let calls = 0;
  await assert.rejects(runObserver({ output: 'x.json', intervalSeconds: 119 }, { collect: async () => { calls++; } }), /120 to 3600/);
  await assert.rejects(runObserverCli(['--interval-seconds', '30', '--output', 'x.json']), /Usage/);
  assert.equal(calls, 0);
});

test('missing resource captures are not normalized into zero pressure', () => {
  const missing = fixture(1000);
  missing.resources.status = 'UNAVAILABLE';
  assert.equal(compareResourceReports(missing, fixture(200000, 10)).status, 'UNAVAILABLE');
});

test('scheduled observer fills bounded missing log hours without additional database probes and preserves degraded originals', async () => {
  let clock = Date.parse('2026-10-17T12:17:00Z');
  let healthCalls = 0;
  const windows = [];
  const oldWindow = { start: '2026-10-16T13:00:00.000Z', end: '2026-10-16T14:00:00.000Z' };
  const previous = { provenance: { projectRef: 'abcdefghijklmnopqrst', workflow: { runId: 'old' } }, evidence: { status: 'DEGRADED', window: oldWindow } };
  const result = await runObserver({ output: 'history.json', intervalSeconds: 120 }, {
    now: () => clock, wait: async ms => { clock += ms; }, env: { GITHUB_ACTIONS: 'true', SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' },
    collect: async () => fixture(clock, healthCalls++ * 10),
    collectLogs: async options => {
      const window = options.window ?? { start: '2026-10-17T11:00:00.000Z', end: '2026-10-17T12:00:00.000Z' };
      windows.push(window);
      return { status: 'SUCCESS', window };
    },
    readHistory: async () => ({ status: 'SUCCESS', archives: [{ attempts: [previous, previous] }], unknowns: [] }),
    save: async () => {},
  });
  assert.equal(healthCalls, 2);
  assert.equal(windows.length, 7);
  assert.equal(windows[1].start, oldWindow.start);
  assert.equal(result.evidence.logArchive.additionalQueries, 6);
  assert.equal(result.evidence.logArchive.attempts.filter(item => item.evidence.status === 'DEGRADED').length, 1);
  assert.ok(result.evidence.logArchive.missingWindows.length > 0);
  assert.equal(result.evidence.logArchive.status, 'DEGRADED');
  assert.equal(result.exitCode, 0, 'collector success remains separate from archive/operational health');
});

test('missing history and catch-up errors stay explicit without erasing current host pair or prior failures', async () => {
  let clock = Date.parse('2026-10-17T12:17:00Z');
  let healthCalls = 0;
  const result = await runObserver({ output: 'history.json', intervalSeconds: 120 }, {
    now: () => clock, wait: async ms => { clock += ms; }, env: { GITHUB_ACTIONS: 'true', SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' },
    collect: async () => fixture(clock, healthCalls++ * 10),
    collectLogs: async options => { if (options.window) throw new Error('secret=fixture');
      return { status: 'SUCCESS', window: { start: '2026-10-17T11:00:00.000Z', end: '2026-10-17T12:00:00.000Z' } }; },
    readHistory: async () => { throw new Error('secret=fixture'); }, save: async () => {},
  });
  assert.equal(result.evidence.logArchive.historyStatus, 'UNAVAILABLE');
  assert.equal(result.evidence.logArchive.attempts.filter(item => item.evidence.status === 'UNAVAILABLE').length, 6);
  assert.equal(result.evidence.samples.length, 2);
  assert.doesNotMatch(JSON.stringify(result.evidence), /secret=fixture/);
});
