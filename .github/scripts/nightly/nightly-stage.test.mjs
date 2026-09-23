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
  validateChangedPaths,
  validateRegistryData,
  composeCommitSubject,
  formatRunWindow,
  readSubCheckStatuses,
  subCheckField,
} from "./nightly-stage.mjs";
import { parseCoverageLine } from "./coverage-log-line.mjs";
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
    "database-verification=DB-AVAILABLE",
    "database-verification=DB-UNAVAILABLE",
    "database-verification=SKIPPED",
    "doc-debt=DEGRADED",
    "doc-debt=OK",
    "doc-debt=SKIPPED",
    "fold-state=CLEAN",
    "fold-state=DEGRADED",
    "fold-state=PENDING",
    "fold-state=SKIPPED",
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
