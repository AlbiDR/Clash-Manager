// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  budgetPhase,
  computeLockFingerprint,
  finalLogLine,
  getStage,
  needsDependencyRefresh,
  renderHandoff,
  prBodyPath,
  renderPlainSummary,
  renderPrBody,
  resolveResult,
  resolveStatus,
  workPhase,
  replaceSentinel,
  sentinelLine,
  prBodySidecarPath,
  majorWatchlistChanged,
  validateChangedPaths,
  validateRegistryData,
  composeCommitSubject,
  formatRunWindow,
  readPendingMigrations,
  readSubCheckStatuses,
  resolveVerified,
  subCheckField,
} from "./nightly-stage.mjs";
import { parseCoverageLine } from "./coverage-log-line.mjs";
import { parseVerified } from "./doc-debt.mjs";
import { extractMetadata, parseStageBranch } from "./merge-nightly-core.mjs";
import { placeholderResult } from "./nightly-prose.mjs";

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

test("a stage prompt budget is declared data, and may only ever be raised", () => {
  // Every prompt is measured against the registry default unless its own stage
  // declares otherwise, so a stage whose mandate outgrows the default widens the
  // ruler in one visible place instead of the validator growing a special case.
  assert.ok(Number.isInteger(registry.promptWordBudget) && registry.promptWordBudget > 0);
  for (const stage of registry.stages) {
    if (stage.promptWordBudget === undefined) continue;
    assert.ok(
      stage.promptWordBudget >= registry.promptWordBudget,
      `Stage ${stage.number} declares a budget below the default.`,
    );
  }

  const missingDefault = structuredClone(registry);
  delete missingDefault.promptWordBudget;
  assert.throws(() => validateRegistryData(missingDefault), /promptWordBudget must be a positive integer/);

  // The failure this guards: a prompt that will not fit passes by shrinking its
  // own limit rather than its own text.
  const lowered = structuredClone(registry);
  lowered.stages[8].promptWordBudget = registry.promptWordBudget - 1;
  assert.throws(() => validateRegistryData(lowered), /promptWordBudget must be an integer of at least/);

  const fractional = structuredClone(registry);
  fractional.stages[8].promptWordBudget = 2200.5;
  assert.throws(() => validateRegistryData(fractional), /promptWordBudget must be an integer of at least/);
});

