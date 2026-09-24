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
 *   * [2026-09-23] [Stage 3] [01:02Z-01:09Z 7m] [checks fold-state=DEGRADED] CLEAN: <target> -- <summary>
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
 * The stage's sub-check statuses inside the bracket run, e.g.
 * `[checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED]`.
 *
 * WHY THIS FIELD EXISTS (2026-09-23)
 * update-nightly-context.sh computes an authoritative status for six sub-checks
 * every night (fold-state, migration-quality, database-verification,
 * apk-ux-audit, doc-debt, audit-duration) and writes each to
 * `<name>-status.txt` in the context dir. Finalize never persisted them, so
 * once the Jules VM was gone the only trace was the agent's own paraphrase.
 * Measured over 2026-08-31..2026-09-22: Stage 3 narrated its database status
 * on 19 of 22 nights, Stage 12 its APK UX audit on 8 of 23, and Stages 5, 6
 * and 13 their doc-debt and audit-duration statuses on 0 of 23. A reader that
 * relies on prose therefore reads "not mentioned" as "fine" for four of the
 * six checks. finalize now writes the values it can see, and this is where
 * they are read back.
 *
 * Only the bracket run is searched, never the ` -- ` payload, so a summary that
 * happens to quote a checks field cannot forge one. Names are lowercase and
 * values uppercase because that is what the producers write; subCheckField in
 * nightly-stage.mjs enforces the same shape on the way in, so a `]` can never
 * be written inside the field and end the bracket early.
 */
export const CHECKS_FIELD = /\[checks ((?:[a-z0-9-]+=[A-Z0-9_-]+ ?)+)\]/;

/**
 * `{ name: value }` from the bracket run, or null when the line carries no
 * checks field. null means UNMEASURED: every line written before this field
 * existed, and every line from a stage whose own checks were all SKIPPED. It
 * must never be read as "no check had a problem", which is why this returns
 * null rather than an empty object.
 */
function parseChecks(brackets) {
  const match = CHECKS_FIELD.exec(brackets || '');
  if (!match) return null;
  const checks = {};
  for (const pair of match[1].trim().split(/\s+/)) {
    const separator = pair.indexOf('=');
    checks[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return checks;
}

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
    // null, not {}, when absent, for the same reason as `window`: a line with
    // no checks field is unmeasured, not clean. See CHECKS_FIELD.
    checks: parseChecks(brackets),
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
