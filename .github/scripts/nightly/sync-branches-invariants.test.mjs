// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const WORKFLOW = readFileSync('.github/workflows/sync-branches.yml', 'utf8');

test('Sync Branches stays manual dispatch only', () => {
  // Deliberate, and repeatedly reaffirmed by the owner: this workflow walks
  // Nightly to Beta to Stable, so an automatic trigger would turn a branch
  // sync into an unreviewed release. Nightly running ahead of Beta and Stable
  // is the intended resting state, not drift to be corrected on a timer.
  const triggerBlock = WORKFLOW.slice(WORKFLOW.indexOf('\non:'), WORKFLOW.indexOf('\npermissions:'));
  assert.match(triggerBlock, /workflow_dispatch:/, 'manual dispatch must remain available');
  for (const forbidden of ['schedule:', 'push:', 'pull_request:', 'repository_dispatch:', 'workflow_call:']) {
    assert.ok(
      !triggerBlock.includes(forbidden),
      `Sync Branches must not gain a ${forbidden} trigger: it would make branch promotion automatic.`,
    );
  }
});

test('manual cross-branch promotions serialize without replacing queued dispatch inputs', () => {
  const concurrencyBlock = WORKFLOW.match(/^concurrency:\n((?:[ \t]+.*\n)+)/m)?.[0];
  assert.equal(
    concurrencyBlock,
    'concurrency:\n  group: sync-branches-promotion\n  queue: max\n  cancel-in-progress: false\n',
    'serialize promotions, retain pending dispatches, and never cancel the active promotion',
  );
  assert.match(
    WORKFLOW,
    /if: needs\.check-sync\.outputs\.nightly_beta_diff == 'true' && github\.event\.inputs\.skip_nightly_sync != 'true'/,
    'each queued run must continue to apply its own skip_nightly_sync input to Nightly → Beta',
  );
});

