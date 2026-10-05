// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const WORKFLOW = readFileSync('.github/workflows/apk-release.yml', 'utf8');

test('workflow output writes cannot mask a failed command substitution', () => {
  const workflowNames = readdirSync('.github/workflows')
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'));

  for (const workflowName of workflowNames) {
    const workflow = readFileSync(`.github/workflows/${workflowName}`, 'utf8');
    assert.doesNotMatch(
      workflow,
      /echo\s+"[^"\n]*\$\([^\n]+\)"\s*>>/,
      `${workflowName} must resolve fallible commands before echoing an output`,
    );
  }
});

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

function releaseBuildJob() {
  const start = WORKFLOW.indexOf('  build-sign-verify:');
  assert.ok(start !== -1, 'the build-sign-verify job must still exist');
  const end = WORKFLOW.indexOf('      - name: Commit signed APK back to repository', start);
  assert.ok(end !== -1, 'the release publication step must still follow the build');
  return WORKFLOW.slice(start, end);
}

function relevantChangesStep() {
  const start = WORKFLOW.indexOf('      - name: Check for relevant changes');
  assert.ok(start !== -1, 'the relevant-change filter must still exist');
  const end = WORKFLOW.indexOf('\n\n  build-sign-verify:', start);
  assert.ok(end !== -1, 'the build job must still follow the relevant-change filter');
  return WORKFLOW.slice(start, end);
}

test('release uses the pinned native toolchain and rejects a stale checked-in dex', () => {
  // APK/android/classes.dex is deliberately the release input: it contains
  // recovered library classes in addition to the Java source. The release
  // must nevertheless compile APK/src with the same pinned inputs and refuse
  // to sign it if it no longer matches, rather than relying on a separate CI
  // workflow that may finish after this workflow_run release begins.
  const job = releaseBuildJob();

  for (const key of ['jdkMajor', 'buildTools', 'androidPlatform']) {
    assert.match(
      job,
      new RegExp(`node APK/fetch-build-deps\\.mjs get ${key}`),
      `release must read ${key} from APK/toolchain.json`,
    );
  }
  assert.match(job, /node APK\/fetch-build-deps\.mjs apktool/, 'release must use the hash-verified apktool resolver');
  assert.match(job, /java-version: \$\{\{ steps\.toolchain\.outputs\.jdk \}\}/, 'release JDK must come from the pinned toolchain');
  assert.match(
    job,
    /sdkmanager "build-tools;\$\{\{ steps\.toolchain\.outputs\.build_tools \}\}" "platforms;\$\{\{ steps\.toolchain\.outputs\.platform \}\}"/,
    'release SDK packages must come from the pinned toolchain',
  );
  assert.match(job, /APKTOOL_JAR: \$\{\{ steps\.apktool\.outputs\.jar \}\}/, 'source check and packaging must share the resolved apktool');
  assert.match(job, /run: \.\/APK\/build-apk\.sh --check/, 'release must verify source against the committed dex before signing');
  assert.match(job, /BT_VERSION: \$\{\{ steps\.toolchain\.outputs\.build_tools \}\}/, 'signing and integrity checks must use the pinned build-tools');

  assert.doesNotMatch(job, /BT_VERSION: "35\.0\.0"/, 'do not silently retain the obsolete build-tools pin');
  assert.doesNotMatch(job, /APKTOOL_VERSION: "3\.0\.2"/, 'do not silently retain the obsolete apktool pin');
  assert.doesNotMatch(job, /java-version: "17"/, 'do not silently retain the obsolete JDK pin');
  assert.doesNotMatch(job, /curl -fsSL -o "\$RUNNER_TEMP\/apktool\.jar"/, 'apktool downloads must be checksum-verified');
  assert.doesNotMatch(
    job,
    /echo\s+"[^"\n]*\$\(node APK\/fetch-build-deps\.mjs/,
    'a failing toolchain resolver must not be masked by a successful echo command',
  );
  for (const output of ['jdk', 'build_tools', 'platform', 'jar']) {
    assert.match(
      job,
      new RegExp(`${output}="\\$\\(node APK/fetch-build-deps\\.mjs[^\\n]+\\)"[\\s\\S]*echo "${output}=\\$${output}" >> "\\$GITHUB_OUTPUT"`),
      `${output} must be resolved before it is written to GITHUB_OUTPUT`,
    );
  }

  const sourceCheck = job.indexOf('run: ./APK/build-apk.sh --check');
  const packageBuild = job.indexOf('Build APK from verified APK/android');
  assert.ok(sourceCheck !== -1 && sourceCheck < packageBuild, 'source/dex verification must happen before packaging');
});