test("every stage prompt fits the budget its own stage declares", () => {
  // The validator enforces this too, but only when someone runs `validate`. This
  // asserts it inside the suite CI actually runs on a prompt-only change.
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
  for (const stage of registry.stages) {
    const budget = stage.promptWordBudget ?? registry.promptWordBudget;
    const words = readFileSync(path.join(repoRoot, stage.prompt), "utf8")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    assert.ok(
      words <= budget,
      `Stage ${stage.number} prompt is ${words} words, over its ${budget}-word budget.`,
    );
  }
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

const watchlist = rows => [
  "## Section 2 - Major Version Watchlist",
  "| Package | Current | Latest Major | First Detected | Notes |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(row => `| ${row.join(" | ")} |`),
].join("\n");

test("Stage 8 log-only CHANGED needs an actual watchlist entry delta", () => {
  const stage8 = getStage(registry, 8);
  const before = watchlist([["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"]]);
  assert.equal(majorWatchlistChanged("legacy coverage history without a structured watchlist", before), true, "the first valid structured watchlist is an actual addition");
  assert.equal(majorWatchlistChanged(before, `${watchlist([["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"]])}\n* [2026-08-08] [Stage 8] IN-PROGRESS: audit`), false);
  assert.equal(majorWatchlistChanged(before, watchlist([
    ["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"],
    ["vite", "^7.0.0", "8.0.0", "2026-08-08", "Rolldown migration"],
  ])), true, "a new entry is substantive");
  assert.equal(majorWatchlistChanged(before, [
    "## Section 2 - Major Version Watchlist",
    "| Package       | Current  | Latest Major | First Detected | Notes                                      |",
    "| express       | ^4.18.2  | 5.2.1        | 2026-03-14     | Breaking: route matching, async error flow |",
  ].join("\n")), true, "the exact prompt example remains accepted without a separator row");
  assert.equal(majorWatchlistChanged(before, watchlist([["vue", "^3.5.0", "4.0.0", "2026-08-01", "Reviewed incompatibility"]])), true, "an entry update is substantive");
  assert.equal(majorWatchlistChanged(before, watchlist([])), true, "an entry removal is visible");
  assert.throws(() => majorWatchlistChanged(before, "coverage metadata without a watchlist"), /missing its Major Version Watchlist section/);
  assert.throws(() => majorWatchlistChanged("## Major Version Watchlists\nlegacy entries", before), /malformed Major Version Watchlist heading/);
  assert.throws(() => majorWatchlistChanged("## Major Version Watchlist\n| Package | Current | Latest | |\n", before), /unsupported header/);
  assert.throws(() => majorWatchlistChanged(before, `${watchlist([["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"]])}\n| malformed | row |`), /malformed row/);
  assert.throws(() => majorWatchlistChanged(before, [
    "## Section 2 - Major Version Watchlist",
    "| Package | Current | Latest Major | First Detected | Notes |",
    "| ---- | not-a-separator | ---- | ---- | ---- |",
    "| vue | ^3.5.0 | 4.0.0 | 2026-08-01 | Breaking API changes |",
  ].join("\n")), /malformed separator row/);
  assert.throws(() => validateChangedPaths(stage8, "CHANGED", [stage8.coverageLog]), /actual Major Version Watchlist entry delta/);
  assert.doesNotThrow(() => validateChangedPaths(stage8, "CHANGED", [stage8.coverageLog], { watchlistChanged: true }));
  assert.doesNotThrow(() => validateChangedPaths(stage8, "CHANGED", [stage8.coverageLog, "pnpm-lock.yaml"]));
});

test("real Stage 8 finalize compares watchlist entries with its recorded execution base", t => {
  const repoRoot = createTemporaryRepo();
  const testContext = mkdtempSync(path.join(os.tmpdir(), "nightly-stage8-finalize-context-test-"));
  t.after(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(testContext, { recursive: true, force: true });
  });
  const stage8 = getStage(registry, 8);
  const logPath = path.join(repoRoot, stage8.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const baseLog = `${watchlist([["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"]])}\n`;
  writeFileSync(logPath, baseLog);
  assert.equal(run("git", ["add", stage8.coverageLog], repoRoot).status, 0);
  assert.equal(run("git", ["commit", "-m", "test: seed Stage 8 watchlist"], repoRoot).status, 0);
  const executionRevision = run("git", ["rev-parse", "HEAD"], repoRoot).stdout.trim();
  const sentinel = `${sentinelLine("2026-08-08", 8)}\n`;
  const changedLog = `${watchlist([
    ["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"],
    ["vite", "^7.0.0", "8.0.0", "2026-08-08", "Rolldown migration"],
  ])}\n${sentinel}`;
  writeFileSync(logPath, changedLog);
  writeFileSync(path.join(repoRoot, prBodySidecarPath(stage8)), "previous generated body\n");
  mkdirSync(testContext, { recursive: true });
  writeFileSync(path.join(testContext, "session-state.json"), `${JSON.stringify({ stage: 8, executionRevision, startEpoch: 900, runId: "test", cycleId: "nightly-cycle/2026-08-08" })}\n`);
  writeFileSync(path.join(testContext, "TODAY"), "2026-08-08\n");
  const outcome = run(process.execPath, [scriptPath, "finalize", "--stage", "8", "--status", "CHANGED", "--summary", "Added a major watchlist entry", "--result", "Validated the new major version entry"], repoRoot, {
    NIGHTLY_CONTEXT_DIR: testContext,
    NIGHTLY_TODAY: "2026-08-08",
    NIGHTLY_NOW_EPOCH: "1000",
  });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.match(readFileSync(logPath, "utf8"), /CHANGED: Codebase -- Added a major watchlist entry/);
});

test("real Stage 8 finalize rejects reworded progress metadata without a watchlist delta", t => {
  const repoRoot = createTemporaryRepo();
  const testContext = mkdtempSync(path.join(os.tmpdir(), "nightly-stage8-progress-context-test-"));
  t.after(() => {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(testContext, { recursive: true, force: true });
  });
  const stage8 = getStage(registry, 8);
  const logPath = path.join(repoRoot, stage8.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const row = ["vue", "^3.5.0", "4.0.0", "2026-08-01", "Breaking API changes"];
  writeFileSync(logPath, `* [2026-08-01] [Stage 8] CLEAN: old progress text\n\n${watchlist([row])}\n`);
  assert.equal(run("git", ["add", stage8.coverageLog], repoRoot).status, 0);
  assert.equal(run("git", ["commit", "-m", "test: seed Stage 8 progress log"], repoRoot).status, 0);
  const executionRevision = run("git", ["rev-parse", "HEAD"], repoRoot).stdout.trim();
  writeFileSync(logPath, `* [2026-08-01] [Stage 8] CLEAN: reworded progress metadata\n\n${watchlist([row])}\n${sentinelLine("2026-08-08", 8)}\n`);
  mkdirSync(testContext, { recursive: true });
  writeFileSync(path.join(testContext, "session-state.json"), `${JSON.stringify({ stage: 8, executionRevision, startEpoch: 900 })}\n`);
  writeFileSync(path.join(testContext, "TODAY"), "2026-08-08\n");
  const outcome = run(process.execPath, [scriptPath, "finalize", "--stage", "8", "--status", "CHANGED", "--summary", "Updated audit progress wording", "--result", "The audit remains in progress"], repoRoot, {
    NIGHTLY_CONTEXT_DIR: testContext,
    NIGHTLY_TODAY: "2026-08-08",
    NIGHTLY_NOW_EPOCH: "1000",
  });
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /actual Major Version Watchlist entry delta/);
  assert.doesNotMatch(readFileSync(logPath, "utf8"), /\[2026-08-08\] \[Stage 8\] CHANGED:/);
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
    // renderPrBody was called without a nudge count here, so the field is
    // absent rather than zero. Absence is ignorance, never innocence.
    nudges: null,
    execution: null,
    // Rendered as "unrecorded" with no cycle id, which is an absence.
    cycle: null,
  });

  // The cycle the stage runner writes is the one the merge coordinator files
  // its tag under, so it has to survive this round trip exactly.
  const withCycle = renderPrBody(stage, "CHANGED", "Added loader boundary coverage", [stage.coverageLog], {
    why: "The loader path lacked regression coverage.",
    result: "The focused spec passed and guards the failure boundary.",
    cycleId: "nightly-cycle/2026-10-04",
  });
  assert.equal(extractMetadata({ body: withCycle, title: "Verification run" }).cycle, "nightly-cycle/2026-10-04");

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
  assert.match(prBody, /  Cycle: nightly-cycle\/2026-08-08/);
  assert.match(prBody, /  Contract: [a-f0-9]{64}/);
  assert.match(prBody, /\*\*Why:\*\* The selected verification slice already covered the audited behavior\./);
  assert.match(prBody, /\*\*Result:\*\* No source change was required after the focused audit\./);
  // No session state was written by this path, so the refusal count is UNKNOWN
  // and the field must be absent. Emitting "Nudges: 0" here would assert that
  // the guard never had to fire, on a run that never looked.
  assert.doesNotMatch(prBody, /Nudges:/);
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
  assert.equal(state.cycleId, "nightly-cycle/2026-08-08");
  assert.match(state.contractFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(state.executionRevision, run("git", ["rev-parse", "HEAD"], repoRoot).stdout.trim());
  assert.equal(state.dependencyRefresh, "not-required");
  assert.equal(state.contextRefresh, "current");
  assert.equal(readFileSync(path.join(testContext, "active-lock.sha256"), "utf8").trim(), fingerprint);
  const manifest = readFileSync(path.join(testContext, "stage-manifest.txt"), "utf8");
  assert.match(manifest, /target-branch: Nightly/);
  assert.match(manifest, /cycle-id: nightly-cycle\/2026-08-08/);
  assert.match(manifest, new RegExp(`execution-revision: ${state.executionRevision}`));
  assert.match(manifest, new RegExp(`contract-fingerprint: ${state.contractFingerprint}`));
  const contract = JSON.parse(readFileSync(path.join(testContext, "stage-contract.json"), "utf8"));
  assert.equal(contract.stage, 13);
  assert.equal(contract.cycleId, state.cycleId);
  assert.equal(contract.fingerprint, state.contractFingerprint);
  assert.deepEqual(contract.contract, getStage(registry, 13).contract);
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


// The budget signal the evidence guard rides on. Both callers fail toward
// SUBMIT, because the only thing worse than a thin result is no pull request.
test("the work phase falls back to SUBMIT whenever the budget is unreadable", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(workPhase(undefined), "SUBMIT");
  assert.equal(workPhase({}), "SUBMIT");
  assert.equal(workPhase({ startEpoch: now }), "SUBMIT", "a start with no deadline says nothing");
  assert.equal(workPhase({ startEpoch: now, workDeadlineEpoch: now }), "SUBMIT", "a zero-length budget is over");
  assert.equal(workPhase({ startEpoch: now - 60, workDeadlineEpoch: now + 1800 }), "WORK");
  assert.equal(workPhase({ startEpoch: now - 3600, workDeadlineEpoch: now - 900 }), "SUBMIT");
});

// Every spelling a stage actually published, so trimming this back cannot
// quietly restore the defect. Length-checked at the top of the test below,
// because a loop over an empty array passes in silence.
const REFUSABLE_VERDICTS = ["PASSED", "PASS", "OK", "CLEAN"];

// The prevention half. This is the only moment in the pipeline where the agent
// that owns the evidence is still running, so it is the only place a better
// result can still be asked for rather than merely reported as missing.
test("a bare verdict is refused while the stage still has budget to fix it", () => {
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };

  assert.ok(REFUSABLE_VERDICTS.length > 0, "an empty corpus makes this loop assert nothing");
  for (const verdict of REFUSABLE_VERDICTS) {
    assert.throws(
      () => resolveResult(verdict, "CHANGED", working),
      error => {
        // A guard an agent cannot satisfy is a slower way to fail, so the
        // message has to carry the offending value and a shape that would pass.
        assert.match(error.message, new RegExp(verdict));
        assert.match(error.message, /--result/);
        assert.match(error.message, /pnpm audit:version reported 0 drift lines/);
        return true;
      },
      `${verdict} was accepted as a result`,
    );
  }
});

// The safety-valve half, and the reason this can never cost a run its pull
// request. Past the budget the same input is downgraded rather than refused:
// the placeholder is a string every reader already recognises, so the result
// is reported as absent instead of printed as evidence.
test("a bare verdict past the budget is downgraded, never blocked", () => {
  const now = Math.floor(Date.now() / 1000);
  const spent = { startEpoch: now - 3600, workDeadlineEpoch: now - 900 };
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(String(message));
  try {
    assert.equal(resolveResult("PASSED", "CHANGED", spent), placeholderResult("CHANGED"));
    assert.equal(resolveResult("PASS", "CLEAN", spent), placeholderResult("CLEAN"));
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 2, "a downgrade must say so out loud");
  assert.match(errors[0], /verdict with no evidence/);
});

// The path that must stay completely untouched: a stage that stated real
// evidence is handed straight through, whatever the budget says.
test("a stated result is never touched by the evidence guard", () => {
  const now = Math.floor(Date.now() / 1000);
  const stated = "Vitest StorageService.spec.ts passed 7 of 7 tests, depcruise 0 violations";
  const budgets = [
    { startEpoch: now - 60, workDeadlineEpoch: now + 1800 },
    { startEpoch: now - 3600, workDeadlineEpoch: now - 900 },
    {},
  ];
  assert.ok(budgets.length > 0, "an empty corpus makes this loop assert nothing");
  for (const state of budgets) {
    assert.equal(resolveResult(stated, "CHANGED", state), stated);
  }
  // Whitespace normalisation still applies; only the evidence rule is new.
  assert.equal(resolveResult("  0   drift   lines  ", "CLEAN", {}), "0 drift lines");
});

// Omitting --result entirely is still allowed and still yields the placeholder.
// The guard exists to stop a verdict MASQUERADING as evidence, not to force a
// stage that genuinely has nothing to say into inventing something.
test("an omitted result still falls back to the placeholder", () => {
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  assert.equal(resolveResult(undefined, "CLEAN", working), placeholderResult("CLEAN"));
  assert.equal(resolveResult("", "CHANGED", working), placeholderResult("CHANGED"));
});


// The bound that makes the refusal safe, and the reason it is one nudge and not
// a rule. finalize writes the coverage line, the sidecar and the body, so a
// refusal that repeats does not give the stage a weaker description, it costs
// the stage its whole night and leaves the watchdog nothing to recover. That is
// strictly worse than the defect being fixed. Raised by a peer session against
// the first version of this guard, which had no bound.
test("a stage is asked for evidence once, never twice", () => {
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  const refusals = [];
  const record = () => refusals.push(true);

  assert.throws(() => resolveResult("PASSED", "CHANGED", working, record));
  assert.equal(refusals.length, 1, "the refusal must be recorded, or the next call repeats it");

  // The state the recorded refusal produces. Every later call is accepted.
  const asked = { ...working, resultRefused: true };
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(String(message));
  try {
    assert.equal(resolveResult("PASSED", "CHANGED", asked, record), placeholderResult("CHANGED"));
    assert.equal(resolveResult("PASS", "PARTIAL-RUN", asked, record), placeholderResult("PARTIAL-RUN"));
  } finally {
    console.error = originalError;
  }
  assert.equal(refusals.length, 1, "a second refusal was recorded");
  assert.match(errors[0], /already asked once/);
});

// A stage that took the nudge is not punished for having needed it: real
// evidence on the second call is published as the stage's own words.
test("evidence offered after a refusal is accepted in full", () => {
  const now = Math.floor(Date.now() / 1000);
  const asked = { startEpoch: now - 60, workDeadlineEpoch: now + 1800, resultRefused: true };
  const stated = "pnpm audit:version reported 0 drift lines across 3 manifests";
  assert.equal(resolveResult(stated, "CLEAN", asked), stated);
});

// --- resolveStatus: Stage 3's own "FAIL cannot finalize CLEAN" rule, enforced ---
//
// Stage 3 finalized CLEAN over a self-reported migration-quality FAIL on
// 2026-09-07 and again on 2026-09-17 (.github/nightly-logs/
// 03-baseline-consolidation-coverage.log), even though its own prompt
// (03-baseline-consolidation.md, "CLEAN Evidence Floor") already forbids it.
// The prompt was never mechanically enforced; this closes that gap using the
// same one-shot-refusal shape as resolveResult, above.

test("Stage 3 CLEAN is refused while migration-quality reads FAIL and budget remains", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  assert.throws(
    () => resolveStatus("CLEAN", stage, working, "FAIL"),
    error => {
      assert.match(error.message, /--status CLEAN cannot stand/);
      assert.match(error.message, /PARTIAL-RUN/);
      return true;
    },
  );
});

