// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  CALIBRATION_TOKEN,
  buildCalibrationReport,
  calibrationForStage,
  calibrationOn,
  calibrationTimeline,
  cleanStreak,
  hasCalibrationMarker,
  ordinaryCleanStreakSinceCalibration,
  parseTerminalCoverageLines,
  renderStageCalibration,
} from "./nightly-clean-calibration.mjs";

const stage = { number: 10, slug: "apk-integrity", coverageLog: "stage-10.log" };

test("terminal coverage parsing ignores in-progress lines and other stages", () => {
  const records = parseTerminalCoverageLines([
    "* [2026-08-01] [Stage 10] IN-PROGRESS: session started",
    "* [2026-08-01] [Stage 10] CLEAN: Codebase -- checked wrapper config",
    "* [2026-08-02] [Stage 9] CLEAN: Codebase -- checked architecture",
    "* [2026-08-03] [Stage 10] CHANGED: APK/android/AndroidManifest.xml -- removed redundant permission",
  ].join("\n"), 10);
  assert.deepEqual(records.map(record => record.status), ["CLEAN", "CHANGED"]);
  assert.deepEqual(records.map(record => record.date), ["2026-08-01", "2026-08-03"]);
});

test("clean streak counts only consecutive latest CLEAN records", () => {
  assert.equal(cleanStreak([
    { status: "CLEAN" },
    { status: "CHANGED" },
    { status: "CLEAN" },
    { status: "CLEAN" },
  ]), 2);
  assert.equal(cleanStreak([{ status: "CLEAN" }, { status: "PARTIAL-RUN" }]), 0);
  assert.equal(cleanStreak([]), 0);
});

const ordinary = n => Array.from({ length: n }, () => ({ status: "CLEAN", summary: "ordinary clean" }));
const CALIBRATED = { status: "CLEAN", summary: "Calibration pass: widened scan checked 10 files" };

test("a calibration on a due night resets the ordinary clean counter", () => {
  assert.equal(ordinaryCleanStreakSinceCalibration([...ordinary(7), CALIBRATED, ...ordinary(2)]), 2);
  assert.equal(ordinaryCleanStreakSinceCalibration([...ordinary(7), CALIBRATED]), 0);
});

test("a calibration line on a night nothing was due does not reset the counter", () => {
  // Stuck OFF, the S03 defect: the old rule reset on any matching prose, so a
  // stage that reported its own counter was never told to re-check.
  assert.equal(ordinaryCleanStreakSinceCalibration([...ordinary(1), CALIBRATED, ...ordinary(2)]), 4);
});

test("a line that only reports the counter no longer resets it, with S03's real wording", () => {
  const records = [
    ...ordinary(5),
    { status: "CLEAN", summary: "Baseline current across 0 pending migrations (calibration-due: NO, consecutive CLEAN: 11)" },
    { status: "CLEAN", summary: "Baseline current (0 pending migrations, 4 clean since calibration)" },
  ];
  const timeline = calibrationTimeline(records);
  assert.deepEqual(timeline.map(entry => entry.registered), records.map(() => false));
  assert.equal(ordinaryCleanStreakSinceCalibration(records), 7);
});

test("a due stage's real wider-check wording registers, with S01's real lines", () => {
  // Stuck ON, the S01 defect: "Widened" and "(calibrated)" matched neither
  // alternative of the old rule, so S01 was told to re-check every night.
  for (const summary of [
    "Widened runtime security audit verified zero unhandled threats across Target B/C surfaces.",
    "Runtime security audit verified intact (calibrated)",
  ]) {
    const timeline = calibrationTimeline([...ordinary(7), { status: "CLEAN", summary }]);
    assert.equal(timeline.at(-1).due, true);
    assert.equal(timeline.at(-1).registered, true, summary);
  }
});

test("a due night with no wider-check wording stays ordinary, so the stage is told again", () => {
  const timeline = calibrationTimeline([...ordinary(7), { status: "CLEAN", summary: "routine scan clean" }]);
  assert.equal(timeline.at(-1).due, true);
  assert.equal(timeline.at(-1).registered, false);
  assert.equal(ordinaryCleanStreakSinceCalibration([...ordinary(7), { status: "CLEAN", summary: "routine scan clean" }]), 8);
});

test("anything but CLEAN ends the streak, and a marker on it registers nothing", () => {
  const timeline = calibrationTimeline([...ordinary(7), { status: "CHANGED", summary: "Calibration pass: fixed one issue" }, ...ordinary(1)]);
  assert.equal(timeline[7].registered, false);
  assert.equal(timeline[8].streakBefore, 0);
});

