// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseStageBranch } from "./merge-nightly-core.mjs";
import {
  buildFallbackPlan,
  extractSessionPatch,
  fallbackBranchName,
  parseCoverageOutcome,
  patchTouchedPaths,
  publishFallback,
  renderFallbackPrBody,
} from "./nightly-publish-fallback.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const stageOf = number => registry.stages.find(stage => stage.number === number);
const DATE = "2026-08-27";

const patchFor = (paths, line) =>
  paths.map(p => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1,2 @@\n context\n${p.endsWith("-coverage.log") ? line : "+change"}\n`).join("");

const coverageLine = (stage, status, date = DATE) =>
  `+* [${date}] [Stage ${stage}] ${status}: Codebase -- did the thing`;

const sessionWith = patch => ({ id: "123456789", name: "sessions/123456789", outputs: [{ changeSet: { gitPatch: { unidiffPatch: patch } } }] });

test("extractSessionPatch finds the change set and tolerates empty outputs", () => {
  assert.equal(extractSessionPatch(sessionWith("diff --git a/x b/x\n")), "diff --git a/x b/x\n");
  assert.equal(extractSessionPatch({ outputs: [] }), null);
  assert.equal(extractSessionPatch({ outputs: [{ changeSet: {} }] }), null);
  assert.equal(extractSessionPatch({}), null);
  assert.equal(extractSessionPatch(null), null);
});

test("patchTouchedPaths lists every path a patch can write", () => {
  const patch = "diff --git a/one.md b/one.md\n@@\n" + "diff --git a/two.ts b/two.ts\n@@\n";
  assert.deepEqual(patchTouchedPaths(patch).sort(), ["one.md", "two.ts"]);
  assert.deepEqual(patchTouchedPaths(""), []);
  assert.deepEqual(patchTouchedPaths(null), []);
});

test("parseCoverageOutcome recovers the stage's own declared status and summary", () => {
  const stage = stageOf(4);
  const patch = patchFor([stage.coverageLog], coverageLine(4, "CLEAN"));
  const outcome = parseCoverageOutcome(patch, stage, DATE);
  assert.equal(outcome.status, "CLEAN");
  assert.equal(outcome.summary, "did the thing");
});

test("parseCoverageOutcome refuses a line belonging to another stage or date", () => {
  const stage = stageOf(4);
  // A stage must never publish under another stage's evidence.
  assert.equal(parseCoverageOutcome(patchFor([stage.coverageLog], coverageLine(5, "CLEAN")), stage, DATE), null);
  assert.equal(parseCoverageOutcome(patchFor([stage.coverageLog], coverageLine(4, "CLEAN", "2026-01-01")), stage, DATE), null);
  assert.equal(parseCoverageOutcome("no coverage line here", stage, DATE), null);
});

test("a well-formed CLEAN session yields a complete plan", () => {
  const stage = stageOf(4);
  const plan = buildFallbackPlan({
    stage,
    session: sessionWith(patchFor([stage.coverageLog], coverageLine(4, "CLEAN"))),
    date: DATE,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, "CLEAN");
  assert.equal(plan.commitMessage, `chore(${stage.commitScope}): did the thing`);
  const body = renderFallbackPrBody(plan);
  assert.match(body, /This recovered Stage 4 run publishes the finalized nightly work: did the thing\./);
  assert.match(body, /The fallback publisher opened this PR so the completed run is not lost\./);
  assert.match(body, /\*\*What changed:\*\* did the thing/);
  assert.match(body, /\*\*Why:\*\* The Jules session finalized successfully/);
  assert.match(body, /\*\*Result:\*\* The recovered patch was applied unmodified/);
  assert.match(body, /NIGHTLY_PR_METADATA:/);
});

test("the fallback branch is recognised by the merge coordinator", () => {
  // If parseStageBranch does not recognise it, classifyNightlyPr treats the PR
  // as unrecognised and never folds it in, which would make the entire recovery
  // pointless: the work would be published and still never land.
  for (const stage of registry.stages) {
    const branch = fallbackBranchName(stage, { id: "987654321" });
    const parsed = parseStageBranch(branch);
    assert.ok(parsed, `${branch} must parse as a nightly stage branch`);
    assert.equal(parsed.stage, stage.number, `${branch} must resolve to stage ${stage.number}`);
  }
});

test("a patch that escapes the stage's write boundary is refused", () => {
  // Stage 2 may only touch *.spec.ts besides its own log. This is the property
  // that stops an autonomous publisher from writing anywhere it likes.
  const stage = stageOf(2);
  const patch = patchFor([stage.coverageLog, "Frontend-PWA/src/core/services/useApkManager.ts"], coverageLine(2, "CHANGED"));
  const plan = buildFallbackPlan({ stage, session: sessionWith(patch), date: DATE });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /write boundary/);
});

test("a patch touching pipeline instructions is refused", () => {
  const stage = stageOf(4);
  const patch = patchFor([stage.coverageLog, ".github/nightly-prompts/04-optimization.md"], coverageLine(4, "CHANGED"));
  const plan = buildFallbackPlan({ stage, session: sessionWith(patch), date: DATE });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /write boundary/);
});

test("a patch touching another stage's coverage log is refused", () => {
  const stage = stageOf(4);
  const patch = patchFor([stage.coverageLog, stageOf(7).coverageLog], coverageLine(4, "CHANGED"));
  const plan = buildFallbackPlan({ stage, session: sessionWith(patch), date: DATE });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /write boundary/);
});

test("every refusal is explicit rather than a silent skip", () => {
  const stage = stageOf(4);
  // A publisher that quietly declines cannot be told apart from a broken one,
  // so each of these must carry a reason a human can act on.
  for (const [input, pattern] of [
    [{ stage, session: null, date: DATE }, /no Jules session/],
    [{ stage, session: { outputs: [] }, date: DATE }, /no change set/],
    [{ stage, session: sessionWith("diff --git a/x b/x\n"), date: DATE }, /cannot be validated/],
    [{ stage: null, session: sessionWith("x"), date: DATE }, /no stage supplied/],
  ]) {
    const plan = buildFallbackPlan(input);
    assert.equal(plan.ok, false);
    assert.match(plan.reason, pattern);
  }
});

test("a failed pull request removes the branch it already pushed", async () => {
  // Creating a PR needs pull-requests: write, and a workflow's permissions come
  // from its YAML on the default branch, so until that half is deployed this is
  // the call that fails. Leaving the branch behind would create a
  // nightly/stage-N branch with no pull request: precisely the litter that
  // misclassified stage 1 on three consecutive runs via PR #1546.
  const commands = [];
  const plan = {
    stage: 4, branch: "nightly/stage-4-optimization-fallback-1", patch: "PATCH",
    paths: ["a.log"], status: "CLEAN", summary: "s", sessionName: "sessions/1",
    commitMessage: "m", prTitle: "t",
  };

  await assert.rejects(
    () => publishFallback(plan, {
      config: { targetBranch: "Nightly", owner: "o", repo: "r" },
      githubApi: async () => { throw new Error("403 Resource not accessible by integration"); },
      runGit: args => { commands.push(args.join(" ")); return ""; },
      applyPatch: () => ({ status: 0, stderr: "" }),
      log: () => {},
    }),
    /403/,
    "the failure must propagate, never be reported as a successful publish",
  );

  assert.ok(commands.some(c => c.startsWith("push --force-with-lease")), "precondition: the branch was pushed");
  assert.ok(
    commands.includes("push origin --delete nightly/stage-4-optimization-fallback-1"),
    "the orphaned branch must be deleted after the pull request fails",
  );
});

test("a successful publish never deletes anything", async () => {
  const commands = [];
  const result = await publishFallback(
    { stage: 4, branch: "nightly/stage-4-x", patch: "P", paths: ["a.log"], status: "CLEAN",
      summary: "s", sessionName: "sessions/1", commitMessage: "m", prTitle: "t" },
    {
      config: { targetBranch: "Nightly", owner: "o", repo: "r" },
      githubApi: async () => ({ number: 99, html_url: "https://example.test/99" }),
      runGit: args => { commands.push(args.join(" ")); return ""; },
      applyPatch: () => ({ status: 0, stderr: "" }),
      log: () => {},
    },
  );
  assert.equal(result.published, true);
  assert.equal(result.prNumber, 99);
  assert.ok(!commands.some(c => c.includes("--delete")), "nothing may be deleted on the success path");
});

test("a patch whose base has moved leaves no branch behind at all", async () => {
  // The stale-session case: refuse before anything is pushed, so there is
  // nothing to clean up.
  const commands = [];
  await assert.rejects(
    () => publishFallback(
      { stage: 4, branch: "nightly/stage-4-x", patch: "P", paths: ["a.log"], status: "CLEAN",
        summary: "s", sessionName: "sessions/1", commitMessage: "m", prTitle: "t" },
      {
        config: { targetBranch: "Nightly", owner: "o", repo: "r" },
        githubApi: async () => { throw new Error("must not be called"); },
        runGit: args => { commands.push(args.join(" ")); return ""; },
        applyPatch: () => ({ status: 1, stderr: "does not apply" }),
        log: () => {},
      },
    ),
    /no longer applies/,
  );
  assert.ok(!commands.some(c => c.startsWith("push")), "nothing may be pushed when the patch does not apply");
});

test("dry run proves the patch applies and creates nothing", async () => {
  const commands = [];
  const result = await publishFallback(
    { stage: 4, branch: "nightly/stage-4-x", patch: "P", paths: ["a.log"], status: "CLEAN",
      summary: "s", sessionName: "sessions/1", commitMessage: "m", prTitle: "t" },
    {
      config: { targetBranch: "Nightly", owner: "o", repo: "r" },
      githubApi: async () => { throw new Error("must not be called"); },
      runGit: args => { commands.push(args.join(" ")); return ""; },
      applyPatch: () => ({ status: 0, stderr: "" }),
      dryRun: true,
      log: () => {},
    },
  );
  assert.equal(result.published, false);
  assert.equal(result.dryRun, true);
  assert.ok(!commands.some(c => c.startsWith("push") || c.startsWith("commit")), "a dry run must not write anything");
});

test("every exit returns to the base branch and the commit has a real identity", async () => {
  // The watchdog commits the run ledger immediately after this function, so
  // being left on a nightly/stage-N branch lands that commit on the wrong
  // branch: the pipeline quietly corrupting its own evidence while repairing a
  // stage. Only two of the four exits used to restore it.
  const plan = {
    stage: 3,
    branch: "nightly/stage-3-baseline-consolidation-abc",
    patch: "diff --git a/x b/x\n",
    paths: ["x"],
    commitMessage: "chore(database): recovered",
    prTitle: "chore(database): recovered",
    session: { id: "s1" },
    date: "2026-08-15",
  };
  const config = { targetBranch: "Nightly", owner: "AlbiDR", repo: "Clash-Manager", token: "t" };

  const run = async (applyPatch, githubApi) => {
    const calls = [];
    const runGit = args => { calls.push(args.join(" ")); return ""; };
    let threw = null;
    try {
      await publishFallback(plan, { config, githubApi, runGit, applyPatch, log: () => {} });
    } catch (error) {
      threw = error;
    }
    return { calls, threw };
  };

  const ok = { status: 0, stderr: "", stdout: "" };
  const bad = { status: 1, stderr: "does not apply", stdout: "" };

  // 1. patch no longer applies
  const stale = await run(() => bad, async () => ({ number: 1 }));
  assert.ok(stale.threw, "a stale patch must throw");
  assert.ok(stale.calls.some(c => c === "checkout --force Nightly"), "stale patch must restore the base branch");

  // 2. the pull request cannot be opened
  const noPr = await run(() => ok, async () => { throw new Error("no permission"); });
  assert.ok(noPr.threw, "a failed pull request must throw");
  assert.ok(noPr.calls.some(c => c === "checkout --force Nightly"), "a failed PR must restore the base branch");

  // 3. the happy path
  const good = await run(() => ok, async () => ({ number: 42, html_url: "u" }));
  assert.equal(good.threw, null);
  assert.ok(good.calls.some(c => c === "checkout --force Nightly"), "success must restore the base branch too");

  // The identity is configured before any commit is made. A CI runner has none
  // by default, so git would fail or invent one from the hostname.
  const nameIndex = good.calls.findIndex(c => c.startsWith("config user.name"));
  const commitIndex = good.calls.findIndex(c => c.startsWith("commit "));
  assert.ok(nameIndex !== -1, "user.name must be configured");
  assert.ok(good.calls.some(c => c.startsWith("config user.email")), "user.email must be configured");
  assert.ok(nameIndex < commitIndex, "the identity must be set before the commit");
});