test('a developer-rebuilt dex and its pinned toolchain remain release inputs', () => {
  // The release commit writes APK/release/** only. Excluding classes.dex made
  // a legitimate source rebuild invisible to the relevance filter even though
  // it is the binary the release job actually packages.
  const step = relevantChangesStep();
  assert.match(step, /APK\/android\/\*/, 'APK/android, including classes.dex, must be relevant');
  assert.match(step, /APK\/toolchain\.json/, 'a native toolchain change must be relevant');
  assert.doesNotMatch(step, /APK\/android\/classes\.dex\|APK\/release/, 'classes.dex must not be excluded with release output');
});

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

// ---------------------------------------------------------------------------
// The commit-back step, RUN rather than read.
//
// Every test above asserts over the step's text, and that is how its race
// recovery shipped broken: `git reset --soft` + `git commit --amend` rewrote
// the remote tip, so the push could never fast-forward, and the stale index
// would have reverted the other push's files. v14.50.142's APK was lost to it
// twice on 2026-10-05. These tests execute the step's own shell against a
// throwaway remote, so they fail on behaviour and survive any rewording.
// ---------------------------------------------------------------------------

/** The commit-back step's `run: |` body, dedented to the script bash receives. */
function commitBackScript() {
  const runBlock = commitBackStep().split('        run: |\n')[1];
  assert.ok(runBlock, 'the commit-back step must still have a run block');
  return runBlock
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
}

const REAL_GIT = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();

/** Git for the test's own setup steps, isolated from the developer's config and hooks. */
function gitEnv(extra = {}) {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    ...extra,
  };
}

