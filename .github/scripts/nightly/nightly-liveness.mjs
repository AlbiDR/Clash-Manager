// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { parseCoverageLog } from "./coverage-log-line.mjs";
import { CALIBRATION_CLEAN_STREAK, calibrationTimeline } from "./nightly-clean-calibration.mjs";
import { getEvidenceDate } from "./nightly-events.mjs";
import { isObserved } from "./nightly-health.mjs";
import { hasInterventionEvidence } from "./nightly-intervention.mjs";
import { isPlaceholderField } from "./nightly-prose.mjs";

// Detector liveness: whether each of the recap's own checks could see its
// evidence for the run it is judging.
//
// THE DEFECT CLASS (measured 2026-09-22, all 42 ledger dates)
// Every check in the recap reads its input through a reader that returns the
// same empty value whether the input is genuinely absent or the reader went
// blind. The output is then indistinguishable from "judged, found nothing",
// and three detectors went blind that way without anybody noticing:
//
// - Merge tags. The recap read only `git tag -l nightly/*`, while evidence
//   refs older than a week had been moved to refs/nightly-archive/. 9 of 42
//   dates were misreported and 2026-08-20 printed "Dead pipeline" at 1/10
//   over 8 merged stages. Fixed at the root in b2d55452f (evidenceRefNames);
//   tagsProbe below stays as the cheap witness that the fix keeps holding.
// - The calibration counter. Its line parser was repaired on 2026-09-10 (see
//   coverage-log-line.mjs), but its RECOGNISER was a vocabulary list the
//   stages stopped speaking. S01's "Widened runtime security audit ..." on
//   2026-09-20 did not match, so S01 was told "calibration-due: YES" every
//   night after and its count never reset; S03's lines that only REPORTED
//   its counter did match, resetting it on nights nothing was due. The
//   recogniser itself was fixed on 2026-09-27 (a calibration now needs the
//   stage to have been due; see nightly-clean-calibration.mjs). The check
//   below stays as the witness that it keeps working: replayed, it would have
//   flagged S12 on 2026-09-08, two days before the manual discovery.
// - Watchdog observation. On 2026-08-20 and 08-22 the ledger held 12
//   EXPECTED rows while 8 stages had merged, so health and the nudge count
//   skipped those stages silently.
// And the precedent all three repeat: on 2026-09-03 the coverage line gained
// its timing block and the calibration parser matched nothing for seven
// nights while reporting confident numbers.
//
// THE PREVENTIVE ACTION
// Every check gets a WITNESS: a second, independent piece of evidence that
// its input should exist. A check whose witness is present while its input is
// not is BLIND, and says so, instead of contributing its silence to an
// all-clear. Four verdicts, never two:
//   FED        every witnessed stage had its input
//   BLIND      at least one witnessed stage did not
//   NOT_YET    the input field has never appeared anywhere up to this date,
//              so the check did not exist yet
//   UNASKABLE  the check exists but nothing on this run could be asked of it
//              (no stage merged, no history entry survives, one result is not
//              enough to find a duplicate)
// UNASKABLE and NOT_YET are never counted as "had what they need". That is
// the whole point: a reader that could not answer must print something
// different from "no".
//
// WHY THERE IS NO THRESHOLD OR CLOCK
// A check's epoch is the first appearance of its input field in the ledger or
// logs up to the recap date, computed from the evidence, never configured.
// The calibration check reuses CALIBRATION_CLEAN_STREAK by import rather than
// restating it, and the intervention witness is PR-number order, which is
// allocated by creation and needs no clock. The session-updateTime witness
// that was tried instead fired 41 false alarms on 2026-09-03 to 09-06 and
// 09-11, and was rejected.
//
// WHICH CHECKS MAY MOVE THE GRADE
// Only coverage, tags and intervention (feedsGrade). The observation check is
// report-only on purpose: the rubric's "Unverified ... never observed" 9
// already grades exactly the stages it finds, and a second rule over the same
// stages would count one gap twice. The calibration check is advisory: a
// stuck counter changes what a stage is told to do, not whether tonight's
// result was delivered.
//
// Pure: no I/O and nothing runs at import, because nightly-recap.mjs imports
// this and nightly-watchdog.mjs and nightly-explain.mjs import the recap.

