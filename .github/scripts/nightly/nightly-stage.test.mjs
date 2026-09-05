// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  budgetPhase,
  computeLockFingerprint,
  getStage,
  needsDependencyRefresh,
  renderHandoff,
  prBodyPath,
  renderPlainSummary,
  renderPrBody,
  replaceSentinel,
  sentinelLine,
  prBodySidecarPath,
  validateChangedPaths,
  validateRegistryData,
  composeCommitSubject,
  formatRunWindow,
} from "./nightly-stage.mjs";
import { extractMetadata, parseStageBranch } from "./merge-nightly-core.mjs";

const scriptPath = fileURLToPath(new URL("./nightly-stage.mjs", import.meta.url));
const contextScriptPath = fileURLToPath(new URL("./update-nightly-context.sh", import.meta.url));
const registryPath = fileURLToPath(new URL("../../nightly-config/stages.json", import.meta.url));
const registry = validateRegistryData(JSON.parse(readFileSync(registryPath, "utf8")));

function run(command, args, cwd, env = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function createTemporaryRepo() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "nightly-stage-test-"));
  mkdirSync(path.join(repoRoot, ".github/nightly-config"), { recursive: true });
  writeFileSync(path.join(repoRoot, ".github/nightly-config/stages.json"), `${JSON.stringify(registry, null, 2)}\n`);
  writeFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

  assert.equal(run("git", ["init", "-b", "Nightly"], repoRoot).status, 0);
  assert.equal(run("git", ["config", "user.email", "nightly@example.invalid"], repoRoot).status, 0);
  assert.equal(run("git", ["config", "user.name", "Nightly Test"], repoRoot).status, 0);
  assert.equal(run("git", ["add", "."], repoRoot).status, 0);
  assert.equal(run("git", ["commit", "-m", "test: seed nightly lifecycle repo"], repoRoot).status, 0);
  return repoRoot;
}

function attachBareOrigin(repoRoot) {
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), "nightly-stage-remote-test-"));
  assert.equal(run("git", ["init", "--bare"], remoteRoot).status, 0);
  assert.equal(run("git", ["remote", "add", "origin", remoteRoot], repoRoot).status, 0);
  assert.equal(run("git", ["push", "origin", "Nightly"], repoRoot).status, 0);
  return remoteRoot;
}

test("registry defines exactly one ordered identity for every stage", () => {
  assert.equal(registry.stages.length, 13);
  assert.equal(getStage(registry, 1).slug, "hardening");
  assert.equal(getStage(registry, "13").slug, "self-healing-protocol");
  assert.throws(() => getStage(registry, 14), /Invalid nightly stage/);
  assert.throws(() => getStage(registry, "2-extra"), /Invalid nightly stage/);

  const duplicate = structuredClone(registry);
  duplicate.stages[1].coverageLog = duplicate.stages[0].coverageLog;
  assert.throws(() => validateRegistryData(duplicate), /Duplicate coverage log/);
});

test("lockfile fingerprint detects snapshot drift", () => {
  const first = computeLockFingerprint("lockfile A");
  const same = computeLockFingerprint("lockfile A");
  const second = computeLockFingerprint("lockfile B");
  assert.equal(first, same);
  assert.notEqual(first, second);
  assert.equal(needsDependencyRefresh(first, same), false);
  assert.equal(needsDependencyRefresh(first, second), true);
  assert.equal(needsDependencyRefresh("", second), true);
});

test("budget reserves publication time at the exact 45-minute boundary", () => {
  const start = 1_000;
  assert.equal(budgetPhase(start, start + 44 * 60 + 59, 45), "WORK");
  assert.equal(budgetPhase(start, start + 45 * 60, 45), "SUBMIT");
  assert.equal(budgetPhase(start, start + 60 * 60, 45), "SUBMIT");
  assert.throws(() => budgetPhase(start, Number.NaN, 45), /finite numbers/);
  assert.throws(() => budgetPhase(start, start, 0), /positive number/);
});

