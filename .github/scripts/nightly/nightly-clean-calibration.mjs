// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFileSync } from "node:fs";

import { parseCoverageLog } from "./coverage-log-line.mjs";

export const CALIBRATION_CLEAN_STREAK = 7;
export function parseTerminalCoverageLines(content, stageNumber) {
  // The line format is owned by coverage-log-line.mjs. It used to be parsed by
  // a private regex here, which went silently blind on 2026-09-03 when the
  // format gained a session timing block; see that module's header for what
  // that cost. Field mapping is preserved exactly so this function's contract
  // is unchanged.
  return parseCoverageLog(content, stageNumber).map(record => ({
    date: record.date,
    stage: record.stage,
    status: record.status,
    target: record.target,
    summary: record.summary,
  }));
}

export function cleanStreak(records) {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].status !== "CLEAN") break;
    streak += 1;
  }
  return streak;
}

// WHAT COUNTS AS A CALIBRATION (fixed 2026-09-27)
//
// A calibration is the wider re-check a stage is told to run once it has filed
// CALIBRATION_CLEAN_STREAK ordinary CLEANs in a row. Registering one resets the
// count. Until this fix, a line registered as a calibration whenever its prose
// matched /\bcalibration\b|consecutive CLEAN/i, on any night. That went wrong
// in both directions, because both halves of the contract were free prose:
//
// - Stuck ON. S01 was due from 2026-09-20 and reported "Widened runtime
//   security audit verified ...", then "...(calibrated)". Neither matches, so
//   S01 was told "calibration-due: YES" every night and its count only grew.
//   S12 sat due and unclosed on 2026-09-08, 09-09 and 09-10 the same way.
// - Stuck OFF. The prompts ask stages to put the counter itself in their
//   summary, and S03 does so every night: "(clean-since-calibration: 1)" on
//   09-03, "4 clean since calibration" on 09-14, "(calibration-due: NO,
//   consecutive CLEAN: 11)" on 09-21. Each matched and reset S03's count on a
//   night nothing was due, so S03 was never told to re-check. Across the ledger
//   era 5 of the 20 recognised calibrations fell on nights that were not due.
//
// A calibration now needs BOTH halves:
// 1. The stage was due at that line: its ordinary CLEAN streak before it had
//    reached the threshold. This is the part that was missing. A line cannot
//    be the answer to an instruction the stage was never given, so a stage
//    that merely reports its counter can no longer reset it.
// 2. The line says it did the wider check: the fixed CALIBRATION_TOKEN the
//    prompts now ask for, or the wordings stages have actually used
//    ("calibration", "calibrated", "widened", "consecutive CLEAN").
// A due night without either still counts as ordinary, so the stage is told
// to re-check again; nightly-liveness.mjs reports that as UNCLOSED.

/**
 * The phrase every calibration gate in .github/nightly-prompts asks a stage to
 * begin its calibration CLEAN summary with. One fixed string on both sides of
 * the contract, pinned by a test against the prompts, so the counter and the
 * instructions can never drift apart again.
 */
export const CALIBRATION_TOKEN = "Calibration pass:";

// The wordings stages have used for a wider check, kept so history still
// reads the way the stages meant it. Matching is safe to be generous here only
// because it is consulted on due nights alone (see calibrationTimeline).
const CALIBRATION_WORDING = /\bcalibrat\w*|\bwiden\w*|consecutive CLEAN/i;

/** Whether a summary says the stage ran its wider re-check. Not a verdict on its own; see calibrationTimeline. */
export function hasCalibrationMarker(summary) {
  const text = String(summary ?? "");
  return text.includes(CALIBRATION_TOKEN) || CALIBRATION_WORDING.test(text);
}

/**
 * Every record in order, with whether the stage was due at it and whether it
 * registered as a calibration. The one place the rule above is applied: the
 * counter, the recap's prose and the detector check all read this.
 *
 * `streakBefore` is the ordinary CLEAN streak the stage carried into the
 * record. Anything other than CLEAN ends the streak, as it always has.
 */
