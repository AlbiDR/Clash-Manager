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