test("sentinel replacement is exact and idempotent", () => {
  const sentinel = sentinelLine("2026-08-08", 4);
  const finalLine = "* [2026-08-08] [Stage 4] CLEAN: Codebase -- No bottleneck found";
  const first = replaceSentinel(`older\n${sentinel}\n`, sentinel, finalLine);
  assert.equal(first.changed, true);
  assert.equal(first.content, `older\n${finalLine}\n`);
  assert.deepEqual(replaceSentinel(first.content, sentinel, finalLine), {
    content: first.content,
    changed: false,
  });
  assert.throws(() => replaceSentinel("missing\n", sentinel, finalLine), /found 0/);
  assert.throws(() => replaceSentinel(`${sentinel}\n${sentinel}\n`, sentinel, finalLine), /found 2/);
});

test("fallback finalization rejects every non-log change", () => {
  const stage = getStage(registry, 4);
  assert.deepEqual(validateChangedPaths(stage, "PARTIAL-RUN", [stage.coverageLog]), [stage.coverageLog]);
  assert.throws(
    () => validateChangedPaths(stage, "PARTIAL-RUN", [stage.coverageLog, "Frontend-PWA/src/App.vue"]),
    /log-only diff/,
  );
});

test("stage-specific write boundaries reject unsafe diffs", () => {
  const stage1 = getStage(registry, 1);
  const stage2 = getStage(registry, 2);
  const stage5 = getStage(registry, 5);
  const stage13 = getStage(registry, 13);

  assert.doesNotThrow(() => validateChangedPaths(stage1, "CLEAN", [stage1.coverageLog, ".github/nightly-logs/00-pr-history.md"]));
  assert.doesNotThrow(() => validateChangedPaths(stage2, "CHANGED", [stage2.coverageLog, "Frontend-PWA/src/example.spec.ts"]));
  assert.throws(
    () => validateChangedPaths(stage2, "CHANGED", [stage2.coverageLog, "Frontend-PWA/src/example.ts"]),
    /only change \*\.spec\.ts/,
  );
  assert.doesNotThrow(() => validateChangedPaths(stage5, "CHANGED", [stage5.coverageLog, "Frontend-PWA/README.md"]));
  assert.throws(
    () => validateChangedPaths(stage13, "CHANGED", [stage13.coverageLog, "AGENTS.md"]),
    /may not modify pipeline instructions/,
  );
  assert.throws(
    () =>
      validateChangedPaths(stage13, "CHANGED", [
        stage13.coverageLog,
        ".github/nightly-prompts/00-nightly-agent-contract.md",
      ]),
    /may not modify pipeline instructions/,
  );
  assert.throws(
    () => validateChangedPaths(stage1, "CHANGED", [stage1.coverageLog, ".github/workflows/example.yml"]),
    /may not modify pipeline instructions/,
  );
  assert.throws(
    () =>
      validateChangedPaths(stage1, "CHANGED", [
        stage1.coverageLog,
        ".github/nightly-logs/00-pipeline-intelligence.md",
      ]),
    /may not modify pipeline instructions/,
  );
  assert.throws(
    () =>
      validateChangedPaths(stage1, "CHANGED", [
        stage1.coverageLog,
        ".github/nightly-logs/13-self-healing-protocol.md",
      ]),
    /Only Stage 13/,
  );
});

