// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Deterministic nightly recap: what each of the 13 stages did on a given run.
//
// WHY THIS IS CODE AND NOT A PROMPT
// The recap used to exist only as prose, re-implemented once per AI tool
// (Claude, Codex, Gemini), each interpreting a slightly different document and
// producing slightly different answers to the same question. The pipeline it
// judges is code with a test suite; the judgement of it was the least rigorous
// part of the system, unversioned, untestable, and lost on a fresh clone.
//
// So the FACTS live here, once, tested, in the repository. Narrating them
// pleasantly is what a language model is good at and is all a per-tool skill
// should still do. But even that last mile is now standardized: tools should
// relay renderRecap's human-readable output verbatim instead of inventing their
// own recap style.
//
// WHY IT SCOPES BY RUN DATE AND NOT BY A BRANCH DIFF
// The prose version defined its scope as "commits in Nightly not yet in Beta".
// That is a proxy for "last night's run" which holds only until the branches
// are synced, and sync here is a deliberate manual act. Sync before running the
// recap and a perfectly successful stage vanishes from scope; worse, the prose
// rules then classified a completed Jules session whose commit was no longer in
// that set as STUCK, turning a healthy stage into a false alarm.
//
// A run is identified by its date. The evidence for a date is the ledger, the
// nightly/<date>/stage-N/pr-* tags, and the coverage logs. Tags are global and
// the ledger and logs are read from the Nightly ref directly, so none of it
// depends on what has or has not been promoted. As a side effect the recap can
// report on ANY past run, which a branch diff fundamentally cannot do.

import { spawnSync } from "node:child_process";

import { HEALTH, PACE, evaluatePipelineHealth, isObserved } from "./nightly-health.mjs";
import { prNumberFromTag } from "./nightly-ledger.mjs";
import {
  FAILURE_PHRASES,
  PLAIN_PREFIX,
  RESULT_LABEL,
  WHY_LABEL,
  changeLabel,
  displayArea,
  isPlaceholderField,
  joinList,
  stageTag,
} from "./nightly-prose.mjs";

export const SOURCE_REF = "origin/Nightly";
const LEDGER = ".github/nightly-logs/nightly-run-ledger.json";
const REGISTRY = ".github/nightly-config/stages.json";
const PR_HISTORY = ".github/nightly-logs/00-pr-history.md";

// Outcomes a stage declares for itself in its coverage log.
// The optional third bracket is the run window `[HH:MMZ-HH:MMZ NNm]`, written
// by nightly-stage.mjs finalize. Optional because every line written before
// that existed must keep parsing identically.
const DECLARED = /^\* \[(\d{4}-\d{2}-\d{2})\] \[Stage (\d+)\] (?:\[([^\]]+)\] )?(CLEAN|CHANGED|SKIPPED|PARTIAL-RUN): (.*)$/;

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) return null;
  return String(res.stdout || "");
}

export function readAtRef(path, ref = SOURCE_REF) {
  return git(["show", `${ref}:${path}`]);
}

/** Stage 1 logs under the previous calendar day; see expectedEvidenceDate in the watchdog. */
export function evidenceDateFor(stageNumber, runDate) {
  if (stageNumber !== 1) return runDate;
  const d = new Date(`${runDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function parseCoverageLine(content, stageNumber, date) {
  for (const line of String(content || "").split("\n")) {
    const m = DECLARED.exec(line.trim());
    if (!m) continue;
    if (m[1] !== date || Number(m[2]) !== stageNumber) continue;
    const rest = m[5];
    const [target, ...summary] = rest.split(" -- ");
    const durationMatch = /(\d+)m$/.exec(m[3] || "");
    return {
      status: m[4],
      target: target.trim(),
      summary: summary.join(" -- ").trim() || target.trim(),
      window: m[3] || null,
      durationMinutes: durationMatch ? Number(durationMatch[1]) : null,
    };
  }
  return null;
}

/** The rich block Stage 1's aging pass writes for each merged PR. */
export function parsePrHistoryEntry(content, stageNumber, date) {
  const blocks = String(content || "").split(/^### /m);
  for (const block of blocks) {
    const head = block.match(/^\[(\d{4}-\d{2}-\d{2})\] PR #(\d+) \[Stage (\d+)\]: (.*)$/m);
    if (!head) continue;
    if (head[1] !== date || Number(head[3]) !== stageNumber) continue;
    const field = name => (block.match(new RegExp(`^\\*\\*${name}:\\*\\* (.*)$`, "m")) || [])[1]?.trim() || null;
    return {
      prNumber: Number(head[2]),
      title: head[4].trim(),
      why: field("Why"),
      change: field("Change"),
      result: field("Result"),
      files: (field("Files") || "").split(",").map(f => f.trim()).filter(Boolean),
    };
  }
  return null;
}

// The ledger states that count as a stage having reached a result, and so as
// evidence the run got that far. Named here rather than inline because the
// asymmetry the doc block below describes is the whole point of the set.
const REACHED_STATES = new Set(["MERGED", "RECOVERABLE", "DEGRADED", "BLOCKED"]);

/**
 * How far this run has got.
 *
 * Only POSITIVE evidence counts: a tag, a coverage line, or a ledger row
 * recording a result the stage actually reached. Failure states are excluded on
 * purpose, and that asymmetry is the whole point. The watchdog bug this guards
 * against fabricates failures for stages that have not run, so letting
 * NO_OUTPUT or ESCALATED advance the frontier would let a poisoned ledger
 * defeat the guard built to survive it. Success is never fabricated.
 *
 * The ledger is consulted for that success because it is sometimes the only
 * witness: tags need `git fetch --tags` and coverage logs need the Nightly ref,
 * and a recap run where either is unavailable would otherwise conclude the
 * pipeline had not started.
 *
 * `over` is the other half and matters more than it looks: without it, a run
 * whose last stages genuinely never ran would be excused as "still going"
 * forever, quietly deleting real failures from the record. A run is over once
 * the next one has started, which is a fact about the pipeline rather than a
 * clock reading, so it needs no threshold and no timezone.
 */
export function runProgress({ registry, ledger, date, coverageByStage, tags }) {
  let frontier = 0;
  for (const stage of registry.stages || []) {
    const evidenceDate = evidenceDateFor(stage.number, date);
    const hasTag = (tags || []).some(t => t.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`));
    const hasCoverage = Boolean(parseCoverageLine(coverageByStage?.[stage.number], stage.number, evidenceDate));
    const hasResult = REACHED_STATES.has(ledger?.runs?.[date]?.[String(stage.number)]?.state);
    if (hasTag || hasCoverage || hasResult) frontier = Math.max(frontier, stage.number);
  }
  const over = Object.keys(ledger?.runs || {}).some(runDate => runDate > date)
    || (tags || []).some(t => {
      const m = /^nightly\/(\d{4}-\d{2}-\d{2})\//.exec(t);
      return m && m[1] > date;
    });
  return { frontier, over };
}

