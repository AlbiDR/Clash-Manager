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
  renderPrBody,
  replaceSentinel,
  sentinelLine,
  validateChangedPaths,
  validateRegistryData,
  composeCommitSubject,
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
  assert.match(
    body,
    /This Stage 2 Verification - Logic Integrity Auditor run focused on Added loader boundary coverage\./,
  );
  assert.match(
    body,
    /It made a small, targeted update and left the branch with verified nightly maintenance\./,
  );
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
