// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildHealthReport, compareResourceReports, formatHealthReport, parseResourceMetrics, runHealthCli, collectHealthReport, validateDatabaseMetadata } from './db-health.mjs';

function completeMetadata() {
  const heartbeat = component => ({ component_id: component, status: 'COMPLETED', last_success_at: '2026-10-13T10:00:00Z',
    last_triggered_at: '2026-10-13T09:59:00Z', last_failure_at: null, is_data_perfect: true,
    stages_called: ['FETCH_DATA'], stages_run: ['FETCH_DATA'], integrity_checks: [{ stage: 'FETCH_DATA', passed: true }] });
  const heartbeats = [heartbeat('ROYALE_DATA_INGESTOR'), heartbeat('HEADHUNTER_SCANNER')];
  return { observedAt: '2026-10-13T10:00:00Z', cron24h: { runs: 1, failed: 0, startupTimeouts: 0 },
    databaseBytes: 1024, connections: 1, maxConnections: 60,
    databaseStats: { statsReset: null, numBackends: 1, xactCommit: 0, xactRollback: 0,
      blocksRead: 0, blocksHit: 0, tempFiles: 0, tempBytes: 0, deadlocks: 0 },
    snapshotPublication: [{ snapshotName: 'roster', generation: 0, refreshedAt: null },
      { snapshotName: 'headhunter', generation: 0, refreshedAt: null }],
    ingestion: structuredClone(heartbeats[0]), heartbeats };
}

test('resource parsing distinguishes absent metrics from zero and sums CPU cores', () => {
  const metrics = parseResourceMetrics(`
node_memory_MemTotal_bytes{service_type="db"} 4.0e8
node_memory_SwapTotal_bytes{} 1000
node_memory_SwapFree_bytes{} 1000
node_cpu_seconds_total{cpu="0",mode="idle"} 80
node_cpu_seconds_total{cpu="0",mode="iowait"} 20
node_cpu_seconds_total{cpu="1",mode="idle"} 80
node_cpu_seconds_total{cpu="1",mode="iowait"} 20
${['0', '1'].flatMap(cpu => ['irq', 'nice', 'softirq', 'steal', 'system', 'user']
  .map(mode => `node_cpu_seconds_total{cpu="${cpu}",mode="${mode}"} 0`)).join('\n')}
`);
  assert.equal(metrics.memoryBytes, 400000000);
  assert.equal(metrics.swapUsedBytes, 0);
  assert.equal(metrics.availableMemoryBytes, null);
  assert.equal(metrics.lifetimeSwapInPages, null);
  assert.equal(metrics.lifetimeIoWaitPercent, 20);
});

const cpuModes = ['idle', 'iowait', 'irq', 'nice', 'softirq', 'steal', 'system', 'user'];
function resourceReport(start, end, advance = 0) {
  return buildHealthReport({ observedAt: '2026-10-10T12:30:00Z', database, reads, resources: {
    status: 'SUCCESS', data: {
      hostId: 'project', hostBootTimeSeconds: 100,
      sampleStartedAt: `2026-10-10T12:00:${start}Z`, sampleCompletedAt: `2026-10-10T12:00:${end}Z`,
      cpuSeconds: ['0', '1'].flatMap(cpu => cpuModes.map(mode => ({
        cpu, mode, seconds: 100 + (mode === 'idle' ? advance * 0.8 : mode === 'iowait' ? advance * 0.2 : 0),
      }))),
      lifetimeSwapInPages: 100 + advance * 2, lifetimeSwapOutPages: 100,
    },
  } });
}

test('preserves boot and stable CPU/mode identities regardless of label order', () => {
  const metrics = parseResourceMetrics(`node_boot_time_seconds 100
node_cpu_seconds_total{mode="idle",cpu="1",service_type="db"} 100
node_cpu_seconds_total{cpu="0",mode="iowait"} 20`);
  assert.equal(metrics.hostBootTimeSeconds, 100);
  assert.deepEqual(metrics.cpuSeconds, [
    { cpu: '0', mode: 'iowait', seconds: 20 }, { cpu: '1', mode: 'idle', seconds: 100 },
  ]);
});

