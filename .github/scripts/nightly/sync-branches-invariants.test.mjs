// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  // The APK slot is normalised before the merge only in the Nightly jobs, and
  // only Job 1 regenerates and re-verifies the lockfile. A job claiming more
  // would let the guard wave through a loss nothing repairs.
  for (const { step } of theirsMerges()) {
    const call = step.text.slice(step.text.indexOf('node "$SYNC_GUARD"')).split('\n')[0];
    const nightlyJob = /--source origin\/Nightly|--target-name Nightly/.test(call);
    assert.equal(call.includes('--apk-slot-normalised'), nightlyJob, `"${step.name}": --apk-slot-normalised only where the slot is normalised`);
    assert.equal(call.includes('--lockfile-verified'), call.includes('--source origin/Nightly'), `"${step.name}": --lockfile-verified only in Job 1, which runs verify_lockfile`);
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