/**
 * Pure classification from durable evidence only. Nothing here consults branch
 * state, so the answer is identical before and after a sync.
 */
export function classifyStage({ stage, entry, tag, declared, history, progress }) {
  const merged = Boolean(tag) || entry?.state === "MERGED";
  const rescued = Boolean(entry?.evidence?.recovery) || Boolean(entry?.evidence?.fallbackPublish)
    || (entry?.attempts ?? 0) > 0
    || ["RECOVERED_AFTER_NUDGE", "RECOVERED_BY_FALLBACK_PUBLISH"].includes(entry?.failureClass);

  // A stage the run has not reached yet is not stuck, and the difference is not
  // cosmetic: the 13 stages fire in order across roughly twelve hours, so any
  // recap taken before the last one runs sees stages with no evidence purely
  // because their turn has not come. On 2026-09-05 a recap at 10:10 UTC called
  // stages 12 and 13 stuck and graded a flawless run 5/10; stage 13 was not due
  // for another hour. EXPECTED and RUNNING are exactly the two states
  // nightly-health treats as unobserved, so this reads the same signal the
  // watchdog writes rather than inventing a second opinion about lateness.
  // Two ways to still be waiting, and the distinction is load-bearing.
  // RUNNING is a live Jules session: the stage is working right now. Above the
  // frontier means nothing later has published, so its turn has not come. A
  // stage sitting at EXPECTED *below* the frontier is neither -- the pipeline
  // went past it and it produced nothing, which is stuck, not pending.
  //
  // Both are void once the run is over, which is what keeps a tail stage that
  // genuinely never ran reported as STUCK instead of excused forever.
  const notReached = (progress?.frontier ?? Infinity) < stage.number;
  const pending = !merged && !declared && !progress?.over
    && (notReached || entry?.state === "RUNNING");

  let outcome;
  if (declared) outcome = declared.status === "CHANGED" ? "CHANGED" : declared.status;
  else if (merged) outcome = "CHANGED";
  else if (pending) outcome = "PENDING";
  else outcome = "STUCK";

  if (!merged && !pending && entry?.state && !["MERGED", "RECOVERABLE"].includes(entry.state)) outcome = "STUCK";

  return {
    stage: stage.number,
    slug: stage.slug,
    name: stage.name,
    outcome,
    merged,
    rescued,
    // Whether the watchdog actually reached a verdict for this stage. `merged`
    // reads through to durable tags, but `rescued` can only come from a ledger
    // row, so without this flag an absent row is indistinguishable from an
    // observed clean run and reads as "nobody intervened".
    observed: isObserved(entry),
    rescuedBy: entry?.evidence?.fallbackPublish ? "fallback-publish"
      : entry?.evidence?.recovery ? "watchdog-nudge" : null,
    state: entry?.state ?? null,
    failureClass: entry?.failureClass ?? null,
    attempts: entry?.attempts ?? 0,
    tag: tag || entry?.evidence?.tag || null,
    prNumber: prNumberFromTag(tag) ?? history?.prNumber ?? entry?.evidence?.prNumber ?? null,
    title: history?.title ?? null,
    summary: declared?.summary ?? history?.change ?? null,
    target: declared?.target ?? null,
    why: history?.why ?? null,
    result: history?.result ?? null,
    files: history?.files ?? [],
    health: entry?.evidence?.health ?? null,
    session: entry?.evidence?.session ?? null,
    bodyHealth: entry?.evidence?.body ?? null,
  };
}