test("the marker accepts the fixed token and the wordings stages have used, and nothing else", () => {
  for (const text of [CALIBRATION_TOKEN, `${CALIBRATION_TOKEN} audited`, "calibration CLEAN", "calibrated", "Widened scan", "11 consecutive CLEAN runs"]) {
    assert.equal(hasCalibrationMarker(text), true, text);
  }
  // "recalibrate" has no word boundary before "calibrat", so it is not a claim
  // of a wider check.
  for (const text of ["routine scan clean", "", null, "recalibrate nothing"]) {
    assert.equal(hasCalibrationMarker(text), false, String(text));
  }
});

test("calibrationOn reads the timeline entry for a stage's first record on a date", () => {
  const lines = [
    ...Array.from({ length: 7 }, (_, i) => `* [2026-08-0${i + 1}] [Stage 10] CLEAN: Codebase -- ordinary clean`),
    `* [2026-08-08] [Stage 10] CLEAN: Codebase -- ${CALIBRATION_TOKEN} full wrapper invariant set`,
  ].join("\n");
  assert.equal(calibrationOn(lines, 10, "2026-08-08").registered, true);
  assert.equal(calibrationOn(lines, 10, "2026-08-03").registered, false);
  assert.equal(calibrationOn(lines, 10, "2026-08-20"), null, "no record for the date is null, never a verdict");
});

test("every prompt with a calibration gate asks for the token the counter accepts", () => {
  // One fixed phrase on both sides of the contract. If a prompt's gate loses
  // it, or the counter stops accepting it, the two drift apart silently: the
  // precondition for the 2026-09-20 stuck-ON defect.
  const dir = new URL("../../nightly-prompts/", import.meta.url);
  const gated = readdirSync(dir).filter(name => name.endsWith(".md"))
    .filter(name => readFileSync(new URL(name, dir), "utf8").includes("calibration-due: YES"));
  assert.ok(gated.length > 0, "no prompt carries a calibration gate, so this pin would pass vacuously");
  for (const name of gated) {
    const gateLines = readFileSync(new URL(name, dir), "utf8").split("\n").filter(line => line.includes("calibration-due: YES"));
    assert.ok(gateLines.some(line => line.includes(`\`${CALIBRATION_TOKEN}\``)), `${name}: its calibration gate does not ask for ${CALIBRATION_TOKEN}`);
  }
  assert.equal(hasCalibrationMarker(`${CALIBRATION_TOKEN} widened to older surfaces`), true);
});

test("calibration is due after seven consecutive clean terminal records", () => {
  const cleanLine = day => `* [2026-08-${String(day).padStart(2, "0")}] [Stage 10] CLEAN: Codebase -- no mismatch found`;
  const report = calibrationForStage(stage, Array.from({ length: 7 }, (_, index) => cleanLine(index + 1)).join("\n"));
  assert.equal(report.consecutiveClean, 7);
  assert.equal(report.ordinaryCleanSinceCalibration, 7);
  assert.equal(report.due, true);
  assert.equal(report.lastTerminalDate, "2026-08-07");
});

test("calibration is not due immediately after a calibration-backed clean", () => {
  const content = [
    ...Array.from({ length: 7 }, (_, index) =>
      `* [2026-08-${String(index + 1).padStart(2, "0")}] [Stage 10] CLEAN: Codebase -- no mismatch found`,
    ),
    "* [2026-08-08] [Stage 10] CLEAN: Codebase -- calibration CLEAN after 7 consecutive CLEAN runs checked full wrapper invariant set",
  ].join("\n");
  const report = calibrationForStage(stage, content);
  assert.equal(report.consecutiveClean, 8);
  assert.equal(report.ordinaryCleanSinceCalibration, 0);
  assert.equal(report.due, false);
});

test("changed records break the calibration streak", () => {
  const content = [
    "* [2026-08-01] [Stage 10] CLEAN: Codebase -- no mismatch found",
    "* [2026-08-02] [Stage 10] CLEAN: Codebase -- no mismatch found",
    "* [2026-08-03] [Stage 10] CHANGED: APK/android/AndroidManifest.xml -- removed redundant permission",
  ].join("\n");
  const report = calibrationForStage(stage, content);
  assert.equal(report.consecutiveClean, 0);
  assert.equal(report.due, false);
});

