// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CALIBRATION_FINDINGS,
  LIVENESS,
  PROBES,
  calibrationProbe,
  coverageProbe,
  descriptionProbe,
  evaluateDetectorLiveness,
  historyProbe,
  interventionProbe,
  nudgesProbe,
  observationProbe,
  paceProbe,
  selfReportScopeProbe,
  boilerplateScopeProbe,
  tagsProbe,
} from "./nightly-liveness.mjs";
import { buildRecap, evidenceDateFor, renderRecap } from "./nightly-recap.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const ASCII = /^[\x09\x0A\x20-\x7E]*$/;

const MERGED = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
const line = (stage, date, status, summary) => `* [${date}] [Stage ${stage}] ${status}: Codebase -- ${summary}`;

/** A classified stage, as buildRecap hands the probes. */
const stageRow = (stage, overrides = {}) => ({ stage, merged: true, observed: true, prNumber: null, summary: "", result: "", ...overrides });

/** A whole night where every stage merged, was observed and logged a clean line. */
function mergedNight(date, { summaryFor = () => "nothing to do", statusFor = () => "CLEAN", rowFor = () => ({ ...MERGED }), extraLines = {} } = {}) {
  const ledger = { schemaVersion: 1, runs: { [date]: {} } };
  const coverageByStage = {};
  const tags = [];
  for (const stage of registry.stages) {
    const evidenceDate = evidenceDateFor(stage.number, date);
    ledger.runs[date][String(stage.number)] = rowFor(stage.number);
    coverageByStage[stage.number] = `${extraLines[stage.number] || ""}${line(stage.number, evidenceDate, statusFor(stage.number), summaryFor(stage.number))}\n`;
    tags.push(`nightly/${evidenceDate}/stage-${stage.number}/pr-${3000 + stage.number}`);
  }
  return { ledger, registry, date, coverageByStage, prHistory: "", tags };
}

const checkOf = (liveness, id) => liveness.checks.find(check => check.id === id);

// --- The four verdicts, and the count ----------------------------------------

test("a date with no evidence at all is vacuous and never reads as fed", () => {
  const recap = buildRecap({ ledger: { schemaVersion: 1, runs: {} }, registry, date: "2026-09-10", coverageByStage: {}, prHistory: "", tags: [] });
  assert.equal(recap.liveness.vacuous, true);
  assert.equal(recap.liveness.fed.length, 0);
  assert.equal(recap.liveness.unaskable.length, PROBES.length);
  const text = renderRecap(recap);
  assert.match(text, /^Detector check: no evidence exists for this date, so no check could run\.$/m);
  assert.doesNotMatch(text, /checks had what they need/);
});

test("the printed count is the probe list's length, never a literal", () => {
  const inputs = mergedNight("2026-09-10");
  const recap = buildRecap(inputs);
  assert.equal(recap.liveness.total, PROBES.length);
  assert.equal(recap.liveness.checks.length, PROBES.length);
  assert.match(renderRecap(recap), new RegExp(`^Detector check: \\d+ of ${PROBES.length} checks|^Detector check: all ${PROBES.length} checks`, "m"));
});

test("a night whose every log line the parser rejects is blind, not empty", () => {
  // The 2026-09-03 shape: every line present, none readable. A witness that
  // shared the parser's rules would go blind with it and print an all-clear.
  const inputs = mergedNight("2026-09-10", { statusFor: () => "VERIFIED" });
  const recap = buildRecap(inputs);
  assert.equal(recap.liveness.vacuous, false, "raw lines exist, so the night is not empty");
  const coverage = checkOf(recap.liveness, "coverage");
  assert.equal(coverage.verdict, LIVENESS.BLIND);
  assert.equal(coverage.findings.length, registry.stages.length);
  assert.ok(coverage.findings.every(f => f.token === "VERIFIED"));
  assert.equal(recap.grade, 9, "a grade-feeding check blind caps an otherwise perfect night");
  assert.match(recap.rationale, /^Unverified: every stage completed, but 1 check \(stage log lines\) could not see its evidence/);
  const text = renderRecap(recap);
  assert.match(text, /This grade leans on a check that was blind for this run, so it may be wrong in either direction\./);
  assert.match(text, new RegExp(`- Stage log lines: none of the ${registry.stages.length} merged stages left a log line for this date that this report could read`));
  assert.doesNotMatch(text, /checks had what they need for this run, and none was blind/);
  assert.match(text, ASCII);
});

