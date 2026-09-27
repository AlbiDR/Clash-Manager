// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  KIND,
  VERDICT,
  compareVersions,
  conflictBlocks,
  exitCodeFor,
  guardMerge,
  isVersionOnly,
  judgeConflicts,
  renderGuardReport,
} from './sync-merge-guard.mjs';

const block = (ours, theirs) => ({ ours, theirs });
const markers = (ours, theirs) => ['head', '<<<<<<< target', ...ours, '=======', ...theirs, '>>>>>>> source', 'tail'].join('\n');
const versions = { target: '14.50.113', source: '14.50.117' };

// --- Pure pieces ----------------------------------------------------------------

test('conflict blocks are read from merge-tree markers, and a file with none is null', () => {
  assert.deepEqual(conflictBlocks(markers(['a'], ['b', 'c'])), [block(['a'], ['b', 'c'])]);
  assert.equal(conflictBlocks('no markers at all'), null, 'a binary conflict carries no markers, so nothing can be proven');
  assert.equal(conflictBlocks(null), null);
});

test('a version stamp differs only by each branch own version and versionCode', () => {
  assert.equal(isVersionOnly(block(['  "version": "14.50.113",'], ['  "version": "14.50.117",']), versions), true);
  assert.equal(isVersionOnly(block(['  versionCode: 14050113'], ['  versionCode: 14050117']), versions), true);
  assert.equal(isVersionOnly(block([' * [PERF] Optimized for v14.50.113:'], [' * [PERF] Optimized for v14.50.117:']), versions), true);
});

test('anything beyond the two branch versions is not a version stamp', () => {
  // A dependency pin looks like a version but is a real choice between sides.
  assert.equal(isVersionOnly(block(['    "p-limit": "7.3.2",'], ['    "p-limit": "7.3.3",']), versions), false);
  // The real 2026-09-09 shape: the stamp plus a documentation line one side dropped.
  assert.equal(isVersionOnly(block([' * [PERF] Optimized for v14.50.113:'], [' * Satisfies CleanStack Architecture ADR Section IV.', ' *', ' * [PERF] Optimized for v14.50.117:']), versions), false);
  // Directional: the destination must carry the destination's own version.
  assert.equal(isVersionOnly(block(['  "version": "14.50.117",'], ['  "version": "14.50.113",']), versions), false);
  // Identical sides are not a conflict to settle, and unknown versions prove nothing.
  assert.equal(isVersionOnly(block(['same'], ['same']), versions), false);
  assert.equal(isVersionOnly(block(['  "version": "14.50.113",'], ['  "version": "14.50.117",']), {}), false);
});

test('versions compare numerically, and an unreadable one compares as unknown', () => {
  assert.equal(compareVersions('14.50.9', '14.50.10'), -1);
  assert.equal(compareVersions('14.50.117', '14.50.113'), 1);
  assert.equal(compareVersions('14.50.1', '14.50.1'), 0);
  assert.equal(compareVersions('14.50', '14.50.1'), null);
});

test('each conflicted path is classified by what losing it would cost', () => {
  const stamp = markers(['  "version": "14.50.113",'], ['  "version": "14.50.117",']);
  const read = file => (file === 'package.json' ? stamp : file === 'app.bin' ? 'binary' : markers(['ours'], ['theirs']));
  const judged = judgeConflicts({
    conflicts: ['package.json', '.github/nightly-logs/00-pr-history.md', 'APK/release/latest.json', 'pnpm-lock.yaml', 'src/app.ts', 'app.bin'],
    readMerged: read,
    versions,
  });
  const kinds = Object.fromEntries(judged.files.map(f => [f.path, f.kind]));
  assert.equal(kinds['package.json'], KIND.VERSION);
  assert.equal(kinds['.github/nightly-logs/00-pr-history.md'], KIND.BOOKKEEPING);
  assert.equal(kinds['APK/release/latest.json'], KIND.CONTENT, 'a job that does not normalise the slot cannot call it handled');
  assert.equal(kinds['pnpm-lock.yaml'], KIND.CONTENT, 'only a job that re-verifies the lockfile may call it handled');
  assert.equal(kinds['src/app.ts'], KIND.CONTENT);
  assert.equal(kinds['app.bin'], KIND.CONTENT);
  assert.equal(judged.verdict, VERDICT.DISCARDS);

  const owned = judgeConflicts({ conflicts: ['APK/release/latest.json', 'pnpm-lock.yaml'], readMerged: read, versions, lockfileVerified: true, apkSlotNormalised: true });
  assert.deepEqual(owned.files.map(f => f.kind), [KIND.APK_SLOT, KIND.LOCKFILE]);
  assert.equal(owned.verdict, VERDICT.SAFE);
});

test('a version stamp that would walk the version back is a discard, the 2026-09-24 case', () => {
  const stamp = markers(['  "version": "14.50.113",'], ['  "version": "14.50.112",']);
  const judged = judgeConflicts({ conflicts: ['package.json'], readMerged: () => stamp, versions: { target: '14.50.113', source: '14.50.112' } });
  assert.equal(judged.files[0].kind, KIND.VERSION_BACK);
  assert.equal(judged.verdict, VERDICT.DISCARDS);
  assert.match(judged.files[0].reason, /14\.50\.112 over 14\.50\.113/);
});

