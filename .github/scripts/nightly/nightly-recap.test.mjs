// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GRADE_RUBRIC,
  buildRecap,
  classifyStage,
  evidenceDateFor,
  gradeRun,
  latestRunDate,
  parseCoverageLine,
  parsePrHistoryEntry,
  renderRecap,
  runProgress,
} from "./nightly-recap.mjs";
import { prNumberFromTag } from "./nightly-ledger.mjs";
import {
  FAILURE_PHRASES,
  METADATA_PLACEHOLDERS,
  placeholderResult,
  placeholderWhy,
} from "./nightly-prose.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const stageOf = n => registry.stages.find(s => s.number === n);

test("Stage 1 is dated to the previous day, every other stage to the run date", () => {
  // Stage 1 starts before midnight UTC and logs under the previous date; the
  // watchdog encodes the same rule in expectedEvidenceDate.
  assert.equal(evidenceDateFor(1, "2026-08-28"), "2026-08-27");
  assert.equal(evidenceDateFor(2, "2026-08-28"), "2026-08-28");
  assert.equal(evidenceDateFor(13, "2026-08-01"), "2026-08-01");
  assert.equal(evidenceDateFor(1, "2026-01-01"), "2025-12-31", "month and year boundaries must roll correctly");
});

test("a coverage line yields the stage's own declared status and summary", () => {
  const log = [
    "* [2026-08-26] [Stage 2] CLEAN: Codebase -- old entry",
    "* [2026-08-27] [Stage 2] CHANGED: Backend/x.spec.ts -- Add tests for validation boundaries",
  ].join("\n");
  const parsed = parseCoverageLine(log, 2, "2026-08-27");
  assert.equal(parsed.status, "CHANGED");
  assert.equal(parsed.target, "Backend/x.spec.ts");
  assert.equal(parsed.summary, "Add tests for validation boundaries");
  assert.equal(parseCoverageLine(log, 2, "2026-08-01"), null);
  assert.equal(parseCoverageLine(log, 7, "2026-08-27"), null, "another stage's line must not be borrowed");
});

test("the PR history block supplies the richer why/result detail", () => {
  const history = [
    "### [2026-08-27] PR #1588 [Stage 13]: chore(pipeline): audit pass",
    "**Domain:** pipeline | **Commit:** f9cc3ec1 | [View PR](https://example.test)",
    "**Files:** a.md, b.log",
    "**Why:** Automated nightly audit pass.",
    "**Change:** Updated the protocol document.",
    "**Result:** Nominal validation with zero regressions.",
  ].join("\n");
  const parsed = parsePrHistoryEntry(history, 13, "2026-08-27");
  assert.equal(parsed.prNumber, 1588);
  assert.equal(parsed.why, "Automated nightly audit pass.");
  assert.equal(parsed.result, "Nominal validation with zero regressions.");
  assert.deepEqual(parsed.files, ["a.md", "b.log"]);
  assert.equal(parsePrHistoryEntry(history, 12, "2026-08-27"), null);
});

test("prNumberFromTag reads only a well-formed merge tag", () => {
  assert.equal(prNumberFromTag("nightly/2026-08-27/stage-1/pr-1589"), 1589);
  assert.equal(prNumberFromTag("v14.46.23"), null);
  assert.equal(prNumberFromTag(null), null);
});

test("a merged stage is classified from durable evidence, not from branch state", () => {
  // The whole point: a tag and a coverage line are enough. Nothing here asks
  // whether the commit has been promoted to Beta, so syncing cannot change it.
  const result = classifyStage({
    stage: stageOf(4),
    entry: { state: "MERGED", failureClass: null, attempts: 0, evidence: {} },
    tag: "nightly/2026-08-27/stage-4/pr-1579",
    declared: { status: "CLEAN", target: "Codebase", summary: "no changes required" },
    history: null,
  });
  assert.equal(result.outcome, "CLEAN");
  assert.equal(result.merged, true);
  assert.equal(result.rescued, false);
  assert.equal(result.prNumber, 1579);
});

