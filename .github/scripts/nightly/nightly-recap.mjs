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
import { PLAIN_PREFIX, displayArea, joinList, stageTag } from "./nightly-prose.mjs";

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

export function prNumberFromTag(tag) {
  const m = /\/pr-(\d+)$/.exec(String(tag || ""));
  return m ? Number(m[1]) : null;
}

/**
 * Pure classification from durable evidence only. Nothing here consults branch
 * state, so the answer is identical before and after a sync.
 */
export function classifyStage({ stage, entry, tag, declared, history }) {
  const merged = Boolean(tag) || entry?.state === "MERGED";
  const rescued = Boolean(entry?.evidence?.recovery) || Boolean(entry?.evidence?.fallbackPublish)
    || (entry?.attempts ?? 0) > 0
    || ["RECOVERED_AFTER_NUDGE", "RECOVERED_BY_FALLBACK_PUBLISH"].includes(entry?.failureClass);

  let outcome;
  if (declared) outcome = declared.status === "CHANGED" ? "CHANGED" : declared.status;
  else if (merged) outcome = "CHANGED";
  else outcome = "STUCK";

  if (!merged && entry?.state && !["MERGED", "RECOVERABLE"].includes(entry.state)) outcome = "STUCK";

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
  };
}

// The grade rubric, encoded declaratively so the thresholds are the published
// specification rather than numbers invented here. Evaluated in order.
export const GRADE_RUBRIC = [
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
  const stages = registry.stages.map(stage => {
    const evidenceDate = evidenceDateFor(stage.number, date);
    const tag = (tags || []).find(t => t.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`)) || null;
    return classifyStage({
      stage,
      entry: ledger?.runs?.[date]?.[String(stage.number)] ?? null,
      tag,
      declared: parseCoverageLine(coverageByStage[stage.number], stage.number, evidenceDate),
      history: parsePrHistoryEntry(prHistory, stage.number, evidenceDate),
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
    health: evaluatePipelineHealth(ledgerThrough(ledger, date), registry),
  };
}

/**
 * The ledger as it stood at the end of `date`. Run dates are ISO, so ordering
 * them is a string compare.
 */
export function ledgerThrough(ledger, date) {
  const runs = {};
  for (const runDate of Object.keys(ledger?.runs || {})) {
    if (runDate <= date) runs[runDate] = ledger.runs[runDate];
  }
  return { ...(ledger || {}), runs };
}

function escapeMarkdownCell(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulWhy(stage) {
  if (!stage.why) return null;
  if (stage.why === stage.summary) return null;
  if (/^Automated nightly audit pass\.?$/i.test(stage.why)) return null;
  if (new RegExp(`^Execute the scheduled Stage ${stage.stage} ${stage.slug} audit\\.?$`, "i").test(stage.why)) return null;
  return stage.why;
}

function displayStatus(outcome) {
  return `${String(outcome || "").slice(0, 1)}${String(outcome || "").slice(1).toLowerCase()}`;
}

function sentencePart(value) {
  const text = escapeMarkdownCell(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stripCommitPrefix(value) {
  return String(value || "").replace(/^([a-z]+)(\([^)]+\))?!?:\s+/i, "");
}

function isCalibrationClean(stage) {
  return stage.outcome === "CLEAN" && /\bcalibration\b|ordinary CLEAN-since-calibration|consecutive CLEAN/i.test(stage.summary || "");
}

function semanticAction(stage) {
  const action = stripCommitPrefix(stage.summary || stage.title || stage.result || "-")
    .replace(/^Audit complete:\s*/i, "")
    .replace(/^Stage \d+\s+/i, "")
    .replace(/\s+\(CLEAN\)$/i, "")
    .replace(/\s+-\s+CLEAN$/i, " completed cleanly");
  if (/^(nothing to do|no changes required)$/i.test(action.trim())) {
    return `The ${displayArea(stage.slug)} check found everything already in order.`;
  }
  return action;
}

function semanticMiddle(stage) {
  const why = usefulWhy(stage);
  if (why) return why;
  const area = displayArea(stage.slug);
  if (stage.outcome === "CHANGED") {
    return `That keeps ${area} up to date and makes the fix part of the branch.`;
  }
  if (stage.outcome === "CLEAN") {
    if (isCalibrationClean(stage)) {
      return `This was a wider calibration check after repeated clean runs, so the CLEAN result has stronger evidence.`;
    }
    return `The run confirmed ${area} is still healthy, so no code or docs needed to change.`;
  }
  if (stage.outcome === "SKIPPED") {
    return `There was no useful ${area} work to do in this run.`;
  }
  if (stage.outcome === "PARTIAL-RUN") {
    return `It kept the ${area} notes, but avoided shipping changes that were not fully checked.`;
  }
  return `This area needs follow-up before ${area} can be called healthy again.`;
}

function semanticResult(stage) {
  const result = stage.result || (stage.merged ? "Merged successfully." : stage.state || stage.outcome);
  if (/^Nominal validation with zero regressions\.?$/i.test(result)) {
    return "Validation passed with zero regressions.";
  }
  return result;
}

function stageDescription(stage) {
  return [
    sentencePart(semanticAction(stage)),
    sentencePart(semanticMiddle(stage)),
    sentencePart(semanticResult(stage)),
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
      `- ${label} ${displayArea(s.slug)} is ${s.pace.verdict}: ${escapeMarkdownCell(s.pace.reason)}`
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
      `- ${label} ${displayArea(s.slug)} is ${s.verdict}: ${escapeMarkdownCell(s.reason)}`
      + ` (${streak} run${streak === 1 ? "" : "s"} in a row needing help, judged over ${s.runs} observed runs).`,
    );
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
  const rescued = stages.filter(s => s.rescued);
  const sentences = [];

  if (recap.unobserved === recap.total) {
    // Nothing was observed, so nothing may be claimed in either direction.
    return [`${PLAIN_PREFIX}nothing was recorded for this date, so there is no basis to say whether the pipeline ran well or badly.`, ""];
  }

  sentences.push(recap.merged === recap.total
    ? `All ${recap.total} stages ran and every one of them landed its work.`
    : `${recap.merged} of ${recap.total} stages landed their work.`);

  if (changed.length > 0) {
    // displayArea's casing is kept verbatim: it carries the acronyms (README,
    // TSDoc, APK, UX), and lowercasing the area names destroys them.
    sentences.push(`Of those, ${changed.length} actually changed the project, covering ${joinList(changed.map(s => displayArea(s.slug)))}.`);
  } else {
    sentences.push("No stage changed the project.");
  }

  if (clean.length > 0) {
    sentences.push(`The remaining ${clean.length} checked their areas and found nothing that needed fixing, which for auditing stages is the job being done rather than a wasted run.`);
  }

  if (stuck.length > 0) {
    sentences.push(`${joinList(stuck.map(stageLabel))} produced nothing at all.`);
  }
  if (rescued.length > 0) {
    sentences.push(`${joinList(rescued.map(stageLabel))} could not finish unaided and had to be nudged first, so the clean sweep above was not entirely self-driven.`);
  } else if (stuck.length === 0) {
    sentences.push("Every stage got there without help.");
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
    ? "Nothing in this run needs you to do anything."
    : `The part worth your attention is ${joinList(unique)}, detailed below.`);

  return [PLAIN_PREFIX + sentences.join(" "), ""];
}

export function renderRecap(recap) {
  const lines = [
    `Nightly Recap: ${recap.date}`,
    "",
    `Summary: ${recap.merged}/${recap.total} merged | ${recap.changed} changed | ${recap.clean} clean | ${recap.stuck} stuck | ${recap.rescued} intervention`,
    `Grade: ${recap.grade}/10 - ${recap.rationale}`,
    "",
  ];
  lines.push(...overviewSection(recap));
  for (const s of recap.stages) {
    const label = `S${String(s.stage).padStart(2, "0")}`;
    const pr = s.prNumber ? `PR #${s.prNumber}` : "no PR";
    lines.push(`**${label}** | ${pr}`);
    lines.push(`${displayStatus(s.outcome)} | **${displayArea(s.slug).toUpperCase()}**`);
    lines.push(`_${escapeMarkdownCell(s.title || s.summary || s.result || "-")}_`);
    lines.push(...stageDescription(s));
    lines.push("");
  }

  lines.push(...healthSection(recap.health));
  lines.push(...paceSection(recap.health));

  const notes = recap.stages.flatMap(s => {
    const stageNotes = [];
    const label = `S${String(s.stage).padStart(2, "0")}`;
    if (s.rescued) stageNotes.push(`${label}: rescued via ${s.rescuedBy || "retry"}.`);
    const why = usefulWhy(s);
    if (why) stageNotes.push(`${label}: why - ${why}`);
    return stageNotes;
  });
  if (notes.length > 0) lines.push("Notes:", ...notes.map(note => `- ${note}`), "");

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