test("a FAILing migration-quality status does not touch any other stage or status", () => {
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  assert.equal(resolveStatus("CLEAN", getStage(registry, 4), working, "FAIL"), "CLEAN");
  assert.equal(resolveStatus("CHANGED", getStage(registry, 3), working, "FAIL"), "CHANGED");
  assert.equal(resolveStatus("CLEAN", getStage(registry, 3), working, "PASS"), "CLEAN");
  assert.equal(resolveStatus("CLEAN", getStage(registry, 3), working, "DEGRADED"), "CLEAN");
  assert.equal(resolveStatus("CLEAN", getStage(registry, 3), working, ""), "CLEAN");
});

test("past the budget, a FAILing CLEAN is downgraded rather than blocked", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const spent = { startEpoch: now - 3600, workDeadlineEpoch: now - 900 };
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(String(message));
  try {
    assert.equal(resolveStatus("CLEAN", stage, spent, "FAIL"), "PARTIAL-RUN");
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1, "a downgrade must say so out loud");
  assert.match(errors[0], /migration-quality-status\.txt reads FAIL/);
});

test("Stage 3 is asked once, never twice, for the same FAILing CLEAN", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  const refusals = [];
  const record = () => refusals.push(true);

  assert.throws(() => resolveStatus("CLEAN", stage, working, "FAIL", record));
  assert.equal(refusals.length, 1);

  const asked = { ...working, statusRefused: true };
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(String(message));
  try {
    assert.equal(resolveStatus("CLEAN", stage, asked, "FAIL", record), "PARTIAL-RUN");
  } finally {
    console.error = originalError;
  }
  assert.equal(refusals.length, 1, "a second refusal was recorded");
  assert.match(errors[0], /already asked once/);
});

// --- resolveStatus: fold-state PENDING cannot finalize a Stage 3 CLEAN ---
//
// On 2026-10-04 (v14.50.138) fold-state.mjs stopped hiding unfolded migrations
// behind DEGRADED, and on 2026-10-05 Stage 3 read 22 of them, folded none, and
// finalized CLEAN. This is that night's committed record, byte for byte, from
// .github/nightly-logs/03-baseline-consolidation-coverage.log on origin/Nightly,
// with the finalize arguments that wrote it (--why and --result are from the
// same night's PR body sidecar, commit f9ccf7792). finalize accepted it and the
// recap graded it clean. Wherever the input matters, the tests below replay
// that night rather than an invented one, so the refusal is proven against the
// input that actually got through.
const REAL_2026_10_05_LINE = "* [2026-10-05] [Stage 3] [01:06Z-01:27Z 22m] [checks database-verification=DB-UNAVAILABLE fold-state=PENDING migration-quality=PASS] CLEAN: Codebase -- Completed read-only baseline consolidation audit. Pending migrations count: 22 (fold-state status: PENDING). Migration quality: PASS. Database verification: DB-UNAVAILABLE. Clean calibration streak: 10.";
const NIGHT_2026_10_05 = {
  date: "2026-10-05",
  // The line's own window. Its seconds were not recorded, so these are any
  // pair that reproduces it: 01:06:00 to 01:27:45 is a 21.75-minute run,
  // which formatRunWindow rounds to the 22m the line records.
  startEpoch: Date.UTC(2026, 9, 5, 1, 6, 0) / 1000,
  finalizeEpoch: Date.UTC(2026, 9, 5, 1, 27, 45) / 1000,
  summary: "Completed read-only baseline consolidation audit. Pending migrations count: 22 (fold-state status: PENDING). Migration quality: PASS. Database verification: DB-UNAVAILABLE. Clean calibration streak: 10.",
  why: "Read-only audit verified master migration baseline. Migration quality PASS.",
  result: "Static audit PASS; database verification DB-UNAVAILABLE.",
  statuses: { "database-verification": "DB-UNAVAILABLE", "fold-state": "PENDING", "migration-quality": "PASS" },
};