// The grade rubric, encoded declaratively so the thresholds are the published
// specification rather than numbers invented here. Evaluated in order.
export const GRADE_RUBRIC = [
  // An unfinished run has no grade. Grading one means scoring stages that have
  // not had their turn as failures, which is how a 13 of 13 night was published
  // as 5/10 at 10:10 UTC on 2026-09-05. Withholding the grade is the only
  // honest answer while the pipeline is still working: the stages that HAVE run
  // are still reported in full below, so nothing is hidden, and asking again
  // after the run window closes gives the real number.
  {
    grade: null,
    when: r => r.pending > 0,
    why: r => `Run still in progress: ${r.pending} of ${r.total} stages have not reached their slot yet, so this run cannot be graded.`,
  },
  // Absence of evidence is not evidence of failure. Without this first rule a
  // date the watchdog never observed, and for which no promotion tag exists,
  // was reported as a dead pipeline - an assertion the data cannot support.
  {
    grade: 1,
    when: r => r.unobserved === r.total && r.merged === 0,
    why: "No evidence for this date: no stage was observed and no promotion tag exists, so nothing can be concluded.",
  },
  { grade: 1, when: r => r.merged === 0, why: "Dead pipeline: no stage produced any output." },
  { grade: 3, when: r => r.stuck > r.total / 2, why: "Critical failure: the majority of stages did not complete." },
  { grade: 5, when: r => r.stuck >= 2, why: "Multiple blocks: more than one stage failed or got stuck." },
  { grade: 7, when: r => r.stuck === 1, why: "Partial block: one stage failed or got stuck." },
  { grade: 9, when: r => r.rescued > 0, why: "Minor issues: every stage completed, but some needed intervention." },
  // "Unaided" is a claim about intervention, and intervention is only knowable
  // from a ledger row. Tags alone prove the merge, never that it was unaided,
  // so a night with unobserved stages can reach 10/10 on tags while a rescue
  // sits unrecorded. Grade it as unverified instead of perfect.
  {
    grade: 9,
    when: r => r.unobserved > 0,
    why: r => `Unverified: every stage merged, but ${r.unobserved} of ${r.total} were never observed, so intervention cannot be ruled out.`,
  },
  { grade: 10, when: () => true, why: "Optimal run: every stage completed unaided." },
];

export function gradeRun(stages) {
  const totals = {
    total: stages.length,
    merged: stages.filter(s => s.merged).length,
    stuck: stages.filter(s => s.outcome === "STUCK").length,
    pending: stages.filter(s => s.outcome === "PENDING").length,
    rescued: stages.filter(s => s.rescued).length,
    changed: stages.filter(s => s.outcome === "CHANGED").length,
    clean: stages.filter(s => s.outcome === "CLEAN").length,
    unobserved: stages.filter(s => !s.observed).length,
  };
  const hit = GRADE_RUBRIC.find(rule => rule.when(totals));
  return { ...totals, grade: hit.grade, rationale: typeof hit.why === "function" ? hit.why(totals) : hit.why };
}

export function latestRunDate(ledger) {
  const dates = Object.keys(ledger?.runs || {}).sort();
  return dates[dates.length - 1] || null;
}

