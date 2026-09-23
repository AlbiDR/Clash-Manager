// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { parseCoverageLog } from "./coverage-log-line.mjs";
import { getCycleDate, getEvidenceDate } from "./nightly-events.mjs";

// Blind spots: the checks a stage could not run, which its CLEAN never says.
//
// THE GAP (measured 2026-09-23)
// Several stages run sub-checks whose status update-nightly-context.sh computes
// deterministically every night and writes to /tmp/nightly/<check>-status.txt.
// Each check has two kinds of value. Some mean the check ran and answered
// (PASS, FAIL, CLEAN, OK, DB-AVAILABLE). Others mean it could not answer at all
// (DEGRADED, SKIPPED, DB-UNAVAILABLE). The recap had exactly one reader of a
// stage's own sub-check prose, the self-report guard, and it knows only the
// failing verbs (FAIL, DIVERGENT, UNFOLDED). So "could not check" collapsed
// into the declared CLEAN, and from there into the grade.
//
// On 2026-09-22 that printed "Grade: 10/10 - Optimal run" and "S03 ... Clean"
// over a Result line that itself said "fold-state: DEGRADED ...;
// database-verification: DB-UNAVAILABLE". Across every S03 night since the
// status vocabulary appeared (2026-08-31, commit e615d914e):
// - database verification reported DB-UNAVAILABLE on 19 of 22 nights and was
//   silent on the other 3. DB-AVAILABLE has never appeared, ever.
// - fold-state ran (CLEAN or FOLDED) from 08-31 to 09-06, was DEGRADED on
//   09-07, ran again 09-09 to 09-12, was unstated on 09-13, and has been
//   DEGRADED on every night since 09-14.
// Nothing in the grade or the stage header distinguished any of those nights
// from a night where everything had been checked.
//
// THIS READER HAS TO SAY WHEN IT CANNOT SEE
// The authoritative statuses are never persisted today; the only durable
// carrier is the stage's own prose, and agents narrate them unevenly (S03
// database 19 of 22 nights, S12 apk-ux-audit 8 of 23, S05/S06 doc-debt 0 of
// 23, S13 audit-duration 0 of 23). A prose reader that took silence as "fine"
// would be blind to four of the six checks while reporting "none found". So
// every outcome here is one of three things, never two: a check that ran, a
// check that could not run, and a check nobody reported. "Not reported" is
// never allowed to read as "ran", and a stage that stops mentioning a check
// it last said it could not run is UNSTATED, "unknown, not fixed", never
// RESTORED.
//
// WHY THERE IS NO WINDOW, COUNT OR CLOCK
// Every verdict is a transition between a stage's own STATED nights: NEW is
// "could not run tonight, ran on the last night it said", RESTORED is the
// reverse. Nothing is compared against a constant, and a night on which the
// stage said nothing is skipped rather than read as either value, which is
// what keeps 2026-09-13 (silent) from turning 09-14 into ONGOING instead of
// NEW.
//
// WHY FAIL COUNTS AS ANSWERED
// A FAIL is a check that ran and found something. Reporting it is the
// self-report guard's job (hasSelfReportedFailure in nightly-recap.mjs), so
// the two readers partition the vocabulary and never double-count one value.
//
// Measured against every terminal coverage record (779, 2026-07-14 to
// 2026-09-22) and every version of every PR-history block (561 stage-nights):
// zero status tokens are left unattributed by the aliases below, and the only
// stage with a blind spot is S03. SKIPPED, N/A and BLOCKED never appear as a
// sub-check status in either source.
//
// Pure: no I/O, nothing runs at import, because nightly-recap.mjs imports this
// and the watchdog and explainer import the recap.

/**
 * One entry per status file update-nightly-context.sh writes. The id is the
 * file's basename without "-status.txt", so a structured source can be keyed
 * by the producer's own names. `answered` and `unanswered` partition every
 * value the producer can write; a pin test parses the producer script and
 * fails the moment a value is added there without being classified here.
 *
 * `alias` is how agents spell the check in prose, drawn from the spellings on
 * record: "DB: DB-UNAVAILABLE", "db-verification DB-UNAVAILABLE", "Database
 * verification: DB-UNAVAILABLE", "database DB-UNAVAILABLE", "Fold-state:
 * DEGRADED.", "apk-ux-audit-status.txt: PASS". `selfNamed` covers a value that
 * names its own check, as bare "DB-UNAVAILABLE" does on 2026-08-31.
 *
 * fold-state's FOLDED and UNFOLDED are not producer values, but agents narrate
 * fold-state.mjs's own verdicts with them, and both mean the check ran.
 */
