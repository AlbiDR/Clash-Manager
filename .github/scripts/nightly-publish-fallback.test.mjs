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
  renderFallbackPrBody,
} from "./nightly-publish-fallback.mjs";

const registry = JSON.parse(readFileSync(new URL("../nightly-config/stages.json", import.meta.url), "utf8"));
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
  assert.match(renderFallbackPrBody(plan), /never published/);
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