// The pending list itself was not committed, only its length, so the count is
// taken from the stage's own summary and the names are stand-ins in the same
// timestamp-prefixed, chronologically sorted shape the context script writes.
function pendingOf2026_10_05() {
  const count = Number(/Pending migrations count: (\d+)/.exec(NIGHT_2026_10_05.summary)?.[1]);
  assert.ok(Number.isInteger(count) && count > 0, "the replayed summary no longer states a pending count");
  return Array.from({ length: count }, (_, index) => `202606${String(index + 1).padStart(2, "0")}000000_unfolded.sql`);
}

// The session state `start` would have written that night: the work deadline
// comes from the registry's own workBudgetMinutes, exactly as startCommand
// derives it, so a budget change moves this test with it.
function stateOf2026_10_05(extra = {}) {
  const { startEpoch } = NIGHT_2026_10_05;
  return { stage: 3, startEpoch, workDeadlineEpoch: startEpoch + registry.workBudgetMinutes * 60, ...extra };
}

function readingsOf2026_10_05() {
  return {
    migrationQuality: NIGHT_2026_10_05.statuses["migration-quality"],
    foldState: NIGHT_2026_10_05.statuses["fold-state"],
    pendingMigrations: pendingOf2026_10_05(),
  };
}

// workPhase reads the clock through NIGHTLY_NOW_EPOCH, so replaying the night
// means pinning that, and restoring it whatever the assertion does.
function atEpoch(epoch, body) {
  const previous = process.env.NIGHTLY_NOW_EPOCH;
  process.env.NIGHTLY_NOW_EPOCH = String(epoch);
  try {
    return body();
  } finally {
    if (previous === undefined) delete process.env.NIGHTLY_NOW_EPOCH;
    else process.env.NIGHTLY_NOW_EPOCH = previous;
  }
}

function capturingErrors(body) {
  const errors = [];
  const originalError = console.error;
  console.error = message => errors.push(String(message));
  try {
    return { value: body(), errors };
  } finally {
    console.error = originalError;
  }
}

test("the 2026-10-05 Stage 3 CLEAN over fold-state PENDING is refused, with the way to fold instead", () => {
  const stage = getStage(registry, 3);
  const state = stateOf2026_10_05();
  const readings = readingsOf2026_10_05();
  const pending = readings.pendingMigrations;
  const { finalizeEpoch } = NIGHT_2026_10_05;
  const refusals = [];

  atEpoch(finalizeEpoch, () => {
    // Without this the test could pass by replaying the night past its
    // deadline, which would exercise the downgrade instead of the refusal.
    assert.equal(workPhase(state), "WORK", "the real night still had budget when it finalized");
    assert.throws(
      () => resolveStatus("CLEAN", stage, state, readings, () => refusals.push(true)),
      error => {
        assert.match(error.message, /^--status CLEAN cannot stand: fold-state-status\.txt reads PENDING\.\n/);
        assert.ok(error.message.includes(`found ${pending.length} migration(s)`), "the refusal must carry the real pending count");
        assert.ok(error.message.includes(`The oldest is ${pending[0]}.`), "the refusal must name where to start");
        const minutesLeft = Math.floor((state.workDeadlineEpoch - finalizeEpoch) / 60);
        assert.ok(error.message.includes(`${minutesLeft} minutes of this session's work budget remain`));
        // Both ways out, and the one the 2026-10-06 FAILED session needed:
        // a partial fold is a complete night's work.
        assert.match(error.message, /fold the OLDEST pending migrations first/);
        assert.match(error.message, /--status CHANGED/);
        assert.match(error.message, /A partial fold is a valid CHANGED/);
        assert.match(error.message, /tomorrow's work/);
        assert.ok(error.message.includes(`--status PARTIAL-RUN --result "fold-state PENDING: ${pending.length} migrations still unfolded`));
        // migration-quality read PASS that night, so it must not be blamed.
        assert.doesNotMatch(error.message, /migration-quality/);
        return true;
      },
    );
  });
  assert.equal(refusals.length, 1, "the refusal must be recorded, or the next call repeats it");
});

test("the second CLEAN of that session is recorded as PARTIAL-RUN, never refused again", () => {
  const stage = getStage(registry, 3);
  const refusals = [];
  const asked = stateOf2026_10_05({ statusRefused: true });
  const { value, errors } = atEpoch(NIGHT_2026_10_05.finalizeEpoch, () => capturingErrors(
    () => resolveStatus("CLEAN", stage, asked, readingsOf2026_10_05(), () => refusals.push(true)),
  ));
  assert.equal(value, "PARTIAL-RUN");
  assert.equal(refusals.length, 0, "a second refusal was recorded");
  assert.equal(errors.length, 1, "a downgrade must say so out loud");
  assert.match(errors[0], /fold-state-status\.txt reads PENDING/);
  assert.match(errors[0], /already asked once/);
});

test("once the budget says SUBMIT, a PENDING CLEAN is downgraded at once and spends no refusal", () => {
  const stage = getStage(registry, 3);
  const state = stateOf2026_10_05();
  const refusals = [];
  // The deadline itself is SUBMIT (budgetPhase uses >=), so this is the first
  // second the escape applies, read from the session's own deadline.
  const { value, errors } = atEpoch(state.workDeadlineEpoch, () => {
    assert.equal(workPhase(state), "SUBMIT");
    return capturingErrors(() => resolveStatus("CLEAN", stage, state, readingsOf2026_10_05(), () => refusals.push(true)));
  });
  assert.equal(value, "PARTIAL-RUN");
  assert.equal(refusals.length, 0, "a refusal was spent past the budget");
  assert.match(errors[0], /fold-state-status\.txt reads PENDING/);
  assert.match(errors[0], /work budget has ended/);

  // Unreadable session state is SUBMIT too (workPhase), so a stage whose state
  // file is gone is never blocked by this guard either.
  const blind = capturingErrors(() => resolveStatus("CLEAN", stage, {}, readingsOf2026_10_05(), () => refusals.push(true)));
  assert.equal(blind.value, "PARTIAL-RUN");
  assert.equal(refusals.length, 0);
});

// The legitimate answers to a PENDING night. The guard exists to stop a false
// CLEAN, so a stage that folded (CHANGED, partial or not) or that honestly ran
// out of time must pass straight through, every night the backlog lasts.
test("a stage that folds, or says it could not, is never refused over PENDING", () => {
  const stage = getStage(registry, 3);
  const state = stateOf2026_10_05();
  const honest = ["CHANGED", "PARTIAL-RUN", "SKIPPED"];
  assert.ok(honest.length > 0, "an empty corpus makes this loop assert nothing");
  atEpoch(NIGHT_2026_10_05.finalizeEpoch, () => {
    for (const status of honest) {
      assert.equal(
        resolveStatus(status, stage, state, readingsOf2026_10_05(), () => assert.fail(`${status} spent a refusal`)),
        status,
      );
    }
  });
});

test("fold-state PENDING binds Stage 3 alone", () => {
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  const others = registry.stages.filter(stage => stage.number !== 3);
  assert.ok(others.length > 0, "an empty corpus makes this loop assert nothing");
  for (const stage of others) {
    assert.equal(
      resolveStatus("CLEAN", stage, working, readingsOf2026_10_05(), () => assert.fail(`Stage ${stage.number} spent a refusal`)),
      "CLEAN",
    );
  }
});

// The missing-input direction, answered on purpose. Accepting is the safe way
// to fail here: a throw at finalize on the nights the context script broke
// would cost Stage 3 its output exactly when it has least evidence. And it is
// not silent: finalize builds the coverage line's [checks ...] field from the
// same statuses this guard reads, so a missing fold-state is a line with no
// `fold-state=` entry, which the recap's blind-spot reader reports as a check
// nobody reported, never as one that ran clean.
test("a missing, empty or non-PENDING fold-state reading never refuses a CLEAN", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  const neverRefused = () => assert.fail("a refusal was spent without a PENDING reading");
  const readings = [undefined, null, "", "CLEAN", "DEGRADED", "SKIPPED"];
  assert.ok(readings.length > 0, "an empty corpus makes this loop assert nothing");
  for (const foldState of readings) {
    assert.equal(
      resolveStatus("CLEAN", stage, working, { migrationQuality: "PASS", foldState }, neverRefused),
      "CLEAN",
      `fold-state ${JSON.stringify(foldState)} refused a CLEAN`,
    );
  }
  assert.equal(resolveStatus("CLEAN", stage, working, {}, neverRefused), "CLEAN");
  // Under DEGRADED the context script fills the pending list from a filename
  // heuristic, so the list alone is never evidence of unfolded work.
  assert.equal(
    resolveStatus("CLEAN", stage, working, { foldState: "DEGRADED", pendingMigrations: pendingOf2026_10_05() }, neverRefused),
    "CLEAN",
  );
});