export const SUB_CHECKS = Object.freeze([
  {
    id: "database-verification",
    label: "database verification",
    alias: /\b(?:database|db)(?:[- ]verification)?\b/i,
    selfNamed: /\bDB-(?:UN)?AVAILABLE\b/,
    answered: ["DB-AVAILABLE"],
    unanswered: ["DB-UNAVAILABLE", "SKIPPED"],
  },
  {
    id: "fold-state",
    label: "fold-state check",
    alias: /\bfold[- ]state\b/i,
    answered: ["CLEAN", "FOLDED", "PENDING", "UNFOLDED"],
    unanswered: ["DEGRADED", "SKIPPED"],
  },
  {
    id: "migration-quality",
    label: "migration-quality audit",
    alias: /\bmigration[- ]quality\b/i,
    answered: ["PASS", "FAIL"],
    unanswered: ["DEGRADED", "SKIPPED"],
  },
  {
    id: "apk-ux-audit",
    label: "APK UX audit",
    alias: /\bapk[- ]ux[- ]audit(?:-status\.txt)?\b/i,
    answered: ["PASS", "FAIL"],
    unanswered: ["DEGRADED", "SKIPPED"],
  },
  {
    id: "doc-debt",
    label: "documentation debt scan",
    alias: /\bdoc[- ]debt(?:-status\.txt)?\b/i,
    answered: ["OK"],
    unanswered: ["DEGRADED", "SKIPPED"],
  },
  {
    id: "audit-duration",
    label: "audit duration scan",
    alias: /\baudit[- ]duration(?:-status\.txt)?\b/i,
    answered: ["OK"],
    unanswered: ["DEGRADED", "SKIPPED"],
  },
]);

export const BLIND_SPOT_KINDS = Object.freeze({
  // Could not run tonight, and never has on any night the stage reported.
  NEVER: "NEVER",
  // Could not run tonight, and ran on the last night the stage reported.
  NEW: "NEW",
  // Could not run tonight or on the last reported night, having run before.
  ONGOING: "ONGOING",
  // A structured value in neither vocabulary set: not counted as having run.
  UNRECOGNISED: "UNRECOGNISED",
  // Ran tonight after not running on the last reported night.
  RESTORED: "RESTORED",
  // Ran tonight for the first time ever.
  FIRST_RUN: "FIRST_RUN",
  // Not reported tonight, and it could not run on the last reported night.
  UNSTATED: "UNSTATED",
});

/** Could not run tonight, as far as tonight's evidence says. */
export const COULD_NOT_RUN_KINDS = new Set(["NEVER", "NEW", "ONGOING", "UNRECOGNISED"]);
/** Lost tonight: a check the stage had, and a status nobody classified. */
export const NEW_KINDS = new Set(["NEW", "UNRECOGNISED"]);
/** An environment fact carried from earlier nights, not tonight's doing. */
export const STANDING_KINDS = new Set(["NEVER", "ONGOING", "UNSTATED"]);
/** Good news. Printed, never graded. */
export const RECOVERED_KINDS = new Set(["RESTORED", "FIRST_RUN"]);

function checkFor(id) {
  return SUB_CHECKS.find(check => check.id === id) || null;
}

