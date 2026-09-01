// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HEALTH,
  evaluatePipelineHealth,
  evaluateStageHealth,
  isObserved,
  neededIntervention,
  renderHealthReport,
  stageInterventionHistory,
} from "./nightly-health.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));

// `needed` is what the ledger implies; this builds the history directly so the
// verdict logic can be tested without hand-writing whole ledgers.
const history = pattern => pattern.map((needed, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, needed }));

test("a rescued stage counts as having needed rescuing", () => {
  // The crux of the entire module: RECOVERABLE is a pass for the night, and it
  // is still a stage that could not finish by itself.
  assert.equal(neededIntervention({ state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE" }), true);
  assert.equal(neededIntervention({ state: "RECOVERABLE", failureClass: "RECOVERED_BY_FALLBACK_PUBLISH" }), true);
  assert.equal(neededIntervention({ state: "MERGED", attempts: 1 }), true);
  assert.equal(neededIntervention({ state: "MERGED", evidence: { recovery: { ok: true } } }), true);
  assert.equal(neededIntervention({ state: "MERGED", evidence: { fallbackPublish: {} } }), true);
  assert.equal(neededIntervention({ state: "NO_OUTPUT" }), true);
  assert.equal(neededIntervention({ state: "BLOCKED" }), true);
});

test("a stage that merged on its own needed nothing", () => {
  assert.equal(neededIntervention({ state: "MERGED", attempts: 0, failureClass: null }), false);
  assert.equal(neededIntervention(null), false);
});

test("a stage carried on every recent run is CHRONIC", () => {
  const result = evaluateStageHealth(history([false, false, false, false, true, true, true, true]));
  assert.equal(result.verdict, HEALTH.CHRONIC);
  assert.equal(result.currentStreak, 4);
});

test("a stage needing help more often, and again last night, is DEGRADING", () => {
  const result = evaluateStageHealth(history([false, false, true, false, true, false, true, true]));
  assert.equal(result.verdict, HEALTH.DEGRADING);
  assert.ok(result.recentRate > result.earlierRate);
});

test("a stage that has recovered its form is not held against its past", () => {
  // Worse earlier, clean now. Flagging this would train the reader to ignore
  // the signal, which is the failure mode that makes alarms worthless.
  const result = evaluateStageHealth(history([true, true, true, true, false, false, false, false]));
  assert.equal(result.verdict, HEALTH.HEALTHY);
  assert.equal(result.currentStreak, 0);
});

test("a single bad night inside a good trend is not DEGRADING", () => {
  const result = evaluateStageHealth(history([true, true, false, false, false, false, false, true]));
  assert.equal(result.verdict, HEALTH.HEALTHY);
});

test("insufficient history is UNKNOWN rather than quietly HEALTHY", () => {
  // Reporting "healthy" from no evidence is the same class of lie as an
  // observer that cannot observe returning an all-clear.
  for (const pattern of [[], [true], [true, false], [true, false, true]]) {
    assert.equal(evaluateStageHealth(history(pattern)).verdict, HEALTH.UNKNOWN);
  }
});

test("verdicts are comparative, so a uniformly flaky stage is not falsely DEGRADING", () => {
  // Equal rates, so no trend. Chronic is a separate, stricter question.
  const result = evaluateStageHealth(history([true, false, true, false, true, false, true, false]));
  assert.equal(result.verdict, HEALTH.HEALTHY);
  assert.equal(result.recentRate, result.earlierRate);
});

test("stageInterventionHistory reads dates in order from the ledger itself", () => {
  const ledger = {
    schemaVersion: 1,
    runs: {
      "2026-08-02": { 4: { state: "MERGED", attempts: 0 } },
      "2026-08-01": { 4: { state: "NO_OUTPUT" } },
      "2026-08-03": { 4: { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE" } },
    },
  };
  const result = stageInterventionHistory(ledger, 4);
  assert.deepEqual(result.map(r => r.date), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.deepEqual(result.map(r => r.needed), [true, false, true]);
});

test("renderHealthReport says plainly why a per-run check cannot see this", () => {
  const chronicHealth = {
    stages: [{ stage: 5, slug: "documentation-readme", verdict: HEALTH.CHRONIC, reason: "needed intervention on all 4 most recent runs" }],
    chronic: [{ stage: 5, slug: "documentation-readme", reason: "needed intervention on all 4 most recent runs" }],
    degrading: [],
  };
  const report = renderHealthReport(chronicHealth);
  assert.match(report, /Stage 5 \(documentation-readme\) CHRONIC/);
  assert.match(report, /rescues it every time or it is not producing at all/);
  assert.match(report, /comparing each stage against its own history/);
  // A CHRONIC verdict does not establish that the runs merged: neededIntervention
  // is true for NO_OUTPUT and ESCALATED too, which is most of the real ledger.
  assert.doesNotMatch(report, /passes its individual runs|reaching a merged result/);

  const clean = renderHealthReport({ stages: [{ verdict: HEALTH.HEALTHY }], chronic: [], degrading: [] });
  assert.match(clean, /no stage is degrading/);
});

test("the real recorded history is evaluated without throwing and stays calibrated", () => {
  // Guards against a future change that makes the analyser alarm on everything:
  // a report that flags all thirteen stages is as useless as one that flags none.
  const ledger = JSON.parse(readFileSync(new URL("../../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  const health = evaluatePipelineHealth(ledger, registry);
  assert.equal(health.stages.length, 13);
  assert.ok(
    health.chronic.length + health.degrading.length < registry.stages.length,
    "an analyser that flags every stage is not distinguishing anything",
  );
});

test("an unobserved day is not counted as a failure", () => {
  // Real incident: on 2026-08-20 the ledger held 12 EXPECTED rows while eight
  // stages had genuinely merged (tags pr-1506..pr-1513). The watchdog had
  // failed to finish its observation pass. Scoring EXPECTED as a failure blames
  // the pipeline for the observer's blind spot and skews every rate from it.
  assert.equal(isObserved({ state: "EXPECTED" }), false);
  assert.equal(isObserved({ state: "RUNNING" }), false);
  assert.equal(isObserved({ state: "MERGED" }), true);
  assert.equal(isObserved({ state: "NO_OUTPUT" }), true);
  assert.equal(isObserved(null), false);

  const ledger = {
    schemaVersion: 1,
    runs: {
      "2026-08-19": { 4: { state: "MERGED", attempts: 0 } },
      "2026-08-20": { 4: { state: "EXPECTED" } },
      "2026-08-21": { 4: { state: "MERGED", attempts: 0 } },
    },
  };
  const history = stageInterventionHistory(ledger, 4);
  assert.deepEqual(history.map(h => h.date), ["2026-08-19", "2026-08-21"], "the unobserved day is dropped entirely");
  assert.ok(history.every(h => h.needed === false));
});