test("metadata and native handoff are complete without pending placeholders", () => {
  const stage = getStage(registry, 2);
  const body = renderPrBody(stage, "CHANGED", "Added loader boundary coverage", [
    stage.coverageLog,
    "Frontend-PWA/src/example.spec.ts",
  ], {
    why: "The loader path lacked regression coverage.",
    result: "The focused spec passed and guards the failure boundary.",
  });
  assert.match(body, /NIGHTLY_PR_METADATA:/);
  // The plain-language line is derived from the diff shape, never from the
  // free-text summary, so it stays grammatical whatever the summary looks like
  // and adds the one fact the fields below do not carry: that this diff is
  // tests only and therefore cannot alter behaviour.
  assert.match(body, /In plain terms: this adds 1 test file in the verification area\./);
  assert.match(body, /No product code changed, so the app behaves exactly as it did before\./);
  // The replaced paragraph restated the fields printed directly beneath it and
  // broke grammatically whenever the summary was not a noun phrase.
  assert.doesNotMatch(body, /run focused on/);
  assert.doesNotMatch(body, /small, targeted update/);
  assert.match(body, /\*\*What changed:\*\* Added loader boundary coverage/);
  assert.match(body, /\*\*Why:\*\* The loader path lacked regression coverage\./);
  assert.match(body, /\*\*Result:\*\* The focused spec passed and guards the failure boundary\./);
  assert.match(body, /\*\*Files changed:\*\* .github\/nightly-logs\/02-verification-coverage\.log, Frontend-PWA\/src\/example\.spec\.ts/);
  assert.match(body, /Domain: verification/);
  assert.match(body, /Change: Added loader boundary coverage/);
  assert.doesNotMatch(body, /PENDING/);
  assert.deepEqual(extractMetadata({ body, title: "Verification run" }), {
    domain: "verification",
    why: "The loader path lacked regression coverage.",
    change: "Added loader boundary coverage",
    result: "The focused spec passed and guards the failure boundary.",
    files: ".github/nightly-logs/02-verification-coverage.log, Frontend-PWA/src/example.spec.ts",
  });

  const handoff = renderHandoff(stage, "CHANGED", "Added loader boundary coverage", "a1b2c3d4");
  assert.match(handoff, /nightly\/stage-2-verification-a1b2c3d4/);
  assert.match(handoff, /PR base: Nightly/);
  assert.match(handoff, /native scheduled-task publisher/);
  const suggestedBranch = handoff.match(/Suggested branch: (\S+)/)?.[1];
  assert.equal(parseStageBranch(suggestedBranch)?.stage, 2);
});

test("dry-run startup and real finalization are isolated in a disposable repository", t => {
  const repoRoot = createTemporaryRepo();
  const testContext = mkdtempSync(path.join(os.tmpdir(), "nightly-stage-context-test-"));
  t.after(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(testContext, { recursive: true, force: true });
  });
  const commonEnv = {
    NIGHTLY_CONTEXT_DIR: testContext,
    NIGHTLY_TODAY: "2026-08-08",
    NIGHTLY_NOW_EPOCH: "1000",
  };

  const start = run(process.execPath, [scriptPath, "start", "--stage", "2", "--dry-run"], repoRoot, commonEnv);
  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /"dryRun": true/);
  assert.match(start.stdout, /"wouldSynchronize": true/);
  assert.match(start.stdout, /"refreshDependencies": true/);
  assert.equal(run("git", ["status", "--porcelain"], repoRoot).stdout, "");

  const malformedStage = run(
    process.execPath,
    [scriptPath, "start", "--stage", "2-extra", "--dry-run"],
    repoRoot,
    commonEnv,
  );
  assert.notEqual(malformedStage.status, 0);
  assert.match(malformedStage.stderr, /Invalid nightly stage/);

  const stage = getStage(registry, 2);
  const logPath = path.join(repoRoot, stage.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const sentinel = `${sentinelLine("2026-08-08", 2)}\n`;
  writeFileSync(logPath, sentinel);
  const finalize = run(
    process.execPath,
    [scriptPath, "finalize", "--stage", "2", "--status", "CLEAN", "--summary", "No coverage gap found", "--dry-run"],
    repoRoot,
    commonEnv,
  );
  assert.equal(finalize.status, 0, finalize.stderr);
  assert.match(finalize.stdout, /"command": "finalize"/);
  assert.equal(readFileSync(logPath, "utf8"), sentinel);

  const completedFinalize = run(
    process.execPath,
    [
      scriptPath,
      "finalize",
      "--stage",
      "2",
      "--status",
      "CLEAN",
      "--summary",
      "No coverage gap found",
      "--why",
      "The selected verification slice already covered the audited behavior.",
      "--result",
      "No source change was required after the focused audit.",
    ],
    repoRoot,
    commonEnv,
  );
  assert.equal(completedFinalize.status, 0, completedFinalize.stderr);
  assert.doesNotMatch(readFileSync(logPath, "utf8"), /IN-PROGRESS/);
  assert.match(readFileSync(logPath, "utf8"), /CLEAN: Codebase -- No coverage gap found/);
  const prBody = readFileSync(path.join(testContext, "pr-body.md"), "utf8");
  assert.match(prBody, /NIGHTLY_PR_METADATA:/);
  assert.match(prBody, /\*\*Why:\*\* The selected verification slice already covered the audited behavior\./);
  assert.match(prBody, /\*\*Result:\*\* No source change was required after the focused audit\./);
  assert.match(readFileSync(path.join(testContext, "final-handoff.txt"), "utf8"), /PR base: Nightly/);
  assert.equal(run("git", ["branch", "--show-current"], repoRoot).stdout.trim(), "Nightly");
});

