// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRADE_RUBRIC,
  buildRecap,
  classifyStage,
  evidenceDateFor,
  gradeRun,
  latestRunDate,
  parseCoverageLine,
  parsePrHistoryEntry,
  renderRecap,
} from "./nightly-recap.mjs";
import { prNumberFromTag } from "./nightly-ledger.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const stageOf = n => registry.stages.find(s => s.number === n);

test("Stage 1 is dated to the previous day, every other stage to the run date", () => {
  // Stage 1 starts before midnight UTC and logs under the previous date; the
  // watchdog encodes the same rule in expectedEvidenceDate.
  assert.equal(evidenceDateFor(1, "2026-08-28"), "2026-08-27");
  assert.equal(evidenceDateFor(2, "2026-08-28"), "2026-08-28");
  assert.equal(evidenceDateFor(13, "2026-08-01"), "2026-08-01");
  assert.equal(evidenceDateFor(1, "2026-01-01"), "2025-12-31", "month and year boundaries must roll correctly");
});

test("a coverage line yields the stage's own declared status and summary", () => {
  const log = [
    "* [2026-08-26] [Stage 2] CLEAN: Codebase -- old entry",
    "* [2026-08-27] [Stage 2] CHANGED: Backend/x.spec.ts -- Add tests for validation boundaries",
  ].join("\n");
  const parsed = parseCoverageLine(log, 2, "2026-08-27");
  assert.equal(parsed.status, "CHANGED");
  assert.equal(parsed.target, "Backend/x.spec.ts");
  assert.equal(parsed.summary, "Add tests for validation boundaries");
  assert.equal(parseCoverageLine(log, 2, "2026-08-01"), null);
  assert.equal(parseCoverageLine(log, 7, "2026-08-27"), null, "another stage's line must not be borrowed");
});

test("the PR history block supplies the richer why/result detail", () => {
  const history = [
    "### [2026-08-27] PR #1588 [Stage 13]: chore(pipeline): audit pass",
    "**Domain:** pipeline | **Commit:** f9cc3ec1 | [View PR](https://example.test)",
    "**Files:** a.md, b.log",
    "**Why:** Automated nightly audit pass.",
    "**Change:** Updated the protocol document.",
    "**Result:** Nominal validation with zero regressions.",
  ].join("\n");
  const parsed = parsePrHistoryEntry(history, 13, "2026-08-27");
  assert.equal(parsed.prNumber, 1588);
  assert.equal(parsed.why, "Automated nightly audit pass.");
  assert.equal(parsed.result, "Nominal validation with zero regressions.");
  assert.deepEqual(parsed.files, ["a.md", "b.log"]);
  assert.equal(parsePrHistoryEntry(history, 12, "2026-08-27"), null);
});

test("prNumberFromTag reads only a well-formed merge tag", () => {
  assert.equal(prNumberFromTag("nightly/2026-08-27/stage-1/pr-1589"), 1589);
  assert.equal(prNumberFromTag("v14.46.23"), null);
  assert.equal(prNumberFromTag(null), null);
});

test("a merged stage is classified from durable evidence, not from branch state", () => {
  // The whole point: a tag and a coverage line are enough. Nothing here asks
  // whether the commit has been promoted to Beta, so syncing cannot change it.
  const result = classifyStage({
    stage: stageOf(4),
    entry: { state: "MERGED", failureClass: null, attempts: 0, evidence: {} },
    tag: "nightly/2026-08-27/stage-4/pr-1579",
    declared: { status: "CLEAN", target: "Codebase", summary: "no changes required" },
    history: null,
  });
  assert.equal(result.outcome, "CLEAN");
  assert.equal(result.merged, true);
  assert.equal(result.rescued, false);
  assert.equal(result.prNumber, 1579);
});

