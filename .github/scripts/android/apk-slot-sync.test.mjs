// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { align, restoreNewer, runCli, SLOT_DIR } from './apk-slot-sync.mjs';

/** A signed build stand-in: mostly shared bytes, so git sees a rename between builds, as it does with real APKs. */
const apkBytes = build => Buffer.concat([Buffer.alloc(4096, 7), Buffer.from([0, 255, build % 256, 0])]);
const slotJson = (version, buildNumber) => `${JSON.stringify({ version, buildNumber, filename: `clashmanager-v${version}+${buildNumber}.apk` }, null, 2)}\n`;

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'apk-slot-sync-'));
  const run = args => {
    const res = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8' });
    return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
  };
  const git = (...args) => {
    const res = run(args);
    if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
    return res.stdout.trim();
  };
  /** Replace the slot with one build, the way apk-release.yml does: rename the file, rewrite latest.json. */
  const release = (version, buildNumber) => {
    mkdirSync(path.join(dir, SLOT_DIR), { recursive: true });
    const name = `clashmanager-v${version}+${buildNumber}.apk`;
    const existing = readdirSync(path.join(dir, SLOT_DIR)).find(file => file.endsWith('.apk'));
    if (existing && existing !== name) git('mv', `${SLOT_DIR}/${existing}`, `${SLOT_DIR}/${name}`);
    writeFileSync(path.join(dir, SLOT_DIR, name), apkBytes(buildNumber));
    writeFileSync(path.join(dir, SLOT_DIR, 'latest.json'), slotJson(version, buildNumber));
    git('add', '-A');
    git('commit', '-q', '-m', `release ${version}+${buildNumber}`);
  };
  // Commits in the helper use the repository identity, as the workflow's do.
  git('init', '-q');
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@t');
  const slot = () => ({
    apks: readdirSync(path.join(dir, SLOT_DIR)).filter(file => file.endsWith('.apk')).sort(),
    json: JSON.parse(readFileSync(path.join(dir, SLOT_DIR, 'latest.json'), 'utf8')),
  });
  return { dir, git, run, release, slot, backup: path.join(dir, '..', `${path.basename(dir)}-backup`), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Both branches renamed the same base build differently: the 2026-09-27 Stable/Beta shape. */
function divergedSlots(r, { main, beta }) {
  r.release('14.50.113', 410);
  r.git('branch', 'beta');
  r.release(...main);
  r.git('checkout', '-q', 'beta');
  r.release(...beta);
  r.git('checkout', '-q', 'main');
}

test('the diverged slots really are a rename/rename -X theirs cannot merge', () => {
  // Pins the premise, so the tests below prove something: without alignment
  // this merge fails outright, which is what blocked Sync Branches.
  const r = repo();
  try {
    divergedSlots(r, { main: ['14.50.112', 411], beta: ['14.50.117', 415] });
    const merge = r.run(['merge', 'beta', '-X', 'theirs', '--no-edit']);
    assert.notEqual(merge.status, 0);
    assert.match(merge.stdout + merge.stderr, /rename\/rename/);
  } finally {
    r.cleanup();
  }
});

test('aligned first, the merge succeeds and keeps the incoming build when it is newer', () => {
  const r = repo();
  try {
    divergedSlots(r, { main: ['14.50.112', 411], beta: ['14.50.117', 415] });
    const aligned = align({ source: 'beta', sourceName: 'Beta', backup: r.backup, cwd: r.dir });
    assert.equal(aligned.aligned, true);
    assert.equal(r.git('log', '-1', '--format=%s'), 'chore(sync): pre-align APK release slot to Beta before merge [skip ci]');
    assert.equal(r.run(['merge', 'beta', '-X', 'theirs', '--no-edit']).status, 0, 'no rename/rename left to conflict on');

    const restored = restoreNewer({ backup: r.backup, cwd: r.dir });
    assert.equal(restored.restored, false);
    assert.deepEqual(r.slot().apks, ['clashmanager-v14.50.117+415.apk']);
    assert.equal(r.slot().json.buildNumber, 415);
  } finally {
    r.cleanup();
  }
});

test('when the destination held the newer build, it is put back after the merge', () => {
  // The 2026-09-10 lesson: aligning by branch alone can walk the updater back.
  const r = repo();
  try {
    divergedSlots(r, { main: ['14.50.118', 416], beta: ['14.50.117', 415] });
    align({ source: 'beta', backup: r.backup, cwd: r.dir });
    assert.equal(r.run(['merge', 'beta', '-X', 'theirs', '--no-edit']).status, 0);
    const restored = restoreNewer({ backup: r.backup, cwd: r.dir });
    assert.equal(restored.restored, true);
    assert.equal(r.git('log', '-1', '--format=%s'), 'chore(sync): restore newer APK release slot after merge [skip ci]');
    assert.deepEqual(r.slot().apks, ['clashmanager-v14.50.118+416.apk'], 'exactly one build, the newer one');
    assert.equal(r.slot().json.version, '14.50.118');
    assert.deepEqual(readFileSync(path.join(r.dir, SLOT_DIR, 'clashmanager-v14.50.118+416.apk')), apkBytes(416), 'the signed bytes, not a copy of the other build');
    assert.equal(r.git('status', '--porcelain'), '', 'everything it changed is committed');
  } finally {
    r.cleanup();
  }
});

test('a slot that cannot be ordered is left as merged, with a warning, never guessed', () => {
  const r = repo();
  try {
    divergedSlots(r, { main: ['14.50.112', 411], beta: ['14.50.117', 415] });
    align({ source: 'beta', backup: r.backup, cwd: r.dir });
    writeFileSync(path.join(r.backup, 'latest.json'), '{ not json');
    r.run(['merge', 'beta', '-X', 'theirs', '--no-edit']);
    const result = restoreNewer({ backup: r.backup, cwd: r.dir });
    assert.equal(result.restored, false);
    assert.match(result.warning, /Could not order/);
    assert.deepEqual(r.slot().apks, ['clashmanager-v14.50.117+415.apk']);
  } finally {
    r.cleanup();
  }
});

test('a source with no versioned APK leaves this slot alone', () => {
  const r = repo();
  try {
    r.release('14.50.113', 410);
    r.git('checkout', '-q', '--orphan', 'empty');
    r.git('rm', '-rq', '--cached', '.');
    writeFileSync(path.join(r.dir, 'README.md'), 'x\n');
    r.git('add', 'README.md');
    r.git('commit', '-q', '-m', 'no slot');
    r.git('checkout', '-q', '-f', 'main');
    const result = align({ source: 'empty', backup: r.backup, cwd: r.dir });
    assert.equal(result.aligned, false);
    assert.deepEqual(r.slot().apks, ['clashmanager-v14.50.113+410.apk']);
  } finally {
    r.cleanup();
  }
});

test('a ref git cannot resolve is an error, never "no APK there"', () => {
  const r = repo();
  try {
    r.release('14.50.113', 410);
    assert.throws(() => align({ source: 'no-such-branch', backup: r.backup, cwd: r.dir }), /resolving no-such-branch/);
    assert.deepEqual(r.slot().apks, ['clashmanager-v14.50.113+410.apk'], 'nothing was touched');
  } finally {
    r.cleanup();
  }
});

test('aligning to a slot that is already identical commits nothing', () => {
  const r = repo();
  try {
    r.release('14.50.113', 410);
    r.git('branch', 'beta');
    const before = r.git('rev-parse', 'HEAD');
    assert.equal(align({ source: 'beta', backup: r.backup, cwd: r.dir }).aligned, false);
    assert.equal(r.git('rev-parse', 'HEAD'), before);
    assert.ok(existsSync(path.join(r.backup, 'latest.json')), 'the snapshot is still taken');
  } finally {
    r.cleanup();
  }
});

test('the CLI refuses an incomplete command rather than guessing', () => {
  assert.equal(runCli([]), 2);
  assert.equal(runCli(['align', '--backup', '/tmp/x']), 2);
  assert.equal(runCli(['restore-newer']), 2);
});