test("a PENDING reading with no readable pending list still refuses, and never calls the count 0", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  assert.throws(
    () => resolveStatus("CLEAN", stage, working, { migrationQuality: "PASS", foldState: "PENDING" }),
    error => {
      assert.match(error.message, /found <N> migration\(s\)/);
      assert.doesNotMatch(error.message, /found 0 /);
      assert.doesNotMatch(error.message, /The oldest is/);
      return true;
    },
  );
});

// A stage can hit both readings at once. It is still asked exactly once, the
// one refusal names both, and a FAIL does not take folding away: the prompt
// bars a CLEAN and any edit to an incremental migration on a FAIL night, and a
// fold is neither, so CHANGED stays open as long as the FAIL is named.
test("a FAIL and a PENDING together cost one refusal, which names both and still allows a fold", () => {
  const stage = getStage(registry, 3);
  const state = stateOf2026_10_05();
  const readings = { ...readingsOf2026_10_05(), migrationQuality: "FAIL" };
  const refusals = [];
  atEpoch(NIGHT_2026_10_05.finalizeEpoch, () => {
    assert.throws(
      () => resolveStatus("CLEAN", stage, state, readings, () => refusals.push(true)),
      error => {
        assert.match(error.message, /^--status CLEAN cannot stand: migration-quality-status\.txt reads FAIL and fold-state-status\.txt reads PENDING\.\n/);
        assert.match(error.message, /migration-quality also reads FAIL/);
        assert.match(error.message, /--status CHANGED/);
        return true;
      },
    );
    assert.equal(refusals.length, 1);
    const { value, errors } = capturingErrors(
      () => resolveStatus("CLEAN", stage, { ...state, statusRefused: true }, readings, () => refusals.push(true)),
    );
    assert.equal(value, "PARTIAL-RUN");
    assert.match(errors[0], /migration-quality-status\.txt reads FAIL and fold-state-status\.txt reads PENDING/);
  });
  assert.equal(refusals.length, 1, "two readings bought two refusals");
});

// Why the refusal flag is shared rather than one per reading: the bound owed
// to the chokepoint is one --status refusal per session whatever the inputs
// do. A session refused for FAIL whose fold-state then reads PENDING (its
// context files regenerated between calls) must be downgraded, not asked again.
test("a session already refused once is never refused again, whichever reading turned on", () => {
  const stage = getStage(registry, 3);
  let state = stateOf2026_10_05();
  const refusals = [];
  const record = () => {
    refusals.push(true);
    state = { ...state, statusRefused: true };
  };
  atEpoch(NIGHT_2026_10_05.finalizeEpoch, () => {
    assert.throws(() => resolveStatus("CLEAN", stage, state, { migrationQuality: "FAIL", foldState: "CLEAN" }, record));
    const { value } = capturingErrors(() => resolveStatus("CLEAN", stage, state, readingsOf2026_10_05(), record));
    assert.equal(value, "PARTIAL-RUN");
  });
  assert.equal(refusals.length, 1, "a second refusal was recorded for a different reading");
});

// The original single-check signature still means exactly what it meant: the
// object form and the bare string agree on every migration-quality value, down
// to the bytes of the FAIL refusal, so no existing caller changed behaviour.
test("the object form agrees with the original string form on migration-quality", () => {
  const stage = getStage(registry, 3);
  const now = Math.floor(Date.now() / 1000);
  const working = { startEpoch: now - 60, workDeadlineEpoch: now + 1800 };
  const outcome = readings => {
    try {
      return { status: resolveStatus("CLEAN", stage, working, readings) };
    } catch (error) {
      return { refusal: error.message };
    }
  };
  const values = ["FAIL", "PASS", "DEGRADED", ""];
  assert.ok(values.length > 0, "an empty corpus makes this loop assert nothing");
  for (const value of values) {
    assert.deepEqual(outcome({ migrationQuality: value }), outcome(value), `migration-quality ${value} diverged`);
  }
  assert.ok(outcome("FAIL").refusal, "FAIL must still refuse");
});

test("readPendingMigrations keeps the file's order and never throws", t => {
  const dir = temporaryContext(t);
  assert.deepEqual(readPendingMigrations(dir), [], "a missing list reads as empty, never as a throw");
  writeFileSync(path.join(dir, "pending-migrations.txt"), "20260601000000_a.sql\n\n  20260602000000_b.sql  \n");
  assert.deepEqual(readPendingMigrations(dir), ["20260601000000_a.sql", "20260602000000_b.sql"]);

  const odd = temporaryContext(t);
  mkdirSync(path.join(odd, "pending-migrations.txt"));
  assert.deepEqual(readPendingMigrations(odd), [], "an unreadable list reads as empty, never as a throw");
});

// The whole defect end to end, through the real CLI: the exact 2026-10-05
// finalize call, replayed twice in a disposable repository with that night's
// context files. The first call must refuse and leave the sentinel for the
// retry; the second must publish, and what it writes must be that night's line
// with only its status corrected. Before this guard the first call wrote
// REAL_2026_10_05_LINE verbatim.
test("replaying the 2026-10-05 Stage 3 finalize can no longer write that night's CLEAN line", t => {
  const repoRoot = createTemporaryRepo();
  const testContext = temporaryContext(t);
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const stage = getStage(registry, 3);
  const night = NIGHT_2026_10_05;

  for (const [name, value] of Object.entries(night.statuses)) {
    writeFileSync(path.join(testContext, `${name}-status.txt`), `${value}\n`);
  }
  writeFileSync(path.join(testContext, "pending-migrations.txt"), `${pendingOf2026_10_05().join("\n")}\n`);
  writeFileSync(path.join(testContext, "TODAY"), `${night.date}\n`);
  const statePath = path.join(testContext, "session-state.json");
  writeFileSync(statePath, `${JSON.stringify(stateOf2026_10_05({ cycleId: `nightly-cycle/${night.date}` }), null, 2)}\n`);
  const logPath = path.join(repoRoot, stage.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const sentinel = `${sentinelLine(night.date, 3)}\n`;
  writeFileSync(logPath, sentinel);

  const env = { NIGHTLY_CONTEXT_DIR: testContext, NIGHTLY_TODAY: night.date, NIGHTLY_NOW_EPOCH: String(night.finalizeEpoch) };
  const args = [
    scriptPath, "finalize", "--stage", "3", "--status", "CLEAN",
    "--summary", night.summary, "--why", night.why, "--result", night.result,
  ];

  const refused = run(process.execPath, args, repoRoot, env);
  assert.notEqual(refused.status, 0, "the 2026-10-05 CLEAN was accepted again");
  assert.match(refused.stderr, /fold-state-status\.txt reads PENDING/);
  assert.equal(readFileSync(logPath, "utf8"), sentinel, "a refused finalize must leave the sentinel for the retry");
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).statusRefused, true, "the refusal must be recorded before the throw");

  const published = run(process.execPath, args, repoRoot, env);
  assert.equal(published.status, 0, published.stderr);
  assert.match(published.stderr, /already asked once/);
  const log = readFileSync(logPath, "utf8");
  assert.ok(!log.includes(REAL_2026_10_05_LINE), "the 2026-10-05 CLEAN line was written");
  assert.equal(log, `${REAL_2026_10_05_LINE.replace("] CLEAN: Codebase -- ", "] PARTIAL-RUN: Codebase -- ")}\n`);
  assert.match(readFileSync(path.join(testContext, "pr-body.md"), "utf8"), /\*\*Status:\*\* PARTIAL-RUN/);
});