test('no conflicts is clean, and each verdict maps to its exit code', () => {
  assert.equal(judgeConflicts({ conflicts: [], readMerged: () => null }).verdict, VERDICT.CLEAN);
  assert.equal(exitCodeFor({ verdict: VERDICT.CLEAN }), 0);
  assert.equal(exitCodeFor({ verdict: VERDICT.SAFE }), 0);
  assert.equal(exitCodeFor({ verdict: VERDICT.DISCARDS }), 1);
  assert.equal(exitCodeFor({ verdict: VERDICT.UNKNOWN }), 2, 'a question git could not answer must stop the sync too');
});

// --- Against a real git repository ------------------------------------------------

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sync-guard-'));
  const git = (...args) => {
    const res = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
    return res.stdout.trim();
  };
  const write = (file, text) => writeFileSync(path.join(dir, file), text);
  const commit = (message, files) => {
    for (const [file, text] of Object.entries(files)) write(file, text);
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  const run = args => {
    const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  };
  git('init', '-q');
  return { dir, git, commit, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const pkg = version => `{\n  "name": "x",\n  "version": "${version}"\n}\n`;
const migration = body => `-- migration\n${body}\n-- end\n`;

test('real merge: work only on the destination, with an older copy upstream, is refused', () => {
  // The 2026-09-24 shape: Stable trimmed a migration Beta still held untrimmed,
  // and Stable's version was ahead of Beta's.
  const r = repo();
  try {
    r.commit('base', { 'package.json': pkg('14.50.111'), 'm.sql': migration('select 1;\nselect 2;') });
    r.git('branch', 'beta');
    r.commit('stable only: trim the migration', { 'package.json': pkg('14.50.113'), 'm.sql': migration('select 1;') });
    r.git('checkout', '-q', 'beta');
    r.commit('beta: bump', { 'package.json': pkg('14.50.112'), 'm.sql': migration('select 1;\nselect 2;\nselect 3;') });
    const result = guardMerge({ target: 'main', source: 'beta', git: r.run });
    assert.equal(result.verdict, VERDICT.DISCARDS);
    const byPath = Object.fromEntries(result.files.map(f => [f.path, f]));
    assert.equal(byPath['m.sql'].kind, KIND.CONTENT);
    assert.deepEqual(byPath['m.sql'].commits.map(c => c.replace(/^\w+ /, '')), ['stable only: trim the migration']);
    assert.equal(byPath['package.json'].kind, KIND.VERSION_BACK);
    const report = renderGuardReport(result, { targetName: 'Stable', sourceName: 'Beta' });
    assert.match(report, /Not merging: `-X theirs` would silently discard Stable's own changes in 2 files\./);
    assert.match(report, /only on Stable: \w+ stable only: trim the migration/);
    assert.equal(exitCodeFor(result), 1);
  } finally {
    r.cleanup();
  }
});

test('real merge: only the version stamps conflict and upstream is newer, so it passes', () => {
  const r = repo();
  try {
    r.commit('base', { 'package.json': pkg('14.50.111'), 'a.ts': 'one\n' });
    r.git('branch', 'beta');
    r.commit('stable bump', { 'package.json': pkg('14.50.112') });
    r.git('checkout', '-q', 'beta');
    r.commit('beta work', { 'package.json': pkg('14.50.117'), 'a.ts': 'one\ntwo\n' });
    const result = guardMerge({ target: 'main', source: 'beta', git: r.run });
    assert.equal(result.verdict, VERDICT.SAFE);
    assert.deepEqual(result.files.map(f => [f.path, f.kind]), [['package.json', KIND.VERSION]]);
    assert.equal(exitCodeFor(result), 0);
  } finally {
    r.cleanup();
  }
});

test('real merge: no overlap at all is clean', () => {
  const r = repo();
  try {
    r.commit('base', { 'a.ts': 'one\n', 'b.ts': 'one\n' });
    r.git('branch', 'beta');
    r.commit('stable', { 'a.ts': 'one\ntwo\n' });
    r.git('checkout', '-q', 'beta');
    r.commit('beta', { 'b.ts': 'one\ntwo\n' });
    assert.equal(guardMerge({ target: 'main', source: 'beta', git: r.run }).verdict, VERDICT.CLEAN);
  } finally {
    r.cleanup();
  }
});

test('real merge: a ref git cannot resolve is unknown, never clean', () => {
  const r = repo();
  try {
    r.commit('base', { 'a.ts': 'one\n' });
    const result = guardMerge({ target: 'main', source: 'no-such-branch', git: r.run });
    assert.equal(result.verdict, VERDICT.UNKNOWN);
    assert.equal(exitCodeFor(result), 2);
    assert.match(renderGuardReport(result), /Could not compute the merge/);
  } finally {
    r.cleanup();
  }
});