test("a stage rescued by a nudge is reported as merged AND as having needed help", () => {
  const result = classifyStage({
    stage: stageOf(5),
    entry: { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE", attempts: 1, evidence: { recovery: { ok: true } } },
    tag: "nightly/2026-08-27/stage-5/pr-1581",
    declared: { status: "CHANGED", target: "README.md", summary: "reconciled docs" },
    history: null,
  });
  assert.equal(result.merged, true);
  assert.equal(result.rescued, true);
  assert.equal(result.rescuedBy, "watchdog-nudge");
});

test("a stage rescued by the fallback publisher is distinguished from a nudge", () => {
  const result = classifyStage({
    stage: stageOf(5),
    entry: { state: "RECOVERABLE", failureClass: "RECOVERED_BY_FALLBACK_PUBLISH", attempts: 2, evidence: { fallbackPublish: { status: "CLEAN" } } },
    tag: null,
    declared: { status: "CLEAN", target: "Codebase", summary: "x" },
    history: null,
  });
  assert.equal(result.rescuedBy, "fallback-publish");
});

test("a stage with no evidence at all is STUCK", () => {
  const result = classifyStage({
    stage: stageOf(6),
    entry: { state: "NO_OUTPUT", failureClass: "JULES_SESSION_STUCK", attempts: 0, evidence: {} },
    tag: null,
    declared: null,
    history: null,
  });
  assert.equal(result.outcome, "STUCK");
  assert.equal(result.merged, false);
});

test("the grade rubric is applied in severity order", () => {
  const at = totals => GRADE_RUBRIC.find(r => r.when({ total: 13, merged: 13, stuck: 0, rescued: 0, ...totals })).grade;
  assert.equal(at({ merged: 0 }), 1);
  assert.equal(at({ stuck: 9 }), 3);
  assert.equal(at({ stuck: 3 }), 5);
  assert.equal(at({ stuck: 1 }), 7);
  assert.equal(at({ rescued: 1 }), 9);
  assert.equal(at({}), 10);
});

test("a perfect run grades 10 and a rescued one grades 9", () => {
  const stage = (outcome, rescued) => ({ outcome, merged: outcome !== "STUCK", rescued, observed: true });
  assert.equal(gradeRun(Array.from({ length: 13 }, () => stage("CLEAN", false))).grade, 10);
  const oneRescued = Array.from({ length: 13 }, (_, i) => stage("CLEAN", i === 4));
  assert.equal(gradeRun(oneRescued).grade, 9);
});

test("grade 10 requires observation, not just merges", () => {
  // "Optimal run: every stage completed unaided" is a claim about intervention,
  // and intervention is knowable only from a ledger row. `merged` reads through
  // to durable promotion tags, so a date whose ledger rows are missing or still
  // EXPECTED used to satisfy every grade-10 condition on tags alone and print
  // the unaided claim over a night nobody watched. Reproduced against the real
  // 2026-09-01 inputs with an emptied ledger: grade was 10, rescued 0.
  //
  // The flag is deliberately fail-closed: an absent `observed` counts as
  // unobserved, so a caller cannot reach the unaided claim by omission.
  const merged = n => Array.from({ length: n }, () => ({ outcome: "CLEAN", merged: true, rescued: false, observed: true }));

  const allSeen = gradeRun(merged(13));
  assert.equal(allSeen.grade, 10);
  assert.equal(allSeen.unobserved, 0);

  const oneBlind = [...merged(12), { outcome: "CLEAN", merged: true, rescued: false, observed: false }];
  const graded = gradeRun(oneBlind);
  assert.equal(graded.grade, 9, "a single unobserved stage must forfeit the unaided claim");
  assert.equal(graded.unobserved, 1);
  assert.match(graded.rationale, /Unverified: every stage merged, but 1 of 13 were never observed/);

  // Omission must not buy a 10 either.
  assert.equal(gradeRun([{ outcome: "CLEAN", merged: true, rescued: false }]).grade, 9);

  // A date with neither observation nor tags must not be called a dead
  // pipeline: that asserts a failure the evidence cannot support.
  const blind = gradeRun(Array.from({ length: 13 }, () => ({ outcome: "STUCK", merged: false, rescued: false, observed: false })));
  assert.equal(blind.grade, 1);
  assert.match(blind.rationale, /No evidence for this date/);
});

test("latestRunDate picks the newest date regardless of key order", () => {
  assert.equal(latestRunDate({ runs: { "2026-08-02": {}, "2026-08-10": {}, "2026-08-05": {} } }), "2026-08-10");
  assert.equal(latestRunDate({ runs: {} }), null);
  assert.equal(latestRunDate({}), null);
});

test("a whole recap is assembled and rendered from evidence alone", () => {
  const date = "2026-08-27";
  const ledger = { schemaVersion: 1, runs: { [date]: {} } };
  const coverageByStage = {};
  const tags = [];
  for (const stage of registry.stages) {
    const evidenceDate = evidenceDateFor(stage.number, date);
    ledger.runs[date][String(stage.number)] = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
    coverageByStage[stage.number] = `* [${evidenceDate}] [Stage ${stage.number}] CLEAN: Codebase -- nothing to do`;
    tags.push(`nightly/${evidenceDate}/stage-${stage.number}/pr-${2000 + stage.number}`);
  }
  const recap = buildRecap({ ledger, registry, date, coverageByStage, prHistory: "", tags });
  assert.equal(recap.total, 13);
  assert.equal(recap.merged, 13);
  assert.equal(recap.stuck, 0);
  assert.equal(recap.grade, 10);
  const text = renderRecap(recap);
  assert.match(text, /Summary: 13\/13 merged/);
  assert.match(text, /Grade: 10\/10/);
  // A one-date ledger cannot judge a cross-run trend, so the health block says
  // nothing at all rather than printing an empty verdict. The golden literal
  // below asserts that absence by terminating after the last stage block.
  assert.doesNotMatch(text, /Pipeline health/);
  assert.equal(text, [
    "Nightly Recap: 2026-08-27",
    "",
    "Summary: 13/13 merged | 0 changed | 13 clean | 0 stuck | 0 intervention",
    "Grade: 10/10 - Optimal run: every stage completed unaided.",
    "",
    // The plain-language overview, asserted verbatim: every clause of it is
    // derived from the same counts the rubric grades on, so a change to either
    // that silently desynchronises them fails right here.
    "In plain terms: All 13 stages ran and every one of them landed its work. No stage changed the project. The remaining 13 checked their areas and found nothing that needed fixing, which for auditing stages is the job being done rather than a wasted run. Every stage got there without help. Nothing in this run needs you to do anything.",
    "",
    "**S01** | PR #2001",
    "Clean | **HARDENING**",
    "_nothing to do_",
    "The hardening check found everything already in order.",
    "The run confirmed hardening is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S02** | PR #2002",
    "Clean | **VERIFICATION**",
    "_nothing to do_",
    "The verification check found everything already in order.",
    "The run confirmed verification is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S03** | PR #2003",
    "Clean | **BASELINE CONSOLIDATION**",
    "_nothing to do_",
    "The baseline consolidation check found everything already in order.",
    "The run confirmed baseline consolidation is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S04** | PR #2004",
    "Clean | **OPTIMIZATION**",
    "_nothing to do_",
    "The optimization check found everything already in order.",
    "The run confirmed optimization is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S05** | PR #2005",
    "Clean | **DOCUMENTATION README**",
    "_nothing to do_",
    "The documentation README check found everything already in order.",
    "The run confirmed documentation README is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S06** | PR #2006",
    "Clean | **DOCUMENTATION TSDOC**",
    "_nothing to do_",
    "The documentation TSDoc check found everything already in order.",
    "The run confirmed documentation TSDoc is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S07** | PR #2007",
    "Clean | **VERSION INTEGRITY**",
    "_nothing to do_",
    "The version integrity check found everything already in order.",
    "The run confirmed version integrity is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S08** | PR #2008",
    "Clean | **DEPENDENCY AUDIT**",
    "_nothing to do_",
    "The dependency audit check found everything already in order.",
    "The run confirmed dependency audit is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S09** | PR #2009",
    "Clean | **REFACTOR**",
    "_nothing to do_",
    "The refactor check found everything already in order.",
    "The run confirmed refactor is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S10** | PR #2010",
    "Clean | **APK INTEGRITY**",
    "_nothing to do_",
    "The APK integrity check found everything already in order.",
    "The run confirmed APK integrity is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S11** | PR #2011",
    "Clean | **APK OPTIMIZATION**",
    "_nothing to do_",
    "The APK optimization check found everything already in order.",
    "The run confirmed APK optimization is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S12** | PR #2012",
    "Clean | **APK UX**",
    "_nothing to do_",
    "The APK UX check found everything already in order.",
    "The run confirmed APK UX is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
    "**S13** | PR #2013",
    "Clean | **SELF HEALING PROTOCOL**",
    "_nothing to do_",
    "The self healing protocol check found everything already in order.",
    "The run confirmed self healing protocol is still healthy, so no code or docs needed to change.",
    "Merged successfully.",
    "",
  ].join("\n"));
});

test("a calibration-backed CLEAN run is called out in prose", () => {
  const text = renderRecap({
    date: "2026-08-27",
    total: 1,
    merged: 1,
    changed: 0,
    clean: 1,
    stuck: 0,
    rescued: 0,
    grade: 10,
    rationale: "Optimal run: every stage completed unaided.",
    stages: [{
      stage: 10,
      slug: "apk-integrity",
      outcome: "CLEAN",
      prNumber: 2010,
      title: "chore(apk): calibration CLEAN for wrapper integrity",
      summary: "calibration CLEAN after 7 ordinary CLEAN-since-calibration runs checked full wrapper invariant set",
      result: "Audit completed with no source change required.",
      merged: true,
    }],
  });
  assert.match(text, /This was a wider calibration check after repeated clean runs/);
  assert.match(text, /Audit completed with no source change required\./);
});

test("the real recorded history recaps without throwing, for a synced run", () => {
  // 2026-08-25 was promoted to Beta and Stable long ago. The previous prose
  // recap scoped itself by `origin/Beta..origin/Nightly` and would report
  // "nothing to catch up on" for this date; scoping by run date must not care.
  const ledger = JSON.parse(readFileSync(new URL("../../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  assert.ok(ledger.runs["2026-08-25"], "precondition: the run is in the ledger");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-25",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.total, 13);
  assert.ok(recap.grade >= 1 && recap.grade <= 10);
});


// --- Cross-run health -------------------------------------------------------
//
// The health block reaches past the selected date - a stage carried every night
// passes every individual run - but never past it. These build multi-date
// ledgers because a single date can never produce a verdict, which is exactly
// what the first test above pins down.

const MERGED_RUN = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
// Needed help and got it: merged, but only because something nudged it.
const RESCUED_RUN = { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE", attempts: 1, evidence: {} };
// Needed help and never got there. This is the dominant real flavour: the
// ledger holds far more NO_OUTPUT/ESCALATED rows than rescued ones, and
// neededIntervention counts both, so no verdict may assume a merge happened.
const STUCK_RUN = { state: "NO_OUTPUT", failureClass: "JULES_SESSION_STUCK", attempts: 0, evidence: {} };

/** A ledger with `dates` observed runs per stage; `needed` decides which of them needed help. */
function historyLedger(dates, needed = () => false, neededRun = RESCUED_RUN) {
  const runs = {};
  for (const date of dates) {
    runs[date] = {};
    for (const stage of registry.stages) {
      runs[date][String(stage.number)] = { ...(needed(stage.number, date) ? neededRun : MERGED_RUN) };
    }
  }
  return { schemaVersion: 1, runs };
}

const HISTORY_DATES = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"];

test("a self-sufficient history renders the all-clear health line", () => {
  const ledger = historyLedger(HISTORY_DATES);
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.health.chronic.length, 0);
  assert.equal(recap.health.degrading.length, 0);
  const text = renderRecap(recap);
  assert.match(text, /Pipeline health: no stage is chronic or degrading \(all 13 stages judged\)\./);
});

test("a stage needing help on every recent run is reported as CHRONIC with its evidence", () => {
  // Stage 5 needs help only on the recent half, which is all CHRONIC requires.
  // Keeping the earlier half clean makes streak (2) and observed runs (4)
  // different numbers, so a renderer that confuses them cannot pass.
  const ledger = historyLedger(HISTORY_DATES, (stage, date) => stage === 5 && date >= "2026-08-26");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.chronic.map(s => s.stage), [5]);
  const text = renderRecap(recap);
  assert.match(text, /Pipeline health: adverse cross-run trends \(all 13 stages judged\)\./);
  assert.match(text, /- S05 documentation README is CHRONIC: needed intervention on all 2 most recent runs/);
  assert.match(text, /2 runs in a row needing help, judged over 4 observed runs/);
  assert.match(text, /comparing each stage against its own history/);
});

test("a rising intervention rate on the latest run is reported as DEGRADING", () => {
  // Needed help on the last date only: the recent half is not all-needed (so
  // not CHRONIC), the latest run needed help, and the rate rose from 0% to 50%.
  const ledger = historyLedger(HISTORY_DATES, (stage, date) => stage === 5 && date === "2026-08-27");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.degrading.map(s => s.stage), [5]);
  assert.equal(recap.health.chronic.length, 0);
  const text = renderRecap(recap);
  assert.match(text, /- S05 documentation README is DEGRADING: intervention rate rose from 0% to 50%/);
  assert.match(text, /1 run in a row needing help, judged over 4 observed runs/);
});

test("an adverse verdict never claims the runs merged or were rescued", () => {
  // The real ledger's dominant failure is a stage that produced nothing at all,
  // not one that was nudged over the line. Both count as needing intervention,
  // so the section must not narrate either mechanism.
  const ledger = historyLedger(HISTORY_DATES, stage => stage === 5, STUCK_RUN);
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.chronic.map(s => s.stage), [5]);
  const text = renderRecap(recap);
  assert.match(text, /- S05 documentation README is CHRONIC/);
  assert.doesNotMatch(text, /reaches a merged result|rescues it every time/);
  assert.doesNotMatch(text, /passed its own individual runs/);
});