function classifyValue(check, value) {
  if (check?.answered.includes(value)) return true;
  if (check?.unanswered.includes(value)) return false;
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/**
 * The last status a piece of prose gives one check, or null when it gives none.
 *
 * The alias and the optional "status"/"state" word are case-insensitive; the
 * value is not. A status here is always the producer's ALL-CAPS token, so
 * lowercase "degraded" in ordinary prose is not one. The gap between alias and
 * value is limited to punctuation and spaces, so "fold-state check complete"
 * and "apk-ux-audit.json: 12 candidate files" carry no status. Last match wins
 * because a stage that restates a value restates the one it ended on.
 */
function proseValue(check, text) {
  const vocabulary = [...check.answered, ...check.unanswered].map(escapeRegExp).join("|");
  const pattern = new RegExp(
    `${check.alias.source}[^A-Za-z]{0,4}(?:(?:status|state)[^A-Za-z]{0,3})?(${vocabulary})\\b`,
    "gi",
  );
  let last = null;
  for (const match of text.matchAll(pattern)) {
    const value = match[1];
    if (value !== value.toUpperCase()) continue;
    if (!last || match.index >= last.index) last = { index: match.index, value };
  }
  if (check.selfNamed) {
    for (const match of text.matchAll(new RegExp(check.selfNamed.source, "g"))) {
      if (!last || match.index >= last.index) last = { index: match.index, value: match[0] };
    }
  }
  return last ? last.value : null;
}

/**
 * Which sub-checks a stage stated a status for on one night.
 *
 * `structured` is a { checkId: value } map from a source that owns the fact
 * (none exists yet; the planned [checks ...] coverage field would be one). When
 * it is present it wins over prose for every check it names, because the
 * helper that owns a fact is authoritative and prose is a paraphrase of it. An
 * id or value the vocabulary does not know is returned with answered:null
 * rather than dropped, so an unclassified status can never pass silently.
 *
 * Returns { [checkId]: { value, answered: true|false|null, source } } and omits
 * any check the night did not state. An absent key means "not reported", which
 * is a different fact from both answers.
 */
export function statedSubChecks({ structured = null, prose = "" } = {}) {
  const stated = {};
  const text = String(prose || "");
  for (const check of SUB_CHECKS) {
    const value = proseValue(check, text);
    if (value) stated[check.id] = { value, answered: classifyValue(check, value), source: "prose" };
  }
  for (const [id, raw] of Object.entries(structured || {})) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    stated[id] = { value, answered: classifyValue(checkFor(id), value), source: "structured" };
  }
  return stated;
}

/**
 * Every night each stage stated any sub-check, oldest first, keyed by run date.
 *
 * `historyByStage` is { [stage]: [PR-history entries with .date] }, parsed by
 * the recap's own history parser and passed in, so there is one parser for
 * that format and no import cycle back into the recap.
 *
 * Each night reads the FIRST coverage record for its date, the same record
 * declaredCoverageRecord reads, and that date's PR-history entry. Coverage and
 * history are dated by evidence date; the result is re-keyed by run date
 * through getCycleDate so Stage 1's previous-day logging lines up with every
 * other stage.
 *
 * It stops AT the selected run date. A night after it must never change how
 * that date reads, for the same reason ledgerThrough stops there.
 */
export function subCheckHistory({ registry, coverageByStage = {}, historyByStage = {}, date }) {
  const byStage = {};
  for (const stage of registry?.stages || []) {
    const last = getEvidenceDate(stage.number, date);
    const prose = new Map();
    const structured = new Map();
    const add = (evidenceDate, parts) => {
      if (evidenceDate > last) return;
      const text = parts.filter(Boolean).join(" ");
      prose.set(evidenceDate, prose.has(evidenceDate) ? `${prose.get(evidenceDate)} ${text}` : text);
    };
    const seen = new Set();
    for (const record of parseCoverageLog(coverageByStage[stage.number], stage.number)) {
      if (seen.has(record.date)) continue;
      seen.add(record.date);
      add(record.date, [record.target, record.summary]);
      // A structured map on the record, once the coverage parser returns one,
      // is the owner's statement and beats the prose for every check it names.
      // Absent (every line written so far) means prose alone, never "none".
      if (record.checks && record.date <= last) structured.set(record.date, record.checks);
    }
    for (const entry of historyByStage[stage.number] || []) {
      if (entry?.date) add(entry.date, [entry.change, entry.result]);
    }
    byStage[stage.number] = [...prose.keys()].sort()
      .map(evidenceDate => ({
        date: getCycleDate(stage.number, evidenceDate),
        stated: statedSubChecks({ structured: structured.get(evidenceDate) || null, prose: prose.get(evidenceDate) }),
      }))
      .filter(night => Object.keys(night.stated).length > 0);
  }
  return byStage;
}