export const LIVENESS = Object.freeze({
  FED: "FED",
  BLIND: "BLIND",
  NOT_YET: "NOT_YET",
  UNASKABLE: "UNASKABLE",
});

// One finding kind. A second, PREMATURE (a count reset on a night nothing was
// due), existed until 2026-09-27; the counter's own rule now makes it
// impossible, because a line only registers on a night the stage was due.
export const CALIBRATION_FINDINGS = Object.freeze({
  UNCLOSED: "UNCLOSED",
});

/**
 * The first run date, on or before `date`, on which any ledger row satisfied
 * `has`: the day that field started being recorded. Null when it never has,
 * which is what NOT_YET means. Run dates are ISO, so ordering is a string
 * compare.
 */
function fieldEpoch(ledger, date, has) {
  const dates = Object.keys(ledger?.runs || {}).filter(runDate => runDate <= date).sort();
  return dates.find(runDate => Object.values(ledger.runs[runDate] || {}).some(entry => entry && has(entry))) || null;
}

/**
 * Whether a row may be judged for a field whose recording began on `epoch`.
 * On the epoch night itself the instrumentation arrived part-way through the
 * run, so the stages that ran before it carry nothing and are not blind:
 * evidence.body first appears on 2026-09-03 from S02 on, and judging S01's
 * row that night (evidence date 09-02) would fire on a check that did not
 * exist for it yet. From the next night on, every row is judged.
 */
function judgeableSince(epoch, date, entry, has) {
  return epoch !== null && (epoch < date || Boolean(entry && has(entry)));
}

function ledgerRowFor(ctx, stageNumber) {
  return ctx.ledger?.runs?.[ctx.date]?.[String(stageNumber)] ?? null;
}

function recordsFor(ctx, stageNumber) {
  return parseCoverageLog(ctx.coverageByStage?.[stageNumber], stageNumber);
}

function declaredRecordFor(ctx, stageNumber) {
  const evidenceDate = getEvidenceDate(stageNumber, ctx.date);
  return recordsFor(ctx, stageNumber).find(record => record.date === evidenceDate) || null;
}

/**
 * The raw lines a stage wrote for a date, read with a deliberately looser
 * pattern than the shared parser: only the date and stage marker. A witness
 * that shared the parser's rules would go blind with it, which is the one
 * failure a witness exists to catch. It never interprets the status; that
 * stays with coverage-log-line.mjs.
 */
function rawCoverageLines(content, stageNumber, evidenceDate) {
  const prefix = `* [${evidenceDate}] [Stage ${stageNumber}]`;
  return String(content || "").split("\n").map(line => line.trim()).filter(line => line.startsWith(prefix));
}

/** The status token of a raw line the parser could not read, e.g. VERIFIED or IN-PROGRESS. */
function rawStatusToken(line) {
  const match = /^\* \[[^\]]*\] \[Stage \d+\](?: \[[^\]]*\])* ([A-Z][A-Z-]*):/.exec(line);
  return match ? match[1] : null;
}

/**
 * The raw PR-history blocks for one stage and date, split on the heading
 * marker only. Same reasoning as rawCoverageLines: parsePrHistoryEntries in
 * the recap is the parser, and this is the independent evidence that it had
 * something to parse.
 */