test("real startup synchronizes a disposable Nightly branch and writes bounded state", t => {
  const repoRoot = createTemporaryRepo();
  const remoteRoot = attachBareOrigin(repoRoot);
  const testContext = mkdtempSync(path.join(os.tmpdir(), "nightly-stage-start-context-test-"));
  t.after(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(remoteRoot, { recursive: true, force: true });
    rmSync(testContext, { recursive: true, force: true });
  });

  mkdirSync(path.join(repoRoot, ".github/scripts/nightly"), { recursive: true });
  writeFileSync(
    path.join(repoRoot, ".github/scripts/nightly/update-nightly-context.sh"),
    readFileSync(contextScriptPath, "utf8"),
  );
  assert.equal(run("git", ["add", ".github/scripts/nightly/update-nightly-context.sh"], repoRoot).status, 0);
  assert.equal(run("git", ["commit", "-m", "test: add context helper"], repoRoot).status, 0);
  assert.equal(run("git", ["push", "origin", "Nightly"], repoRoot).status, 0);

  const fingerprint = computeLockFingerprint(readFileSync(path.join(repoRoot, "pnpm-lock.yaml")));
  writeFileSync(path.join(testContext, "snapshot-lock.sha256"), `${fingerprint}\n`);
  const start = run(
    process.execPath,
    [scriptPath, "start", "--stage", "13"],
    repoRoot,
    {
      NIGHTLY_CONTEXT_DIR: testContext,
      NIGHTLY_TODAY: "2026-08-08",
      NIGHTLY_NOW_EPOCH: "1000",
    },
  );

  assert.equal(start.status, 0, start.stderr);
  assert.match(start.stdout, /Nightly Stage 13 started/);
  assert.match(
    readFileSync(path.join(repoRoot, getStage(registry, 13).coverageLog), "utf8"),
    /\[2026-08-08\] \[Stage 13\] IN-PROGRESS/,
  );
  const state = JSON.parse(readFileSync(path.join(testContext, "session-state.json"), "utf8"));
  assert.equal(state.stage, 13);
  assert.equal(state.dependencyRefresh, "not-required");
  assert.equal(state.contextRefresh, "current");
  assert.equal(readFileSync(path.join(testContext, "active-lock.sha256"), "utf8").trim(), fingerprint);
  assert.match(readFileSync(path.join(testContext, "stage-manifest.txt"), "utf8"), /target-branch: Nightly/);
});

