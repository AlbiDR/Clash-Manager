// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalibrationReport,
  calibrationForStage,
  cleanStreak,
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

test("a calibration clean resets the ordinary clean counter", () => {
  assert.equal(ordinaryCleanStreakSinceCalibration([
    { status: "CLEAN", summary: "ordinary clean" },
    { status: "CLEAN", summary: "calibration CLEAN: widened scan checked 10 files" },
    { status: "CLEAN", summary: "ordinary clean" },
    { status: "CLEAN", summary: "ordinary clean" },
  ]), 2);
  assert.equal(ordinaryCleanStreakSinceCalibration([
    { status: "CLEAN", summary: "ordinary clean" },
    { status: "CLEAN", summary: "calibration CLEAN: widened scan checked 10 files" },
  ]), 0);
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
  const lines = [
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
    "* [2026-09-08] [Stage 1] [23:05Z-23:10Z 5m] CLEAN: Codebase -- clean",
    "* [2026-09-09] [Stage 1] [23:05Z-23:10Z 5m] CLEAN: Codebase -- CLEAN calibration pass (widened candidate scan)",
  ].join("\n");
  const report = calibrationForStage({ number: 1, slug: "hardening" }, lines);
  assert.equal(report.ordinaryCleanSinceCalibration, 0);
  assert.equal(report.due, false);
});
