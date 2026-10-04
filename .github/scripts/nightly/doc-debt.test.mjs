// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  COMMIT_SENTINEL,
  documentationLaneLog,
  findDocDebt,
  laneLogDomains,
  parseLog,
  parseVerified,
} from './doc-debt.mjs';

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
  const first = 'a'.repeat(40);
  const second = 'b'.repeat(40);
  const raw = [
    `${COMMIT_SENTINEL}${first} refactor(core): first`,
    'a.ts',
    'b.ts',
    `${COMMIT_SENTINEL}${second} docs(tsdoc): second`,
    'a.ts',
    '',
  ].join('\n');
  assert.deepEqual(parseLog(raw), [
    { hash: first, subject: 'refactor(core): first', files: ['a.ts', 'b.ts'] },
    { hash: second, subject: 'docs(tsdoc): second', files: ['a.ts'] },
  ]);
});

// The real registry, so a renamed log or domain fails here rather than
// silently switching the lane rule off.
const registry = JSON.parse(readFileSync(new URL('../../nightly-config/stages.json', import.meta.url), 'utf8'));
const laneDomains = laneLogDomains(registry);
const logOf = number => registry.stages.find(stage => stage.number === number).coverageLog;
const VIEW_OPTIONS = 'Frontend-PWA/src/shared/ui/ViewOptions.vue';

test('a documentation lane commit counts as documentation whatever its subject says', () => {
  // Four of eight S05/S06 merges from 2026-10-01 to 10-04 carried subjects
  // like these, which match no documentation subject.
  for (const subject of ['Nightly Stage 6: Documentation TSDoc - Interface Contract Architect (#2074)', '[Stage 6] Documentation TSDoc (#2062)']) {
    const debt = findDocDebt([
      { subject, files: [logOf(6), FILE] },
      { subject: 'refactor(core): change behaviour', files: [FILE] },
      { subject: 'docs(tsdoc): first description', files: [FILE] },
    ], { laneDomains });
    assert.deepEqual(debt, [], subject);
  }
});

test('a commit touching several lanes\' logs is no lane\'s commit', () => {
  // A repository-wide rewrite: every coverage log and every source file at once.
  // Read as documentation, it marked 428 files described in one commit.
  const debt = findDocDebt([
    { subject: 'fix(pipeline): repository-wide rewrite', files: [logOf(5), logOf(6), logOf(9), FILE] },
    { subject: 'docs(tsdoc): first description', files: [FILE] },
  ], { laneDomains });
  assert.equal(debt.length, 1, 'still a code change, so the description is behind it');
  assert.equal(documentationLaneLog([logOf(5), logOf(6)], laneDomains), null);
  assert.equal(documentationLaneLog([logOf(9), FILE], laneDomains), null, 'a code lane is not a documentation lane');
  assert.equal(documentationLaneLog([logOf(6), FILE], laneDomains), logOf(6));
});

test('a file a documentation lane verified as accurate leaves the list until its code changes again', () => {
  // ViewOptions.vue: described, changed by a refactor, then audited and found
  // accurate on 2026-10-01, 10-02 and 10-04 while staying listed every night.
  const described = { subject: 'chore(docs): harden ViewOptions TSDoc (#2036)', files: [VIEW_OPTIONS] };
  const refactor = { subject: 'chore(refactor): remove dead export ViewOptionsProps (#2025)', files: [VIEW_OPTIONS] };
  const verifiedClean = { subject: 'Nightly Stage 6: Documentation TSDoc (#2074)', files: [logOf(6)], verified: [VIEW_OPTIONS] };
  const cleanUnverified = { subject: 'Nightly Stage 6: Documentation TSDoc (#2048)', files: [logOf(6)] };

  assert.equal(findDocDebt([cleanUnverified, refactor, described], { laneDomains }).length, 1, 'a clean run with no record changes nothing');
  assert.deepEqual(findDocDebt([verifiedClean, refactor, described], { laneDomains }), []);
  const changedAgain = { subject: 'fix(ui): change ViewOptions behaviour', files: [VIEW_OPTIONS] };
  assert.equal(findDocDebt([changedAgain, verifiedClean, refactor, described], { laneDomains }).length, 1, 'and returns when the code moves on');
});

test('a verification is read only from the metadata block, and only for documented sources', () => {
  const body = [
    '**Verified accurate:** Frontend-PWA/src/not-the-field.ts',
    '<!--',
    'NIGHTLY_PR_METADATA:',
    '  Domain: documentation',
    `  Verified: ${VIEW_OPTIONS}, README.md, ${VIEW_OPTIONS}, Frontend-PWA/src/shared/ui/AnimatedDigits.vue`,
    '-->',
  ].join('\n');
  assert.deepEqual(parseVerified(body), [VIEW_OPTIONS, 'Frontend-PWA/src/shared/ui/AnimatedDigits.vue']);
  assert.deepEqual(parseVerified('Verified: Frontend-PWA/src/a.ts'), [], 'outside a metadata block it is prose');
  assert.deepEqual(parseVerified(''), []);
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
