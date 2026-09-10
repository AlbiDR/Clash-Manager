// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCoverageLine, parseCoverageLog } from './coverage-log-line.mjs';

const TIMED = '* [2026-09-09] [Stage 1] [23:17Z-23:23Z 6m] CLEAN: .github/nightly-logs/00-pr-history.md -- Audited Edge Function endpoints; zero threat vectors found';
const UNTIMED = '* [2026-09-02] [Stage 1] CLEAN: Codebase -- CLEAN calibration pass (widened candidate scan)';

test('parses the timed format introduced on 2026-09-03', () => {
  const record = parseCoverageLine(TIMED);
  assert.equal(record.date, '2026-09-09');
  assert.equal(record.stage, 1);
  assert.equal(record.status, 'CLEAN');
  assert.equal(record.target, '.github/nightly-logs/00-pr-history.md');
  assert.match(record.summary, /zero threat vectors found/);
  assert.deepEqual(record.window, { start: '23:17', end: '23:23', minutes: 6 });
});

test('parses the older untimed format and reports no window', () => {
  const record = parseCoverageLine(UNTIMED);
  assert.equal(record.date, '2026-09-02');
  // null, not 0. A line written before the timing block existed carries no
  // duration, and calling that a zero-minute audit invents a finding from a
  // format change.
  assert.equal(record.window, null);
});

test('survives a further bracketed field being added', () => {
  // The original defect was a parser pinned to the exact field count.
  const record = parseCoverageLine('* [2026-09-09] [Stage 4] [23:17Z-23:23Z 6m] [attempt 2] CHANGED: a.ts -- did a thing');
  assert.equal(record.status, 'CHANGED');
  assert.equal(record.window.minutes, 6);
});

test('reads a zero-minute window as zero, not as missing', () => {
  const record = parseCoverageLine('* [2026-09-08] [Stage 12] [10:34Z-10:35Z 0m] CLEAN: Codebase -- No UX issues found across 75 examined files');
  assert.equal(record.window.minutes, 0);
});

test('rejects lines that are not terminal records', () => {
  for (const line of [
    '',
    'not a log line',
    '* [2026-09-09] [Stage 1] IN-PROGRESS: session started',
    '* [2026-09-09] CLEAN: missing the stage marker -- x',
  ]) {
    assert.equal(parseCoverageLine(line), null, `should not parse: ${line}`);
  }
});

test('recognises every terminal status and no others', () => {
  for (const status of ['CLEAN', 'CHANGED', 'SKIPPED', 'PARTIAL-RUN']) {
    assert.equal(parseCoverageLine(`* [2026-09-09] [Stage 1] ${status}: t -- s`).status, status);
  }
  assert.equal(parseCoverageLine('* [2026-09-09] [Stage 1] BLOCKED: t -- s'), null);
});

test('filters a whole log to one stage, oldest first', () => {
  const content = [
    UNTIMED,
    '* [2026-09-05] [Stage 2] [00:10Z-00:20Z 10m] CHANGED: spec.ts -- added tests',
    TIMED,
    'noise that must be ignored',
  ].join('\n');
  const stageOne = parseCoverageLog(content, 1);
  assert.deepEqual(stageOne.map(r => r.date), ['2026-09-02', '2026-09-09']);
  assert.equal(parseCoverageLog(content, 2).length, 1);
  assert.equal(parseCoverageLog(content).length, 3, 'no stage filter returns every record');
});

test('tolerates empty and absent content', () => {
  assert.deepEqual(parseCoverageLog(''), []);
  assert.deepEqual(parseCoverageLog(null), []);
  assert.deepEqual(parseCoverageLog(undefined, 1), []);
});

test('tolerates a payload with no summary separator', () => {
  // The recap parser has always accepted this, and unifying three parsers onto
  // one must not quietly drop the most forgiving behaviour of the three. The
  // whole payload becomes the target and the summary repeats it.
  const record = parseCoverageLine('* [2026-09-09] [Stage 1] CLEAN: no summary separator');
  assert.equal(record.status, 'CLEAN');
  assert.equal(record.target, 'no summary separator');
  assert.equal(record.summary, 'no summary separator');
});