test('selects exactly one PostgreSQL process identity without including GoTrue', () => {
  const source = `process_start_time_seconds{project="project",service_type="gotrue"} 1.791640000e+09
process_start_time_seconds{service_type="postgresql",project="project"} 1.7916429351e+09`;
  const metrics = parseResourceMetrics(source);
  assert.equal(metrics.hostBootTimeSeconds, null);
  assert.equal(metrics.postgresProcessStartTimeSeconds, 1791642935.1);
  assert.equal(parseResourceMetrics(source.split('\n')[0]).postgresProcessStartTimeSeconds, null);
  for (const invalid of [
    `${source}\nprocess_start_time_seconds{service_type="postgresql"} 1791642935.1`,
    'process_start_time_seconds{service_type="postgresql"} NaN',
    'process_start_time_seconds{service_type="postgresql"} -1',
    'process_start_time_seconds{service_type="gotrue"} 100',
    'process_start_time_seconds 100',
  ]) assert.equal(parseResourceMetrics(invalid).postgresProcessStartTimeSeconds, null);
});

test('falls back to PostgreSQL continuity when boot evidence is absent, and rejects a process restart', () => {
  const older = resourceReport('00', '02');
  const newer = resourceReport('10', '12', 10);
  const parsed = parseResourceMetrics(`process_start_time_seconds{service_type="gotrue"} 100
process_start_time_seconds{project="project",service_type="postgresql"} 1.7916429351e+09`);
  for (const report of [older, newer]) {
    report.resources.data.hostBootTimeSeconds = parsed.hostBootTimeSeconds;
    report.resources.data.postgresProcessStartTimeSeconds = parsed.postgresProcessStartTimeSeconds;
  }
  const result = compareResourceReports(older, newer);
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.identitySource, 'POSTGRES_PROCESS_START_TIME');
  assert.equal(result.ioWaitPercent, 20);
  assert.equal(result.swapInPagesPerSecond, 2);
  assert.match(formatHealthReport({ ...newer, resourceInterval: result }), /Counter continuity identity: PostgreSQL process start time/);
  newer.resources.data.postgresProcessStartTimeSeconds += 10;
  const restarted = compareResourceReports(older, newer);
  assert.equal(restarted.status, 'UNAVAILABLE');
  assert.equal(restarted.swapInPagesPerSecond, null);
  assert.match(restarted.issues.join(' '), /process-start identity changed/);
  newer.resources.data.postgresProcessStartTimeSeconds = null;
  assert.equal(compareResourceReports(older, newer).status, 'UNAVAILABLE');
});

test('prefers host boot continuity and does not accept a changed boot using the fallback', () => {
  const older = resourceReport('00', '02');
  const newer = resourceReport('10', '12', 10);
  older.resources.data.postgresProcessStartTimeSeconds = 1000;
  newer.resources.data.postgresProcessStartTimeSeconds = 2000;
  assert.equal(compareResourceReports(older, newer).identitySource, 'HOST_BOOT_TIME');
  assert.equal(compareResourceReports(older, newer).status, 'SUCCESS');
  newer.resources.data.hostBootTimeSeconds = 200;
  assert.equal(compareResourceReports(older, newer).status, 'UNAVAILABLE');
  newer.resources.data.hostBootTimeSeconds = null;
  assert.equal(compareResourceReports(older, newer).status, 'UNAVAILABLE');
  newer.resources.data.postgresProcessStartTimeSeconds = 1000;
  assert.equal(compareResourceReports(older, newer).status, 'SUCCESS');
});

test('does not silently use duplicate, missing, negative or nonfinite raw metrics', () => {
  for (const source of [
    'node_cpu_seconds_total{cpu="0",mode="idle"} NaN',
    'node_cpu_seconds_total{cpu="0",mode="idle"} -1',
    'node_cpu_seconds_total{mode="idle"} 1',
    'node_cpu_seconds_total{cpu="0",mode="idle"} 1\nnode_cpu_seconds_total{cpu="0",mode="idle"} 2',
  ]) assert.equal(parseResourceMetrics(source).cpuSeconds, null);
  assert.equal(parseResourceMetrics('node_boot_time_seconds 100\nnode_boot_time_seconds 200').hostBootTimeSeconds, null);
  assert.equal(parseResourceMetrics('node_memory_MemTotal_bytes NaN').memoryBytes, null);
  assert.equal(parseResourceMetrics('').hostBootTimeSeconds, null);
});

