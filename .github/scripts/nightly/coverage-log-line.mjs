// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: COVERAGE LOG LINE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The single parser for a terminal coverage-log line. Every
 * consumer of these lines imports from here.
 *
 * The line shape, with any number of bracketed fields between the stage marker
 * and the status:
 *
 *   * [2026-09-09] [Stage 1] [23:17Z-23:23Z 6m] CLEAN: <target> -- <summary>
 *   * [2026-09-02] [Stage 1] CLEAN: <target> -- <summary>
 *
 * WHY THIS MODULE EXISTS (RCA, 2026-09-10)
 * On 2026-09-03 the format gained the session timing block. The calibration
 * parser required the status immediately after the stage marker, so it
 * silently matched nothing from that date on. It kept reporting confident
 * numbers from records ending 2026-09-02, and `calibration-due` could never
 * become true again for any stage -- which switched off the only mechanism
 * that makes a lane widen its scan and re-audit its own CLEAN verdicts. Nine
 * of thirteen lanes read that signal, and those nine produced 4 substantive
 * pull requests out of 64 across the following week while the four lanes that
 * do not read it produced 27 out of 28.
 *
 * CAPA: one parser, imported by every consumer. A second regex for the same
 * format is the same defect as two migration checkers with different rules,
 * and it fails the same way: silently, in whichever copy nobody updated.
 * ============================================================================
 */

/**
 * `(?: \[[^\]]*\])*` is deliberately permissive. A parser pinned to today's
 * exact field count is a parser that goes silently blind the next time the
 * format grows, which is precisely what happened.
 */
export const COVERAGE_LINE =
  /^\* \[(\d{4}-\d{2}-\d{2})\] \[Stage (\d+)\]((?: \[[^\]]*\])*) (CLEAN|CHANGED|SKIPPED|PARTIAL-RUN): (.*)$/;

/**
 * The payload splits into target and summary on ` -- `. The separator is
 * tolerated as absent because the recap parser has always tolerated it, and
 * unifying three parsers onto one must not quietly drop the most forgiving
 * behaviour of the three. With no separator the whole payload is the target
 * and the summary repeats it.
 */
const PAYLOAD_SEPARATOR = ' -- ';

/** A session window inside the bracket run, e.g. `[23:17Z-23:23Z 6m]`. */
const WINDOW_FIELD = /\[(\d{2}:\d{2})Z-(\d{2}:\d{2})Z (\d+)m\]/;

/**
 * Parses one line. Returns null when the line is not a terminal record, so
 * callers can filter a whole file without pre-checking.
 */
export function parseCoverageLine(line) {
  const match = COVERAGE_LINE.exec(String(line || '').trim());
  if (!match) return null;

  const [, date, stage, brackets, status, payload] = match;
  const window = WINDOW_FIELD.exec(brackets || '');
  const separator = payload.indexOf(PAYLOAD_SEPARATOR);
  const target = separator === -1 ? payload : payload.slice(0, separator);
  const summary = separator === -1 ? payload : payload.slice(separator + PAYLOAD_SEPARATOR.length);

  return {
    date,
    stage: Number(stage),
    status,
    target: target.trim(),
    summary: summary.trim(),
    // null rather than 0 when absent: a line written before the timing block
    // existed carries no duration, and treating that as a zero-minute audit
    // would manufacture a finding out of a format change.
    window: window
      ? { start: window[1], end: window[2], minutes: Number(window[3]) }
      : null,
  };
}

/**
 * Every terminal record in a coverage log, oldest first, optionally narrowed
 * to one stage.
 */
export function parseCoverageLog(content, stageNumber = null) {
  return String(content || '')
    .split('\n')
    .map(parseCoverageLine)
    .filter(Boolean)
    .filter(record => stageNumber === null || record.stage === Number(stageNumber));
}