// --- Probe by probe -------------------------------------------------------------

test("coverageProbe: a readable line is fed, a missing or unknown one is blind, an unmerged stage is not judged", () => {
  const date = "2026-09-10";
  const ctx = stages => ({ ledger: null, registry, date, coverageByStage: {
    4: line(4, date, "CLEAN", "ok"),
    5: line(5, date, "VERIFIED", "ok"),
  }, stages });
  assert.equal(coverageProbe(ctx([stageRow(4)])).verdict, LIVENESS.FED);
  const blind = coverageProbe(ctx([stageRow(4), stageRow(5), stageRow(6)]));
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.deepEqual(blind.findings, [{ stage: 5, token: "VERIFIED", raw: true }, { stage: 6, token: null, raw: false }]);
  assert.equal(coverageProbe(ctx([stageRow(6, { merged: false })])).verdict, LIVENESS.UNASKABLE, "an unmerged stage owes no line");
});

test("tagsProbe: a ledger tag missing from the tags read is blind; no tag ever recorded is not yet", () => {
  const date = "2026-09-10";
  const ledger = { schemaVersion: 1, runs: { [date]: { 4: { ...MERGED, evidence: { tag: "nightly/2026-09-10/stage-4/pr-1" } } } } };
  assert.equal(tagsProbe({ ledger, registry, date, tags: ["nightly/2026-09-10/stage-4/pr-1"] }).verdict, LIVENESS.FED);
  const blind = tagsProbe({ ledger, registry, date, tags: [] });
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.deepEqual(blind.stages, [4]);
  assert.equal(tagsProbe({ ledger: { schemaVersion: 1, runs: { [date]: { 4: MERGED } } }, registry, date, tags: [] }).verdict, LIVENESS.NOT_YET);
});

test("observationProbe is report-only: one unobserved stage lowers the grade through exactly one rule", () => {
  const inputs = mergedNight("2026-09-10", { rowFor: n => (n === 5 ? { state: "EXPECTED", failureClass: null, attempts: 0, evidence: {} } : { ...MERGED }) });
  const recap = buildRecap(inputs);
  const observation = checkOf(recap.liveness, "observation");
  assert.equal(observation.verdict, LIVENESS.BLIND);
  assert.equal(observation.feedsGrade, false);
  assert.ok(!recap.liveness.blindGrading.some(check => check.id === "observation"), "the rubric's never-observed rule already grades this stage");
  assert.equal(recap.grade, 9);
  assert.match(recap.rationale, /never observed/);
  assert.doesNotMatch(renderRecap(recap), /This grade leans on a check that was blind/);
  assert.equal(observationProbe({ ledger: { schemaVersion: 1, runs: {} }, registry, date: "2026-09-10", stages: [stageRow(4)] }).verdict, LIVENESS.NOT_YET);
});