test('lifetime disk-wait percentage stays unavailable for incomplete or invalid CPU evidence', () => {
  for (const source of [
    '',
    'node_cpu_seconds_total{cpu="0",mode="idle"} 100',
    'node_cpu_seconds_total{cpu="0",mode="iowait"} 10',
    'node_cpu_seconds_total{cpu="0",mode="idle"} 80\nnode_cpu_seconds_total{cpu="0",mode="iowait"} 20',
    'node_cpu_seconds_total{cpu="0",mode="idle"} NaN',
  ]) assert.equal(parseResourceMetrics(source).lifetimeIoWaitPercent, null);
});

test('computes interval pressure from host acquisition windows and all CPU cores', () => {
  const result = compareResourceReports(resourceReport('00', '02'), resourceReport('10', '12', 10));
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.intervalSeconds, 10);
  assert.deepEqual(result.intervalBoundsSeconds, { minimum: 8, maximum: 12 });
  assert.equal(result.ioWaitPercent, 20);
  assert.equal(result.swapInPagesPerSecond, 2);
  assert.equal(result.swapOutPagesPerSecond, 0);
  assert.deepEqual(result.issues, []);
});

test('does not double-count guest time already included in user/nice', () => {
  const older = resourceReport('00', '00');
  const newer = resourceReport('10', '10', 10);
  for (const report of [older, newer]) report.resources.data.cpuSeconds.push({ cpu: '0', mode: 'guest', seconds: report === older ? 10 : 20 });
  assert.equal(compareResourceReports(older, newer).ioWaitPercent, 20);
});

test('rejects absent host identity, restarts, different hosts and unusable acquisition windows', () => {
  for (const alter of [
    data => { data.hostBootTimeSeconds = null; },
    data => { data.hostBootTimeSeconds = 200; },
    data => { data.hostId = 'different-project'; },
    data => { delete data.sampleStartedAt; },
    data => { data.sampleCompletedAt = 'invalid'; },
    data => { data.sampleCompletedAt = '2026-10-10T11:00:00Z'; },
    data => { data.sampleStartedAt = '2026-10-10T12:00:01Z'; },
  ]) {
    const newer = resourceReport('10', '12', 10);
    alter(newer.resources.data);
    const result = compareResourceReports(resourceReport('00', '02'), newer);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.ioWaitPercent, null);
    assert.equal(result.swapInPagesPerSecond, null);
  }
  assert.equal(compareResourceReports(resourceReport('00', '00'), resourceReport('00', '00')).status, 'UNAVAILABLE');
});

test('requires nonempty project identities on both observations even when boot times match', () => {
  for (const hostId of [undefined, null, '', '   ', 123]) {
    for (const side of ['older', 'newer', 'both']) {
      const older = resourceReport('00', '02');
      const newer = resourceReport('10', '12', 10);
      if (side !== 'newer') older.resources.data.hostId = hostId;
      if (side !== 'older') newer.resources.data.hostId = hostId;
      const result = compareResourceReports(older, newer);
      assert.equal(result.status, 'UNAVAILABLE');
      assert.equal(result.ioWaitPercent, null);
      assert.equal(result.swapInPagesPerSecond, null);
      assert.equal(result.swapOutPagesPerSecond, null);
      assert.match(result.issues.join(' '), /project identity is unavailable/);
    }
  }
});

test('keeps partial evidence degraded when CPU or swap counters are missing or reset', () => {
  for (const alter of [
    data => { data.cpuSeconds = null; },
    data => { data.cpuSeconds.pop(); },
    data => { data.cpuSeconds[0].seconds = 0; },
    data => { data.cpuSeconds.push(data.cpuSeconds[0]); },
    data => { data.lifetimeSwapInPages = null; },
    data => { data.lifetimeSwapOutPages = 0; },
  ]) {
    const newer = resourceReport('10', '12', 10);
    alter(newer.resources.data);
    const result = compareResourceReports(resourceReport('00', '02'), newer);
    assert.equal(result.status, 'DEGRADED');
    assert.ok(result.issues.length > 0);
  }
  const before = resourceReport('00', '00');
  const after = resourceReport('10', '10', 10);
  before.resources.data.cpuSeconds.pop();
  after.resources.data.cpuSeconds.pop();
  assert.equal(compareResourceReports(before, after).ioWaitPercent, null);
  const noAdvance = compareResourceReports(resourceReport('00', '00'), resourceReport('10', '10'));
  assert.equal(noAdvance.ioWaitPercent, null);
  assert.equal(noAdvance.swapInPagesPerSecond, 0);
});