test("a stage rescued by a nudge is reported as merged AND as having needed help", () => {
  const result = classifyStage({
    stage: stageOf(5),
    entry: { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE", attempts: 1, evidence: { recovery: { ok: true } } },
    tag: "nightly/2026-08-27/stage-5/pr-1581",
    declared: { status: "CHANGED", target: "README.md", summary: "reconciled docs" },
    history: null,
  });
  assert.equal(result.merged, true);
  assert.equal(result.rescued, true);
  assert.equal(result.rescuedBy, "watchdog-nudge");
});

test("a stage rescued by the fallback publisher is distinguished from a nudge", () => {
  const result = classifyStage({
    stage: stageOf(5),
    entry: { state: "RECOVERABLE", failureClass: "RECOVERED_BY_FALLBACK_PUBLISH", attempts: 2, evidence: { fallbackPublish: { status: "CLEAN" } } },
    tag: null,
    declared: { status: "CLEAN", target: "Codebase", summary: "x" },
    history: null,
  });
  assert.equal(result.rescuedBy, "fallback-publish");
});

test("a stage with no evidence at all is STUCK", () => {
  const result = classifyStage({
    stage: stageOf(6),
    entry: { state: "NO_OUTPUT", failureClass: "JULES_SESSION_STUCK", attempts: 0, evidence: {} },
    tag: null,
    declared: null,
    history: null,
  });
  assert.equal(result.outcome, "STUCK");
  assert.equal(result.merged, false);
});

test("the grade rubric is applied in severity order", () => {
  const at = totals => GRADE_RUBRIC.find(r => r.when({ total: 13, merged: 13, stuck: 0, rescued: 0, ...totals })).grade;
  assert.equal(at({ merged: 0 }), 1);
  assert.equal(at({ stuck: 9 }), 3);
  assert.equal(at({ stuck: 3 }), 5);
  assert.equal(at({ stuck: 1 }), 7);
  assert.equal(at({ rescued: 1 }), 9);
  assert.equal(at({}), 10);
});

test("a perfect run grades 10 and a rescued one grades 9", () => {
  const stage = (outcome, rescued) => ({ outcome, merged: outcome !== "STUCK", rescued, observed: true });
  assert.equal(gradeRun(Array.from({ length: 13 }, () => stage("CLEAN", false))).grade, 10);
  const oneRescued = Array.from({ length: 13 }, (_, i) => stage("CLEAN", i === 4));
  assert.equal(gradeRun(oneRescued).grade, 9);
});

test("grade 10 requires observation, not just merges", () => {
  // "Optimal run: every stage completed unaided" is a claim about intervention,
  // and intervention is knowable only from a ledger row. `merged` reads through
  // to durable promotion tags, so a date whose ledger rows are missing or still
  // EXPECTED used to satisfy every grade-10 condition on tags alone and print
  // the unaided claim over a night nobody watched. Reproduced against the real
  // 2026-09-01 inputs with an emptied ledger: grade was 10, rescued 0.
  //
  // The flag is deliberately fail-closed: an absent `observed` counts as
  // unobserved, so a caller cannot reach the unaided claim by omission.
  const merged = n => Array.from({ length: n }, () => ({ outcome: "CLEAN", merged: true, rescued: false, observed: true }));

  const allSeen = gradeRun(merged(13));
  assert.equal(allSeen.grade, 10);
  assert.equal(allSeen.unobserved, 0);

  const oneBlind = [...merged(12), { outcome: "CLEAN", merged: true, rescued: false, observed: false }];
  const graded = gradeRun(oneBlind);
  assert.equal(graded.grade, 9, "a single unobserved stage must forfeit the unaided claim");
  assert.equal(graded.unobserved, 1);
  assert.match(graded.rationale, /Unverified: every stage merged, but 1 of 13 were never observed/);

  // Omission must not buy a 10 either.
  assert.equal(gradeRun([{ outcome: "CLEAN", merged: true, rescued: false }]).grade, 9);

  // A date with neither observation nor tags must not be called a dead
  // pipeline: that asserts a failure the evidence cannot support.
  const blind = gradeRun(Array.from({ length: 13 }, () => ({ outcome: "STUCK", merged: false, rescued: false, observed: false })));
  assert.equal(blind.grade, 1);
  assert.match(blind.rationale, /No evidence for this date/);
});

test("latestRunDate picks the newest date regardless of key order", () => {
  assert.equal(latestRunDate({ runs: { "2026-08-02": {}, "2026-08-10": {}, "2026-08-05": {} } }), "2026-08-10");
  assert.equal(latestRunDate({ runs: {} }), null);
  assert.equal(latestRunDate({}), null);
});

test("a whole recap is assembled and rendered from evidence alone", () => {
  const date = "2026-08-27";
  const ledger = { schemaVersion: 1, runs: { [date]: {} } };
  const coverageByStage = {};
  const tags = [];
  for (const stage of registry.stages) {
    const evidenceDate = evidenceDateFor(stage.number, date);
    ledger.runs[date][String(stage.number)] = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
    coverageByStage[stage.number] = `* [${evidenceDate}] [Stage ${stage.number}] CLEAN: Codebase -- nothing to do`;
    tags.push(`nightly/${evidenceDate}/stage-${stage.number}/pr-${2000 + stage.number}`);
  }
  const recap = buildRecap({ ledger, registry, date, coverageByStage, prHistory: "", tags });
  assert.equal(recap.total, 13);
  assert.equal(recap.merged, 13);
  assert.equal(recap.stuck, 0);
  assert.equal(recap.grade, 10);
  const text = renderRecap(recap);
  assert.match(text, /Summary: 13\/13 merged/);
  assert.match(text, /Grade: 10\/10/);
  // A one-date ledger cannot judge a cross-run trend, so the health block says
  // nothing at all rather than printing an empty verdict. The golden literal
  // below asserts that absence by terminating after the last stage block.
  assert.doesNotMatch(text, /Pipeline health/);
  assert.equal(text, [
    "Nightly Recap: 2026-08-27",
    "",
    "Summary: 13/13 merged | 0 changed | 13 clean | 0 stuck | 0 intervention",
    "Grade: 10/10 - Optimal run: every stage completed unaided.",
    "",
    // The overview, asserted verbatim. It states nothing the Summary line
    // four lines above already counts: what survives is the framing (an audit
    // that finds nothing has succeeded) and the call on the reader's time.
    "In plain terms: No stage changed the project. The rest checked their areas and found nothing that needed fixing, which for auditing stages is the job being done rather than a wasted run. Nothing in this run needs you to do anything.",
    "",
    // Three lines per stage, because these fixture stages genuinely said
    // nothing else: no Why and no Result exist for them, so neither label is
    // printed carrying a placeholder. The foot line below says how many.
    "**S01 HARDENING** | Clean | PR #2001",
    "What was checked: the hardening area, and everything there was already in order.",
    "",
    "**S02 VERIFICATION** | Clean | PR #2002",
    "What was checked: the verification area, and everything there was already in order.",
    "",
    "**S03 BASELINE CONSOLIDATION** | Clean | PR #2003",
    "What was checked: the baseline consolidation area, and everything there was already in order.",
    "",
    "**S04 OPTIMIZATION** | Clean | PR #2004",
    "What was checked: the optimization area, and everything there was already in order.",
    "",
    "**S05 DOCUMENTATION README** | Clean | PR #2005",
    "What was checked: the documentation README area, and everything there was already in order.",
    "",
    "**S06 DOCUMENTATION TSDOC** | Clean | PR #2006",
    "What was checked: the documentation TSDoc area, and everything there was already in order.",
    "",
    "**S07 VERSION INTEGRITY** | Clean | PR #2007",
    "What was checked: the version integrity area, and everything there was already in order.",
    "",
    "**S08 DEPENDENCY AUDIT** | Clean | PR #2008",
    "What was checked: the dependency audit area, and everything there was already in order.",
    "",
    "**S09 REFACTOR** | Clean | PR #2009",
    "What was checked: the refactor area, and everything there was already in order.",
    "",
    "**S10 APK INTEGRITY** | Clean | PR #2010",
    "What was checked: the APK integrity area, and everything there was already in order.",
    "",
    "**S11 APK OPTIMIZATION** | Clean | PR #2011",
    "What was checked: the APK optimization area, and everything there was already in order.",
    "",
    "**S12 APK UX** | Clean | PR #2012",
    "What was checked: the APK UX area, and everything there was already in order.",
    "",
    "**S13 SELF HEALING PROTOCOL** | Clean | PR #2013",
    "What was checked: the self healing protocol area, and everything there was already in order.",
    "",
    // Why every block above is three lines. Without this the report would
    // simply look terse, and a reader could not tell a quiet run from a run
    // whose record has been pruned.
    "Detail aged out: 13 of 13 merged stages no longer have an entry in the pull request history, so no Why or Result survives for them. Stage 1's aging pass prunes older entries; the run itself is unaffected.",
    "",
  ].join("\n"));
});

// --- The stage block ---------------------------------------------------------
//
// The layout these pin down replaced one that answered three questions across
// six lines and said two of the answers twice: an italic line carrying the raw
// coverage summary, then a sentence derived from that same summary, then the
// `why` a third time in a Notes block at the very foot of the report. On
// 2026-09-05 four of the thirteen stages printed their summary line byte for
// byte twice, and all thirteen printed their `why` twice.

/** One stage's block, extracted from a rendered recap by its header line. */
function blockFor(text, tag) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.startsWith(`**${tag} `));
  assert.ok(start >= 0, `${tag} has no block`);
  const rest = lines.slice(start + 1);
  const end = rest.indexOf("");
  return [lines[start], ...rest.slice(0, end === -1 ? undefined : end)];
}