test("interventionProbe: an overtaken stage with no recorded nudge is blind; a recorded one is fed", () => {
  const date = "2026-09-10";
  // The epoch: an earlier night on which the watchdog recorded a nudge.
  const runs = { "2026-09-09": { 7: { ...MERGED, evidence: { recovery: { ok: true } } } } };
  const ctx = (s2Row, stages) => ({ ledger: { schemaVersion: 1, runs: { ...runs, [date]: { 2: s2Row, 3: { ...MERGED } } } }, registry, date, stages });
  const stages = [stageRow(2, { prNumber: 1889 }), stageRow(3, { prNumber: 1888 })];

  const blind = interventionProbe(ctx({ ...MERGED }, stages));
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.deepEqual(blind.findings, [{ stage: 2, overtakenBy: 3 }]);
  assert.equal(interventionProbe(ctx({ ...MERGED, evidence: { recovery: { ok: true } } }, stages)).verdict, LIVENESS.FED);

  // An unobserved row is observationProbe's finding, never a missed nudge.
  const unobserved = [stageRow(2, { prNumber: 1889, observed: false }), stageRow(3, { prNumber: 1888 })];
  assert.equal(interventionProbe(ctx({ ...MERGED }, unobserved)).verdict, LIVENESS.UNASKABLE);

  // Nothing runs after the last stage, so nothing can overtake it.
  const last = Math.max(...registry.stages.map(s => s.number));
  const lastOnly = interventionProbe({ ledger: { schemaVersion: 1, runs: { ...runs, [date]: { [last]: { ...MERGED } } } }, registry, date, stages: [stageRow(last, { prNumber: 1 })] });
  assert.equal(lastOnly.judged, 0);

  // Before the watchdog ever recorded a nudge, the check did not exist.
  const noEpoch = interventionProbe({ ledger: { schemaVersion: 1, runs: { [date]: { 2: { ...MERGED }, 3: { ...MERGED } } } }, registry, date, stages });
  assert.equal(noEpoch.verdict, LIVENESS.NOT_YET);
});

test("historyProbe: a heading the parser missed is blind; an aged-out entry is unaskable", () => {
  const date = "2026-09-10";
  const prHistory = "### [2026-09-10] PR 1920 [Stage 8]: bump\n**Result:** ok\n";
  assert.equal(historyProbe({ registry, date, prHistory, historyByStage: { 8: [{ date }] } }).verdict, LIVENESS.FED);
  const blind = historyProbe({ registry, date, prHistory, historyByStage: {} });
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.deepEqual(blind.stages, [8]);
  assert.equal(historyProbe({ registry, date, prHistory: "", historyByStage: {} }).verdict, LIVENESS.UNASKABLE);
});

test("nudgesProbe: a nudge count that is not a number is blind", () => {
  const date = "2026-09-10";
  const prHistory = "### [2026-09-10] PR 1920 [Stage 8]: bump\n**Nudges:** two\n";
  const blind = nudgesProbe({ registry, date, prHistory, historyByStage: { 8: [{ date, nudges: null }] } });
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.equal(blind.findings[0].quote, "two");
  assert.equal(nudgesProbe({ registry, date, prHistory, historyByStage: { 8: [{ date, nudges: 2 }] } }).verdict, LIVENESS.FED);
});

test("paceProbe: a logged window the watchdog did not time is blind; before timings existed it is not yet", () => {
  const date = "2026-09-10";
  const coverageByStage = { 4: "* [2026-09-10] [Stage 4] [01:02Z-01:09Z 7m] CLEAN: Codebase -- ok" };
  const epoch = { "2026-09-09": { 5: { ...MERGED, evidence: { run: { durationMinutes: 3 } } } } };
  const blind = paceProbe({ ledger: { schemaVersion: 1, runs: { ...epoch, [date]: { 4: { ...MERGED } } } }, registry, date, coverageByStage });
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.deepEqual(blind.stages, [4]);
  const fed = paceProbe({ ledger: { schemaVersion: 1, runs: { ...epoch, [date]: { 4: { ...MERGED, evidence: { run: { durationMinutes: 7 } } } } } }, registry, date, coverageByStage });
  assert.equal(fed.verdict, LIVENESS.FED);
  assert.equal(paceProbe({ ledger: { schemaVersion: 1, runs: { [date]: { 4: { ...MERGED } } } }, registry, date, coverageByStage }).verdict, LIVENESS.NOT_YET);
});