function rawHistoryBlocks(prHistory, stageNumber, evidenceDate) {
  return String(prHistory || "")
    .split(/^(?=### )/m)
    .filter(block => block.startsWith(`### [${evidenceDate}]`))
    .filter(block => block.split("\n")[0].includes(`[Stage ${stageNumber}]`));
}

const NUDGES_LINE = /^\*\*Nudges:\*\*.*$/m;

function probeResult(spec, { epochReached = true, judged = 0, findings = [], nothingToAsk = null }) {
  let verdict;
  if (!epochReached) verdict = LIVENESS.NOT_YET;
  else if (findings.length > 0) verdict = LIVENESS.BLIND;
  else if (judged === 0) verdict = LIVENESS.UNASKABLE;
  else verdict = LIVENESS.FED;
  return {
    id: spec.id,
    name: spec.name,
    feedsGrade: spec.feedsGrade,
    verdict,
    judged,
    findings: verdict === LIVENESS.BLIND ? findings : [],
    stages: verdict === LIVENESS.BLIND ? findings.map(finding => finding.stage) : [],
    reason: verdict === LIVENESS.UNASKABLE ? nothingToAsk : null,
  };
}

/**
 * Witness: the stage merged. Input: a coverage line for its evidence date that
 * the shared parser can read. No epoch, because the logs predate the ledger:
 * a merged stage with no readable line is blind on any date.
 *
 * Measured over all 42 dates it fires on 3 stage-nights (08-14 S08, 08-19 S07
 * and 08-20 S01, a merged stage whose line was IN-PROGRESS or missing), all
 * true. It is the check that would catch the next format change on the night
 * it lands, because every outcome and the calibration counter read through it.
 */
export function coverageProbe(ctx) {
  const findings = [];
  let judged = 0;
  for (const stage of ctx.stages || []) {
    if (!stage.merged) continue;
    judged += 1;
    if (declaredRecordFor(ctx, stage.stage)) continue;
    const evidenceDate = getEvidenceDate(stage.stage, ctx.date);
    const raw = rawCoverageLines(ctx.coverageByStage?.[stage.stage], stage.stage, evidenceDate);
    findings.push({ stage: stage.stage, token: raw.length > 0 ? rawStatusToken(raw[raw.length - 1]) : null, raw: raw.length > 0 });
  }
  return probeResult(PROBE_SPECS.coverage, { judged, findings, nothingToAsk: "no stage merged on this run" });
}

/**
 * Witness: the watchdog wrote a merge tag into the ledger row. Input: that
 * tag is among the evidence refs the recap read (evidenceRefNames' output,
 * live tags plus the archive). Blind when the archive was not fetched, which
 * is the direction that tells the truth.
 */
export function tagsProbe(ctx) {
  const epochReached = fieldEpoch(ctx.ledger, ctx.date, entry => entry?.evidence?.tag) !== null;
  const known = new Set(ctx.tags || []);
  const findings = [];
  let judged = 0;
  for (const stage of ctx.registry?.stages || []) {
    const tag = ledgerRowFor(ctx, stage.number)?.evidence?.tag;
    if (!tag) continue;
    judged += 1;
    if (!known.has(tag)) findings.push({ stage: stage.number, tag });
  }
  return probeResult(PROBE_SPECS.tags, { epochReached, judged, findings, nothingToAsk: "the watchdog recorded no merge tag for this run" });
}

/**
 * Witness: the stage merged or logged a result. Input: the watchdog reached a
 * verdict for it (isObserved). Report-only: see the header.
 */
export function observationProbe(ctx) {
  const epochReached = Object.keys(ctx.ledger?.runs || {}).some(runDate => runDate <= ctx.date);
  const findings = [];
  let judged = 0;
  for (const stage of ctx.stages || []) {
    if (!stage.merged && !declaredRecordFor(ctx, stage.stage)) continue;
    judged += 1;
    if (!isObserved(ledgerRowFor(ctx, stage.stage))) findings.push({ stage: stage.stage });
  }
  return probeResult(PROBE_SPECS.observation, { epochReached, judged, findings, nothingToAsk: "no stage merged or logged a result" });
}

/**
 * Witness: PR order. PR numbers are allocated in creation order and the
 * stages run in number order, so a stage whose PR number is HIGHER than a
 * later stage's opened after the pipeline had moved past it, which is what a
 * stalled stage that was nudged looks like. Input: the ledger row records an
 * intervention.
 *
 * Measured over every merged stage pair since 2026-08-23: 35 of 35 overtaken
 * stages carried recovery evidence, and none was overtaken without it. The
 * witness is one-sided. It cannot see a nudge that worked before the next
 * stage opened (5 such, among them 2 fast S06 nudges), and it can never judge
 * the last stage, because nothing runs after it to overtake it. So a FED
 * verdict means no MISSED nudge was seen, never that every nudge was recorded.
 *
 * Only observed rows are judged: an unobserved row has no intervention field
 * to read, and that gap is observationProbe's finding, not a missed nudge.
 */
export function interventionProbe(ctx) {
  const epoch = fieldEpoch(ctx.ledger, ctx.date, hasInterventionEvidence);
  const last = Math.max(0, ...(ctx.registry?.stages || []).map(stage => stage.number));
  const numbered = (ctx.stages || []).filter(stage => stage.merged && Number.isInteger(stage.prNumber));
  const findings = [];
  let judged = 0;
  for (const stage of numbered) {
    if (stage.stage === last || !stage.observed) continue;
    const row = ledgerRowFor(ctx, stage.stage);
    if (!judgeableSince(epoch, ctx.date, row, hasInterventionEvidence)) continue;
    const later = numbered.filter(other => other.stage > stage.stage);
    if (later.length === 0) continue;
    judged += 1;
    if (hasInterventionEvidence(row)) continue;
    const overtaker = later.find(other => other.prNumber < stage.prNumber);
    if (overtaker) findings.push({ stage: stage.stage, overtakenBy: overtaker.stage });
  }
  return probeResult(PROBE_SPECS.intervention, {
    epochReached: epoch !== null,
    judged,
    findings,
    nothingToAsk: "fewer than two observed stages merged with a known pull request number",
  });
}

/**
 * Witness: a raw `### [date] ... [Stage N]` heading. Input: the recap's
 * parser returned an entry for it. With no heading at all the entry has aged
 * out, which the recap's "Detail aged out" line already reports, so that is
 * UNASKABLE and never BLIND. 653 historical versions of the file replayed
 * with 0 ledger-era headings that failed to parse: this is a tripwire, not a
 * live finding.
 */
export function historyProbe(ctx) {
  const findings = [];
  let judged = 0;
  for (const stage of ctx.registry?.stages || []) {
    const evidenceDate = getEvidenceDate(stage.number, ctx.date);
    const blocks = rawHistoryBlocks(ctx.prHistory, stage.number, evidenceDate);
    if (blocks.length === 0) continue;
    judged += 1;
    const parsed = (ctx.historyByStage?.[stage.number] || []).some(entry => entry.date === evidenceDate);
    if (!parsed) findings.push({ stage: stage.number, quote: blocks[0].split("\n")[0].trim() });
  }
  return probeResult(PROBE_SPECS.history, { judged, findings, nothingToAsk: "no pull request history entry survives for this run" });
}

/**
 * Witness: a raw `**Nudges:**` line in the stage's history block. Input: the
 * parser read it as an integer. A block without the line is not judged: the
 * field is omitted whenever the stage could not read its own session state,
 * and the evidence guard already prints its own "measured on N of M".
 */
export function nudgesProbe(ctx) {
  const findings = [];
  let judged = 0;
  let survived = 0;
  for (const stage of ctx.registry?.stages || []) {
    const evidenceDate = getEvidenceDate(stage.number, ctx.date);
    const blocks = rawHistoryBlocks(ctx.prHistory, stage.number, evidenceDate);
    if (blocks.length === 0) continue;
    survived += 1;
    const line = blocks.map(block => NUDGES_LINE.exec(block)).find(Boolean);
    if (!line) continue;
    judged += 1;
    const entry = (ctx.historyByStage?.[stage.number] || []).find(item => item.date === evidenceDate);
    if (!Number.isInteger(entry?.nudges)) {
      findings.push({ stage: stage.number, quote: line[0].replace(/^\*\*Nudges:\*\*\s*/, "").trim() });
    }
  }
  // The epoch can only be read from blocks that survive. When none survives
  // for this run the field's age is unknowable, which is UNASKABLE, not NOT_YET.
  const seenThrough = String(ctx.prHistory || "")
    .split(/^(?=### )/m)
    .some(block => {
      const head = /^### \[(\d{4}-\d{2}-\d{2})\]/.exec(block);
      return head && head[1] <= ctx.date && NUDGES_LINE.test(block);
    });
  return probeResult(PROBE_SPECS.nudges, {
    epochReached: survived === 0 || seenThrough,
    judged,
    findings,
    nothingToAsk: survived === 0
      ? "no pull request history entry survives for this run"
      : "no history entry for this run records a nudge count",
  });
}

/**
 * Witness: an observed stage's coverage line carries a run window. Input: the
 * watchdog transcribed it into evidence.run. Epoch: the first row carrying
 * evidence.run, 2026-09-03. Transcription has never missed since, so this is
 * a tripwire for the pace check going quietly silent.
 */
export function paceProbe(ctx) {
  const hasRun = entry => Boolean(entry?.evidence?.run);
  const epoch = fieldEpoch(ctx.ledger, ctx.date, hasRun);
  const findings = [];
  let judged = 0;
  for (const stage of ctx.registry?.stages || []) {
    const row = ledgerRowFor(ctx, stage.number);
    if (!isObserved(row) || !judgeableSince(epoch, ctx.date, row, hasRun)) continue;
    if (!declaredRecordFor(ctx, stage.number)?.window) continue;
    judged += 1;
    if (!Number.isFinite(row?.evidence?.run?.durationMinutes)) findings.push({ stage: stage.number });
  }
  return probeResult(PROBE_SPECS.pace, { epochReached: epoch !== null, judged, findings, nothingToAsk: "no observed stage logged a run window" });
}

/**
 * Witness: the stage merged and was observed. Input: the watchdog recorded a
 * description check (evidence.body). Epoch: the first row carrying one. The
 * recap's description line already says "not checked" when NO stage carries
 * one; this catches the partial case that line cannot tell from a clean one.
 */
export function descriptionProbe(ctx) {
  const hasBody = entry => Boolean(entry?.evidence?.body);
  const epoch = fieldEpoch(ctx.ledger, ctx.date, hasBody);
  const findings = [];
  let judged = 0;
  for (const stage of ctx.stages || []) {
    if (!stage.merged || !stage.observed) continue;
    const row = ledgerRowFor(ctx, stage.stage);
    if (!judgeableSince(epoch, ctx.date, row, hasBody)) continue;
    judged += 1;
    if (!hasBody(row)) findings.push({ stage: stage.stage });
  }
  return probeResult(PROBE_SPECS.description, { epochReached: epoch !== null, judged, findings, nothingToAsk: "no observed stage merged" });
}

function firstClause(summary) {
  const clauses = String(summary || "").split("; ");
  return clauses.length > 1 ? `${clauses[0]}; ...` : clauses[0];
}

/**
 * Whether the calibration counter is doing what the stage is told it does.
 *
 * Advisory: never moves the grade. Reads calibrationTimeline, the counter's
 * own rule, so it cannot disagree with what nightly-clean-calibration.mjs
 * tells the stage each night.
 *
 * UNCLOSED: the stage was due, tonight's line is CLEAN, and it did not
 * register as a calibration (no CALIBRATION_TOKEN and none of the wordings the
 * counter accepts). The stage is told to re-check again tomorrow and the count
 * only grows. Either it skipped the wider check or described it in words the
 * counter does not recognise; the quote lets a reader tell which.
 *
 * Epoch: the first calibration any log registered on or before this date.
 * Every stage is judged from then on, not only stages that have registered
 * one themselves: a lane that never manages to register a calibration is the
 * worst case of the defect, and judging only lanes with a past success would
 * have hidden S12, due and unclosed on 2026-09-08, 09-09 and 09-10 before its
 * first registration on 09-11.
 */
export function calibrationProbe(ctx) {
  const findings = [];
  let judged = 0;
  let registeredAnywhere = false;
  for (const stage of ctx.registry?.stages || []) {
    const evidenceDate = getEvidenceDate(stage.number, ctx.date);
    const records = recordsFor(ctx, stage.number).filter(record => record.date <= evidenceDate);
    const timeline = calibrationTimeline(records, CALIBRATION_CLEAN_STREAK);
    const index = records.findIndex(record => record.date === evidenceDate);
    const through = index >= 0 ? timeline.slice(0, index + 1) : timeline;
    if (through.some(entry => entry.registered)) registeredAnywhere = true;
    if (index < 0 || records[index].status !== "CLEAN") continue;
    judged += 1;
    const tonight = timeline[index];
    if (!tonight.due || tonight.registered) continue;
    // The streak is the last `streakBefore` records before tonight. The record
    // that brought it to the threshold sits CALIBRATION_CLEAN_STREAK into that
    // run, and the first night told to re-check is the one after it.
    const streak = tonight.streakBefore;
    const firstDue = index - streak + CALIBRATION_CLEAN_STREAK;
    findings.push({
      stage: stage.number,
      kind: CALIBRATION_FINDINGS.UNCLOSED,
      since: (records[firstDue] || tonight.record).date,
      count: streak - CALIBRATION_CLEAN_STREAK + 1,
      quote: firstClause(tonight.record.summary),
    });
  }
  return probeResult(PROBE_SPECS.calibration, {
    epochReached: registeredAnywhere,
    judged,
    findings,
    nothingToAsk: "no stage filed a clean result on this run",
  });
}

/**
 * Whether a stage left any words of its own for the recap's prose readers.
 * The self-report guard reads the summary and the result; a result that is
 * only the pipeline's placeholder was written by the pipeline, not the stage.
 */
export function stageLeftOwnWords(stage) {
  if (String(stage?.summary || "").trim()) return true;
  const result = String(stage?.result || "").trim();
  return Boolean(result) && !isPlaceholderField("result", result);
}

/**
 * The self-report guard can only find a contradiction in words a stage
 * wrote. It printed "no stage's own summary contradicted" with no scope on
 * dates where only 5 of 13 stages had words (2026-08-12 to 08-24, 09-10,
 * 09-14): the vacuous-truth shape. This is the scope it now states.
 */
export function selfReportScopeProbe(ctx) {
  const judged = (ctx.stages || []).filter(stageLeftOwnWords).length;
  return probeResult(PROBE_SPECS.selfReportScope, { judged, nothingToAsk: "no stage left words of its own" });
}

/**
 * The boilerplate check finds a placeholder by the same result appearing on
 * two stages, so it can only be asked when at least two stages stated a
 * result of their own. Two is the arithmetic minimum for a duplicate, not a
 * tuned number. On today's evidence that holds on 8 of 42 dates; on the other
 * 34 the check's silence was never an all-clear.
 */
export function boilerplateScopeProbe(ctx) {
  const stated = (ctx.stages || []).filter(stage => {
    const result = String(stage.result || "").trim();
    return Boolean(result) && !isPlaceholderField("result", result);
  });
  return probeResult(PROBE_SPECS.boilerplateScope, {
    judged: stated.length >= 2 ? stated.length : 0,
    nothingToAsk: "fewer than two stages stated a result of their own",
  });
}

const PROBE_SPECS = {
  coverage: { id: "coverage", name: "stage log lines", feedsGrade: true },
  tags: { id: "tags", name: "merge tags", feedsGrade: true },
  observation: { id: "observation", name: "watchdog verdicts", feedsGrade: false },
  intervention: { id: "intervention", name: "watchdog nudges", feedsGrade: true },
  history: { id: "history", name: "the pull request history", feedsGrade: false },
  nudges: { id: "nudges", name: "the evidence guard", feedsGrade: false },
  pace: { id: "pace", name: "run timings", feedsGrade: false },
  description: { id: "description", name: "description checks", feedsGrade: false },
  calibration: { id: "calibration", name: "the calibration counter", feedsGrade: false },
  selfReportScope: { id: "selfReportScope", name: "the self-report guard", feedsGrade: false },
  boilerplateScope: { id: "boilerplateScope", name: "the boilerplate check", feedsGrade: false },
};

/**
 * Every check, in the order the Detector check prints them. The printed "N
 * checks" count is this array's length, never a literal, so adding a probe
 * cannot leave a stale number behind.
 */
export const PROBES = Object.freeze([
  { ...PROBE_SPECS.coverage, run: coverageProbe },
  { ...PROBE_SPECS.tags, run: tagsProbe },
  { ...PROBE_SPECS.observation, run: observationProbe },
  { ...PROBE_SPECS.intervention, run: interventionProbe },
  { ...PROBE_SPECS.history, run: historyProbe },
  { ...PROBE_SPECS.nudges, run: nudgesProbe },
  { ...PROBE_SPECS.pace, run: paceProbe },
  { ...PROBE_SPECS.description, run: descriptionProbe },
  { ...PROBE_SPECS.calibration, run: calibrationProbe },
  { ...PROBE_SPECS.selfReportScope, run: selfReportScopeProbe },
  { ...PROBE_SPECS.boilerplateScope, run: boilerplateScopeProbe },
]);

/**
 * Whether ANY evidence exists for this date: a ledger row, an evidence ref, or
 * a raw coverage line. Raw, not parsed, because a night whose every line the
 * parser rejects is the worst blind night there is, not an empty one.
 */
function dateHasEvidence(ctx) {
  if (Object.keys(ctx.ledger?.runs?.[ctx.date] || {}).length > 0) return true;
  return (ctx.registry?.stages || []).some(stage => {
    const evidenceDate = getEvidenceDate(stage.number, ctx.date);
    if ((ctx.tags || []).some(tag => tag.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`))) return true;
    return rawCoverageLines(ctx.coverageByStage?.[stage.number], stage.number, evidenceDate).length > 0;
  });
}

/**
 * Runs every probe over one recap's inputs and its classified stages.
 *
 * `stages` are buildRecap's classified stages, so the probes judge exactly
 * what the recap reported. `historyByStage` is parsePrHistoryEntries' output,
 * passed in rather than re-parsed here so the history parser stays single.
 */
export function evaluateDetectorLiveness({
  ledger = null,
  registry = null,
  date,
  coverageByStage = {},
  prHistory = "",
  tags = [],
  stages = [],
  historyByStage = {},
} = {}) {
  const ctx = { ledger, registry, date, coverageByStage: coverageByStage || {}, prHistory, tags: tags || [], stages: stages || [], historyByStage };
  if (!dateHasEvidence(ctx)) {
    const checks = PROBES.map(probe => probeResult(probe, { nothingToAsk: "no evidence exists for this date" }));
    return { total: PROBES.length, vacuous: true, checks, fed: [], blind: [], blindGrading: [], notYet: [], unaskable: checks };
  }
  const checks = PROBES.map(probe => probe.run(ctx));
  const blind = checks.filter(check => check.verdict === LIVENESS.BLIND);
  return {
    total: PROBES.length,
    vacuous: false,
    checks,
    fed: checks.filter(check => check.verdict === LIVENESS.FED),
    blind,
    blindGrading: blind.filter(check => check.feedsGrade),
    notYet: checks.filter(check => check.verdict === LIVENESS.NOT_YET),
    unaskable: checks.filter(check => check.verdict === LIVENESS.UNASKABLE),
  };
}