const singleStage = (stage, overrides = {}) => ({
  date: "2026-09-05",
  total: 1, merged: 1, changed: 0, clean: 1, stuck: 0, pending: 0, rescued: 0, unobserved: 0,
  grade: 10, rationale: "Optimal run: every stage completed unaided.",
  stages: [stage],
  ...overrides,
});

test("a stage says everything about itself once, in one block", () => {
  // The real S03 of 2026-09-05, whose title and summary are the same string.
  // That is what printed it twice: the italic line took `title`, the sentence
  // below it took `summary`.
  const summary = "Baseline consolidation audit completed cleanly; master migration is fully up to date.";
  const text = renderRecap(singleStage({
    stage: 3,
    slug: "baseline-consolidation",
    outcome: "CLEAN",
    prNumber: 1696,
    title: summary,
    summary,
    why: "No pending migrations found in fold-state scan.",
    result: "0 pending migrations, fold-state CLEAN.",
    merged: true,
  }));

  assert.deepEqual(blockFor(text, "S03"), [
    "**S03 BASELINE CONSOLIDATION** | Clean | PR #1696",
    `What was checked: ${summary}`,
    "Why: No pending migrations found in fold-state scan.",
    "Result: 0 pending migrations, fold-state CLEAN.",
  ]);
  // The summary appears once in the whole report, and the why is not repeated
  // in a trailing block either.
  assert.equal(text.split(summary).length - 1, 1);
  assert.equal(text.split("No pending migrations found in fold-state scan.").length - 1, 1);
  assert.doesNotMatch(text, /^Notes:$/m);
  assert.doesNotMatch(text, /: why - /);
});

test("a stage that changed something is labelled as having changed it", () => {
  // The label is the one the pull request itself uses, so the two surfaces
  // cannot describe the same field with different words.
  const text = renderRecap(singleStage({
    stage: 8,
    slug: "dependency-audit",
    outcome: "CHANGED",
    prNumber: 1701,
    summary: "Bumped @ast-grep/cli to ^0.45.3",
    why: "Safe Tier 1 patch update for @ast-grep/cli.",
    result: "PASS.",
    merged: true,
  }, { changed: 1, clean: 0 }));

  assert.match(text, /^What changed: Bumped @ast-grep\/cli to \^0\.45\.3\.$/m);
  assert.doesNotMatch(text, /What was checked/);
});

test("a stage carrying an intervention or a damaged description says so in its own block", () => {
  const text = renderRecap(singleStage({
    stage: 2,
    slug: "verification",
    outcome: "CHANGED",
    prNumber: 1695,
    summary: "Expanded unit test coverage",
    result: "Validation passed with zero regressions.",
    merged: true,
    rescued: true,
    rescuedBy: "fallback-publish",
    bodyHealth: { ok: false, verdict: "AD_LIBBED", pr: 1695 },
  }, { changed: 1, clean: 0, rescued: 1 }));

  assert.deepEqual(blockFor(text, "S02").slice(-2), [
    "Note: This stage could not finish unaided and was recovered via fallback-publish.",
    "Note: Its published PR description was AD_LIBBED; the work landed, the description did not.",
  ]);
  // The stage tag is not needed to know which stage a note is about, because
  // the note is inside that stage's block.
  assert.doesNotMatch(text, /^- S02: /m);
});