test("a commit subject never doubles its prefix or severs a word", () => {
  // Both defects are in git log today. The old line was
  // `chore(${scope}): ${summary}`.slice(0, 120).

  // 13 subjects on Nightly read "chore(docs): docs(tsdoc): harden ...", because
  // stage prompts legitimately produce a scoped summary and it got a second
  // prefix bolted in front.
  assert.equal(
    composeCommitSubject("docs", "docs(tsdoc): harden useClashSync interface contracts"),
    "chore(docs): harden useClashSync interface contracts",
  );
  assert.equal(composeCommitSubject("apk", "fix(apk)!: correct the wrapper"), "chore(apk): correct the wrapper");

  // Only ONE prefix is stripped: prose that happens to contain a colon must
  // survive intact.
  assert.equal(
    composeCommitSubject("database", "clean calibration pass: 0 pending migrations"),
    "chore(database): clean calibration pass: 0 pending migrations",
  );

  // 11 subjects sit exactly at the 120 cap. One reads "... migration-quality
  // PASS, fold-stat", which is "fold-state" with two characters guillotined.
  const long = composeCommitSubject(
    "database",
    "clean calibration pass: 0 pending migrations, 25 migrations examined, migration-quality PASS, fold-state CLEAN, database-verification DB-UNAVAILABLE",
  );
  assert.ok(long.length <= 120, "must respect the limit");
  assert.ok(long.endsWith("\u2026"), "a truncated subject must say so");
  assert.doesNotMatch(long, /fold-stat$/, "must not sever a word");
  assert.doesNotMatch(long, /[\s,;:.-]\u2026$/, "no dangling punctuation before the ellipsis");

  // A subject that fits is returned untouched, with no ellipsis.
  const short = composeCommitSubject("verify", "Expanded useConnectivityManager test suite");
  assert.equal(short, "chore(verify): Expanded useConnectivityManager test suite");

  // A summary that is nothing but a prefix must not produce an empty subject.
  assert.match(composeCommitSubject("docs", "docs(tsdoc):"), /docs/);
});

test("the handoff ends with the pull request description, not with scaffolding", () => {
  // Jules' publisher uses the session's LAST MESSAGE as the pull request
  // description, so whatever the handoff invites the agent to return becomes
  // public. #1657 published the scaffolding itself: its whole description on
  // GitHub reads "Suggested branch: ...", "PR body: /tmp/nightly/pr-body.md",
  // and "Do not run code review, memory, reflection, git commit, or git push."
  //
  // The marker that fixed that still failed on 5 of 13 bodies on 2026-09-03, so
  // the handoff now carries no description at all: it names the file holding
  // one. An agent cannot mis-split a document it is not given.
  const stage = { number: 4, commitScope: "optimize", branchPrefix: "nightly/stage-4-optimization-", domain: "optimization" };
  const handoff = renderHandoff(stage, "CLEAN", "Substrate hygiene audit", "abc123", "/tmp/nightly/pr-body.md");

  assert.match(handoff, /Suggested branch/);
  assert.match(handoff, /Do not run code review/);
  assert.match(handoff, /return the exact contents of \/tmp\/nightly\/pr-body\.md/);
  // No marker, so there is nothing to leak and nothing to split on.
  assert.doesNotMatch(handoff, /PULL REQUEST DESCRIPTION BELOW/);
  // And no description embedded, so returning this file cannot half-work.
  assert.doesNotMatch(handoff, /\*\*Why:\*\*/);
  assert.doesNotMatch(handoff, /\*\*What (changed|was checked):\*\*/);
  // The instruction has to say plainly that the handoff itself is not the body,
  // because publishing it is the exact failure this has now caused twice.
  assert.match(handoff, /returning it publishes the instructions instead of the description/);
});

test("the body path the handoff names is the path finalize writes", () => {
  // Two literals would silently diverge under NIGHTLY_CONTEXT_DIR, sending the
  // agent to read a file nothing had written.
  const stage = { number: 4, commitScope: "optimize", branchPrefix: "nightly/stage-4-optimization-", domain: "optimization" };
  const previous = process.env.NIGHTLY_CONTEXT_DIR;
  process.env.NIGHTLY_CONTEXT_DIR = "/tmp/nightly-alt";
  try {
    assert.equal(prBodyPath(), "/tmp/nightly-alt/pr-body.md");
    assert.match(renderHandoff(stage, "CLEAN", "audit", "abc123"), /\/tmp\/nightly-alt\/pr-body\.md/);
  } finally {
    if (previous === undefined) delete process.env.NIGHTLY_CONTEXT_DIR;
    else process.env.NIGHTLY_CONTEXT_DIR = previous;
  }
});

