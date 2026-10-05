// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHealthReport, formatHealthReport, parseResourceMetrics } from './db-health.mjs';

test('resource parsing distinguishes absent metrics from zero and sums CPU cores', () => {
  const metrics = parseResourceMetrics(`
node_memory_MemTotal_bytes{service_type="db"} 4.0e8
node_memory_SwapTotal_bytes{} 1000
node_memory_SwapFree_bytes{} 1000
node_cpu_seconds_total{cpu="0",mode="idle"} 80
node_cpu_seconds_total{cpu="0",mode="iowait"} 20
node_cpu_seconds_total{cpu="1",mode="idle"} 80
node_cpu_seconds_total{cpu="1",mode="iowait"} 20
`);
  assert.equal(metrics.memoryBytes, 400000000);
  assert.equal(metrics.swapUsedBytes, 0);
  assert.equal(metrics.availableMemoryBytes, null);
  assert.equal(metrics.lifetimeSwapInPages, null);
  assert.equal(metrics.lifetimeIoWaitPercent, 20);
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
  const report = buildHealthReport({ database, resources, reads: [{ label: 'roster_view', status: 'UNAVAILABLE', error: 'HTTP 500' }] });
  assert.equal(report.currentStatus, 'DEGRADED');
  assert.match(formatHealthReport(report), /roster_view: HTTP 500/);
});

test('unavailable history and metrics are never reported as a clean run', () => {
  const report = buildHealthReport({ database: { status: 'UNAVAILABLE', error: 'HTTP 503' }, resources: { status: 'UNAVAILABLE', error: 'Missing metric' }, reads });
  assert.equal(report.currentStatus, 'DEGRADED');
  assert.equal(report.historyStatus, 'UNAVAILABLE');
  const formatted = formatHealthReport(report);
  assert.match(formatted, /Host resources: Missing metric/);
  assert.doesNotMatch(formatted, /NO_CRON_FAILURES_RECORDED/);
});