test("descriptionProbe: after description checks began, a merged observed stage without one is blind", () => {
  const date = "2026-09-10";
  const epoch = { "2026-09-09": { 5: { ...MERGED, evidence: { body: { verdict: "OK" } } } } };
  const blind = descriptionProbe({ ledger: { schemaVersion: 1, runs: { ...epoch, [date]: { 4: { ...MERGED } } } }, registry, date, stages: [stageRow(4)] });
  assert.equal(blind.verdict, LIVENESS.BLIND);
  assert.equal(descriptionProbe({ ledger: { schemaVersion: 1, runs: { [date]: { 4: { ...MERGED } } } }, registry, date, stages: [stageRow(4)] }).verdict, LIVENESS.NOT_YET);
});

// --- The calibration counter -------------------------------------------------------

/**
 * Stage 4 (no evidence-date offset): seven ordinary nights, a calibration on
 * the due night that follows (2026-08-31), `ordinary` more plain CLEAN nights,
 * then tonight. Since 2026-09-27 only a due night can register, so the history
 * has to earn its calibration the way a real stage does.
 */
function calibrationLog(ordinary, tonight, stage = 4) {
  const lines = [];
  for (let day = 24; day <= 30; day += 1) lines.push(line(stage, `2026-08-${day}`, "CLEAN", "routine scan clean"));
  lines.push(line(stage, "2026-08-31", "CLEAN", "Calibration pass: widened to older surfaces"));
  for (let day = 1; day <= ordinary; day += 1) lines.push(line(stage, `2026-09-${String(day).padStart(2, "0")}`, "CLEAN", "routine scan clean"));
  const date = `2026-09-${String(ordinary + 1).padStart(2, "0")}`;
  lines.push(line(stage, date, "CLEAN", tonight));
  return { date, coverageByStage: { [stage]: `${lines.join("\n")}\n` } };
}

test("calibration UNCLOSED: a due stage whose clean result claims no wider check", () => {
  // S04's real line on 2026-09-22, due that night. Nothing in it says the
  // scan was widened, so the counter tells S04 to re-check again.
  const { date, coverageByStage } = calibrationLog(8, "Audited Edge Function SQL view usage, recent changed files (72 files), and L1/L2 performance composables; zero substrate or logic bottlenecks found.");
  const result = calibrationProbe({ registry, date, coverageByStage });
  assert.equal(result.verdict, LIVENESS.BLIND);
  assert.equal(result.feedsGrade, false, "advisory: a stuck counter changes what a stage is told, not what it delivered");
  const [finding] = result.findings;
  assert.equal(finding.kind, CALIBRATION_FINDINGS.UNCLOSED);
  // Seven ordinary nights make it due; the eighth (09-08) is the first told to re-check.
  assert.equal(finding.since, "2026-09-08");
  assert.equal(finding.count, 2);
  assert.match(finding.quote, /^Audited Edge Function SQL view usage/);
});

test("S01's real wider-check wording on a due night now registers, so it is no longer stuck", () => {
  // Stuck ON until 2026-09-27: "Widened ..." matched nothing in the old rule.
  const { date, coverageByStage } = calibrationLog(7, "Widened runtime security audit verified zero unhandled threats across Target B/C surfaces.");
  assert.equal(calibrationProbe({ registry, date, coverageByStage }).verdict, LIVENESS.FED);
});

test("a line that only reports the counter on a night nothing was due is no finding and no reset", () => {
  // S03's real wording. It used to reset S03's count, so S03 was never told
  // to re-check; now it is an ordinary night and the count keeps growing.
  const { date, coverageByStage } = calibrationLog(5, "Baseline current across 0 pending migrations (calibration-due: NO, consecutive CLEAN: 11)", 3);
  const result = calibrationProbe({ registry, date, coverageByStage });
  assert.equal(result.verdict, LIVENESS.FED);
  assert.deepEqual(result.findings, []);
});

test("calibration: a due stage that registers is fed, and no calibration ever registered is not yet", () => {
  const { date, coverageByStage } = calibrationLog(7, "Calibration pass: widened scan found nothing");
  assert.equal(calibrationProbe({ registry, date, coverageByStage }).verdict, LIVENESS.FED);
  // A calibration line on a night nothing was due registers nothing, so the
  // counter has still never registered one: the check did not exist yet.
  const never = { 4: `${[1, 2, 3].map(d => line(4, `2026-09-0${d}`, "CLEAN", d === 2 ? "Calibration pass: widened" : "routine scan clean")).join("\n")}\n` };
  assert.equal(calibrationProbe({ registry, date: "2026-09-03", coverageByStage: never }).verdict, LIVENESS.NOT_YET);
});