export function buildRecap({ ledger, registry, date, coverageByStage, prHistory, tags }) {
  const progress = runProgress({ registry, ledger, date, coverageByStage, tags });
  const stages = registry.stages.map(stage => {
    const evidenceDate = evidenceDateFor(stage.number, date);
    const tag = (tags || []).find(t => t.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`)) || null;
    return classifyStage({
      stage,
      entry: ledger?.runs?.[date]?.[String(stage.number)] ?? null,
      tag,
      declared: parseCoverageLine(coverageByStage[stage.number], stage.number, evidenceDate),
      history: parsePrHistoryEntry(prHistory, stage.number, evidenceDate),
      progress,
    });
  });
  // Cross-run health needs more than the selected date - a stage that needs
  // help every single night passes every individual run, so no single-date view
  // can ever see it - but it stops AT the selected date. Judging a past run
  // against nights that had not happened yet would both misreport that run and
  // break the reproducibility this file promises above.
  return {
    date,
    stages,
    ...gradeRun(stages),
    health: evaluatePipelineHealth(ledgerThrough(ledger, date, { inProgress: stages.some(s => s.outcome === "PENDING") }), registry),
  };
}

/**
 * The ledger as it stood at the end of `date`. Run dates are ISO, so ordering
 * them is a string compare.
 *
 * When `date` is a run still in flight its row is dropped rather than trimmed.
 * A night that has not finished is not yet a data point about reliability: the
 * stages still queued have not had the chance to need help, so counting the
 * row invents an intervention record for work that has not happened. That is
 * how a flawless 2026-09-05 published "S12 is DEGRADING, intervention rate rose
 * from 17% to 36%" off a stage that had not started. Dropping the row also
 * makes the recap immune to a ledger written by a watchdog that has not been
 * updated yet, which is the state every deployment passes through.
 */
export function ledgerThrough(ledger, date, { inProgress = false } = {}) {
  const runs = {};
  for (const runDate of Object.keys(ledger?.runs || {})) {
    if (inProgress && runDate === date) continue;
    if (runDate <= date) runs[runDate] = ledger.runs[runDate];
  }
  return { ...(ledger || {}), runs };
}

/**
 * Prose that is safe to drop into a markdown paragraph.
 *
 * Escapes only what markdown would actually consume there, which is narrower
 * than it looks. `*` opens emphasis anywhere, mid-word included, so it always
 * needs escaping. `_` does not: CommonMark refuses to open emphasis on an
 * underscore flanked by alphanumerics, so `search_path` and
 * `LOAD_CACHE_ELSE_NETWORK` are already literal. Escaping them anyway printed
 * `search\_path` into a report whose entire purpose is being read, so only
 * boundary underscores are escaped.
 *
 * `|` is deliberately not escaped any more. It mattered while this rendered
 * table cells, and the last of those went away with the two-line stage header;
 * a stage whose summary says "0 errors | 7 passed" should print it.
 */
function escapeInline(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("*", "\\*")
    .replace(/(?<![0-9A-Za-z])_|_(?![0-9A-Za-z])/g, "\\_")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a stage's `why` is one of the pipeline's own placeholders.
 *
 * Separate from usefulWhy because the two answer different questions and the
 * thin-evidence line depends on the difference. A `why` can be unusable for
 * three unrelated reasons: it is absent (no history entry exists yet), it
 * duplicates the summary (nothing new to print), or a placeholder stood in
 * because nothing was published (a fact about the pipeline). Only the third is
 * evidence of anything, and counting the other two alongside it would report a
 * defect rate the run did not have.
 */
function isPlaceholderWhy(stage) {
  if (!stage.why) return false;
  return isPlaceholderField("why", stage.why, { number: stage.stage, slug: stage.slug });
}

function usefulWhy(stage) {
  if (!stage.why) return null;
  if (stage.why === stage.summary) return null;
  if (isPlaceholderWhy(stage)) return null;
  return stage.why;
}

/**
 * A stage's result, or null when it never stated one.
 *
 * 116 of 156 entries over the twelve runs to 2026-09-05 held either nothing or
 * a placeholder here, and the renderer dressed every one of them in a "Result"
 * label: "Validation passed with zero regressions" on 75, "Merged
 * successfully" on the 41 with no field at all. Both read as the stage
 * reporting its own verification, and neither was. A suppressed line is
 * counted by thinEvidenceSection rather than silently dropped.
 */
function usefulResult(stage) {
  if (!String(stage.result || "").trim()) return null;
  if (isPlaceholderField("result", stage.result)) return null;
  return String(stage.result).trim();
}

function displayStatus(outcome) {
  return `${String(outcome || "").slice(0, 1)}${String(outcome || "").slice(1).toLowerCase()}`;
}

function sentencePart(value) {
  const text = escapeInline(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stripCommitPrefix(value) {
  return String(value || "").replace(/^([a-z]+)(\([^)]+\))?!?:\s+/i, "");
}

function isCalibrationClean(stage) {
  return stage.outcome === "CLEAN" && /\bcalibration\b|ordinary CLEAN-since-calibration|consecutive CLEAN/i.test(stage.summary || "");
}

function semanticAction(stage) {
  // A stage can be STUCK and still have declared a coverage line, so its own
  // words are preferred whenever it left any. With nothing at all, the fallback
  // has to be a claim the absence of evidence actually supports: the previous
  // "-" placeholder read as a stage that ran and had nothing to say, which is
  // the opposite of what a stuck stage means.
  const raw = stage.summary || stage.title || usefulResult(stage);
  if (!raw) {
    // The failure class is the only field that holds a sentence. A stuck stage
    // that left no words of its own gets that sentence, because "published
    // nothing" says only that nothing happened, where the class says what did:
    // JULES_SESSION_STUCK, 30 of the 52 recorded failures, means the work was
    // finished and merely never shipped, which is the opposite of nothing.
    const phrase = FAILURE_PHRASES[stage.failureClass];
    if (stage.outcome === "STUCK") return phrase || `${displayArea(stage.slug)} published nothing for this run`;
    return `${displayArea(stage.slug)} recorded no summary for this run`;
  }
  const action = stripCommitPrefix(raw)
    .replace(/^Audit complete:\s*/i, "")
    .replace(/^Stage \d+\s+/i, "")
    .replace(/\s+\(CLEAN\)$/i, "")
    .replace(/\s+-\s+CLEAN$/i, " completed cleanly");
  // Reads as the continuation of the summary-field label, because that is where
  // it lands. A standalone sentence here (The hardening check found everything
  // already in order) restated the label instead of answering it.
  if (/^(nothing to do|no changes required)$/i.test(action.trim())) {
    return `the ${displayArea(stage.slug)} area, and everything there was already in order`;
  }
  return action;
}

function semanticMiddle(stage) {
  const why = usefulWhy(stage);
  if (why) return why;
  const area = displayArea(stage.slug);
  // What survives here is only what a reader cannot get from the header line.
  if (stage.outcome === "CLEAN" && isCalibrationClean(stage)) {
    return `This was a wider calibration check after repeated clean runs, so the CLEAN result has stronger evidence.`;
  }
  if (stage.outcome === "SKIPPED") {
    return `There was no useful ${area} work to do in this run.`;
  }
  if (stage.outcome === "PARTIAL-RUN") {
    return `It kept the ${area} notes, but avoided shipping changes that were not fully checked.`;
  }
  // Nothing for CHANGED, CLEAN or STUCK. The sentences that used to stand here
  // were generated from the outcome alone ("That keeps X up to date and makes
  // the fix part of the branch", "The run confirmed X is still healthy"), so
  // they restated the verdict already printed two words to the left of the
  // pull request number. A stuck stage needs none either: its What line now
  // carries the failure class, which says more than any generated why could.
  return null;
}

/**
 * A stage the run has not reached yet, in one line rather than four.
 *
 * The full What/Why/Result shape answered all three questions with the same
 * fact - that nothing has happened - and saying it three times is what turned
 * the pending half of an in-flight recap into filler.
 *
 * It deliberately prints no `why`, even when the stage carries one: a pending
 * stage can still be holding a stale `why` from an older ledger row, and
 * explaining why a stage that has not run "did" something is worse than saying
 * nothing.
 */
const PENDING_LINE = "Not yet run. Its slot in the run order has not come round yet, so there is nothing to report either way.";

/**
 * The per-stage exceptions, next to the stage they are about.
 *
 * These used to be collected into a Notes block at the very bottom, keyed by
 * stage tag, which meant reading a note required scrolling back up to find the
 * stage it belonged to. The one thing that block protected - that the rate of
 * damaged descriptions stays visible without anyone reading pull requests by
 * hand - is now descriptionSection's job, in a single line.
 */
function stageNotes(stage) {
  const notes = [];
  // Only when the stage's own summary already occupies the What line. Otherwise
  // semanticAction has used this phrase there, and repeating it here would be
  // the duplication this whole section was rebuilt to remove.
  const phrase = FAILURE_PHRASES[stage.failureClass];
  if (phrase && stage.outcome === "STUCK" && (stage.summary || stage.title)) {
    notes.push(phrase);
  }
  if (stage.rescued) {
    notes.push(`This stage could not finish unaided and was recovered via ${stage.rescuedBy || "retry"}.`);
  }
  // A malformed description does not mean the work was wrong: in all five cases
  // on 2026-09-03 the code, tests and coverage log landed correctly.
  if (stage.bodyHealth && stage.bodyHealth.ok === false) {
    notes.push(`Its published PR description was ${stage.bodyHealth.verdict}; the work landed, the description did not.`);
  }
  // A repaired body is still a body that arrived damaged. Reporting only the
  // ones left broken would hide the defect rate behind its own fix, which is
  // how this went unnoticed until someone read three pull requests by hand.
  // Why and Result cannot be recovered after the fact, hence the warning about
  // the two lines directly above this one.
  if (stage.bodyHealth?.repairedFrom) {
    notes.push(`Its published PR description arrived ${stage.bodyHealth.repairedFrom} and was rebuilt from the coverage log, so the Why and Result above are the generic defaults.`);
  }
  return notes.map(note => `Note: ${sentencePart(note)}`);
}

/**
 * One stage, as a reader meets it.
 *
 * Consolidated into a single labelled block, one line per question actually
 * being asked: what the stage did, why, how it went. The previous layout spread
 * those three answers across six lines and repeated two of them - an italic
 * line carrying the raw coverage summary, immediately followed by a sentence
 * derived from that same summary (byte-identical on 4 of the 13 stages on
 * 2026-09-05), and then the `why` a second time in a Notes block at the foot of
 * the report. That duplication was not merely untidy: it doubled the text a
 * reader has to cross to reach the one stage that needs them, which is the only
 * reason the section exists.
 *
 * The labels come from nightly-prose.mjs because the pull request this block
 * describes labels the very same fields, and a reader comparing the two should
 * not have to work out that a labelled field there and a bare sentence here are
 * the same thing.
 */
function stageBlock(stage) {
  const area = displayArea(stage.slug).toUpperCase();
  const pr = stage.prNumber ? `PR #${stage.prNumber}` : "no PR";
  const header = `**${stageTag(stage.stage)} ${area}** | ${displayStatus(stage.outcome)} | ${pr}`;

  if (stage.outcome === "PENDING") return [header, PENDING_LINE, ""];

  // A line is printed only when it says something this stage said. The Why and
  // Result slots are skipped rather than filled with the pipeline's own
  // placeholder prose; thinEvidenceSection reports how often that happened, so
  // the silence stays measurable instead of just looking tidier.
  const why = semanticMiddle(stage);
  const result = usefulResult(stage);
  return [
    header,
    `${changeLabel(stage.outcome)}: ${sentencePart(semanticAction(stage))}`,
    ...(why ? [`${WHY_LABEL}: ${sentencePart(why)}`] : []),
    ...(result ? [`${RESULT_LABEL}: ${sentencePart(result)}`] : []),
    ...stageNotes(stage),
    "",
  ];
}

const JUDGED_VERDICTS = new Set([HEALTH.HEALTHY, HEALTH.DEGRADING, HEALTH.CHRONIC]);

/**
 * The cross-run pace block.
 *
 * Kept separate from healthSection rather than folded into it, because the two
 * answer different questions and each has its own judgeability: durations only
 * exist for runs recorded after the run window was instrumented, so a stage can
 * be fully judged for reliability and not yet judgeable for pace. Merging them
 * would let either half's silence suppress the other's finding.
 */
function paceSection(health) {
  const stages = health?.stages || [];
  const judged = stages.filter(s => s.pace && s.pace.verdict !== PACE.UNKNOWN);
  if (judged.length === 0) return [];

  const scope = judged.length === stages.length
    ? `all ${stages.length} stages measured`
    : `${judged.length} of ${stages.length} stages measured`;

  const adverse = judged.filter(s => s.pace.verdict === PACE.OVERRUNNING || s.pace.verdict === PACE.SLOWING);
  if (adverse.length === 0) {
    return [`Pipeline pace: no stage is slowing or overrunning (${scope}).`, ""];
  }

  const lines = [`Pipeline pace: adverse duration trends (${scope}).`];
  for (const s of adverse) {
    const label = `S${String(s.stage).padStart(2, "0")}`;
    lines.push(
      `- ${label} ${displayArea(s.slug)} is ${s.pace.verdict}: ${escapeInline(s.pace.reason)}`
      + ` (median ${s.pace.recentMedian}m over ${s.pace.recentRuns} recent runs, was ${s.pace.earlierMedian}m).`,
    );
  }
  // Pace is advisory. A slow stage that still merges has not failed, and saying
  // so here stops the block being read as a second failure list.
  lines.push("Pace never fails a run on its own; it says where the budget is being spent.", "");
  return lines;
}

/**
 * The cross-run health block.
 *
 * Says nothing at all when no stage has enough recorded history to judge:
 * an absent verdict is not evidence of health, and printing "0 evaluated"
 * every night would train the reader to skip the section that matters.
 */
function healthSection(health) {
  const stages = health?.stages || [];
  const judged = stages.filter(s => JUDGED_VERDICTS.has(s.verdict));
  if (judged.length === 0) return [];

  const unjudged = stages.length - judged.length;
  const scope = unjudged > 0
    ? `${judged.length} of ${stages.length} stages judged, ${unjudged} without enough history`
    : `all ${stages.length} stages judged`;

  const adverse = stages.filter(s => s.verdict === HEALTH.CHRONIC || s.verdict === HEALTH.DEGRADING);
  if (adverse.length === 0) {
    // Exactly the predicate that was tested, and no more: a rising intervention
    // rate whose latest run happened to be clean is HEALTHY here, so this line
    // must not be read as "nothing is getting worse".
    return [`Pipeline health: no stage is chronic or degrading (${scope}).`, ""];
  }

  const lines = [`Pipeline health: adverse cross-run trends (${scope}).`];
  for (const s of adverse) {
    const label = `S${String(s.stage).padStart(2, "0")}`;
    const streak = s.currentStreak ?? 0;
    lines.push(
      `- ${label} ${displayArea(s.slug)} is ${s.verdict}: ${escapeInline(s.reason)}`
      + ` (${streak} run${streak === 1 ? "" : "s"} in a row needing help, judged over ${s.runs} observed runs).`,
    );
    // The dates behind the rate. Without them a healed incident and a live
    // decline print the same sentence; see recentInterventionDates.
    const when = s.recentInterventionDates || [];
    if (when.length > 0) lines.push(`    Those interventions: ${when.join(", ")}.`);
  }
  // Deliberately says nothing about whether those runs merged. "Needed
  // intervention" covers both a stage rescued into a merge and a stage that
  // never produced anything, and the two are indistinguishable from a verdict
  // alone - claiming a rescue here inverts the truth for every stuck stage.
  lines.push("These come from comparing each stage against its own history; one run cannot show them.", "");
  return lines;
}

function stageLabel(stage) {
  return `${stageTag(stage.stage)} ${displayArea(stage.slug)}`;
}

/**
 * The whole run in one plain-language paragraph, for a reader who does not want
 * thirteen stage entries.
 *
 * Every clause is derived from the same counts the rubric grades on, so this
 * cannot drift from the stage list below it. It deliberately does NOT re-grade
 * the run or introduce a judgement the data does not carry.
 *
 * Two phrasings here are load-bearing and should not be "tidied" into something
 * shorter:
 *
 * 1. A CLEAN stage is described as having verified its area, never as idle or
 *    as having done nothing. Most stages here are auditors, and an audit that
 *    finds nothing has succeeded. Wording that implies waste is wrong about the
 *    pipeline and has previously led to a compliance stage being repurposed.
 * 2. A rescued stage is never folded into the merged count in prose. "13 of 13
 *    merged" and "every stage managed on its own" are different claims, and the
 *    second one was asserted once on the strength of the first and was false.
 */
function overviewSection(recap) {
  const stages = recap.stages || [];
  if (stages.length === 0) return [];

  const changed = stages.filter(s => s.outcome === "CHANGED");
  const clean = stages.filter(s => s.outcome === "CLEAN");
  const stuck = stages.filter(s => s.outcome === "STUCK");
  const pendingStages = stages.filter(s => s.outcome === "PENDING");
  const rescued = stages.filter(s => s.rescued);
  const sentences = [];

  if (recap.unobserved === recap.total) {
    // Nothing was observed, so nothing may be claimed in either direction.
    return [`${PLAIN_PREFIX}nothing was recorded for this date, so there is no basis to say whether the pipeline ran well or badly.`, ""];
  }

  // Said FIRST, before any count, because every number that follows is a
  // partial tally and reading them as final is the whole failure mode this
  // sentence exists to prevent.
  if (pendingStages.length > 0) {
    sentences.push(`This run is still going: ${joinList(pendingStages.map(stageLabel))} ${pendingStages.length === 1 ? "has" : "have"} not reached ${pendingStages.length === 1 ? "its" : "their"} slot in the run order yet, so the counts below cover only the part that has finished.`);
  }

  // No sentence restates a Summary count. "Summary: 13/13 merged | 5 changed |
  // 8 clean" sits four lines above, and the paragraph used to spend three of
  // its five sentences re-narrating those same five numbers before reaching the
  // two things a count cannot say: what needs the reader, and whether the sweep
  // was self-driven. What is kept is the part the counts do not carry.
  if (changed.length > 0) {
    // displayArea's casing is kept verbatim: it carries the acronyms (README,
    // TSDoc, APK, UX), and lowercasing the area names destroys them. The area
    // list is the information here; the count of them is already above.
    sentences.push(`The project changed in ${joinList(changed.map(s => displayArea(s.slug)))}.`);
  } else {
    sentences.push("No stage changed the project.");
  }

  if (clean.length > 0) {
    // The framing is load-bearing and outlives the count it used to carry: an
    // audit that finds nothing has succeeded, and wording that implies waste is
    // wrong about the pipeline. It once led to a compliance stage being
    // repurposed.
    sentences.push(`The rest checked their areas and found nothing that needed fixing, which for auditing stages is the job being done rather than a wasted run.`);
  }

  if (stuck.length > 0) {
    sentences.push(`${joinList(stuck.map(stageLabel))} produced nothing at all.`);
  }
  if (rescued.length > 0) {
    sentences.push(`${joinList(rescued.map(stageLabel))} could not finish unaided and had to be nudged first, so the clean sweep above was not entirely self-driven.`);
  } else if (stuck.length === 0 && pendingStages.length > 0) {
    // Said only while the run is in flight, because only then can the grade not
    // say it. A finished run's grade line already carries the claim exactly
    // ("every stage completed unaided" at 10, "some needed intervention" at 9),
    // and an unfinished run has no grade at all. "That has run" matters: the
    // stages still queued have not been tested yet.
    sentences.push("Every stage that has run got there without help.");
  }

  // Attention is the union of what is broken now and what is trending badly.
  // Pace is excluded on purpose: a slow stage that still delivers is not a
  // call on the reader's time.
  const attention = [
    ...stuck.map(stageLabel),
    ...(recap.health?.chronic || []).map(stageLabel),
    ...(recap.health?.degrading || []).map(stageLabel),
  ];
  const unique = [...new Set(attention)];
  sentences.push(unique.length === 0
    ? pendingStages.length > 0
      // Not "nothing needs you to do anything": the run is not over, so the
      // only claim the evidence supports is about the part that has finished.
      ? "Nothing that has run so far needs you to do anything."
      : "Nothing in this run needs you to do anything."
    : `The part worth your attention is ${joinList(unique)}, detailed below.`);

  return [PLAIN_PREFIX + sentences.join(" "), ""];
}

/**
 * How often a stage said nothing of its own, in one line.
 *
 * The stage blocks above omit a Why or Result that holds only a pipeline
 * placeholder. Without this line that omission would be invisible, and a
 * quieter report would read as a better one: 116 of 156 entries over the twelve
 * runs to 2026-09-05 carried a placeholder or nothing in the Result field, and
 * the old renderer dressed every one of them in a "Result" label.
 *
 * It counts only PROVABLE placeholders, never an absent field. A missing Why
 * means no history entry exists for that stage yet, which is a fact about the
 * aging pass rather than about what the stage published, and folding the two
 * together would report a defect rate the run did not have.
 *
 * Not part of the Summary counts, for the same reason as descriptionSection: a
 * stage that reported thinly still did its work, and a reader who meets this
 * inside the failure tally goes and fixes the wrong thing.
 */
function thinEvidenceSection(recap) {
  const thin = (recap.stages || []).filter(s => {
    // A damaged description is already reported by descriptionSection, and it
    // is the CAUSE of the placeholders: a body with no recoverable metadata
    // block leaves the coordinator nothing to read, so every field falls back.
    // Naming those stages here as well printed the same two stages twice on
    // 2026-09-05, once as damaged and once as their own consequence. What is
    // left is the distinct defect: a stage that published a sound body and
    // still left a field to the default.
    if (s.bodyHealth && (s.bodyHealth.ok === false || s.bodyHealth.repairedFrom)) return false;
    return isPlaceholderWhy(s) || (Boolean(s.result) && isPlaceholderField("result", s.result));
  });
  // The other reason a block is thin, and a different fact about the world:
  // 00-pr-history.md holds only recent runs, and Stage 1's aging pass prunes
  // the rest, so a recap of an older date has no Why or Result to show for any
  // stage. Distinguished from a placeholder because the reader's conclusion
  // differs: a placeholder means the stage did not say, an absent entry means
  // the record no longer exists. A stage that never merged is excluded, since
  // its own failure already explains why it published nothing.
  const agedOut = (recap.stages || []).filter(s => s.merged && !s.title && !s.why && !s.result);

  const lines = [];
  if (thin.length > 0) {
    lines.push(
      `Thin evidence: ${thin.length} of ${recap.total} stages published a sound description but left a Why or Result to the pipeline's default (${joinList(thin.map(s => stageTag(s.stage)))}).`
      + ` Those lines are omitted above rather than printed as the stage's own words.`,
    );
  }
  if (agedOut.length > 0) {
    lines.push(
      `Detail aged out: ${agedOut.length} of ${recap.total} merged stages no longer have an entry in the pull request history, so no Why or Result survives for them.`
      + ` Stage 1's aging pass prunes older entries; the run itself is unaffected.`,
    );
  }
  return lines.length > 0 ? [...lines, ""] : [];
}

/**
 * The published-description defect rate, in one line.
 *
 * The Note lines in each stage block say which stages were affected; this says
 * how many, because the rate is what decides whether the publisher needs work
 * and it was invisible until someone read three pull requests by hand.
 *
 * Kept out of the Summary counts on purpose: a damaged description is not a
 * failed stage, and a reader who meets it inside the failure tally will go and
 * fix the wrong thing.
 */
function descriptionSection(recap) {
  const damaged = (recap.stages || []).filter(s => s.bodyHealth && (s.bodyHealth.ok === false || s.bodyHealth.repairedFrom));
  if (damaged.length === 0) return [];
  const which = joinList(damaged.map(s => stageTag(s.stage)));
  return [
    `Published descriptions: ${damaged.length} of ${recap.total} arrived damaged (${which}).`
    + ` The work landed in every one of them; only the description did not.`,
    "",
  ];
}

export function renderRecap(recap) {
  const pending = recap.pending || 0;
  const lines = [
    pending > 0 ? `Nightly Recap: ${recap.date} (run still in progress)` : `Nightly Recap: ${recap.date}`,
    "",
    `Summary: ${recap.merged}/${recap.total} merged | ${recap.changed} changed | ${recap.clean} clean | ${recap.stuck} stuck`
      + (pending > 0 ? ` | ${pending} still to run` : "")
      + ` | ${recap.rescued} intervention`,
    // Never prints "null/10". A withheld grade is a statement in its own right
    // and has to read like one, not like a rendering bug.
    recap.grade === null ? `Grade: withheld - ${recap.rationale}` : `Grade: ${recap.grade}/10 - ${recap.rationale}`,
    "",
  ];
  lines.push(...overviewSection(recap));
  for (const stage of recap.stages) lines.push(...stageBlock(stage));

  // Everything below here is about the run as a whole, or about the pipeline
  // across runs. Nothing per-stage belongs down here: that was the old Notes
  // block, and a fact separated from the stage it describes is a fact the
  // reader has to reassemble.
  lines.push(...healthSection(recap.health));
  lines.push(...paceSection(recap.health));
  lines.push(...descriptionSection(recap));
  lines.push(...thinEvidenceSection(recap));

  return lines.join("\n");
}

export function loadRecapInputs(date, ref = SOURCE_REF) {
  const ledger = JSON.parse(readAtRef(LEDGER, ref) || "{}");
  const registry = JSON.parse(readAtRef(REGISTRY, ref) || "{}");
  const runDate = date || latestRunDate(ledger);
  if (!runDate) throw new Error("No run date available: the ledger has no runs.");

  const coverageByStage = {};
  for (const stage of registry.stages || []) {
    coverageByStage[stage.number] = readAtRef(stage.coverageLog, ref) || "";
  }
  const tags = (git(["tag", "-l", "nightly/*"]) || "").split("\n").map(t => t.trim()).filter(Boolean);
  return { ledger, registry, date: runDate, coverageByStage, prHistory: readAtRef(PR_HISTORY, ref) || "", tags };
}

export function runCli(argv = process.argv.slice(2)) {
  const dateArg = argv.indexOf("--date");
  const date = dateArg >= 0 ? argv[dateArg + 1] : null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid --date: ${date}`);

  git(["fetch", "--tags", "--quiet", "origin", "Nightly"]);
  const recap = buildRecap(loadRecapInputs(date));
  console.log(argv.includes("--json") ? JSON.stringify(recap, null, 2) : renderRecap(recap));
}

if (process.argv[1] && process.argv[1].endsWith("nightly-recap.mjs")) {
  try {
    runCli();
  } catch (error) {
    console.error(`Nightly recap failed: ${error.message}`);
    process.exitCode = 1;
  }
}