function git(cwd, ...args) {
  const result = spawnSync(REAL_GIT, args, { cwd, env: gitEnv(), encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeSlot(dir, version, build) {
  const release = path.join(dir, 'APK/release');
  for (const name of readdirSync(release, { withFileTypes: false })) {
    if (/^clashmanager-v.*\.apk$/.test(name)) rmSync(path.join(release, name));
  }
  writeFileSync(path.join(release, `clashmanager-v${version}+${build}.apk`), `apk ${version}`);
  writeFileSync(path.join(release, 'latest.json'), JSON.stringify({ version, buildNumber: build }, null, 2));
}

/**
 * A remote whose Beta already holds `publishedVersion`, a CI checkout of that
 * commit (the run's head_sha), and a signed APK for VERSION in RUNNER_TEMP.
 */
function releaseFixture(publishedVersion = '1.0.0') {
  const root = mkdtempSync(path.join(tmpdir(), 'apk-release-'));
  const remote = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  git(root, 'init', '--bare', '--initial-branch=Beta', remote);
  git(root, 'clone', remote, seed);
  mkdirSync(path.join(seed, 'APK/release'), { recursive: true });
  writeSlot(seed, publishedVersion, 1);
  writeFileSync(path.join(seed, 'other.txt'), 'base\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-m', 'base');
  git(seed, 'push', 'origin', 'HEAD:Beta');

  const checkout = path.join(root, 'checkout');
  git(root, 'clone', remote, checkout);
  git(checkout, 'checkout', '--detach');

  const runnerTemp = path.join(root, 'runner-temp');
  mkdirSync(runnerTemp);
  writeFileSync(path.join(runnerTemp, 'clashmanager-v1.0.1+2.apk'), 'signed apk 1.0.1');
  return { root, remote, seed, checkout, runnerTemp };
}

/** Lands a commit from another contributor on Beta, as a concurrent push would. */
function peerPush(fixture, file, content) {
  git(fixture.seed, 'pull', '--ff-only', 'origin', 'Beta');
  writeFileSync(path.join(fixture.seed, file), content);
  git(fixture.seed, 'add', '-A');
  git(fixture.seed, 'commit', '-m', `peer change to ${file}`);
  git(fixture.seed, 'push', 'origin', 'HEAD:Beta');
  return git(fixture.seed, 'rev-parse', 'HEAD');
}

function runCommitBack(fixture, { pathPrefix } = {}) {
  const scriptPath = path.join(fixture.root, 'commit-back.sh');
  writeFileSync(scriptPath, commitBackScript());
  const env = gitEnv({
    VERSION: '1.0.1',
    BUILD_NUMBER: '2',
    TARGET_BRANCH: 'Beta',
    RUNNER_TEMP: fixture.runnerTemp,
  });
  if (pathPrefix) env.PATH = `${pathPrefix}${path.delimiter}${env.PATH}`;
  // GitHub runs `run:` blocks as `bash -e {0}`.
  return spawnSync('bash', ['-e', scriptPath], { cwd: fixture.checkout, env, encoding: 'utf8' });
}

function remoteTree(fixture) {
  return git(fixture.remote, 'ls-tree', '-r', '--name-only', 'Beta').split('\n');
}

test('commit-back publishes on top of a branch that moved while the APK built', () => {
  const fixture = releaseFixture();
  try {
    const peerTip = peerPush(fixture, 'other.txt', 'peer work\n');
    const result = runCommitBack(fixture);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    assert.equal(git(fixture.remote, 'rev-parse', 'Beta~1'), peerTip, 'the peer commit must stay, not be rewritten');
    assert.equal(git(fixture.remote, 'show', 'Beta:other.txt'), 'peer work', 'the peer change must not be reverted');
    assert.deepEqual(
      remoteTree(fixture).filter(name => name.endsWith('.apk')),
      ['APK/release/clashmanager-v1.0.1+2.apk'],
      'exactly the new APK must occupy the release slot',
    );
    assert.match(git(fixture.remote, 'show', 'Beta:APK/release/latest.json'), /"version": "1\.0\.1"/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('commit-back retries when another push lands between its fetch and its push', () => {
  const fixture = releaseFixture();
  try {
    // A git wrapper that lands a peer push just before the step's first push,
    // the exact two-second window that cost v14.50.142 its APK.
    const bin = path.join(fixture.root, 'bin');
    mkdirSync(bin);
    const mark = path.join(fixture.root, 'raced');
    writeFileSync(path.join(bin, 'git'), [
      '#!/bin/bash',
      `if [ "$1" = "push" ] && [ ! -e "${mark}" ]; then`,
      `  touch "${mark}"`,
      `  cd "${fixture.seed}" && "${REAL_GIT}" pull -q --ff-only origin Beta \\`,
      `    && echo raced > race.txt && "${REAL_GIT}" add race.txt \\`,
      `    && "${REAL_GIT}" commit -q -m "peer push during the race" && "${REAL_GIT}" push -q origin HEAD:Beta`,
      '  cd - > /dev/null',
      'fi',
      `exec "${REAL_GIT}" "$@"`,
      '',
    ].join('\n'));
    chmodSync(path.join(bin, 'git'), 0o755);

    const result = runCommitBack(fixture, { pathPrefix: bin });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /moved during the push/);
    assert.equal(git(fixture.remote, 'log', '-1', '--format=%s', 'Beta~1'), 'peer push during the race');
    assert.ok(remoteTree(fixture).includes('race.txt'), 'the racing push must survive the retry');
    assert.ok(remoteTree(fixture).includes('APK/release/clashmanager-v1.0.1+2.apk'));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('commit-back fails, rather than looping, when a push is rejected and the branch did not move', () => {
  const fixture = releaseFixture();
  try {
    const hook = path.join(fixture.remote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho "rejected by policy" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    const before = git(fixture.remote, 'rev-parse', 'Beta');

    const result = runCommitBack(fixture);
    assert.notEqual(result.status, 0, 'a real rejection must fail the step');
    assert.match(result.stdout, /did not move, so this was not a race/);
    assert.equal(git(fixture.remote, 'rev-parse', 'Beta'), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('commit-back never replaces a newer published APK, and skips one already published', () => {
  for (const published of ['1.0.2', '1.0.1']) {
    const fixture = releaseFixture(published);
    try {
      const before = git(fixture.remote, 'rev-parse', 'Beta');
      const result = runCommitBack(fixture);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(git(fixture.remote, 'rev-parse', 'Beta'), before, `v${published} on the branch must be left alone`);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});