export function calibrationTimeline(records, threshold = CALIBRATION_CLEAN_STREAK) {
  let streak = 0;
  return (records || []).map(record => {
    if (record.status !== "CLEAN") {
      streak = 0;
      return { record, streakBefore: 0, due: false, registered: false };
    }
    const streakBefore = streak;
    const due = streakBefore >= threshold;
    const registered = due && hasCalibrationMarker(record.summary);
    streak = registered ? 0 : streak + 1;
    return { record, streakBefore, due, registered };
  });
}

export function ordinaryCleanStreakSinceCalibration(records, threshold = CALIBRATION_CLEAN_STREAK) {
  const timeline = calibrationTimeline(records, threshold);
  const last = timeline.at(-1);
  if (!last || last.record.status !== "CLEAN") return 0;
  return last.registered ? 0 : last.streakBefore + 1;
}

/**
 * The timeline entry for a stage's FIRST record on `date`, the record the
 * recap reads as the stage's declared outcome, or null when it has none.
 */
export function calibrationOn(coverageContent, stageNumber, date, threshold = CALIBRATION_CLEAN_STREAK) {
  const records = parseTerminalCoverageLines(coverageContent, stageNumber);
  const timeline = calibrationTimeline(records, threshold);
  return timeline.find(entry => entry.record.date === date) || null;
}

export function calibrationForStage(stage, coverageContent, threshold = CALIBRATION_CLEAN_STREAK) {
  const records = parseTerminalCoverageLines(coverageContent, stage.number);
  const consecutiveClean = cleanStreak(records);
  const ordinaryCleanSinceCalibration = ordinaryCleanStreakSinceCalibration(records, threshold);
  return {
    stage: stage.number,
    slug: stage.slug,
    threshold,
    consecutiveClean,
    ordinaryCleanSinceCalibration,
    due: ordinaryCleanSinceCalibration >= threshold,
    lastTerminalStatus: records.at(-1)?.status || null,
    lastTerminalDate: records.at(-1)?.date || null,
  };
}

export function buildCalibrationReport(registry, readCoverage, threshold = CALIBRATION_CLEAN_STREAK) {
  const stages = (registry?.stages || []).map(stage =>
    calibrationForStage(stage, readCoverage(stage.coverageLog), threshold),
  );
  return {
    version: 1,
    threshold,
    stages,
    due: stages.filter(stage => stage.due),
  };
}

export function renderStageCalibration(report, stageNumber) {
  const stage = report.stages.find(item => item.stage === stageNumber);
  if (!stage) throw new Error(`Stage ${stageNumber} is not present in the calibration report.`);
  return [
    `stage: ${stage.stage}`,
    `slug: ${stage.slug}`,
    `consecutive-clean: ${stage.consecutiveClean}`,
    `ordinary-clean-since-calibration: ${stage.ordinaryCleanSinceCalibration}`,
    `threshold: ${stage.threshold}`,
    `calibration-due: ${stage.due ? "YES" : "NO"}`,
    `last-terminal-status: ${stage.lastTerminalStatus || "none"}`,
    `last-terminal-date: ${stage.lastTerminalDate || "none"}`,
    stage.due
      ? "instruction: widen the candidate scan before finalizing CLEAN, and include the widened evidence in --summary, --why, or --result."
      : "instruction: normal bounded scan is sufficient; still include concrete CLEAN evidence if no source change is required.",
  ].join("\n");
}

export function runCli(argv = process.argv.slice(2)) {
  const stageArg = argv.indexOf("--stage");
  const stageNumber = stageArg >= 0 ? Number(argv[stageArg + 1]) : null;
  const registry = JSON.parse(readFileSync(".github/nightly-config/stages.json", "utf8"));
  const report = buildCalibrationReport(registry, coverageLog => {
    try {
      return readFileSync(coverageLog, "utf8");
    } catch {
      return "";
    }
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(stageNumber ? report.stages.find(stage => stage.stage === stageNumber) : report, null, 2));
    return;
  }
  console.log(stageNumber ? renderStageCalibration(report, stageNumber) : JSON.stringify(report, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith("nightly-clean-calibration.mjs")) {
  runCli();
}