test("a calibration-only finding keeps a perfect night at 10 and adds no grade caveat", () => {
  const history = calibrationLog(8, "routine scan clean");
  const inputs = mergedNight(history.date, {
    summaryFor: n => (n === 4 ? "routine scan clean" : "nothing to do"),
    extraLines: { 4: history.coverageByStage[4].split("\n").slice(0, -2).join("\n") + "\n" },
  });
  const recap = buildRecap(inputs);
  assert.equal(checkOf(recap.liveness, "calibration").verdict, LIVENESS.BLIND);
  assert.equal(recap.grade, 10);
  const text = renderRecap(recap);
  assert.doesNotMatch(text, /This grade leans on/);
  assert.match(text, /The calibration counter did not:/);
  assert.match(text, /S04 optimization has been due a wider re-check since 2026-09-08, and neither of its 2 clean results since registered as one/);
  assert.match(text, /^Until a re-check registers, that stage is told to re-check every night and its count never resets\.$/m);
  assert.match(text, ASCII);
});

test("the recap calls a line a calibration only when the counter registered it", () => {
  // Same wording, two nights: due on one, not on the other. The recap's
  // "wider calibration check" sentence has to follow the counter, not the word.
  const due = calibrationLog(7, "Calibration pass: widened scan found nothing");
  const early = calibrationLog(3, "Calibration pass: widened scan found nothing");
  const stageOf = history => buildRecap(mergedNight(history.date, {
    summaryFor: n => (n === 4 ? "Calibration pass: widened scan found nothing" : "nothing to do"),
    extraLines: { 4: history.coverageByStage[4].split("\n").slice(0, -2).join("\n") + "\n" },
  })).stages.find(s => s.stage === 4);
  assert.equal(stageOf(due).calibrated, true);
  assert.equal(stageOf(early).calibrated, false);
});

// --- Scope checks ----------------------------------------------------------------

test("the self-report and boilerplate scopes say when there was nothing to ask", () => {
  assert.equal(selfReportScopeProbe({ stages: [stageRow(4)] }).verdict, LIVENESS.UNASKABLE);
  assert.equal(selfReportScopeProbe({ stages: [stageRow(4, { summary: "scanned the api layer" })] }).verdict, LIVENESS.FED);
  assert.equal(boilerplateScopeProbe({ stages: [stageRow(4, { result: "vitest 12 of 12 passed" })] }).verdict, LIVENESS.UNASKABLE, "one result cannot be a duplicate");
  assert.equal(boilerplateScopeProbe({ stages: [stageRow(4, { result: "vitest 12 of 12 passed" }), stageRow(5, { result: "vue-tsc 0 errors" })] }).verdict, LIVENESS.FED);
});

test("the self-report guard states its scope when only some stages left words", () => {
  // Stages 6 to 13 merged but left no line, which is how a stage ends up with
  // no words of its own.
  const inputs = mergedNight("2026-09-10", { summaryFor: () => "scanned the api layer" });
  for (const stage of registry.stages) if (stage.number > 5) inputs.coverageByStage[stage.number] = "";
  const text = renderRecap(buildRecap(inputs));
  assert.match(text, /^Self-report guard: no stage's own summary contradicted the outcome it declared \(checked the 5 of 13 stages that left words of their own\)\.$/m);
});

test("every probe is pure: evaluating the same inputs twice gives the same answer", () => {
  const inputs = mergedNight("2026-09-10");
  const stages = buildRecap(inputs).stages;
  const a = evaluateDetectorLiveness({ ...inputs, stages });
  const b = evaluateDetectorLiveness({ ...inputs, stages });
  assert.deepEqual(a, b);
});