// The emission contract, in isolation from finalize.
//
// The field is a COUNT and it is ABSENT when unmeasured, and both halves are
// load-bearing. A boolean would make a broken emitter's "false" identical to a
// genuine "the guard never fired", which is the happy answer, so the
// measurement failing would read as success. A defaulted 0 does the same.
const EMITTED_COUNTS = [0, 1, 2];
const UNMEASURED_VALUES = [undefined, null, "1", 1.5, -1, NaN, "", "yes"];

test("a measured refusal count is emitted, and only a measured one", () => {
  const stage = getStage(registry, 2);
  const paths = [stage.coverageLog, "Frontend-PWA/src/example.spec.ts"];
  const details = { why: "A reason.", result: "Vitest passed 7 of 7." };

  assert.ok(EMITTED_COUNTS.length > 0, "an empty corpus makes this loop assert nothing");
  for (const nudges of EMITTED_COUNTS) {
    const body = renderPrBody(stage, "CHANGED", "Added coverage", paths, { ...details, nudges });
    assert.match(body, new RegExp(`^  Nudges: ${nudges}$`, "m"), `count ${nudges} was not emitted`);
  }

  // Anything that is not a plain integer count is not a measurement, and a
  // non-measurement must leave no field rather than a defaulted one.
  assert.ok(UNMEASURED_VALUES.length > 0, "an empty corpus makes this loop assert nothing");
  for (const nudges of UNMEASURED_VALUES) {
    const body = renderPrBody(stage, "CHANGED", "Added coverage", paths, { ...details, nudges });
    assert.doesNotMatch(body, /Nudges:/, `${JSON.stringify(String(nudges))} was emitted as a count`);
  }

  // The watchdog reconstructs bodies with no details at all. It did not measure
  // this and must not appear to have.
  assert.doesNotMatch(renderPrBody(stage, "CLEAN", "Audited", [stage.coverageLog]), /Nudges:/);
});

// The count must not disturb anything a reader already depends on.
test("emitting the refusal count leaves the rest of the body identical", () => {
  const stage = getStage(registry, 2);
  const paths = [stage.coverageLog];
  const details = { why: "A reason.", result: "Vitest passed 7 of 7." };
  const without = renderPrBody(stage, "CLEAN", "Audited", paths, details);
  const with0 = renderPrBody(stage, "CLEAN", "Audited", paths, { ...details, nudges: 0 });
  assert.equal(with0.replace(/\n  Nudges: 0/, ""), without, "the body changed beyond the added line");
});

test("the coverage-log target is never the pipeline's own bookkeeping", () => {
  // Stage 1 recorded `.github/nightly-logs/00-pr-history.md` as its audited
  // target on more than thirty consecutive nights. Excluding only the stage's
  // own coverage log was not enough, because every lane appends to
  // 00-pr-history.md, so a night with no source change named whichever
  // bookkeeping file sorted first and it read as a claim about what was
  // audited.
  const stage = { number: 1, coverageLog: ".github/nightly-logs/01-hardening-coverage.log" };
  const cleanNight = finalLogLine(stage, "CLEAN", "Audited Edge Function endpoints", [
    ".github/nightly-logs/01-hardening-coverage.log",
    ".github/nightly-logs/00-pr-history.md",
  ], "2026-09-10", null);
  assert.match(cleanNight, /CLEAN: Codebase -- /);
  assert.ok(!cleanNight.includes("00-pr-history.md"), "bookkeeping is never the target");

  const realChange = finalLogLine(stage, "CHANGED", "hardened a boundary", [
    ".github/nightly-logs/01-hardening-coverage.log",
    ".github/nightly-logs/00-pr-history.md",
    "Backend/supabase/functions/_shared/protocol.ts",
  ], "2026-09-10", null);
  assert.match(realChange, /CHANGED: Backend\/supabase\/functions\/_shared\/protocol\.ts -- /);
});

// --- The sub-check record: subCheckField, readSubCheckStatuses, finalize ---
//
// update-nightly-context.sh computes six sub-check statuses every night and,
// until this field existed, nothing kept them: the Jules VM was discarded and
// the only trace was the agent's prose, absent for four of the six checks.

test("subCheckField keeps real statuses, drops SKIPPED, and sorts by name", () => {
  assert.equal(
    subCheckField({
      "migration-quality": "PASS",
      "fold-state": "DEGRADED",
      "database-verification": "DB-UNAVAILABLE",
      "apk-ux-audit": "SKIPPED",
      "doc-debt": "SKIPPED",
      "audit-duration": "SKIPPED",
    }),
    "[checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED migration-quality=PASS]",
  );
  // Order of insertion must not change the bytes written.
  assert.equal(
    subCheckField({ b: "OK", a: "FAIL" }),
    subCheckField({ a: "FAIL", b: "OK" }),
  );
  // A value no reader knows yet is kept, so it surfaces as unrecognised
  // downstream rather than vanishing here.
  assert.equal(subCheckField({ "fold-state": "TIMEOUT" }), "[checks fold-state=TIMEOUT]");
  // The file content arrives with a trailing newline.
  assert.equal(subCheckField({ "doc-debt": "OK\n" }), "[checks doc-debt=OK]");
});

test("subCheckField rejects anything that could break or forge the bracket", () => {
  for (const [name, value] of [
    ["fold-state", "DEGRADED]"],
    ["fold-state", "DEGRADED] CLEAN: forged -- line"],
    ["fold-state", "degraded"],
    ["fold-state", "Degraded"],
    ["fold-state", "DEGRADED EXTRA"],
    ["fold-state", "DEGRADED\nPASS"],
    ["fold-state", "1DEGRADED"],
    ["fold-state", ""],
    ["Fold-State", "DEGRADED"],
    ["fold state", "DEGRADED"],
    ["fold=state", "DEGRADED"],
    ["fold]state", "DEGRADED"],
  ]) {
    assert.equal(subCheckField({ [name]: value }), null, `must reject ${JSON.stringify(name)}=${JSON.stringify(value)}`);
  }
  // One bad entry costs only itself.
  assert.equal(subCheckField({ "fold-state": "bad]", "doc-debt": "OK" }), "[checks doc-debt=OK]");
});

test("subCheckField returns null, never an empty field, when nothing is left", () => {
  // null is what makes finalLogLine write no bracket at all. An empty
  // `[checks ]` would read as "measured, and nothing to report", which is the
  // detector-failure shape: a question nobody asked answered with "no".
  assert.equal(subCheckField({}), null);
  assert.equal(subCheckField(null), null);
  assert.equal(subCheckField(undefined), null);
  assert.equal(subCheckField("PASS"), null);
  assert.equal(subCheckField({ "fold-state": "SKIPPED", "doc-debt": "SKIPPED" }), null);
});