test('old reports and failed resources yield unavailable comparison instead of zero pressure', () => {
  assert.equal(compareResourceReports({ resources }, resourceReport('10', '10')).status, 'UNAVAILABLE');
  assert.equal(compareResourceReports({ resources: { status: 'UNAVAILABLE' } }, resourceReport('10', '10')).status, 'UNAVAILABLE');
});

test('CLI compares two saved reports offline and preserves normal JSON behavior', async () => {
  const older = resourceReport('00', '02');
  const newer = resourceReport('10', '12', 10);
  let collections = 0;
  const dependencies = { collect: async () => { collections++; return newer; }, read: async file => JSON.stringify(file === 'older.json' ? older : newer) };
  const normal = await runHealthCli(['--json'], dependencies);
  assert.deepEqual(JSON.parse(normal.output), newer);
  const offline = await runHealthCli(['--compare', 'older.json', 'newer.json', '--json'], dependencies);
  assert.equal(collections, 1);
  assert.equal(offline.exitCode, 0);
  assert.equal(JSON.parse(offline.output).resourceInterval.ioWaitPercent, 20);
  const fresh = await runHealthCli(['--compare', 'older.json'], dependencies);
  assert.equal(collections, 2);
  assert.match(fresh.output, /Host interval: SUCCESS/);
  assert.match(fresh.output, /exporter sample age is unknown/);
  const unavailable = await runHealthCli(['--json', '--compare', 'old.json', 'newer.json'], {
    ...dependencies, read: async file => JSON.stringify(file === 'old.json' ? { resources } : newer),
  });
  assert.equal(unavailable.exitCode, 1);
  assert.equal(JSON.parse(unavailable.output).currentStatus, 'REACHABLE');
  await assert.rejects(runHealthCli(['--compare'], dependencies), /Usage/);
  await assert.rejects(runHealthCli(['--compare', 'older.json', '--invalid'], dependencies), /Usage/);
  await assert.rejects(runHealthCli(['--compare', 'older.json', 'newer.json'], { ...dependencies, read: async () => '{}' }), /Invalid health report/);
});

const database = { status: 'SUCCESS', data: { cron24h: { runs: 20, failed: 0 } } };
const resources = { status: 'SUCCESS', data: {} };
const reads = [{ label: 'roster_view', status: 'SUCCESS', elapsedMs: 300, data: { rows: 47 } }];

test('current recovery cannot erase the recent outage evidence', () => {
  const report = buildHealthReport({ database: { ...database, data: { cron24h: { runs: 100, failed: 99 } } }, resources, reads });
  assert.equal(report.currentStatus, 'REACHABLE');
  assert.equal(report.historyStatus, 'FAILURES_RECORDED');
});

test('a failed app read stays degraded even when management SQL and metrics work', () => {
  const report = buildHealthReport({ database, resources, reads: [{ label: 'roster_view', status: 'UNAVAILABLE', http: { status: 500 } }] });
  assert.equal(report.currentStatus, 'DEGRADED');
  assert.match(formatHealthReport(report), /roster_view: HTTP 500/);
});

test('unavailable history and metrics are never reported as a clean run', () => {
  const report = buildHealthReport({ database: { status: 'UNAVAILABLE', http: { status: 503 } }, resources: { status: 'UNAVAILABLE', errorCategory: 'FETCH_REJECTED' }, reads });
  assert.equal(report.currentStatus, 'DEGRADED');
  assert.equal(report.historyStatus, 'UNAVAILABLE');
  const formatted = formatHealthReport(report);
  assert.match(formatted, /Host resources: FETCH_REJECTED/);
  assert.doesNotMatch(formatted, /NO_CRON_FAILURES_RECORDED/);
});

