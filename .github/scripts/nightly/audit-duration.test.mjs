// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDurationReport, laneDurations } from './audit-duration.mjs';
import { parseCoverageLog } from './coverage-log-line.mjs';

const stage = { number: 12, slug: 'apk-ux' };
const line = (date, minutes, summary = 'audited things') =>
  `* [${date}] [Stage 12] [10:30Z-10:3${Math.min(minutes, 9)}Z ${minutes}m] CLEAN: Codebase -- ${summary}`;

test('flags a zero-minute audit and names its claim', () => {
  // The real 2026-09-08 record: 75 files across 10 UX categories, in a
  // recorded zero minutes. Both cannot be true.
  const records = parseCoverageLog([
    line('2026-09-07', 4),
    line('2026-09-08', 0, 'No UX issues found across 75 examined files in 10 UX categories (audit PASS)'),
    line('2026-09-09', 3),
  ].join('\n'), 12);
  const lane = laneDurations(stage, records);
  assert.equal(lane.zeroMinute.length, 1);
  assert.equal(lane.zeroMinute[0].date, '2026-09-08');
  assert.match(lane.zeroMinute[0].summary, /75 examined files/);
  assert.equal(lane.shortestMinutes, 0);
});

test('an untimed record is untimed, never a zero-minute audit', () => {
  // Every line before 2026-09-03 lacks the timing block. Counting those as
  // zero would turn a format change into dozens of fabricated findings.
  const records = parseCoverageLog([
    '* [2026-09-01] [Stage 12] CLEAN: Codebase -- older format, no timing block',
    line('2026-09-09', 3),
  ].join('\n'), 12);
  const lane = laneDurations(stage, records);
  assert.equal(lane.untimedAudits, 1);
  assert.equal(lane.timedAudits, 1);
  assert.deepEqual(lane.zeroMinute, []);
  assert.equal(lane.shortestMinutes, 3, 'the untimed record must not drag the minimum to zero');
});

test('reports recent audits newest first', () => {
  const records = parseCoverageLog([
    line('2026-09-07', 1),
    line('2026-09-08', 2),
    line('2026-09-09', 3),
  ].join('\n'), 12);
  assert.deepEqual(laneDurations(stage, records).recent.map(r => r.minutes), [3, 2, 1]);
});

test('a lane with no records reports nothing rather than zero', () => {
  const lane = laneDurations(stage, []);
  assert.equal(lane.timedAudits, 0);
  assert.equal(lane.medianMinutes, null);
  assert.equal(lane.shortestMinutes, null, 'no data is not the same as a fast audit');
  assert.deepEqual(lane.zeroMinute, []);
});

test('an unreadable coverage log degrades to empty instead of throwing', () => {
  // A missing log must not take down the context generation for the lane that
  // audits the pipeline.
  const report = buildDurationReport(() => { throw new Error('ENOENT'); }, {
    stages: [{ number: 1, slug: 'hardening', coverageLog: 'missing.log' }],
  });
  assert.equal(report.lanes[0].timedAudits, 0);
  assert.deepEqual(report.zeroMinuteAudits, []);
});

test('collects zero-minute audits across every lane', () => {
  const report = buildDurationReport(
    s => (s.number === 4
      ? '* [2026-09-07] [Stage 4] [02:10Z-02:10Z 0m] CLEAN: Codebase -- audited substrate hygiene'
      : '* [2026-09-08] [Stage 12] [10:34Z-10:35Z 0m] CLEAN: Codebase -- 75 files examined'),
    { stages: [{ number: 4, slug: 'optimization', coverageLog: 'a' }, { number: 12, slug: 'apk-ux', coverageLog: 'b' }] },
  );
  assert.deepEqual(report.zeroMinuteAudits.map(item => item.stage), [4, 12]);
});