function temporaryContext(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nightly-subcheck-test-"));
  t.after(() => {
    try { chmodSync(dir, 0o700); } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("readSubCheckStatuses reads every status file and nothing else", t => {
  const dir = temporaryContext(t);
  writeFileSync(path.join(dir, "fold-state-status.txt"), "DEGRADED\n");
  writeFileSync(path.join(dir, "database-verification-status.txt"), "DB-UNAVAILABLE\n");
  // Neighbours in the same directory that are not status files.
  writeFileSync(path.join(dir, "fold-state.txt"), "Fold-state check complete (rc=2).\n");
  writeFileSync(path.join(dir, "pr-body.md"), "body\n");
  writeFileSync(path.join(dir, "session-state.json"), "{}\n");
  assert.deepEqual(readSubCheckStatuses(dir), {
    "fold-state": "DEGRADED",
    "database-verification": "DB-UNAVAILABLE",
  });
});

test("readSubCheckStatuses returns {} for a missing or unreadable context dir, never throws", t => {
  const dir = temporaryContext(t);
  assert.deepEqual(readSubCheckStatuses(path.join(dir, "does-not-exist")), {});

  // A path that is a file, not a directory: ENOTDIR on every platform.
  const file = path.join(dir, "not-a-dir");
  writeFileSync(file, "x\n");
  assert.deepEqual(readSubCheckStatuses(file), {});

  // A status path that is itself a directory: the read throws EISDIR.
  const odd = path.join(dir, "odd");
  mkdirSync(path.join(odd, "fold-state-status.txt"), { recursive: true });
  assert.deepEqual(readSubCheckStatuses(odd), {});
});

test("readSubCheckStatuses returns {} when the directory cannot be listed", t => {
  const dir = temporaryContext(t);
  writeFileSync(path.join(dir, "fold-state-status.txt"), "DEGRADED\n");
  chmodSync(dir, 0o000);
  // Root ignores permission bits, so on a root runner this case cannot be
  // produced. Say so rather than passing without having tested anything.
  let listable = false;
  try { readdirSync(dir); listable = true; } catch {}
  if (listable) {
    t.skip("permission bits are not enforced for this user (running as root)");
    return;
  }
  assert.deepEqual(readSubCheckStatuses(dir), {});
});

test("readSubCheckStatuses honours NIGHTLY_CONTEXT_DIR when no dir is passed", t => {
  // The reader must share contextDir() with every other finalize input. A
  // literal /tmp/nightly here would read a different directory from the one
  // the context script wrote whenever the override is set.
  const dir = temporaryContext(t);
  writeFileSync(path.join(dir, "apk-ux-audit-status.txt"), "PASS\n");
  const previous = process.env.NIGHTLY_CONTEXT_DIR;
  process.env.NIGHTLY_CONTEXT_DIR = dir;
  try {
    assert.deepEqual(readSubCheckStatuses(), { "apk-ux-audit": "PASS" });
  } finally {
    if (previous === undefined) delete process.env.NIGHTLY_CONTEXT_DIR;
    else process.env.NIGHTLY_CONTEXT_DIR = previous;
  }
});

test("a line without checks is byte-identical to the format written before the field existed", () => {
  const stage = { number: 1, coverageLog: ".github/nightly-logs/01-hardening-coverage.log" };
  const args = [stage, "CLEAN", "Audited Edge Function endpoints", [stage.coverageLog], "2026-09-10", "[23:17Z-23:23Z 6m]"];
  const expected = "* [2026-09-10] [Stage 1] [23:17Z-23:23Z 6m] CLEAN: Codebase -- Audited Edge Function endpoints";
  assert.equal(finalLogLine(...args), expected);
  assert.equal(finalLogLine(...args, null), expected);
  assert.equal(finalLogLine(...args, undefined), expected);
  assert.equal(finalLogLine(...args, subCheckField({ "doc-debt": "SKIPPED" })), expected);

  const untimed = [stage, "CLEAN", "Audited", [stage.coverageLog], "2026-09-02", null];
  assert.equal(finalLogLine(...untimed), "* [2026-09-02] [Stage 1] CLEAN: Codebase -- Audited");
  assert.equal(finalLogLine(...untimed, null), "* [2026-09-02] [Stage 1] CLEAN: Codebase -- Audited");
});

test("window plus checks round-trips through the shared parser", () => {
  const stage = { number: 3, coverageLog: ".github/nightly-logs/03-baseline-consolidation-coverage.log" };
  const statuses = { "fold-state": "DEGRADED", "migration-quality": "PASS", "database-verification": "DB-UNAVAILABLE" };
  const summary = "fold-state: DEGRADED; database-verification: DB-UNAVAILABLE";
  const withBoth = finalLogLine(stage, "CLEAN", summary, [stage.coverageLog], "2026-09-23", "[01:02Z-01:09Z 7m]", subCheckField(statuses));
  assert.equal(
    withBoth,
    "* [2026-09-23] [Stage 3] [01:02Z-01:09Z 7m] [checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED migration-quality=PASS] CLEAN: Codebase -- fold-state: DEGRADED; database-verification: DB-UNAVAILABLE",
  );
  const plain = finalLogLine(stage, "CLEAN", summary, [stage.coverageLog], "2026-09-23", "[01:02Z-01:09Z 7m]");

  const parsed = parseCoverageLine(withBoth);
  const before = parseCoverageLine(plain);
  assert.deepEqual(parsed.checks, statuses);
  assert.equal(before.checks, null);
  const { checks: _a, ...rest } = parsed;
  const { checks: _b, ...restBefore } = before;
  assert.deepEqual(rest, restBefore, "the checks field changes nothing but checks");
  assert.deepEqual(parsed.window, { start: "01:02", end: "01:09", minutes: 7 });

  // Checks without a window: a run whose state file was missing.
  const untimed = parseCoverageLine(finalLogLine(stage, "PARTIAL-RUN", summary, [stage.coverageLog], "2026-09-23", null, subCheckField(statuses)));
  assert.equal(untimed.status, "PARTIAL-RUN");
  assert.equal(untimed.window, null);
  assert.deepEqual(untimed.checks, statuses);
});

test("the producer vocabulary is pinned, and finalize can carry every value it writes", () => {
  // Every `echo "V" > "$CONTEXT_DIR/N-status.txt"` in the context script. A new
  // status value or a new status file fails this until someone has decided
  // what it means, which is the step a reader downstream (the recap's
  // blind-spot classifier) depends on. Pinned as the exact set, not a count,
  // so a swap cannot hide behind an unchanged total.
  const script = readFileSync(contextScriptPath, "utf8");
  const pairs = [...script.matchAll(/echo "([^"]*)" > "\$CONTEXT_DIR\/([a-z0-9-]+)-status\.txt"/g)]
    .map(([, value, name]) => `${name}=${value}`);
  const distinct = [...new Set(pairs)].sort();
  assert.deepEqual(distinct, [
    "apk-ux-audit=DEGRADED",
    "apk-ux-audit=FAIL",
    "apk-ux-audit=PASS",
    "apk-ux-audit=SKIPPED",
    "audit-duration=DEGRADED",
    "audit-duration=OK",
    "audit-duration=SKIPPED",
    // S02's baseline run: DEGRADED is a run that never finished, not a FAIL.
    "baseline-tests=DEGRADED",
    "baseline-tests=FAIL",
    "baseline-tests=PASS",
    "baseline-tests=SKIPPED",
    "database-verification=DB-AVAILABLE",
    "database-verification=DB-UNAVAILABLE",
    "database-verification=SKIPPED",
    "dependency-cruiser=DEGRADED",
    "dependency-cruiser=FAIL",
    "dependency-cruiser=PASS",
    "dependency-cruiser=SKIPPED",
    "doc-debt=DEGRADED",
    "doc-debt=OK",
    "doc-debt=SKIPPED",
    "fold-state=CLEAN",
    "fold-state=DEGRADED",
    "fold-state=PENDING",
    "fold-state=SKIPPED",
    "knip=DEGRADED",
    "knip=OK",
    "knip=SKIPPED",
    "migration-quality=DEGRADED",
    "migration-quality=FAIL",
    "migration-quality=PASS",
    "migration-quality=SKIPPED",
  ]);

  // Every non-SKIPPED value must survive subCheckField and parse back
  // unchanged. A producer value the writer silently drops would make that
  // check vanish from the record on exactly the nights it reports it.
  for (const pair of distinct) {
    const [name, value] = pair.split("=");
    const field = subCheckField({ [name]: value });
    if (value === "SKIPPED") {
      assert.equal(field, null, `${pair} is "not this stage's check" and must not be written`);
      continue;
    }
    assert.equal(field, `[checks ${pair}]`, `${pair} must be writable`);
    const line = `* [2026-09-23] [Stage 3] ${field} CLEAN: Codebase -- x`;
    assert.deepEqual(parseCoverageLine(line).checks, { [name]: value }, `${pair} must round-trip`);
  }

  // Every stage that is not an owner gets SKIPPED for every check, so the
  // field is absent for it and its lines stay byte-identical.
  const names = [...new Set(distinct.map(pair => pair.split("=")[0]))];
  assert.equal(subCheckField(Object.fromEntries(names.map(name => [name, "SKIPPED"]))), null);
});

function finalizeInContext(t, { stageNumber, contextDir, statusFiles = {}, state = null, summary, result }) {
  const repoRoot = createTemporaryRepo();
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(statusFiles)) {
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(path.join(contextDir, `${name}-status.txt`), `${value}\n`);
  }
  if (state) {
    mkdirSync(contextDir, { recursive: true });
    writeFileSync(path.join(contextDir, "session-state.json"), `${JSON.stringify(state)}\n`);
  }
  const stage = getStage(registry, stageNumber);
  const logPath = path.join(repoRoot, stage.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${sentinelLine("2026-08-08", stageNumber)}\n`);
  const outcome = run(
    process.execPath,
    [scriptPath, "finalize", "--stage", String(stageNumber), "--status", "CLEAN", "--summary", summary, "--result", result],
    repoRoot,
    { NIGHTLY_CONTEXT_DIR: contextDir, NIGHTLY_TODAY: "2026-08-08", NIGHTLY_NOW_EPOCH: "1000" },
  );
  return { outcome, log: readFileSync(logPath, "utf8") };
}

test("--verified is recorded only for a documentation lane's finished run, and only for real source files", t => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "nightly-verified-test-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const real = "Frontend-PWA/src/shared/ui/ViewOptions.vue";
  mkdirSync(path.join(repoRoot, path.dirname(real)), { recursive: true });
  writeFileSync(path.join(repoRoot, real), "<template />\n");
  const doc = getStage(registry, 6);

  assert.deepEqual(resolveVerified(`./${real}, ${real}`, doc, "CLEAN", repoRoot), [real]);
  assert.deepEqual(resolveVerified(real, doc, "CHANGED", repoRoot), [real]);
  assert.deepEqual(resolveVerified(real, doc, "PARTIAL-RUN", repoRoot), [], "an unfinished run vouches for nothing");
  assert.deepEqual(resolveVerified(real, getStage(registry, 9), "CLEAN", repoRoot), [], "only a documentation lane can vouch for prose");
  assert.deepEqual(
    resolveVerified(`README.md, Frontend-PWA/src/missing.ts, Frontend-PWA/../../outside.ts, ${real}`, doc, "CLEAN", repoRoot),
    [real],
    "not a documented source, not in this checkout, or outside it",
  );
  assert.deepEqual(resolveVerified(undefined, doc, "CLEAN", repoRoot), []);
  assert.deepEqual(resolveVerified(" , ", doc, "CLEAN", repoRoot), []);
});

test("the verification the stage runner writes is the one doc-debt reads", () => {
  const stage = getStage(registry, 6);
  const real = "Frontend-PWA/src/shared/ui/ViewOptions.vue";
  const body = renderPrBody(stage, "CLEAN", "Audited ViewOptions.vue", [stage.coverageLog], { why: "w", result: "r", verified: [real] });
  assert.deepEqual(parseVerified(body), [real]);
  assert.match(body, /\*\*Verified accurate:\*\* Frontend-PWA\/src\/shared\/ui\/ViewOptions\.vue/);
  // The coordinator's parser is undisturbed: Files is still Files.
  assert.equal(extractMetadata({ body, title: "t" }).files, stage.coverageLog);
  // No verification, no line, so every other stage's body is unchanged.
  assert.doesNotMatch(renderPrBody(stage, "CLEAN", "Audited", [stage.coverageLog], { why: "w", result: "r" }), /Verified/);
});

test("finalize --verified reaches the committed description end to end", t => {
  const repoRoot = createTemporaryRepo();
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const contextDir = temporaryContext(t);
  const stage = getStage(registry, 6);
  const real = "Frontend-PWA/src/shared/ui/ViewOptions.vue";
  mkdirSync(path.join(repoRoot, path.dirname(real)), { recursive: true });
  writeFileSync(path.join(repoRoot, real), "<template />\n");
  assert.equal(run("git", ["add", real], repoRoot).status, 0);
  assert.equal(run("git", ["commit", "-m", "test: seed a documented source"], repoRoot).status, 0);
  const logPath = path.join(repoRoot, stage.coverageLog);
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${sentinelLine("2026-08-08", 6)}\n`);

  const outcome = run(
    process.execPath,
    [scriptPath, "finalize", "--stage", "6", "--status", "CLEAN", "--summary", "Audited ViewOptions.vue",
      "--result", "vue-tsc passed with 0 errors", "--verified", real],
    repoRoot,
    { NIGHTLY_CONTEXT_DIR: contextDir, NIGHTLY_TODAY: "2026-08-08", NIGHTLY_NOW_EPOCH: "1000" },
  );
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.deepEqual(parseVerified(readFileSync(path.join(repoRoot, prBodySidecarPath(stage)), "utf8")), [real]);
});

test("finalize records the sub-check statuses it finds in the context dir", t => {
  const contextDir = temporaryContext(t);
  const { outcome, log } = finalizeInContext(t, {
    stageNumber: 3,
    contextDir,
    // What update-nightly-context.sh leaves for Stage 3 on a night with no
    // database: the three Stage 3 checks, and SKIPPED for everyone else's.
    statusFiles: {
      "fold-state": "DEGRADED",
      "migration-quality": "PASS",
      "database-verification": "DB-UNAVAILABLE",
      "apk-ux-audit": "SKIPPED",
      "doc-debt": "SKIPPED",
      "audit-duration": "SKIPPED",
    },
    state: { startEpoch: 580 },
    summary: "No fold candidates",
    result: "fold-state.mjs reported 0 unfolded objects; audit-migrations passed",
  });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(
    log,
    "* [2026-08-08] [Stage 3] [00:09Z-00:16Z 7m] [checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED migration-quality=PASS] CLEAN: Codebase -- No fold candidates\n",
  );
});

test("finalize still writes its line when the context dir is missing", t => {
  // The chokepoint rule: losing the sub-check record must never cost the stage
  // its output. The directory does not exist when finalize starts, so there is
  // nothing to read, and the line is written with no field at all.
  const parent = temporaryContext(t);
  const contextDir = path.join(parent, "never-created");
  const { outcome, log } = finalizeInContext(t, {
    stageNumber: 2,
    contextDir,
    summary: "No coverage gap found",
    result: "Vitest StorageService.spec.ts passed 7 of 7 tests",
  });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(log, "* [2026-08-08] [Stage 2] CLEAN: Codebase -- No coverage gap found\n");
  assert.doesNotMatch(log, /\[checks/);
});