test("the run window is rendered from the stage's own clock, and degrades safely", () => {
  // Deliberately NOT derived from Jules' session timestamps: updateTime is
  // bulk-bumped, with 9 stages sharing one minute on 2026-08-29, which is what
  // produces the 1069.9-minute lifetimes in the ledger. Those measure how long a
  // session object lived, not how long the stage worked.
  const start = Date.UTC(2026, 8, 3, 0, 25, 0) / 1000;
  assert.equal(formatRunWindow(start, start + 47 * 60), "[00:25Z-01:12Z 47m]");
  assert.equal(formatRunWindow(start, start), "[00:25Z-00:25Z 0m]");

  // A missing or nonsensical state file must cost the metric, never the run:
  // finalize still has to produce a line.
  assert.equal(formatRunWindow(undefined, start), null);
  assert.equal(formatRunWindow(start, undefined), null);
  assert.equal(formatRunWindow(start, start - 60), null, "a clock that ran backwards yields no window");
});

test("the plain-language line reports what a reader can actually notice", () => {
  const stage = registry.stages.find(s => s.number === 6);
  const log = stage.coverageLog;

  // Tests only: the one fact a reader most wants and the fields never carry.
  assert.match(
    renderPlainSummary(stage, "CHANGED", [log, "Frontend-PWA/src/core/services/services-tests/x.spec.ts"]),
    /adds 1 test file .*No product code changed/,
  );
  // Docs only.
  assert.match(
    renderPlainSummary(stage, "CHANGED", [log, "Backend/README.md"]),
    /documentation change to 1 file .*Nothing about how the app runs is affected/,
  );
  // Dependencies only.
  assert.match(
    renderPlainSummary(stage, "CHANGED", [log, "pnpm-lock.yaml", "pnpm-workspace.yaml"]),
    /updates dependencies only\. No project code was written or changed/,
  );
  // A source file: hedged, never cleared. Stage 6 only edits comments in .ts
  // files, but the classifier can see a source file changed and cannot see that
  // the change was comments. Trusting the stage's mandate over its diff is how
  // a stage gets to certify its own safety.
  const code = renderPlainSummary(stage, "CHANGED", [log, "Frontend-PWA/src/core/services/useConnectionStatus.ts"]);
  assert.match(code, /changes 1 code file, so the app's behaviour may be affected/);
  assert.match(code, /No tests were added or changed alongside it/);
  assert.doesNotMatch(code, /behaves exactly as it did before|Nothing about how the app runs/);
});

test("a log-only run says nothing changed, and says it without jargon", () => {
  const stage = registry.stages.find(s => s.number === 10);
  const clean = renderPlainSummary(stage, "CLEAN", [stage.coverageLog]);
  assert.match(clean, /In plain terms: nothing needed fixing\./);
  assert.match(clean, /checked the APK integrity area and found it already correct/);

  // Stages 10 and 11 share the domain "apk". Using the domain made their
  // summaries byte-identical; the slug keeps them distinguishable, and the
  // shared displayArea capitalises the acronym the same way the recap does.
  const sibling = registry.stages.find(s => s.number === 11);
  assert.notEqual(clean, renderPlainSummary(sibling, "CLEAN", [sibling.coverageLog]));
  assert.match(renderPlainSummary(sibling, "CLEAN", [sibling.coverageLog]), /APK optimization area/);

  // A non-CLEAN log-only run must not be described as an all-clear.
  const partial = renderPlainSummary(stage, "PARTIAL-RUN", [stage.coverageLog]);
  assert.match(partial, /no change was made to the project.*ended as PARTIAL-RUN/);
  assert.doesNotMatch(partial, /found it already correct|nothing needed fixing/);
});

test("the CLEAN label does not claim something changed", () => {
  const stage = registry.stages.find(s => s.number === 4);
  const clean = renderPrBody(stage, "CLEAN", "audited 12 views, 0 unreferenced", [stage.coverageLog], {
    why: "scheduled hygiene audit", result: "1797 tests passed",
  });
  assert.match(clean, /\*\*What was checked:\*\* audited 12 views/);
  assert.doesNotMatch(clean, /\*\*What changed:\*\*/);

  const changed = renderPrBody(stage, "CHANGED", "dropped an unreferenced view", [stage.coverageLog, "Backend/x.sql"], {
    why: "it was dead", result: "1797 tests passed",
  });
  assert.match(changed, /\*\*What changed:\*\* dropped an unreferenced view/);
});

// The pull request body sidecar.
//
// Why and Result existed only in /tmp inside the Jules VM and reached anything
// durable only by an agent copying them into a chat message. When it ad-libbed,
// merge-nightly-core substituted placeholders and committed those into
// 00-pr-history.md as though the stage had written them: 75 of 116 Result
// fields in the committed history are that placeholder. Committing the body
// makes the record depend on data the pipeline wrote instead.
test("the sidecar path is derived from the stage's own coverage log", () => {
  for (const stage of registry.stages) {
    const sidecar = prBodySidecarPath(stage);
    assert.match(sidecar, /^\.github\/nightly-logs\/\d{2}-[a-z-]+-pr-body\.md$/, `stage ${stage.number}`);
    assert.equal(sidecar, stage.coverageLog.replace("-coverage.log", "-pr-body.md"));
  }
  // Derived rather than declared, so no stage can be configured without one.
  assert.equal(new Set(registry.stages.map(prBodySidecarPath)).size, registry.stages.length);
});

// The sidecar is removed before any rule sees it, so no safety rule is widened.
// These assert the rules still mean exactly what they meant, with the sidecar
// present in the diff.
test("the sidecar never satisfies a write-boundary rule on its own", () => {
  const stage2 = getStage(registry, 2);
  const stage5 = getStage(registry, 5);
  const stage13 = getStage(registry, 13);

  // CHANGED still demands genuine work: the sidecar must not count as it.
  assert.throws(
    () => validateChangedPaths(stage5, "CHANGED", [stage5.coverageLog, prBodySidecarPath(stage5)]),
    /CHANGED requires a non-coverage-log change/,
  );
  // Stage 2 may still only touch spec files.
  assert.throws(
    () => validateChangedPaths(stage2, "CHANGED", [stage2.coverageLog, prBodySidecarPath(stage2), "Frontend-PWA/src/x.ts"]),
    /Stage 2 may only change \*\.spec\.ts files/,
  );
  // Stage 5 may still only touch READMEs, and Stage 13 only its protocol.
  assert.throws(
    () => validateChangedPaths(stage5, "CHANGED", [stage5.coverageLog, prBodySidecarPath(stage5), "Frontend-PWA/src/x.ts"]),
    /Stage 5 may only change README\.md files/,
  );
  assert.throws(
    () => validateChangedPaths(stage13, "CHANGED", [stage13.coverageLog, prBodySidecarPath(stage13), "Frontend-PWA/src/x.ts"]),
    /Stage 13 may only update its protocol and coverage log/,
  );
});

test("a diff carrying the sidecar still passes every status it should", () => {
  const stage4 = getStage(registry, 4);
  const stage2 = getStage(registry, 2);
  const sidecar4 = prBodySidecarPath(stage4);

  // CLEAN is still log-only, and the sidecar does not break that.
  assert.doesNotThrow(() => validateChangedPaths(stage4, "CLEAN", [stage4.coverageLog, sidecar4]));
  assert.throws(
    () => validateChangedPaths(stage4, "CLEAN", [stage4.coverageLog, sidecar4, "Frontend-PWA/src/x.ts"]),
    /CLEAN contains unexpected changes/,
  );
  // SKIPPED and PARTIAL-RUN are still log-only too.
  for (const status of ["SKIPPED", "PARTIAL-RUN"]) {
    assert.doesNotThrow(() => validateChangedPaths(stage4, status, [stage4.coverageLog, sidecar4]));
  }
  // And real work still passes with the sidecar alongside it.
  assert.doesNotThrow(
    () => validateChangedPaths(stage2, "CHANGED", [stage2.coverageLog, prBodySidecarPath(stage2), "Frontend-PWA/src/a.spec.ts"]),
  );
  // The sidecar is absent from the returned paths, so callers that report the
  // diff do not show the pipeline's own bookkeeping as the stage's work.
  assert.deepEqual(validateChangedPaths(stage4, "CLEAN", [stage4.coverageLog, sidecar4]), [stage4.coverageLog]);
});
