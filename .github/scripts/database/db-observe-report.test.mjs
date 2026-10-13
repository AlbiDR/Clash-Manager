// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeObservations } from './db-observe-report.mjs';

const from = '2026-10-13T20:00:00Z';
const to = '2026-10-13T22:00:00Z';
const sample = currentStatus => ({ currentStatus, sampleWindow: { startedAt: '2026-10-13T21:17:00Z' },
  provenance: { release: '14.55.0', checkout: { commit: 'abc' }, workflow: { runId: '123' } } });
const entry = (file, status = 'REACHABLE') => ({ file, value: { schemaVersion: 1, collector: 'db-observe', sampleCount: 2,
  samples: [sample(status), sample(status)], comparison: { resourceInterval: { status: 'SUCCESS' } }, providerLogs: { status: 'SUCCESS' } } });

test('missing hours stay missing and duplicate successful retakes preserve degraded evidence', () => {
  const result = summarizeObservations([entry('first', 'DEGRADED'), entry('retake')], from, to);
  assert.equal(result.expectedSlots, 2);
  assert.equal(result.observedSlots, 1);
  assert.deepEqual(result.missingSlots, ['2026-10-13T21:00:00.000Z']);
  assert.deepEqual(result.duplicateSlots, [{ slot: '2026-10-13T20:00:00.000Z', runs: 2 }]);
  assert.deepEqual(result.runs.map(r => r.reachability), ['DEGRADED', 'REACHABLE']);
  assert.equal(result.runs[0].runId, '123');
});

test('invalid or partial evidence cannot establish coverage; outside-window runs are excluded', () => {
  const bad = entry('partial'); bad.value.sampleCount = 1;
  const outside = entry('outside'); outside.value.samples[0].sampleWindow.startedAt = '2026-10-14T00:17:00Z';
  const result = summarizeObservations([{ file: 'malformed', value: null }, bad, outside], from, to);
  assert.equal(result.observedSlots, 0);
  assert.deepEqual(result.invalidFiles, ['malformed', 'partial']);
});

test('missing logs remain explicit and observation windows must be bounded whole hours', () => {
  const run = entry('old'); delete run.value.providerLogs;
  assert.equal(summarizeObservations([run], from, to).runs[0].providerLogs, 'NOT_COLLECTED');
  assert.throws(() => summarizeObservations([], '2026-10-13T20:01:00Z', to), /whole UTC-hour/);
  assert.throws(() => summarizeObservations([], to, from), /whole UTC-hour/);
});

test('declared provider window wins when setup crosses a UTC hour boundary', () => {
  const run = entry('boundary');
  run.value.providerLogs.window = { start: '2026-10-13T19:00:00Z', end: '2026-10-13T20:00:00Z' };
  const report = summarizeObservations([run], '2026-10-13T19:00:00Z', to);
  assert.equal(report.runs[0].slot, '2026-10-13T19:00:00.000Z');
  assert.equal(report.runs[0].slotBasis, 'declared_provider_window');
  assert.equal(report.runs[0].providerSourcesObserved, 0);
});