test("health is judged up to the recapped date and never past it", () => {
  // Stage 5 needs help on the first four nights and recovers on the last two.
  // As of 2026-08-27 that is CHRONIC; over the whole ledger it is HEALTHY. A
  // recap of 2026-08-27 must report what was true that night, both when it runs
  // that night and when it runs days later.
  const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"];
  const ledger = historyLedger(dates, (stage, date) => stage === 5 && date <= "2026-08-27");
  const asOf = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  const stageFive = asOf.health.stages.find(s => s.stage === 5);
  assert.equal(stageFive.verdict, "CHRONIC");
  assert.equal(stageFive.runs, 4, "the two later nights are not evidence about this one");
  assert.equal(stageFive.currentStreak, 4, "the streak stops at the recapped date");
  // Still reaches past the single date: that is the whole point of the section.
  assert.ok(stageFive.runs > 1, "earlier nights are judged alongside the recapped one");
  assert.match(renderRecap(asOf), /- S05 documentation README is CHRONIC/);

  const latest = buildRecap({
    ledger, registry, date: "2026-08-29",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(latest.health.stages.find(s => s.stage === 5).verdict, "HEALTHY");
  assert.match(renderRecap(latest), /no stage is chronic or degrading/);
});

test("a stage without enough history is counted, not silently called healthy", () => {
  const ledger = historyLedger(HISTORY_DATES);
  // Stage 7 is observed on only one date, so it cannot be judged at all.
  for (const date of HISTORY_DATES.slice(1)) ledger.runs[date]["7"] = { state: "EXPECTED", attempts: 0, evidence: {} };
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.health.stages.find(s => s.stage === 7).verdict, "UNKNOWN");
  assert.match(renderRecap(recap), /12 of 13 stages judged, 1 without enough history/);
});

test("renderRecap still works for a hand-built recap that carries no health", () => {
  // renderRecap is exported, so a recap object may be assembled without
  // buildRecap. A missing health field must render a recap without the
  // section, not throw and not print an all-clear it has no evidence for.
  const text = renderRecap({
    date: "2026-08-27",
    total: 1, merged: 1, changed: 1, clean: 0, stuck: 0, rescued: 0,
    grade: 10, rationale: "Optimal run: every stage completed unaided.",
    stages: [{ stage: 2, slug: "verification", outcome: "CHANGED", prNumber: 2002, summary: "added a spec", merged: true }],
  });
  assert.match(text, /Nightly Recap: 2026-08-27/);
  assert.doesNotMatch(text, /Pipeline health/);
});

test("a coverage line carries its run window, and lines written before it still parse", () => {
  // The pipeline computed elapsed on every budget call and threw it away, so it
  // could only ever see binary outcomes. A stage degrading gets SLOWER before it
  // fails, and drift from 20 minutes toward the 45-minute workBudgetMinutes
  // ceiling was invisible until the night it breached and finalized PARTIAL-RUN.
  const withWindow = "* [2026-09-03] [Stage 4] [00:25Z-01:12Z 47m] CLEAN: Codebase -- audited 12 views, 0 unreferenced";
  const parsed = parseCoverageLine(withWindow, 4, "2026-09-03");
  assert.equal(parsed.status, "CLEAN");
  assert.equal(parsed.target, "Codebase");
  assert.equal(parsed.summary, "audited 12 views, 0 unreferenced");
  assert.equal(parsed.window, "00:25Z-01:12Z 47m");
  assert.equal(parsed.durationMinutes, 47);

  // Every line written before the window existed must parse identically, or the
  // whole recorded history becomes unreadable the day this ships.
  const legacy = "* [2026-09-03] [Stage 4] CLEAN: Codebase -- audited 12 views, 0 unreferenced";
  const old = parseCoverageLine(legacy, 4, "2026-09-03");
  assert.equal(old.status, "CLEAN");
  assert.equal(old.target, "Codebase");
  assert.equal(old.summary, "audited 12 views, 0 unreferenced");
  assert.equal(old.window, null);
  assert.equal(old.durationMinutes, null);

  // The window must never be absorbed into the summary, which the evidence floor
  // depends on being clean prose.
  assert.doesNotMatch(parsed.summary, /47m/);
});

// A recap object assembled by hand, so the overview's clauses can be driven
// independently of a whole fixture ledger.
const overviewRecap = (overrides = {}) => ({
  date: "2026-09-03",
  total: 3, merged: 3, changed: 1, clean: 2, stuck: 0, rescued: 0, unobserved: 0,
  grade: 10, rationale: "Optimal run: every stage completed unaided.",
  stages: [
    { stage: 2, slug: "verification", outcome: "CHANGED", merged: true },
    { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true },
    { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
  ],
  ...overrides,
});

test("the overview never describes a clean stage as idle or wasted", () => {
  // Most stages here are auditors and an audit that finds nothing has
  // succeeded. Wording that implies waste is factually wrong about the
  // pipeline, and reading a low change rate as dead capacity is exactly what
  // once got a compliance stage repurposed.
  const text = renderRecap(overviewRecap());
  assert.match(text, /In plain terms:/);
  assert.match(text, /found nothing that needed fixing/);
  assert.match(text, /the job being done rather than a wasted run/);
  assert.doesNotMatch(text, /idle|did nothing|wasted capacity|nothing to show/i);
});

test("the overview keeps acronyms in area names", () => {
  // displayArea carries README, TSDoc, APK, UX and PWA. Lowercasing the area
  // list for prose destroyed them.
  const text = renderRecap(overviewRecap({
    total: 2, changed: 2, clean: 0,
    stages: [
      { stage: 5, slug: "documentation-readme", outcome: "CHANGED", merged: true },
      { stage: 10, slug: "apk-integrity", outcome: "CHANGED", merged: true },
    ],
  }));
  assert.match(text, /documentation README/);
  assert.match(text, /APK integrity/);
  assert.doesNotMatch(text, /documentation readme|apk integrity/);
});

test("a rescued run is never described as self-driven", () => {
  // "13 of 13 merged" and "every stage managed on its own" are different
  // claims. The second was once asserted on the strength of the first and was
  // false: ten merged rows carried recovery evidence.
  const rescuedText = renderRecap(overviewRecap({
    rescued: 1,
    stages: [
      { stage: 2, slug: "verification", outcome: "CHANGED", merged: true },
      { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true, rescued: true },
      { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
    ],
  }));
  assert.match(rescuedText, /S05 documentation README could not finish unaided/);
  assert.match(rescuedText, /not entirely self-driven/);
  assert.doesNotMatch(rescuedText, /Every stage got there without help/);

  // The unaided claim is only made when nothing was rescued and nothing stuck.
  assert.match(renderRecap(overviewRecap()), /Every stage got there without help/);
});

test("the overview points at what needs attention, and says so when nothing does", () => {
  const quiet = renderRecap(overviewRecap());
  assert.match(quiet, /Nothing in this run needs you to do anything/);

  const degrading = renderRecap(overviewRecap({
    health: { stages: [], chronic: [], degrading: [{ stage: 1, slug: "hardening" }] },
  }));
  assert.match(degrading, /The part worth your attention is S01 hardening/);
  assert.doesNotMatch(degrading, /Nothing in this run needs you/);

  // A stage that is both stuck and degrading is named once, not twice.
  const both = renderRecap(overviewRecap({
    stuck: 1, merged: 2,
    stages: [
      { stage: 1, slug: "hardening", outcome: "STUCK", merged: false },
      { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true },
      { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
    ],
    health: { stages: [], chronic: [], degrading: [{ stage: 1, slug: "hardening" }] },
  }));
  assert.equal(both.match(/S01 hardening/g).filter(m => m).length >= 1, true);
  assert.match(both, /The part worth your attention is S01 hardening, detailed below/);
});

test("an unobserved date makes no claim about the run in either direction", () => {
  // Absence of evidence is not evidence of failure, and it is not evidence of
  // success either. The overview must refuse to characterise the run.
  const text = renderRecap(overviewRecap({
    total: 3, merged: 0, changed: 0, clean: 0, unobserved: 3,
    grade: 1, rationale: "No evidence recorded.",
    stages: [
      { stage: 2, slug: "verification", outcome: "UNOBSERVED", merged: false },
      { stage: 5, slug: "documentation-readme", outcome: "UNOBSERVED", merged: false },
      { stage: 9, slug: "refactor", outcome: "UNOBSERVED", merged: false },
    ],
  }));
  assert.match(text, /nothing was recorded for this date/);
  assert.doesNotMatch(text, /landed its work|needs you to do anything/);
});
