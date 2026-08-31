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

export const SOURCE_REF = "origin/Nightly";
const LEDGER = ".github/nightly-logs/nightly-run-ledger.json";
const REGISTRY = ".github/nightly-config/stages.json";
const PR_HISTORY = ".github/nightly-logs/00-pr-history.md";

// Outcomes a stage declares for itself in its coverage log.
const DECLARED = /^\* \[(\d{4}-\d{2}-\d{2})\] \[Stage (\d+)\] (CLEAN|CHANGED|SKIPPED|PARTIAL-RUN): (.*)$/;

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
    const rest = m[4];
    const [target, ...summary] = rest.split(" -- ");
    return {
      status: m[3],
      target: target.trim(),
      summary: summary.join(" -- ").trim() || target.trim(),
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
  { grade: 1, when: r => r.merged === 0, why: "Dead pipeline: no stage produced any output." },
  { grade: 3, when: r => r.stuck > r.total / 2, why: "Critical failure: the majority of stages did not complete." },
  { grade: 5, when: r => r.stuck >= 2, why: "Multiple blocks: more than one stage failed or got stuck." },
  { grade: 7, when: r => r.stuck === 1, why: "Partial block: one stage failed or got stuck." },
  { grade: 9, when: r => r.rescued > 0, why: "Minor issues: every stage completed, but some needed intervention." },
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
  };
  const hit = GRADE_RUBRIC.find(rule => rule.when(totals));
  return { ...totals, grade: hit.grade, rationale: hit.why };
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
  return { date, stages, ...gradeRun(stages) };
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

function displayArea(slug) {
  const acronyms = new Map([
    ["apk", "APK"],
    ["pwa", "PWA"],
    ["readme", "README"],
    ["tsdoc", "TSDoc"],
    ["ux", "UX"],
  ]);
  return escapeMarkdownCell(slug)
    .split("-")
    .map(part => acronyms.get(part.toLowerCase()) || part)
    .join(" ");
}

function sentencePart(value) {
  const text = escapeMarkdownCell(value);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stripCommitPrefix(value) {
  return String(value || "").replace(/^([a-z]+)(\([^)]+\))?!?:\s+/i, "");
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

export function renderRecap(recap) {
  const lines = [
    `Nightly Recap: ${recap.date}`,
    "",
    `Summary: ${recap.merged}/${recap.total} merged | ${recap.changed} changed | ${recap.clean} clean | ${recap.stuck} stuck | ${recap.rescued} intervention`,
    `Grade: ${recap.grade}/10 - ${recap.rationale}`,
    "",
  ];
  for (const s of recap.stages) {
    const label = `S${String(s.stage).padStart(2, "0")}`;
    const pr = s.prNumber ? `PR #${s.prNumber}` : "no PR";
    lines.push(`**${label}** | ${pr}`);
    lines.push(`${displayStatus(s.outcome)} | **${displayArea(s.slug).toUpperCase()}**`);
    lines.push(`_${escapeMarkdownCell(s.title || s.summary || s.result || "-")}_`);
    lines.push(...stageDescription(s));
    lines.push("");
  }

  const notes = recap.stages.flatMap(s => {
    const stageNotes = [];
    const label = `S${String(s.stage).padStart(2, "0")}`;
    if (s.rescued) stageNotes.push(`${label}: rescued via ${s.rescuedBy || "retry"}.`);
    const why = usefulWhy(s);
    if (why) stageNotes.push(`${label}: why - ${why}`);
    if (s.health && s.health.verdict && s.health.verdict !== "HEALTHY" && s.health.verdict !== "UNKNOWN") {
      stageNotes.push(`${label}: health - ${s.health.verdict} (${s.health.reason})`);
    }
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
