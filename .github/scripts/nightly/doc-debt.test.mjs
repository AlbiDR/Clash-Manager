// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMIT_SENTINEL, findDocDebt, parseLog } from './doc-debt.mjs';

const FILE = 'Frontend-PWA/src/core/services/useBenchmarking.ts';

/** Newest commit first, matching `git log` order. */
const log = entries => entries.map(([subject, ...files]) => ({ subject, files }));

test('reports a file whose code changed after it was documented', () => {
  // The real 2026-09-06 / 2026-09-07 sequence on useBenchmarking.ts.
  const debt = findDocDebt(log([
    ['refactor(core): fix stale store singleton state pollution in useBenchmarking (#1727)', FILE],
    ['docs(tsdoc): harden useBenchmarking interface contracts (#1712)', FILE],
  ]));
  assert.equal(debt.length, 1);
  assert.equal(debt[0].file, FILE);
  assert.match(debt[0].lastDocSubject, /#1712/);
});

test('stays silent when the documentation is newer than the code', () => {
  const debt = findDocDebt(log([
    ['docs(tsdoc): harden useBenchmarking interface contracts (#1712)', FILE],
    ['refactor(core): fix stale store singleton state pollution (#1727)', FILE],
  ]));
  assert.deepEqual(debt, []);
});

test('a file no documentation lane ever described is not reported', () => {
  // Coverage, not debt. Including it produced 430 entries on this repository,
  // which no lane can act on.
  const debt = findDocDebt(log([['refactor(core): decompose a helper', FILE]]));
  assert.deepEqual(debt, []);
});

test('recognises the chore-prefixed lane subjects the pipeline actually emits', () => {
  const debt = findDocDebt(log([
    ['chore(optimize): Standardized loop counter variable naming in StorageService.ts (#1697)', 'Frontend-PWA/src/core/services/StorageService.ts'],
    ['chore(docs): harden StorageService interface contracts (#1686)', 'Frontend-PWA/src/core/services/StorageService.ts'],
  ]));
  assert.equal(debt.length, 1, 'chore(optimize) is a code lane and chore(docs) is a doc lane');
});

test('ignores commits belonging to neither kind of lane', () => {
  const debt = findDocDebt(log([
    ['Merge remote-tracking branch origin/Nightly into Beta', FILE],
    ['chore(apk): update signed release APK', FILE],
    ['docs(tsdoc): harden useBenchmarking interface contracts', FILE],
  ]));
  assert.deepEqual(debt, [], 'a merge or an APK bump is not a behaviour change');
});

test('ignores files that carry no documentation a reader would trust', () => {
  const debt = findDocDebt(log([
    ['refactor(core): change something', 'pnpm-lock.yaml', '.github/nightly-logs/09-refactor-proposals-coverage.log'],
    ['docs(tsdoc): document something', 'pnpm-lock.yaml', '.github/nightly-logs/09-refactor-proposals-coverage.log'],
  ]));
  assert.deepEqual(debt, []);
});

test('tracks each file independently within one commit', () => {
  const other = 'Frontend-PWA/src/core/services/StorageService.ts';
  const debt = findDocDebt(log([
    ['refactor(core): touch two files', FILE, other],
    ['docs(tsdoc): document only one of them', FILE],
    ['docs(tsdoc): document the other one later in history', other],
  ]));
  assert.deepEqual(debt.map(d => d.file).sort(), [other, FILE].sort());
});

test('parses git log output split on a printable sentinel', () => {
  const raw = [
    `${COMMIT_SENTINEL}refactor(core): first`,
    'a.ts',
    'b.ts',
    `${COMMIT_SENTINEL}docs(tsdoc): second`,
    'a.ts',
    '',
  ].join('\n');
  assert.deepEqual(parseLog(raw), [
    { subject: 'refactor(core): first', files: ['a.ts', 'b.ts'] },
    { subject: 'docs(tsdoc): second', files: ['a.ts'] },
  ]);
});

test('output is deterministically ordered', () => {
  const a = 'Frontend-PWA/src/a.ts';
  const b = 'Backend/supabase/functions/b.ts';
  const debt = findDocDebt(log([
    ['refactor(core): both', a, b],
    ['docs(tsdoc): both', a, b],
  ]));
  assert.deepEqual(debt.map(d => d.file), [b, a], 'sorted by path, not by map insertion order');
});