test("rendered stage guidance tells due stages to widen their scan", () => {
  const registry = { stages: [stage, { number: 11, slug: "apk-optimization", coverageLog: "stage-11.log" }] };
  const report = buildCalibrationReport(registry, coverageLog => {
    if (coverageLog === "stage-10.log") {
      return Array.from({ length: 7 }, (_, index) =>
        `* [2026-08-${String(index + 1).padStart(2, "0")}] [Stage 10] CLEAN: Codebase -- clean`,
      ).join("\n");
    }
    return "* [2026-08-07] [Stage 11] CHANGED: file -- change";
  });
  assert.deepEqual(report.due.map(item => item.stage), [10]);
  assert.match(renderStageCalibration(report, 10), /calibration-due: YES/);
  assert.match(renderStageCalibration(report, 10), /ordinary-clean-since-calibration: 7/);
  assert.match(renderStageCalibration(report, 10), /widen the candidate scan/);
  assert.match(renderStageCalibration(report, 11), /calibration-due: NO/);
});

test("parses the timing block the coverage-log format gained on 2026-09-03", () => {
  // The real line, verbatim from 01-hardening-coverage.log. Before this the
  // pattern required the status immediately after [Stage N], so every line
  // from 2026-09-03 onward silently failed to match and the script kept
  // reporting confident numbers computed from records ending 2026-09-02.
  const real = "* [2026-09-09] [Stage 1] [23:17Z-23:23Z 6m] CLEAN: .github/nightly-logs/00-pr-history.md -- Audited Edge Function endpoints, in-memory state, Valibot boundaries, and cross-layer constraints; zero threat vectors found";
  const records = parseTerminalCoverageLines(real, 1);
  assert.equal(records.length, 1, "the timed line must parse");
  assert.equal(records[0].date, "2026-09-09");
  assert.equal(records[0].status, "CLEAN");
  assert.match(records[0].summary, /zero threat vectors found/);
});

test("still parses the older untimed format", () => {
  const old = "* [2026-09-02] [Stage 1] CLEAN: Codebase -- clean";
  assert.equal(parseTerminalCoverageLines(old, 1).length, 1);
});

test("survives a further bracketed field being added to the format", () => {
  // The failure mode was a parser that had to be edited whenever the log
  // gained a field. A third block must not switch it off again.
  const future = "* [2026-09-09] [Stage 1] [23:17Z-23:23Z 6m] [attempt 2] CLEAN: Codebase -- clean";
  assert.equal(parseTerminalCoverageLines(future, 1).length, 1);
});

test("a stale parser cannot silently freeze the calibration streak", () => {
  // The pipeline-wide consequence: last-terminal-date froze at 2026-09-02 for
  // every stage, the ordinary-clean streak could never advance past the
  // calibration record before that boundary, and calibration-due could never
  // become true again. Calibration is the only mechanism that makes a lane
  // widen its search and re-audit its own CLEAN verdicts.
  // Seven ordinary nights first, so the 2026-09-02 calibration answers a real
  // "calibration-due: YES": since 2026-09-27 only a due night can register.
  const lines = [
    ...Array.from({ length: 7 }, (_, index) => `* [2026-08-${String(index + 20).padStart(2, "0")}] [Stage 1] CLEAN: Codebase -- clean`),
    "* [2026-09-02] [Stage 1] CLEAN: Codebase -- CLEAN calibration pass (widened candidate scan)",
    ...Array.from({ length: 7 }, (_, index) =>
      `* [2026-09-${String(index + 3).padStart(2, "0")}] [Stage 1] [23:05Z-23:10Z 5m] CLEAN: Codebase -- clean`),
  ].join("\n");
  const report = calibrationForStage({ number: 1, slug: "hardening" }, lines);
  assert.equal(report.lastTerminalDate, "2026-09-09", "must see past the format change");
  assert.equal(report.ordinaryCleanSinceCalibration, 7);
  assert.equal(report.due, true, "seven ordinary cleans since calibration is overdue");
});

test("the calibration record itself still breaks the ordinary streak", () => {
  // Guards the fix against over-reaching: a widened calibration pass must not
  // count toward the next threshold, or the net would fire every night.
  const lines = [
    ...Array.from({ length: 7 }, (_, index) => `* [2026-09-0${index + 1}] [Stage 1] [23:05Z-23:10Z 5m] CLEAN: Codebase -- clean`),
    "* [2026-09-08] [Stage 1] [23:05Z-23:10Z 5m] CLEAN: Codebase -- CLEAN calibration pass (widened candidate scan)",
  ].join("\n");
  const report = calibrationForStage({ number: 1, slug: "hardening" }, lines);
  assert.equal(report.ordinaryCleanSinceCalibration, 0);
  assert.equal(report.due, false);
});