test("a line the stage did not write is not printed", () => {
  // 116 of 156 entries over the twelve runs to 2026-09-05 held either nothing
  // or a placeholder in the Result field, and every one of them was printed
  // under a "Result" label: "Validation passed with zero regressions" on 75,
  // "Merged successfully" on the 41 with no field at all. Both read as the
  // stage reporting its own verification. Neither was the stage's words.
  const text = renderRecap(singleStage({
    stage: 9, slug: "refactor", outcome: "CLEAN", prNumber: 1702, merged: true,
    summary: "18 candidate files, 0 dep-violations",
    why: METADATA_PLACEHOLDERS.why,
    result: METADATA_PLACEHOLDERS.result,
  }));

  assert.deepEqual(blockFor(text, "S09"), [
    "**S09 REFACTOR** | Clean | PR #1702",
    "What was checked: 18 candidate files, 0 dep-violations.",
  ]);
  assert.doesNotMatch(text, /^Why:/m);
  assert.doesNotMatch(text, /^Result:/m);
  // Not silently: the omission is counted where a reader will see it.
  assert.match(text, /^Thin evidence: 1 of 1 stages published a sound description but left a Why or Result to the pipeline's default \(S09\)\./m);
});

test("every placeholder either writer can produce is recognised as one", () => {
  // The detection is only as good as its coverage of the writers. Deriving the
  // set from placeholderResult rather than listing the strings again is what
  // stops a reworded placeholder going quietly back to being printed.
  for (const status of ["CHANGED", "CLEAN", "DEGRADED"]) {
    const text = renderRecap(singleStage({
      stage: 4, slug: "optimization", outcome: "CLEAN", prNumber: 1697, merged: true,
      summary: "checked the loop counters", result: placeholderResult(status),
    }));
    assert.doesNotMatch(text, /^Result:/m, `placeholderResult(${status}) reached the reader`);
  }
  // The stage runner's why placeholder interpolates the stage, so it has to be
  // matched per stage rather than by a fixed string.
  const text = renderRecap(singleStage({
    stage: 4, slug: "optimization", outcome: "CLEAN", prNumber: 1697, merged: true,
    summary: "checked the loop counters",
    why: placeholderWhy({ number: 4, slug: "optimization" }),
  }));
  assert.doesNotMatch(text, /^Why:/m);
});

test("a stage's own words are never mistaken for a placeholder", () => {
  // The other direction, and the one that would be a real loss. Suppression
  // keyed on anything looser than an exact match would eat real reporting.
  const text = renderRecap(singleStage({
    stage: 8, slug: "dependency-audit", outcome: "CHANGED", prNumber: 1701, merged: true,
    summary: "Bumped @ast-grep/cli",
    why: "Safe Tier 1 patch update.",
    result: "Nominal validation with zero regressions across 1786 unit tests and 0 depcruise violations.",
  }, { changed: 1, clean: 0 }));

  assert.match(text, /^Why: Safe Tier 1 patch update\.$/m);
  assert.match(text, /^Result: Nominal validation with zero regressions across 1786 unit tests and 0 depcruise violations\.$/m);
  assert.doesNotMatch(text, /^Thin evidence:/m);
});

test("a damaged description is not counted twice as its own consequence", () => {
  // A body with no recoverable metadata block leaves the coordinator nothing to
  // read, so every field falls back to a placeholder. Reporting that stage as
  // damaged AND as thin named the same two stages twice on 2026-09-05, the
  // second time as a restatement of the first.
  const text = renderRecap(singleStage({
    stage: 2, slug: "verification", outcome: "CHANGED", prNumber: 1695, merged: true,
    summary: "expanded coverage",
    why: METADATA_PLACEHOLDERS.why,
    result: METADATA_PLACEHOLDERS.result,
    bodyHealth: { ok: false, verdict: "AD_LIBBED", pr: 1695 },
  }, { changed: 1, clean: 0 }));

  assert.match(text, /^Published descriptions: 1 of 1 arrived damaged \(S02\)\./m);
  assert.doesNotMatch(text, /^Thin evidence:/m);
});

test("a run whose history has been pruned says so, instead of just looking terse", () => {
  // 00-pr-history.md held only 2026-08-28 onward when this was written, so a
  // recap of an older date has no Why or Result for any stage. Without a line
  // saying that, a pruned run and a quiet run render identically.
  const text = renderRecap(singleStage({
    stage: 1, slug: "hardening", outcome: "CLEAN", prNumber: 1500, merged: true,
    summary: "nothing to do",
  }));

  assert.match(text, /^Detail aged out: 1 of 1 merged stages no longer have an entry in the pull request history/m);
  assert.match(text, /the run itself is unaffected/);
  // An absent field is not a placeholder: claiming the stage left one would
  // report a defect this run did not have.
  assert.doesNotMatch(text, /^Thin evidence:/m);
});

test("a stage that never merged is not reported as having lost its history", () => {
  // Its own failure already explains the silence, and "aged out" would blame
  // the aging pass for a pull request that never existed.
  const text = renderRecap(singleStage({
    stage: 1, slug: "hardening", outcome: "STUCK", merged: false,
    failureClass: "JULES_SESSION_STUCK",
  }, { merged: 0, clean: 0, stuck: 1, grade: 7, rationale: "Partial block: one stage failed or got stuck." }));

  assert.doesNotMatch(text, /^Detail aged out:/m);
});

test("every failure class the ledger has actually recorded has a phrase", () => {
  // Data-driven on purpose. A first version of this scanned nightly-watchdog.mjs
  // for `failureClass: "X"` literals, and over-matched: the same file assigns
  // Jules session states ("COMPLETED", "FAILED") through ternaries of the same
  // shape, so the guard demanded a phrase for DEGRADED and failed on a class
  // that does not exist. A guard that cannot be trusted about what it found is
  // worse than none.
  //
  // What this asserts instead cannot be wrong: every class the committed ledger
  // holds must render as a sentence, because those are the ones a reader will
  // actually meet. The exhaustive source-side check belongs in
  // nightly-coherence.test.mjs against a set exported by the watchdog itself,
  // which is the only way to enumerate them without guessing at syntax.
  const ledger = JSON.parse(readFileSync(new URL("../../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  const recorded = new Set();
  for (const day of Object.values(ledger.runs || {})) {
    for (const entry of Object.values(day || {})) {
      if (entry?.failureClass) recorded.add(entry.failureClass);
    }
  }

  assert.ok(recorded.size >= 6, `only ${recorded.size} classes found in the ledger, so this test has stopped reading it`);
  for (const failureClass of recorded) {
    assert.ok(FAILURE_PHRASES[failureClass], `${failureClass} is in the ledger but has no phrase`);
  }

  // Every documented phrase is a sentence, and no two classes share one: a
  // duplicated phrase would report two different conditions identically, which
  // is the defect displayArea was taught to avoid for stage names.
  const phrases = Object.values(FAILURE_PHRASES);
  for (const phrase of phrases) assert.match(phrase, /^[A-Z].*\.$/);
  assert.equal(new Set(phrases).size, phrases.length);

  // The renderer deliberately never reaches these two through the map: a
  // recovered stage merged, so it is narrated by its rescue note instead.
  assert.ok(FAILURE_PHRASES.RECOVERED_AFTER_NUDGE);
  assert.ok(FAILURE_PHRASES.RECOVERED_BY_FALLBACK_PUBLISH);
});

test("the rate of damaged descriptions survives as one line, not thirteen", () => {
  // The Notes block existed so this rate stayed visible without anyone reading
  // pull requests by hand. Folding the per-stage detail into the stage blocks
  // must not cost that.
  const damaged = n => ({
    stage: n, slug: n === 2 ? "verification" : "documentation-tsdoc",
    outcome: "CHANGED", prNumber: 1690 + n, summary: "did the thing", merged: true,
    bodyHealth: { ok: false, verdict: "AD_LIBBED", pr: 1690 + n },
  });
  const text = renderRecap(singleStage(damaged(2), {
    total: 13, merged: 13, changed: 2, clean: 0,
    stages: [damaged(2), damaged(6)],
  }));

  assert.match(text, /^Published descriptions: 2 of 13 arrived damaged \(S02 and S06\)\.( |$)/m);
  assert.match(text, /The work landed in every one of them; only the description did not\./);
  // Never counted as a failure: the stage merged, and a reader who meets this
  // inside the failure tally goes and fixes the wrong thing.
  assert.match(text, /\| 0 stuck \|/);
});

test("a repaired description warns about the two lines directly above it", () => {
  const text = renderRecap(singleStage({
    stage: 4, slug: "optimization", outcome: "CHANGED", prNumber: 1697,
    summary: "renamed a loop counter", merged: true,
    bodyHealth: { ok: true, pr: 1697, repairedFrom: "AD_LIBBED" },
  }, { changed: 1, clean: 0 }));

  assert.match(text, /Note: Its published PR description arrived AD_LIBBED and was rebuilt from the coverage log, so the Why and Result above are the generic defaults\./);
  assert.match(text, /^Published descriptions: 1 of 1 arrived damaged \(S04\)\./m);
});

test("a stuck stage says what happened to it, from its failure class", () => {
  // With no coverage line and no PR history every field is null. This printed
  // `_-_` then "-." before the blocks were consolidated, and then
  // "Result: NO_OUTPUT." after: a state token dressed as a verification
  // outcome. The state says only how bad it was; the class says what happened,
  // and for the commonest one the difference is the whole story, because the
  // work was finished and merely never shipped.
  const stuck = { stage: 11, slug: "apk-optimization", outcome: "STUCK", merged: false, state: "NO_OUTPUT" };
  const totals = { merged: 0, clean: 0, stuck: 1, grade: 7, rationale: "Partial block: one stage failed or got stuck." };

  assert.deepEqual(blockFor(renderRecap(singleStage({ ...stuck, failureClass: "JULES_SESSION_STUCK" }, totals)), "S11"), [
    "**S11 APK OPTIMIZATION** | Stuck | no PR",
    "What happened: Jules finished the work and ended the session, but never opened the pull request.",
  ]);

  // No class either, which is a real ledger state: the watchdog can record a
  // failure it could not classify. The fallback must still be a sentence.
  assert.deepEqual(blockFor(renderRecap(singleStage(stuck, totals)), "S11"), [
    "**S11 APK OPTIMIZATION** | Stuck | no PR",
    "What happened: APK optimization published nothing for this run.",
  ]);

  // The raw state never reaches the reader, under any label.
  const text = renderRecap(singleStage({ ...stuck, failureClass: "MERGE_COORDINATOR" }, totals));
  assert.doesNotMatch(text, /NO_OUTPUT/);
  assert.doesNotMatch(text, /(^|[^-])-\.$/m);
  assert.match(text, /What happened: Its pull request was opened, but the merge coordinator did not fold it in\./);
});

test("a stuck stage that did leave words of its own keeps them, and the class becomes a note", () => {
  // A stage can declare a coverage line and still be overridden to STUCK by its
  // ledger row. Its own summary must not be displaced by a phrase we wrote.
  const text = renderRecap(singleStage({
    stage: 11, slug: "apk-optimization", outcome: "STUCK", merged: false,
    summary: "audited WebView settings, 0 changes required",
    failureClass: "JULES_SESSION_STUCK",
  }, { merged: 0, clean: 0, stuck: 1, grade: 7, rationale: "Partial block: one stage failed or got stuck." }));

  assert.deepEqual(blockFor(text, "S11"), [
    "**S11 APK OPTIMIZATION** | Stuck | no PR",
    "What happened: audited WebView settings, 0 changes required.",
    "Note: Jules finished the work and ended the session, but never opened the pull request.",
  ]);
  // Once each, never both places.
  assert.equal(text.split("never opened the pull request").length - 1, 1);
});

test("an identifier keeps its underscores, and emphasis is still neutralised", () => {
  // CommonMark refuses to open emphasis on an underscore flanked by
  // alphanumerics, so escaping those was never needed and printed
  // `search\_path` and `LOAD\_CACHE\_ELSE\_NETWORK` into a report whose whole
  // purpose is being read.
  const text = renderRecap(singleStage({
    stage: 3, slug: "baseline-consolidation", outcome: "CLEAN", prNumber: 1696,
    summary: "verified search_path isolation and LOAD_CACHE_ELSE_NETWORK",
    why: "_emphasis_ and *stars* must not reach the reader as markup",
    result: "0 errors | 7 passed",
    merged: true,
  }));

  assert.match(text, /verified search_path isolation and LOAD_CACHE_ELSE_NETWORK\./);
  assert.doesNotMatch(text, /search\\_path/);
  assert.match(text, /\\_emphasis\\_ and \\\*stars\\\*/);
  // No tables left to break, so a pipe in a stage's own words is printed as
  // the stage wrote it.
  assert.match(text, /Result: 0 errors \| 7 passed\./);
});

test("a calibration-backed CLEAN run is called out in prose", () => {
  const text = renderRecap({
    date: "2026-08-27",
    total: 1,
    merged: 1,
    changed: 0,
    clean: 1,
    stuck: 0,
    rescued: 0,
    grade: 10,
    rationale: "Optimal run: every stage completed unaided.",
    stages: [{
      stage: 10,
      slug: "apk-integrity",
      outcome: "CLEAN",
      prNumber: 2010,
      title: "chore(apk): calibration CLEAN for wrapper integrity",
      summary: "calibration CLEAN after 7 ordinary CLEAN-since-calibration runs checked full wrapper invariant set",
      result: "Audit completed with no source change required.",
      merged: true,
    }],
  });
  assert.match(text, /This was a wider calibration check after repeated clean runs/);
  // The calibration sentence survives because it says something the header
  // cannot. Its Result does not: "Audit completed with no source change
  // required" is placeholderResult("CLEAN"), the stage runner's own stand-in
  // for a stage that finalized without stating one, so printing it under a
  // Result label would credit the stage with a verification it never reported.
  assert.doesNotMatch(text, /Result: Audit completed with no source change required/);
  assert.match(text, /^Thin evidence: 1 of 1 stages published a sound description but left a Why or Result to the pipeline's default \(S10\)\./m);
});

test("the real recorded history recaps without throwing, for a synced run", () => {
  // 2026-08-25 was promoted to Beta and Stable long ago. The previous prose
  // recap scoped itself by `origin/Beta..origin/Nightly` and would report
  // "nothing to catch up on" for this date; scoping by run date must not care.
  const ledger = JSON.parse(readFileSync(new URL("../../nightly-logs/nightly-run-ledger.json", import.meta.url), "utf8"));
  assert.ok(ledger.runs["2026-08-25"], "precondition: the run is in the ledger");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-25",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.total, 13);
  assert.ok(recap.grade >= 1 && recap.grade <= 10);
});


// --- Cross-run health -------------------------------------------------------
//
// The health block reaches past the selected date - a stage carried every night
// passes every individual run - but never past it. These build multi-date
// ledgers because a single date can never produce a verdict, which is exactly
// what the first test above pins down.

const MERGED_RUN = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
// Needed help and got it: merged, but only because something nudged it.
const RESCUED_RUN = { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE", attempts: 1, evidence: {} };
// Needed help and never got there. This is the dominant real flavour: the
// ledger holds far more NO_OUTPUT/ESCALATED rows than rescued ones, and
// neededIntervention counts both, so no verdict may assume a merge happened.
const STUCK_RUN = { state: "NO_OUTPUT", failureClass: "JULES_SESSION_STUCK", attempts: 0, evidence: {} };

/** A ledger with `dates` observed runs per stage; `needed` decides which of them needed help. */
function historyLedger(dates, needed = () => false, neededRun = RESCUED_RUN) {
  const runs = {};
  for (const date of dates) {
    runs[date] = {};
    for (const stage of registry.stages) {
      runs[date][String(stage.number)] = { ...(needed(stage.number, date) ? neededRun : MERGED_RUN) };
    }
  }
  return { schemaVersion: 1, runs };
}

const HISTORY_DATES = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"];

test("a self-sufficient history renders the all-clear health line", () => {
  const ledger = historyLedger(HISTORY_DATES);
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.health.chronic.length, 0);
  assert.equal(recap.health.degrading.length, 0);
  const text = renderRecap(recap);
  assert.match(text, /Pipeline health: no stage is chronic or degrading \(all 13 stages judged\)\./);
});

test("a stage needing help on every recent run is reported as CHRONIC with its evidence", () => {
  // Stage 5 needs help only on the recent half, which is all CHRONIC requires.
  // Keeping the earlier half clean makes streak (2) and observed runs (4)
  // different numbers, so a renderer that confuses them cannot pass.
  const ledger = historyLedger(HISTORY_DATES, (stage, date) => stage === 5 && date >= "2026-08-26");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.chronic.map(s => s.stage), [5]);
  const text = renderRecap(recap);
  assert.match(text, /Pipeline health: adverse cross-run trends \(all 13 stages judged\)\./);
  assert.match(text, /- S05 documentation README is CHRONIC: needed intervention on all 2 most recent runs/);
  assert.match(text, /2 runs in a row needing help, judged over 4 observed runs/);
  assert.match(text, /comparing each stage against its own history/);
});

test("a rising intervention rate on the latest run is reported as DEGRADING", () => {
  // Needed help on the last date only: the recent half is not all-needed (so
  // not CHRONIC), the latest run needed help, and the rate rose from 0% to 50%.
  const ledger = historyLedger(HISTORY_DATES, (stage, date) => stage === 5 && date === "2026-08-27");
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.degrading.map(s => s.stage), [5]);
  assert.equal(recap.health.chronic.length, 0);
  const text = renderRecap(recap);
  assert.match(text, /- S05 documentation README is DEGRADING: intervention rate rose from 0% to 50%/);
  assert.match(text, /1 run in a row needing help, judged over 4 observed runs/);
});

test("an adverse verdict never claims the runs merged or were rescued", () => {
  // The real ledger's dominant failure is a stage that produced nothing at all,
  // not one that was nudged over the line. Both count as needing intervention,
  // so the section must not narrate either mechanism.
  const ledger = historyLedger(HISTORY_DATES, stage => stage === 5, STUCK_RUN);
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.deepEqual(recap.health.chronic.map(s => s.stage), [5]);
  const text = renderRecap(recap);
  assert.match(text, /- S05 documentation README is CHRONIC/);
  assert.doesNotMatch(text, /reaches a merged result|rescues it every time/);
  assert.doesNotMatch(text, /passed its own individual runs/);
});

test("health is judged up to the recapped date and never past it", () => {
  // Stage 5 needs help on the first four nights and recovers on the last two.
  // As of 2026-08-27 that is CHRONIC; over the whole ledger it is HEALTHY. A
  // recap of 2026-08-27 must report what was true that night, both when it runs
  // that night and when it runs days later.
  const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"];
  const ledger = historyLedger(dates, (stage, date) => stage === 5 && date <= "2026-08-27");
  const asOf = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  const stageFive = asOf.health.stages.find(s => s.stage === 5);
  assert.equal(stageFive.verdict, "CHRONIC");
  assert.equal(stageFive.runs, 4, "the two later nights are not evidence about this one");
  assert.equal(stageFive.currentStreak, 4, "the streak stops at the recapped date");
  // Still reaches past the single date: that is the whole point of the section.
  assert.ok(stageFive.runs > 1, "earlier nights are judged alongside the recapped one");
  assert.match(renderRecap(asOf), /- S05 documentation README is CHRONIC/);

  const latest = buildRecap({
    ledger, registry, date: "2026-08-29",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(latest.health.stages.find(s => s.stage === 5).verdict, "HEALTHY");
  assert.match(renderRecap(latest), /no stage is chronic or degrading/);
});

test("a stage without enough history is counted, not silently called healthy", () => {
  const ledger = historyLedger(HISTORY_DATES);
  // Stage 7 is observed on only one date, so it cannot be judged at all.
  for (const date of HISTORY_DATES.slice(1)) ledger.runs[date]["7"] = { state: "EXPECTED", attempts: 0, evidence: {} };
  const recap = buildRecap({
    ledger, registry, date: "2026-08-27",
    coverageByStage: {}, prHistory: "", tags: [],
  });
  assert.equal(recap.health.stages.find(s => s.stage === 7).verdict, "UNKNOWN");
  assert.match(renderRecap(recap), /12 of 13 stages judged, 1 without enough history/);
});

test("renderRecap still works for a hand-built recap that carries no health", () => {
  // renderRecap is exported, so a recap object may be assembled without
  // buildRecap. A missing health field must render a recap without the
  // section, not throw and not print an all-clear it has no evidence for.
  const text = renderRecap({
    date: "2026-08-27",
    total: 1, merged: 1, changed: 1, clean: 0, stuck: 0, rescued: 0,
    grade: 10, rationale: "Optimal run: every stage completed unaided.",
    stages: [{ stage: 2, slug: "verification", outcome: "CHANGED", prNumber: 2002, summary: "added a spec", merged: true }],
  });
  assert.match(text, /Nightly Recap: 2026-08-27/);
  assert.doesNotMatch(text, /Pipeline health/);
});

test("a coverage line carries its run window, and lines written before it still parse", () => {
  // The pipeline computed elapsed on every budget call and threw it away, so it
  // could only ever see binary outcomes. A stage degrading gets SLOWER before it
  // fails, and drift from 20 minutes toward the 45-minute workBudgetMinutes
  // ceiling was invisible until the night it breached and finalized PARTIAL-RUN.
  const withWindow = "* [2026-09-03] [Stage 4] [00:25Z-01:12Z 47m] CLEAN: Codebase -- audited 12 views, 0 unreferenced";
  const parsed = parseCoverageLine(withWindow, 4, "2026-09-03");
  assert.equal(parsed.status, "CLEAN");
  assert.equal(parsed.target, "Codebase");
  assert.equal(parsed.summary, "audited 12 views, 0 unreferenced");
  assert.equal(parsed.window, "00:25Z-01:12Z 47m");
  assert.equal(parsed.durationMinutes, 47);

  // Every line written before the window existed must parse identically, or the
  // whole recorded history becomes unreadable the day this ships.
  const legacy = "* [2026-09-03] [Stage 4] CLEAN: Codebase -- audited 12 views, 0 unreferenced";
  const old = parseCoverageLine(legacy, 4, "2026-09-03");
  assert.equal(old.status, "CLEAN");
  assert.equal(old.target, "Codebase");
  assert.equal(old.summary, "audited 12 views, 0 unreferenced");
  assert.equal(old.window, null);
  assert.equal(old.durationMinutes, null);

  // The window must never be absorbed into the summary, which the evidence floor
  // depends on being clean prose.
  assert.doesNotMatch(parsed.summary, /47m/);
});

// A recap object assembled by hand, so the overview's clauses can be driven
// independently of a whole fixture ledger.
const overviewRecap = (overrides = {}) => ({
  date: "2026-09-03",
  total: 3, merged: 3, changed: 1, clean: 2, stuck: 0, rescued: 0, unobserved: 0,
  grade: 10, rationale: "Optimal run: every stage completed unaided.",
  stages: [
    { stage: 2, slug: "verification", outcome: "CHANGED", merged: true },
    { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true },
    { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
  ],
  ...overrides,
});

test("the overview never describes a clean stage as idle or wasted", () => {
  // Most stages here are auditors and an audit that finds nothing has
  // succeeded. Wording that implies waste is factually wrong about the
  // pipeline, and reading a low change rate as dead capacity is exactly what
  // once got a compliance stage repurposed.
  const text = renderRecap(overviewRecap());
  assert.match(text, /In plain terms:/);
  assert.match(text, /found nothing that needed fixing/);
  assert.match(text, /the job being done rather than a wasted run/);
  assert.doesNotMatch(text, /idle|did nothing|wasted capacity|nothing to show/i);
});

test("the overview keeps acronyms in area names", () => {
  // displayArea carries README, TSDoc, APK, UX and PWA. Lowercasing the area
  // list for prose destroyed them.
  const text = renderRecap(overviewRecap({
    total: 2, changed: 2, clean: 0,
    stages: [
      { stage: 5, slug: "documentation-readme", outcome: "CHANGED", merged: true },
      { stage: 10, slug: "apk-integrity", outcome: "CHANGED", merged: true },
    ],
  }));
  assert.match(text, /documentation README/);
  assert.match(text, /APK integrity/);
  assert.doesNotMatch(text, /documentation readme|apk integrity/);
});

test("a rescued run is never described as self-driven", () => {
  // "13 of 13 merged" and "every stage managed on its own" are different
  // claims. The second was once asserted on the strength of the first and was
  // false: ten merged rows carried recovery evidence.
  const rescuedText = renderRecap(overviewRecap({
    rescued: 1,
    stages: [
      { stage: 2, slug: "verification", outcome: "CHANGED", merged: true },
      { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true, rescued: true },
      { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
    ],
  }));
  assert.match(rescuedText, /S05 documentation README could not finish unaided/);
  assert.match(rescuedText, /not entirely self-driven/);
  assert.doesNotMatch(rescuedText, /got there without help/);

  // A finished run makes no unaided claim in prose at all now: the grade line
  // already carries it, and carried it more precisely, distinguishing 10 from 9
  // on exactly this question. The prose copy could only ever agree with it or
  // contradict it.
  const clean = renderRecap(overviewRecap());
  assert.doesNotMatch(clean, /got there without help/);
  assert.match(clean, /Grade: 10\/10 - Optimal run: every stage completed unaided\./);
});

test("the overview points at what needs attention, and says so when nothing does", () => {
  const quiet = renderRecap(overviewRecap());
  assert.match(quiet, /Nothing in this run needs you to do anything/);

  const degrading = renderRecap(overviewRecap({
    health: { stages: [], chronic: [], degrading: [{ stage: 1, slug: "hardening" }] },
  }));
  assert.match(degrading, /The part worth your attention is S01 hardening/);
  assert.doesNotMatch(degrading, /Nothing in this run needs you/);

  // A stage that is both stuck and degrading is named once, not twice.
  const both = renderRecap(overviewRecap({
    stuck: 1, merged: 2,
    stages: [
      { stage: 1, slug: "hardening", outcome: "STUCK", merged: false },
      { stage: 5, slug: "documentation-readme", outcome: "CLEAN", merged: true },
      { stage: 9, slug: "refactor", outcome: "CLEAN", merged: true },
    ],
    health: { stages: [], chronic: [], degrading: [{ stage: 1, slug: "hardening" }] },
  }));
  assert.equal(both.match(/S01 hardening/g).filter(m => m).length >= 1, true);
  assert.match(both, /The part worth your attention is S01 hardening, detailed below/);
});

test("an unobserved date makes no claim about the run in either direction", () => {
  // Absence of evidence is not evidence of failure, and it is not evidence of
  // success either. The overview must refuse to characterise the run.
  const text = renderRecap(overviewRecap({
    total: 3, merged: 0, changed: 0, clean: 0, unobserved: 3,
    grade: 1, rationale: "No evidence recorded.",
    stages: [
      { stage: 2, slug: "verification", outcome: "UNOBSERVED", merged: false },
      { stage: 5, slug: "documentation-readme", outcome: "UNOBSERVED", merged: false },
      { stage: 9, slug: "refactor", outcome: "UNOBSERVED", merged: false },
    ],
  }));
  assert.match(text, /nothing was recorded for this date/);
  assert.doesNotMatch(text, /landed its work|needs you to do anything/);
});

// The 2026-09-05 regression, from the reader's side. The recap defaults to the
// newest run in the ledger, which between roughly 23:00 and 11:30 UTC is a run
// still in progress. Asked at 10:10 that day it reported stages 12 and 13 --
// scheduled for 10:05 and 11:05 -- as STUCK and graded a flawless night 5/10.
function inFlightLedger(date, throughStage) {
  const runs = { [date]: {} };
  for (const stage of registry.stages) {
    runs[date][String(stage.number)] = stage.number <= throughStage
      ? { ...MERGED_RUN }
      : { state: "EXPECTED", failureClass: null, attempts: 0, evidence: {} };
  }
  return { schemaVersion: 1, runs };
}

test("a run still in progress reports its unreached stages as PENDING, not STUCK", () => {
  const date = "2026-09-05";
  const ledger = inFlightLedger(date, 11);
  const tags = registry.stages
    .filter(stage => stage.number <= 11)
    .map(stage => `nightly/${evidenceDateFor(stage.number, date)}/stage-${stage.number}/pr-${1690 + stage.number}`);

  const recap = buildRecap({ ledger, registry, date, coverageByStage: {}, prHistory: "", tags });

  assert.equal(runProgress({ registry, ledger, date, coverageByStage: {}, tags }).frontier, 11);
  assert.equal(recap.stuck, 0, "nothing is stuck: the pipeline has not reached those stages");
  assert.equal(recap.pending, 2);
  assert.deepEqual(recap.stages.filter(s => s.outcome === "PENDING").map(s => s.stage), [12, 13]);
});

test("an unfinished run is not graded", () => {
  const date = "2026-09-05";
  const recap = buildRecap({
    ledger: inFlightLedger(date, 11), registry, date,
    coverageByStage: {}, prHistory: "", tags: [],
  });

  assert.equal(recap.grade, null, "a partial run has no grade to give");
  const text = renderRecap(recap);
  assert.match(text, /^Nightly Recap: 2026-09-05 \(run still in progress\)$/m);
  assert.match(text, /Grade: withheld - Run still in progress: 2 of 13 stages have not reached their slot yet/);
  assert.match(text, /\| 2 still to run \|/);
  assert.doesNotMatch(text, /\/10/, "never publishes a score for a night that is still running");
  assert.doesNotMatch(text, /produced nothing at all/);
});

// The counts below an in-progress banner are a partial tally, and every claim
// made about them has to say so. "All 13 stages ran" and "every stage got there
// without help" are both false at 10:10 on a night whose last two stages have
// not started.
test("prose about an unfinished run never claims the whole run succeeded", () => {
  const date = "2026-09-05";
  const text = renderRecap(buildRecap({
    ledger: inFlightLedger(date, 11), registry, date,
    coverageByStage: {}, prHistory: "", tags: [],
  }));

  assert.match(text, /This run is still going: S12 APK UX and S13 self healing protocol have not reached their slot/);
  // The count is on the Summary line and is not repeated here.
  assert.doesNotMatch(text, /So far 11 of 13 stages/);
  // Said only while the run is in flight, because only then is there no grade
  // to carry the claim. "That has run" is the load-bearing half.
  assert.match(text, /Every stage that has run got there without help\./);
  assert.match(text, /Nothing that has run so far needs you to do anything\./);
  // A stage that has not run gets one line, not a What/Why/Result trio
  // answering all three questions with the same absence of fact.
  assert.match(text, /^\*\*S12 APK UX\*\* \| Pending \| no PR$/m);
  assert.match(text, /^Not yet run\. Its slot in the run order has not come round yet/m);
  assert.doesNotMatch(text, /^What was checked: APK UX/m);
  assert.doesNotMatch(text, /Waiting for its scheduled slot/);
});

// The phantom that made this look like a real regression: a stage that had not
// started was scored as having needed intervention, which read out as
// "S12 DEGRADING: intervention rate rose from 17% to 36%".
test("an unfinished run contributes no verdict to the cross-run health trend", () => {
  const date = "2026-09-05";
  const history = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
  const ledger = { schemaVersion: 1, runs: {} };
  for (const day of history) {
    ledger.runs[day] = {};
    for (const stage of registry.stages) ledger.runs[day][String(stage.number)] = { ...MERGED_RUN };
  }
  Object.assign(ledger.runs, inFlightLedger(date, 11).runs);

  const recap = buildRecap({ ledger, registry, date, coverageByStage: {}, prHistory: "", tags: [] });

  assert.equal(recap.health.degrading.length, 0);
  assert.equal(recap.health.chronic.length, 0);
  const stage12 = recap.health.stages.find(s => s.stage === 12);
  assert.equal(stage12.runs, history.length, "the unfinished night is not yet a data point about itself");
});

// The other side of the guard. Once the next run has started, the night is over
// and a tail stage that never published is a real failure again. Without this,
// a genuinely dead stage 13 would be excused as "pending" forever.
test("a finished run still reports a tail stage that never ran as STUCK", () => {
  const date = "2026-09-05";
  const ledger = inFlightLedger(date, 11);
  ledger.runs["2026-09-06"] = { "1": { ...MERGED_RUN } };

  const recap = buildRecap({ ledger, registry, date, coverageByStage: {}, prHistory: "", tags: [] });

  assert.equal(recap.pending, 0);
  assert.equal(recap.stuck, 2);
  assert.equal(recap.grade, 5, "two stages down on a finished run is the real 5/10");
});

// Only positive evidence advances the frontier, so a ledger poisoned with
// fabricated failures for stages that never ran cannot defeat the guard. This
// is the state the ledger is actually in until the fixed watchdog next runs.
test("fabricated failure rows do not advance the frontier", () => {
  const date = "2026-09-05";
  const ledger = inFlightLedger(date, 11);
  ledger.runs[date]["12"] = { state: "ESCALATED", failureClass: "NO_PUBLISHED_OUTPUT", attempts: 0, evidence: {} };
  ledger.runs[date]["13"] = { state: "ESCALATED", failureClass: "NO_PUBLISHED_OUTPUT", attempts: 0, evidence: {} };

  assert.equal(runProgress({ registry, ledger, date, coverageByStage: {}, tags: [] }).frontier, 11);
  const recap = buildRecap({ ledger, registry, date, coverageByStage: {}, prHistory: "", tags: [] });
  assert.equal(recap.pending, 2);
  assert.equal(recap.stuck, 0);
});