test('the APK release slot repair is still wired into the Nightly to Beta merge', () => {
  // Guards the 2026-09-10 regression: the pre-merge normalisation forces this
  // branch's slot to Nightly's to dodge an unresolvable rename/rename
  // conflict, and Nightly is structurally the stale side, so without this
  // repair every sync can walk the published APK pointer backwards.
  assert.match(WORKFLOW, /restore_newer_apk_slot\(\) \{/, 'the repair function must exist');
  assert.match(
    WORKFLOW,
    /\n            restore_newer_apk_slot\n/,
    'the repair must actually be called after the merge, not merely defined',
  );
  assert.match(
    WORKFLOW,
    /APK_SLOT_BACKUP="\$RUNNER_TEMP\/apk-slot-before-merge"/,
    'the pre-merge snapshot the repair reads must still be taken',
  );
  assert.match(
    WORKFLOW,
    /apk-slot\.mjs/,
    'ordering must be delegated to apk-slot.mjs rather than reimplemented in shell',
  );
});

// ---------------------------------------------------------------------------
// The merge guard. -X theirs settles every conflict by taking the incoming
// side, which silently drops the destination's own change wherever both
// touched the same lines: on 2026-09-24 the Beta -> Stable merge (2a53d2b38)
// reverted Stable's trimmed migrations and walked its version back from
// 14.50.113 to 14.50.112. sync-merge-guard.mjs refuses such a merge. These pin
// that no -X theirs merge in this workflow runs without it.

/** Each step of the workflow, as the text from its `- name:` line to the next. */
function steps() {
  return WORKFLOW.split(/\n(?=      - name: )/).map(text => ({ name: (/- name: (.*)/.exec(text) || [])[1] || '', text }));
}

test('Stable promotion jobs refresh source refs pinned to the workflow starting commit', () => {
  for (const [source, target] of [['Beta', 'Stable'], ['Stable', 'Beta']]) {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'sync-source-ref-'));
    const remote = path.join(temp, 'remote.git');
    const seed = path.join(temp, 'seed');
    const runner = path.join(temp, 'runner');
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      git(temp, 'init', '--bare', remote);
      git(temp, 'init', '-b', 'Beta', seed);
      git(seed, 'config', 'user.name', 'Test Owner');
      git(seed, 'config', 'user.email', 'test@example.com');
      writeFileSync(path.join(seed, 'content.txt'), 'before nightly promotion\n');
      git(seed, 'add', '.');
      git(seed, 'commit', '-m', 'initial');
      git(seed, 'branch', 'Stable');
      git(seed, 'remote', 'add', 'origin', remote);
      git(seed, 'push', 'origin', 'Beta', 'Stable');
      git(temp, 'clone', '--branch', 'Beta', remote, runner);
      const oldSource = git(runner, 'rev-parse', `origin/${source}`);
      git(seed, 'checkout', source);
      writeFileSync(path.join(seed, 'content.txt'), 'completed upstream promotion\n');
      git(seed, 'commit', '-am', 'upstream job finished');
      git(seed, 'push', 'origin', source);
      // actions/checkout pins the triggering branch ref to github.sha, even
      // after its full-history fetch has seen the preceding job's newer push.
      git(runner, 'fetch', 'origin');
      git(runner, 'update-ref', `refs/remotes/origin/${source}`, oldSource);
      const step = steps().find(item => item.name === `Merge ${source} into ${target}`);
      assert.ok(step, `missing ${source} -> ${target} step`);
      const preamble = step.text.split('run: |\n')[1].split('BEFORE_SHA=')[0];
      execFileSync('bash', ['-e', '-c', preamble], { cwd: runner, stdio: ['ignore', 'pipe', 'pipe'] });
      git(runner, 'merge', `origin/${source}`, '--no-edit');
      assert.equal(readFileSync(path.join(runner, 'content.txt'), 'utf8'), 'completed upstream promotion\n', `${source} -> ${target} must promote the preceding job's latest content`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('the final sync check rejects diverged contents even when merge jobs succeeded', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'sync-final-tree-'));
  const seed = path.join(temp, 'seed');
  const runner = path.join(temp, 'runner');
  const remote = path.join(temp, 'remote.git');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(temp, 'init', '--bare', remote);
    git(temp, 'init', '-b', 'Beta', seed);
    git(seed, 'config', 'user.name', 'Test Owner');
    git(seed, 'config', 'user.email', 'test@example.com');
    writeFileSync(path.join(seed, 'content.txt'), 'aligned\n');
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', 'initial');
    git(seed, 'branch', 'Stable');
    git(seed, 'branch', 'Nightly');
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', 'origin', 'Beta', 'Stable', 'Nightly');
    git(temp, 'clone', '--branch', 'Beta', remote, runner);
    const step = steps().find(item => item.name === 'Verify synchronized branch trees');
    assert.ok(step, 'successful merge jobs must still prove their final contents');
    const script = step.text.split('run: |\n')[1];
    const summary = path.join(temp, 'summary.md');
    const verify = () => execFileSync('bash', ['-e', '-c', script], { cwd: runner, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, stdio: ['ignore', 'pipe', 'pipe'] });
    const aligned = verify();
    assert.match(aligned, /contain identical files/);
    const initialCommit = git(seed, 'rev-parse', 'HEAD').trim();
    const initialTree = git(seed, 'rev-parse', 'HEAD^{tree}').trim();
    for (const branch of ['Beta', 'Stable', 'Nightly']) {
      assert.ok(aligned.includes(`SYNC_SNAPSHOT branch=${branch} commit=${initialCommit} tree=${initialTree}`));
      assert.ok(readFileSync(summary, 'utf8').includes(`| ${branch} | ${initialCommit} | ${initialTree} |`));
    }
    git(seed, 'checkout', 'Stable');
    writeFileSync(path.join(seed, 'content.txt'), 'diverged\n');
    git(seed, 'commit', '-am', 'Stable differs');
    git(seed, 'push', 'origin', 'Stable');
    assert.throws(verify, error => error.status === 1 && error.stdout.includes('Stable still differs from Beta') && error.stdout.includes('SYNC_SNAPSHOT branch=Nightly'));
    git(seed, 'branch', '-f', 'Beta', 'HEAD');
    git(seed, 'branch', '-f', 'Nightly', 'HEAD');
    git(seed, 'push', 'origin', 'Beta', 'Nightly');
    assert.match(verify(), /contain identical files/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

/** Each `git merge ... -X theirs` in the workflow, with the step it sits in. */
function theirsMerges() {
  return steps().flatMap(step => [...step.text.matchAll(/git merge (origin\/\w+) -X theirs/g)].map(match => ({
    step,
    source: match[1],
    index: match.index,
  })));
}

test('every -X theirs merge is preceded by the merge guard for the same source', () => {
  const merges = theirsMerges();
  assert.ok(merges.length > 0, 'found no -X theirs merge, so this pin would pass vacuously');
  for (const { step, source, index } of merges) {
    const before = step.text.slice(0, index);
    const guard = before.lastIndexOf('node "$SYNC_GUARD"');
    assert.ok(guard >= 0, `"${step.name}" runs git merge ${source} -X theirs with no merge guard before it`);
    const call = before.slice(guard, before.indexOf('\n', guard));
    assert.match(call, new RegExp(`--source ${source.replace('/', '\\/')}(\\s|$)`), `"${step.name}": the guard must judge the same source it merges`);
    assert.match(before.slice(guard), /then\s+exit 1/, `"${step.name}": a refusal must stop the step, not merely print`);
  }
});

test('each job states only the ownership it really has', () => {
  // A guard flag is a claim that some other step repairs that kind of loss.
  // The APK slot is only safe where the job aligns it before merging, and only
  // Job 1 regenerates and re-verifies the lockfile. A job claiming more would
  // let the guard wave through a loss nothing repairs.
  const jobs = WORKFLOW.split(/\n(?=  [a-z0-9-]+:\n)/);
  for (const { step, index } of theirsMerges()) {
    const call = step.text.slice(step.text.indexOf('node "$SYNC_GUARD"')).split('\n')[0];
    // Matched by the step's own name line: a step's text can run on into the
    // next job's header, so it is not always a substring of one job.
    const nameLine = `- name: ${step.name}\n`;
    const job = jobs.find(text => text.includes(nameLine));
    assert.ok(job, `"${step.name}" belongs to no job`);
    const alignsInStep = step.text.slice(0, index).includes('"$APK_SLOT_SYNC" align');
    const normalisesBefore = /- name: Normalise APK release slot \(pre-merge\)/.test(job.slice(0, job.indexOf(nameLine)));
    assert.equal(call.includes('--apk-slot-normalised'), alignsInStep || normalisesBefore, `"${step.name}": --apk-slot-normalised only where the slot is aligned before the merge`);
    assert.equal(call.includes('--lockfile-verified'), call.includes('--source origin/Nightly'), `"${step.name}": --lockfile-verified only in Job 1, which runs verify_lockfile`);
  }
});

test('the Stable jobs align the APK slot before merging and keep the newer build after', () => {
  // Without the alignment the two slots, each renamed by apk-release.yml on
  // its own branch, make a rename/rename -X theirs cannot resolve: on
  // 2026-09-27 that blocked every sync at the Beta -> Stable merge. Without
  // the restore, aligning to the older side walks the updater back (the
  // 2026-09-10 incident).
  const stableSteps = theirsMerges().filter(m => /Stable/.test(m.step.name));
  assert.equal(stableSteps.length, 2, 'both Stable merge steps must be checked');
  for (const { step, source, index } of stableSteps) {
    const before = step.text.slice(0, index);
    const after = step.text.slice(index);
    assert.match(before, new RegExp(`"\\$APK_SLOT_SYNC" align --source ${source.replace('/', '\\/')} `), `"${step.name}": align to the same source it merges`);
    assert.ok(before.indexOf('"$APK_SLOT_SYNC" align') < before.indexOf('node "$SYNC_GUARD"'), `"${step.name}": align before the guard judges the merge`);
    assert.match(after, /"\$APK_SLOT_SYNC" restore-newer --backup "\$APK_SLOT_BACKUP"/, `"${step.name}": restore the newer build after the merge`);
  }
});

test('the guard is loaded from this workflow own commit in every job that calls it', () => {
  // Read from the checked-out branch instead, the first run after the guard
  // lands would fail: the branch being merged INTO does not have it yet.
  const jobs = WORKFLOW.split(/\n(?=  [a-z0-9-]+:\n)/);
  const calling = jobs.filter(job => job.includes('node "$SYNC_GUARD"'));
  assert.equal(calling.length, 4, 'all four merge jobs must be guarded');
  for (const job of calling) {
    assert.match(job, /git archive "\$\{\{ github\.sha \}\}" \.github\/scripts/, 'the guard must come from the commit this YAML was read from');
    assert.ok(job.indexOf('SYNC_GUARD=') < job.indexOf('node "$SYNC_GUARD"'), 'the guard must be loaded before it is called');
  }
});