/** The ids a stage's nights ever named, SUB_CHECKS order first, unknown ids after. */
function checkIds(nights) {
  const ids = new Set();
  for (const night of nights) for (const id of Object.keys(night.stated)) ids.add(id);
  return [
    ...SUB_CHECKS.map(check => check.id).filter(id => ids.has(id)),
    ...[...ids].filter(id => !checkFor(id)).sort(),
  ];
}

/**
 * The blind-spot verdicts for one stage on one run date.
 *
 * Compares each check only against the stage's own previously STATED nights,
 * as described at the top of this file. Each verdict carries the dates behind
 * it, so the reader can print "since" and "last ran" without re-deriving them.
 */
export function evaluateBlindSpots(stageNights, date, { stage = null } = {}) {
  const nights = (stageNights || []).filter(night => night.date <= date);
  const items = [];
  for (const id of checkIds(nights)) {
    const stated = nights.filter(night => night.stated[id]).map(night => ({ date: night.date, ...night.stated[id] }));
    const tonight = stated.find(night => night.date === date) || null;
    const prior = stated.filter(night => night.date < date);
    const previous = prior.at(-1) || null;
    const ranBefore = prior.filter(night => night.answered === true);
    const lastAnswered = ranBefore.at(-1) || null;

    let kind = null;
    if (tonight && tonight.answered === null) kind = BLIND_SPOT_KINDS.UNRECOGNISED;
    else if (tonight && tonight.answered === false) {
      if (ranBefore.length === 0) kind = BLIND_SPOT_KINDS.NEVER;
      else kind = previous?.answered === true ? BLIND_SPOT_KINDS.NEW : BLIND_SPOT_KINDS.ONGOING;
    } else if (tonight) {
      if (previous && previous.answered !== true) {
        kind = ranBefore.length > 0 ? BLIND_SPOT_KINDS.RESTORED : BLIND_SPOT_KINDS.FIRST_RUN;
      }
    } else if (previous && previous.answered !== true) {
      kind = BLIND_SPOT_KINDS.UNSTATED;
    }
    if (!kind) continue;

    // The trailing run of not-answered nights: tonight's for a verdict about
    // tonight, the one ending on the last reported night for RESTORED,
    // FIRST_RUN and UNSTATED.
    const streakSource = tonight && tonight.answered !== true ? stated : prior;
    const streak = [];
    for (let i = streakSource.length - 1; i >= 0 && streakSource[i].answered !== true; i -= 1) {
      streak.unshift(streakSource[i]);
    }
    const streakValues = [...new Set(streak.map(night => night.value))];

    items.push({
      stage,
      check: id,
      label: checkFor(id)?.label || id,
      kind,
      value: tonight?.value ?? null,
      previous: previous ? { date: previous.date, value: previous.value } : null,
      statedNights: stated.length,
      unansweredNights: stated.filter(night => night.answered !== true).length,
      firstStated: stated[0].date,
      streakStart: streak[0]?.date ?? null,
      streakNights: streak.length,
      // The one value the whole streak shares, or null when it changed, so a
      // sentence never claims "DEGRADED on every night" over a mixed run.
      streakValue: streakValues.length === 1 ? streakValues[0] : null,
      lastAnswered: lastAnswered ? { date: lastAnswered.date, value: lastAnswered.value } : null,
    });
  }
  return items;
}

/** Which stages have ever reported a sub-check up to the date, and which did tonight. */
export function blindSpotCoverage(historyByRunDate, date) {
  const everReported = [];
  const reportedTonight = [];
  for (const [stage, nights] of Object.entries(historyByRunDate || {})) {
    const upTo = nights.filter(night => night.date <= date);
    if (upTo.length > 0) everReported.push(Number(stage));
    if (upTo.some(night => night.date === date)) reportedTonight.push(Number(stage));
  }
  return { everReported: everReported.sort((a, b) => a - b), reportedTonight: reportedTonight.sort((a, b) => a - b) };
}
