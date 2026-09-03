// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HEALTH,
  PACE,
  evaluatePipelineHealth,
  evaluateStageDuration,
  stageDurationHistory,
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

// Durations, oldest first, in the shape stageDurationHistory yields.
const paced = minutes => minutes.map((m, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, minutes: m }));

test("pace needs both halves before it will judge", () => {
  assert.equal(evaluateStageDuration(paced([]), 45).verdict, PACE.UNKNOWN);
  assert.equal(evaluateStageDuration(paced([10, 12, 11]), 45).verdict, PACE.UNKNOWN);
  // Reported as unknown rather than rounded down to fine.
  assert.match(evaluateStageDuration(paced([10]), 45).reason, /not enough measured runs/);
});

test("SLOWING requires the whole recent distribution to clear the old worst", () => {
  // Earlier max 14; recent median 30. The stage now typically runs slower than
  // it ever previously ran at its worst.
  const slowing = evaluateStageDuration(paced([10, 12, 14, 28, 30, 32]), 45);
  assert.equal(slowing.verdict, PACE.SLOWING);
  assert.equal(slowing.earlierMax, 14);
  assert.equal(slowing.recentMedian, 30);

  // A single slow night inside ordinary variance must NOT raise it: recent
  // median 12 sits under the earlier max of 30, so the distribution has not moved.
  assert.equal(evaluateStageDuration(paced([10, 30, 11, 12, 11, 13]), 45).verdict, PACE.STEADY);
});

test("OVERRUNNING needs every recent run past the budget, and the budget comes from config", () => {
  const over = evaluateStageDuration(paced([20, 22, 46, 48, 50, 47]), 45);
  assert.equal(over.verdict, PACE.OVERRUNNING);
  assert.equal(over.overruns, 3);
  assert.match(over.reason, /45m work budget/);

  // One run under the budget is enough to disqualify it, exactly as CHRONIC
  // requires every recent run.
  assert.notEqual(evaluateStageDuration(paced([20, 22, 46, 44, 50, 47]), 45).verdict, PACE.OVERRUNNING);

  // With no budget supplied the absolute check cannot run, and must not throw
  // or silently invent one. The trend axis still works.
  const noBudget = evaluateStageDuration(paced([20, 22, 46, 48, 50, 47]), undefined);
  assert.equal(noBudget.verdict, PACE.SLOWING);
  assert.equal(noBudget.overruns, 0);
});

test("a run with no recorded window is dropped, not treated as instant", () => {
  const ledger = {
    runs: {
      "2026-08-01": { 4: { state: "MERGED", evidence: { run: { durationMinutes: 30 } } } },
      // Predates the instrumentation: no window at all.
      "2026-08-02": { 4: { state: "MERGED", evidence: {} } },
      // Observed but never reached a verdict, so not evidence in either direction.
      "2026-08-03": { 4: { state: "EXPECTED", evidence: { run: { durationMinutes: 1 } } } },
      "2026-08-04": { 4: { state: "MERGED", evidence: { run: { durationMinutes: 34 } } } },
    },
  };
  const seen = stageDurationHistory(ledger, 4);
  assert.deepEqual(seen.map(r => r.date), ["2026-08-01", "2026-08-04"]);
  assert.deepEqual(seen.map(r => r.minutes), [30, 34]);
});

test("pace and reliability are reported as separate verdicts", () => {
  // A stage can merge unaided every night and still be sliding toward its
  // budget. Collapsing the two would hide whichever was evaluated second.
  const ledger = {
    runs: Object.fromEntries(
      [12, 13, 14, 40, 41, 42].map((minutes, index) => [
        `2026-08-0${index + 1}`,
        { 4: { state: "MERGED", attempts: 0, failureClass: null, evidence: { run: { durationMinutes: minutes } } } },
      ]),
    ),
  };
  const health = evaluatePipelineHealth(ledger, registry);
  const stage4 = health.stages.find(s => s.stage === 4);
  assert.equal(stage4.verdict, HEALTH.HEALTHY);
  assert.equal(stage4.pace.verdict, PACE.SLOWING);
  assert.equal(health.slowing.length, 1);
  assert.equal(health.chronic.length, 0);
});

test("a pace finding is reported even when reliability is clear", () => {
  // The old renderer returned early on an empty chronic/degrading pair. A pace
  // finding arriving on an otherwise healthy pipeline must not be swallowed by
  // that path.
  const report = renderHealthReport({
    stages: [{ stage: 4, slug: "optimization", verdict: HEALTH.HEALTHY, pace: { verdict: PACE.SLOWING, reason: "typical recent run 40m now exceeds its slowest earlier run 14m" } }],
    chronic: [],
    degrading: [],
    overrunning: [],
    slowing: [{ stage: 4, slug: "optimization", pace: { verdict: PACE.SLOWING, reason: "typical recent run 40m now exceeds its slowest earlier run 14m" } }],
  });
  assert.match(report, /Stage 4 \(optimization\) SLOWING/);
  assert.match(report, /exceeds its slowest earlier run 14m/);
});

test("the real recorded history is judged on pace without alarming on everything", () => {
  const ledger = JSON.parse(readFileSync(new URL("../../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  const health = evaluatePipelineHealth(ledger, registry);
  assert.equal(health.stages.length, 13);
  assert.ok(health.stages.every(s => s.pace && typeof s.pace.verdict === "string"));
  assert.ok(
    health.overrunning.length + health.slowing.length < registry.stages.length,
    "a pace analyser that flags every stage is not distinguishing anything",
  );
});

test("a verdict carries the dates behind it, so a healed incident is not read as a decline", () => {
  // The halves are halves of ALL history, so a resolved cluster keeps counting
  // as "recent" until the history grows past it. On 2026-09-03 Stage 1 read
  // DEGRADING at "9% to 30%" on the strength of one MERGE_COORDINATOR incident
  // from 2026-08-24 to 2026-08-26 that had not recurred since. The rate is
  // right; the impression it gives is not.
  const runs = [
    { date: "2026-08-20", needed: false }, { date: "2026-08-21", needed: false },
    { date: "2026-08-22", needed: false }, { date: "2026-08-23", needed: false },
    { date: "2026-08-24", needed: true }, { date: "2026-08-25", needed: true },
    { date: "2026-08-26", needed: true }, { date: "2026-08-27", needed: false },
    { date: "2026-08-28", needed: false }, { date: "2026-09-03", needed: true },
  ];
  const verdict = evaluateStageHealth(runs);
  // Aug 24 falls in the EARLIER half with ten runs, which is why the rate rose
  // at all. The recent half holds the tail of the incident plus today's nudge,
  // reproducing the real Stage 1 output line for line.
  assert.deepEqual(verdict.recentInterventionDates, ["2026-08-25", "2026-08-26", "2026-09-03"]);
  // The streak is what separates the two readings, and it stays honest.
  assert.equal(verdict.currentStreak, 1);
  // No decay constant, no lookback window, no threshold was introduced to do this.
  const source = readFileSync(new URL("./nightly-health.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /RECENT_DAYS|DECAY|LOOKBACK|MAX_AGE_DAYS/);
});

test("a stage that never needed help reports no dates rather than omitting the field", () => {
  const clean = evaluateStageHealth(history([false, false, false, false, false, false]));
  assert.deepEqual(clean.recentInterventionDates, []);
});
