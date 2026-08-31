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
  prNumberFromTag,
  renderRecap,
} from "./nightly-recap.mjs";

const registry = JSON.parse(readFileSync(new URL("../nightly-config/stages.json", import.meta.url), "utf8"));
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
  const stage = (outcome, rescued) => ({ outcome, merged: outcome !== "STUCK", rescued });
  assert.equal(gradeRun(Array.from({ length: 13 }, () => stage("CLEAN", false))).grade, 10);
  const oneRescued = Array.from({ length: 13 }, (_, i) => stage("CLEAN", i === 4));
  assert.equal(gradeRun(oneRescued).grade, 9);
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
  assert.equal(text, [
    "Nightly Recap: 2026-08-27",
    "",
    "Summary: 13/13 merged | 0 changed | 13 clean | 0 stuck | 0 intervention",
    "Grade: 10/10 - Optimal run: every stage completed unaided.",
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

test("the real recorded history recaps without throwing, for a synced run", () => {
  // 2026-08-25 was promoted to Beta and Stable long ago. The previous prose
  // recap scoped itself by `origin/Beta..origin/Nightly` and would report
  // "nothing to catch up on" for this date; scoping by run date must not care.
  const ledger = JSON.parse(readFileSync(new URL("../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  assert.ok(ledger.runs["2026-08-25"], "precondition: the run is in the ledger");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-25",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.total, 13);
  assert.ok(recap.grade >= 1 && recap.grade <= 10);
});