test('rejected fetch errors are category-only and cannot leak hostile URLs into report or text', async () => {
  const secret = 'https://host.invalid/path?secret=fixture';
  const report = await collectHealthReport({
    env: { SUPABASE_ACCESS_TOKEN: 'token', PROJECT_REF: 'abcdefghijklmnopqrst',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' },
    read: async file => String(file).endsWith('db-health.sql') ? 'select 1' : '',
    fetchImpl: async () => { throw new TypeError(secret); },
  });
  assert.ok([report.database, report.resources, ...report.reads].every(item => item.errorCategory === 'FETCH_REJECTED'));
  assert.ok([report.database, report.resources, ...report.reads].every(item => !Object.hasOwn(item, 'error')));
  assert.doesNotMatch(JSON.stringify(report), /secret|fixture|host\.invalid/);
  assert.doesNotMatch(formatHealthReport(report), /secret|fixture|host\.invalid/);
});

test('body read and JSON parse errors keep only fixed categories and safe HTTP metadata', async () => {
  const env = { SUPABASE_ACCESS_TOKEN: 'token', PROJECT_REF: 'abcdefghijklmnopqrst',
    VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' };
  const read = async file => String(file).endsWith('db-health.sql') ? 'select 1' : '';
  const bodyFailure = await collectHealthReport({ env, read, fetchImpl: async () => ({ ok: true, status: 200,
    headers: new Headers({ 'sb-request-id': '0190abc0-1234-5678-9abc-def012345678' }),
    text: async () => { throw new Error('body ?secret=fixture'); } }) });
  assert.ok([bodyFailure.database, bodyFailure.resources, ...bodyFailure.reads].every(item => item.errorCategory === 'BODY_READ_FAILED'));
  assert.equal(bodyFailure.database.http.requestId, '0190abc0-1234-5678-9abc-def012345678');
  assert.doesNotMatch(JSON.stringify(bodyFailure), /body|secret|fixture/);

  const jsonFailure = await collectHealthReport({ env, read, fetchImpl: async () => new Response('invalid json ?secret=fixture', {
    status: 200, headers: { 'x-request-id': 'safe.req-1' },
  }) });
  assert.equal(jsonFailure.database.errorCategory, 'JSON_PARSE_FAILED');
  assert.ok(jsonFailure.reads.every(item => item.errorCategory === 'JSON_PARSE_FAILED'));
  assert.doesNotMatch(JSON.stringify(jsonFailure), /invalid json|secret|fixture/);
});

test('collector accepts CI environment inputs and records only safe HTTP diagnostics', async () => {
  const sqlHealth = completeMetadata();
  const calls = [];
  const report = await collectHealthReport({
    env: { SUPABASE_ACCESS_TOKEN: 'do-not-print', PROJECT_REF: 'abcdefghijklmnopqrst',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
      GITHUB_SHA: 'deadbeef', GITHUB_REF: 'refs/heads/audit' },
    read: async file => { calls.push(String(file)); return String(file).endsWith('db-health.sql') ? readFile(file, 'utf8') : ''; },
    fetchImpl: async (url, init) => {
      const target = String(url);
      if (init?.method === 'POST') {
        assert.doesNotMatch(init.body, /to_jsonb\(heartbeat\)|last_message|last_validation_report\s*,/i);
        assert.match(init.body, /'stages_called'/);
        assert.match(init.body, /'integrity_checks'/);
        const unsafe = structuredClone(sqlHealth);
        unsafe.private_payload = 'SHOULD_NOT_PERSIST';
        unsafe.ingestion.last_message = 'PRIVATE_LAST_MESSAGE';
        unsafe.ingestion.last_validation_report = { error: 'PRIVATE_VALIDATION_REPORT' };
        unsafe.heartbeats[0].last_message = 'PRIVATE_HEARTBEAT_MESSAGE';
        unsafe.heartbeats[0].last_validation_report = { details: 'PRIVATE_HEARTBEAT_REPORT' };
        return new Response(JSON.stringify([{ health: unsafe }]), {
        status: 200, headers: { 'sb-request-id': 'sql-req.1' },
      });
      }
      if (target.endsWith('/analytics/endpoints/metrics')) return new Response('node_memory_MemTotal_bytes 400000000', {
        status: 200, headers: { 'x-request-id': 'metrics-req-2' },
      });
      if (target.includes('/roster_materialized?')) return new Response('[]', {
        status: 504, headers: { 'x-request-id': 'unsafe/id?secret=1' },
      });
      return new Response('[]', { status: 200, headers: { 'cf-ray': 'safe-id-3' } });
    },
  });
  assert.equal(report.provenance.checkout.commit, 'deadbeef');
  assert.equal(report.provenance.checkout.ref, 'refs/heads/audit');
  assert.equal(report.currentStatus, 'DEGRADED');
  assert.equal(report.sampleCoverage.find(item => item.label === 'Database diagnostics').http.requestId, 'sql-req.1');
  const roster = report.sampleCoverage.find(item => item.label === 'roster_materialized');
  assert.equal(roster.http.status, 504);
  assert.equal(roster.http.requestId, null);
  assert.equal(roster.unavailable, 'HTTP 504');
  assert.doesNotMatch(JSON.stringify(report), /unsafe\/id|secret=1|do-not-print/);
  assert.equal(report.evidenceCoverage.providerLogs, 'NOT_COLLECTED');
  assert.equal(report.databaseEvidenceStatus, 'AVAILABLE');
  assert.doesNotMatch(JSON.stringify(report), /SHOULD_NOT_PERSIST|PRIVATE_LAST_MESSAGE|PRIVATE_VALIDATION_REPORT|PRIVATE_HEARTBEAT/);
  assert.ok(calls.some(file => file.endsWith('db-health.sql')));
});

test('empty and partial seeded metadata stays unavailable while endpoint reachability remains explicit', () => {
  const complete = completeMetadata();
  assert.deepEqual(validateDatabaseMetadata(complete), {
    databaseCounters: true, snapshotPublication: true, pipelineHeartbeats: true,
  });
  assert.equal(validateDatabaseMetadata({ ...complete, snapshotPublication: [] }).snapshotPublication, false);
  assert.equal(validateDatabaseMetadata({ ...complete, snapshotPublication: [complete.snapshotPublication[0]] }).snapshotPublication, false);
  assert.equal(validateDatabaseMetadata({ ...complete, databaseStats: {} }).databaseCounters, false);
  assert.equal(validateDatabaseMetadata({ ...complete, databaseStats: { ...complete.databaseStats, deadlocks: null } }).databaseCounters, false);
  assert.equal(validateDatabaseMetadata({ ...complete, heartbeats: [] }).pipelineHeartbeats, false);
  assert.equal(validateDatabaseMetadata({ ...complete, heartbeats: [complete.heartbeats[0]] }).pipelineHeartbeats, false);
  const privateHeartbeats = structuredClone(complete.heartbeats);
  delete privateHeartbeats[1].stages_called;
  assert.equal(validateDatabaseMetadata({ ...complete, heartbeats: privateHeartbeats }).pipelineHeartbeats, false);
});

test('reachable endpoints with empty metadata arrays and counters report incomplete evidence, not health completeness', async () => {
  const incomplete = { observedAt: '2026-10-13T10:00:00Z', cron24h: { runs: 1, failed: 0, startupTimeouts: 0 },
    databaseStats: {}, snapshotPublication: [], heartbeats: [], ingestion: null };
  const report = await collectHealthReport({
    env: { SUPABASE_ACCESS_TOKEN: 'token', PROJECT_REF: 'abcdefghijklmnopqrst',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'key' },
    read: async file => String(file).endsWith('db-health.sql') ? 'select 1' : '',
    fetchImpl: async (url, init) => {
      if (init?.method === 'POST') return new Response(JSON.stringify([{ health: incomplete }]), { status: 200 });
      if (String(url).endsWith('/analytics/endpoints/metrics')) return new Response('node_memory_MemTotal_bytes 400000000', { status: 200 });
      if (String(url).includes('/roster_materialized?')) return new Response('[{}]', { status: 200 });
      return new Response('[]', { status: 200 });
    },
  });
  assert.equal(report.currentStatus, 'REACHABLE');
  assert.equal(report.databaseEvidenceStatus, 'INCOMPLETE');
  assert.equal(report.evidenceCoverage.databaseCounters, 'UNAVAILABLE');
  assert.equal(report.evidenceCoverage.snapshotPublication, 'UNAVAILABLE');
  assert.equal(report.evidenceCoverage.pipelineHeartbeats, 'UNAVAILABLE');
  assert.ok(report.unavailableEvidence.some(item => item.label === 'pipelineHeartbeats'));
});
