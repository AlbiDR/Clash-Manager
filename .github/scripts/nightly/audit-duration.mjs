#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: AUDIT DURATION
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Reports how long each lane's audits actually took, from the
 * session timing block already present in every coverage-log line. Gives
 * Stage 13 a measurement it has never had: whether a lane's CLEAN verdict was
 * earned by work or filed on arrival.
 *
 * WHY THIS EXISTS
 * The timing block has been written since 2026-09-03 and nothing read it. Over
 * 2026-09-03 to 2026-09-09 the lanes that produced real work ran 5 to 16
 * minutes, the lanes that produced nothing ran 2 to 6, and two audits
 * completed in a recorded ZERO minutes -- one of them claiming to have
 * examined 75 files across 10 UX categories. That claim and that duration
 * cannot both be true, and nothing in the pipeline noticed.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * It sets no threshold and blocks nothing. A "too fast" cutoff would be a
 * hardcoded number standing in for judgement, and a gate on finalization
 * would risk a stage's whole night, which the owner has repeatedly and
 * correctly declined. So this reports the distribution and lets the lane that
 * audits the pipeline judge each duration against that lane's stated scope.
 *
 * The one categorical flag is a zero-minute audit, and that is not a tuning
 * knob: the log records whole minutes, so 0m means the session opened and
 * closed inside the same minute. No surface was examined in that time.
 *
 * A record written before 2026-09-03 carries no timing block. Those are
 * reported as untimed rather than as zero, because treating a format change
 * as a finding is how a detector manufactures work.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseCoverageLog } from './coverage-log-line.mjs';
// Imported rather than reimplemented: the coherence suite forbids a second
// definition of the same helper, for the same reason two coverage-line parsers
// were a defect.
import { median } from './nightly-health.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const REGISTRY_PATH = path.join(REPO_ROOT, '.github', 'nightly-config', 'stages.json');

/** Recent audits shown per lane. Presentation only; nothing is computed from it. */
export const RECENT_WINDOW = 7;

/**
 * Reduces one lane's coverage records to its duration profile. `records` is
 * oldest-first, as parseCoverageLog returns them.
 */
export function laneDurations(stage, records) {
  const timed = records.filter(record => record.window);
  const minutes = timed.map(record => record.window.minutes);
  const zeroMinute = timed
    .filter(record => record.window.minutes === 0)
    .map(record => ({ date: record.date, status: record.status, summary: record.summary }));

  return {
    stage: stage.number,
    slug: stage.slug,
    timedAudits: timed.length,
    untimedAudits: records.length - timed.length,
    recent: timed.slice(-RECENT_WINDOW).reverse().map(record => ({
      date: record.date,
      status: record.status,
      minutes: record.window.minutes,
    })),
    medianMinutes: median(minutes),
    shortestMinutes: minutes.length ? Math.min(...minutes) : null,
    longestMinutes: minutes.length ? Math.max(...minutes) : null,
    zeroMinute,
  };
}

export function buildDurationReport(readCoverageLog, registry) {
  const lanes = registry.stages.map(stage => {
    let content = '';
    try {
      content = readCoverageLog(stage);
    } catch {
      content = '';
    }
    return laneDurations(stage, parseCoverageLog(content, stage.number));
  });

  return {
    version: 1,
    recentWindow: RECENT_WINDOW,
    lanes,
    zeroMinuteAudits: lanes.flatMap(lane =>
      lane.zeroMinute.map(item => ({ stage: lane.stage, slug: lane.slug, ...item })),
    ),
  };
}

function renderHuman(report) {
  const lines = [];
  lines.push(`Audit durations, most recent ${report.recentWindow} timed audits per lane (newest first).`);
  lines.push('A duration is evidence about whether a verdict was earned. Judge each against that lane\'s stated scope.');
  lines.push('');
  lines.push('Stage  recent (min)                median  shortest  longest  timed');
  for (const lane of report.lanes) {
    const recent = lane.recent.map(item => `${item.minutes}m`).join(' ').padEnd(27);
    const fmt = value => (value === null ? '-' : `${value}m`);
    lines.push(
      `S${String(lane.stage).padStart(2, '0')}    ${recent} ${fmt(lane.medianMinutes).padStart(6)}  `
      + `${fmt(lane.shortestMinutes).padStart(8)}  ${fmt(lane.longestMinutes).padStart(7)}  ${String(lane.timedAudits).padStart(5)}`,
    );
  }
  lines.push('');
  if (report.zeroMinuteAudits.length === 0) {
    lines.push('Zero-minute audits: none. Every timed audit occupied at least one minute.');
  } else {
    lines.push(`ZERO-MINUTE AUDITS: ${report.zeroMinuteAudits.length}. The log records whole minutes, so the`);
    lines.push('session opened and closed inside the same minute. No surface was examined.');
    for (const item of report.zeroMinuteAudits) {
      lines.push(`  [${item.date}] Stage ${item.stage} (${item.slug}) ${item.status}: ${item.summary.slice(0, 110)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderDurationReport(argv = process.argv.slice(2), repoRoot = REPO_ROOT) {
  const registry = JSON.parse(readFileSync(path.join(repoRoot, path.relative(REPO_ROOT, REGISTRY_PATH)), 'utf8'));
  const report = buildDurationReport(
    stage => readFileSync(path.join(repoRoot, stage.coverageLog), 'utf8'),
    registry,
  );
  return argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(renderDurationReport());
}
