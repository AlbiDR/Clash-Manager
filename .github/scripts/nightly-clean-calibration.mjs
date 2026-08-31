// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFileSync } from "node:fs";

export const CALIBRATION_CLEAN_STREAK = 7;
const TERMINAL_LINE = /^\* \[(\d{4}-\d{2}-\d{2})\] \[Stage (\d+)\] (CLEAN|CHANGED|SKIPPED|PARTIAL-RUN): (.*?) -- (.*)$/;

export function parseTerminalCoverageLines(content, stageNumber) {
  return String(content || "")
    .split("\n")
    .map(line => TERMINAL_LINE.exec(line.trim()))
    .filter(Boolean)
    .filter(match => Number(match[2]) === stageNumber)
    .map(match => ({
      date: match[1],
      stage: Number(match[2]),
      status: match[3],
      target: match[4].trim(),
      summary: match[5].trim(),
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

function isCalibrationClean(record) {
  return record.status === "CLEAN" && /\bcalibration\b|consecutive CLEAN/i.test(record.summary);
}

export function ordinaryCleanStreakSinceCalibration(records) {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.status !== "CLEAN") break;
    if (isCalibrationClean(record)) break;
    streak += 1;
  }
  return streak;
}

export function calibrationForStage(stage, coverageContent, threshold = CALIBRATION_CLEAN_STREAK) {
  const records = parseTerminalCoverageLines(coverageContent, stage.number);
  const consecutiveClean = cleanStreak(records);
  const ordinaryCleanSinceCalibration = ordinaryCleanStreakSinceCalibration(records);
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
