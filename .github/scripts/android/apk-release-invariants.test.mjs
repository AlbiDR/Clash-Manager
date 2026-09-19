// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const WORKFLOW = readFileSync('.github/workflows/apk-release.yml', 'utf8');

test('Android SDK setup avoids the retired tools package', () => {
  // setup-android v3 defaults to `tools platform-tools`; Google removed the
  // legacy `tools` package on 2026-09-14, preventing every APK build before
  // compilation or signing. v4 defaults to the supported platform-tools.
  assert.match(
    WORKFLOW,
    /android-actions\/setup-android@v4/,
    'APK releases must use setup-android v4 or newer',
  );
});

/**
 * The commit-back step only. The rest of the workflow may legitimately name a
 * branch (the trigger list does), so asserting over the whole file would either
 * fail on that or have to be loose enough to miss the thing that matters.
 */
function commitBackStep() {
  const start = WORKFLOW.indexOf('      - name: Commit signed APK back to repository');
  assert.ok(start !== -1, 'the commit-back step must still exist');
  const end = WORKFLOW.indexOf('      - name: Deploy PWA release assets', start);
  assert.ok(end !== -1, 'the PWA handoff after the commit-back step must still exist');
  return WORKFLOW.slice(start, end);
}

function pwaDeploymentStep() {
  const start = WORKFLOW.indexOf('      - name: Deploy PWA release assets');
  assert.ok(start !== -1, 'the PWA deployment step must exist');
  const end = WORKFLOW.indexOf('      - name: Remove decoded keystore', start);
  assert.ok(end !== -1, 'the step after the PWA deployment must still exist');
  return WORKFLOW.slice(start, end);
}

test('the signed APK is published to the branch the build came from', () => {
  // The 2026-09-13 defect: this step checked out github.event.workflow_run
  // .head_sha but fetched, reset, pushed and verified against a literal Beta.
  // A Stable-triggered build therefore aimed its APK at Beta, so Stable's own
  // release slot never advanced (it sat at v14.50.103+391 while Stable's
  // package.json read 14.50.104), and a race against a real Beta push resolved
  // by absorbing Beta into an 11-file commit carrying 93 deletions.
  const step = commitBackStep();

  for (const [pattern, label] of [
    [/git fetch origin Beta\b/, 'fetch'],
    [/git push origin HEAD:Beta\b/, 'push'],
    [/git rev-parse origin\/Beta\b/, 'remote-head comparison'],
    [/git reset --soft origin\/Beta\b/, 'conflict reset'],
    [/git ls-tree --name-only origin\/Beta\b/, 'already-published check'],
  ]) {
    assert.ok(
      !pattern.test(step),
      `the ${label} must target the triggering branch, not a hardcoded Beta.`,
    );
  }

  // Every remote operation resolves the same way, so none can drift apart: a
  // run that serialises on one branch and pushes to another is the bug.
  const remoteOps = step.split('\n').filter(line => /git (fetch|push|reset|ls-tree) /.test(line));
  assert.ok(remoteOps.length >= 5, `expected the remote operations to still be present, saw ${remoteOps.length}`);
  for (const line of remoteOps) {
    assert.match(line, /\$TARGET_BRANCH/, `remote operation does not use the resolved branch: ${line.trim()}`);
  }
});

test('the branch reaches the script as an environment variable, never as interpolated text', () => {
  // This step runs with contents: write and a decoded keystore in RUNNER_TEMP.
  // A branch name is attacker-influenceable, so expanding one into the shell
  // body would be a script-injection sink; env passes it as data.
  const step = commitBackStep();
  const [envBlock, runBlock] = step.split('        run: |');
  assert.ok(runBlock, 'the step must still have a run block');

  assert.match(
    envBlock,
    /TARGET_BRANCH: \$\{\{ github\.event\.workflow_run\.head_branch \|\| github\.ref_name \}\}/,
    'TARGET_BRANCH must be declared in env and fall back to the dispatching branch',
  );
  assert.ok(
    !/\$\{\{/.test(runBlock),
    'no GitHub expression may be interpolated into the run body; pass it through env instead',
  );
});

test('a successful APK publication deploys its PWA release assets', () => {
  // GITHUB_TOKEN-created pushes do not trigger Deploy PWA. The APK binary and
  // latest.json must be explicitly deployed, otherwise users keep downloading
  // the previous release even though the signed APK is committed to Stable.
  const step = pwaDeploymentStep();
  const [envBlock, runBlock] = step.split('        run: ');
  assert.ok(runBlock, 'the PWA deployment step must have a run command');

  assert.match(envBlock, /GH_TOKEN: \$\{\{ github\.token \}\}/, 'the dispatch needs the workflow token');
  assert.match(
    envBlock,
    /TARGET_BRANCH: \$\{\{ github\.event\.workflow_run\.head_branch \|\| github\.ref_name \}\}/,
    'the PWA deployment must target the branch that received the APK',
  );
  assert.ok(!/\$\{\{/.test(runBlock), 'GitHub expressions must not be interpolated into the command');
  assert.match(
    runBlock,
    /gh workflow run deploy-pwa\.yml --ref "\$TARGET_BRANCH" -R "\$GITHUB_REPOSITORY"/,
    'the PWA workflow must be dispatched for the published APK branch',
  );
  assert.match(
    WORKFLOW,
    /permissions:\n  actions: write\n  contents: write/,
    'the APK workflow token needs actions: write to dispatch Deploy PWA',
  );
});
