// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SUB_CHECKS,
  evaluateBlindSpots,
  statedSubChecks,
  subCheckHistory,
} from "./nightly-blind-spots.mjs";
import { buildRecap, classifyStage, evidenceDateFor, gradeRun, overviewCaveats, renderRecap } from "./nightly-recap.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const stageOf = n => registry.stages.find(s => s.number === n);
const valueOf = (prose, id) => statedSubChecks({ prose })[id]?.value ?? null;

// --- Reading one night -------------------------------------------------------

test("every real S03 spelling on record is read as the status it states", () => {
  // Each string is quoted from a real S03 coverage line or PR-history Result.
  assert.equal(valueOf("Baseline current (0 unfolded migrations, 160 baseline objects, migration-quality PASS, fold-state CLEAN, DB-UNAVAILABLE)", "database-verification"), "DB-UNAVAILABLE", "2026-08-31, bare self-named value");
  assert.equal(valueOf("fold-state: CLEAN, migration-quality: PASS, DB: DB-UNAVAILABLE)", "database-verification"), "DB-UNAVAILABLE", "2026-09-09");
  assert.equal(valueOf("Static migration-quality PASS, fold-state DEGRADED, db-verification DB-UNAVAILABLE.", "database-verification"), "DB-UNAVAILABLE", "2026-09-14");
  assert.equal(valueOf("Migration quality: PASS. Fold-state: DEGRADED. Database verification: DB-UNAVAILABLE.", "database-verification"), "DB-UNAVAILABLE", "2026-09-15");
  assert.equal(valueOf("fold-state DEGRADED, migration-quality FAIL, database DB-UNAVAILABLE.", "database-verification"), "DB-UNAVAILABLE", "2026-09-17");
  assert.equal(valueOf("Migration quality: PASS. Fold-state: DEGRADED.", "fold-state"), "DEGRADED", "2026-09-15");
  assert.equal(valueOf("Migration quality: PASS. Fold-state: DEGRADED.", "migration-quality"), "PASS", "2026-09-15");
  assert.equal(valueOf("migration-quality: PASS; fold-state: DEGRADED (static unsupported constructs require semantic verification); database-verification: DB-UNAVAILABLE", "fold-state"), "DEGRADED", "2026-09-22");
  assert.equal(valueOf("0 pending migrations, fold-state FOLDED, migration-quality PASS", "fold-state"), "FOLDED", "2026-09-06");
  assert.equal(valueOf("apk-ux-audit-status.txt: PASS; apk-ux-audit.json: 1 candidate files reviewed", "apk-ux-audit"), "PASS", "S12, 2026-09-22");
});

test("prose that is not a status is not read as one", () => {
  for (const prose of [
    "Fold-state check complete (rc=2).",
    "apk-ux-audit.json: 12 candidate files",
    "hardened the timeout cancellation path",
    "toolchain probe verified gradle / ANDROID_HOME",
    "fold-state degraded slightly under the new baseline",
    "the database verification step is documented",
  ]) {
    assert.deepEqual(statedSubChecks({ prose }), {}, prose);
  }
  // The vacuous input: nothing at all is nothing stated, never "all ran".
  assert.deepEqual(statedSubChecks({}), {});
});

test("a structured status beats prose, and an unknown one is kept as unrecognised", () => {
  const stated = statedSubChecks({
    structured: { "fold-state": "CLEAN", "migration-quality": "TIMEOUT", "new-check": "PASS" },
    prose: "fold-state DEGRADED, migration-quality PASS",
  });
  assert.deepEqual(stated["fold-state"], { value: "CLEAN", answered: true, source: "structured" });
  assert.deepEqual(stated["migration-quality"], { value: "TIMEOUT", answered: null, source: "structured" });
  assert.equal(stated["new-check"].answered, null, "a check this file does not know is never a silent pass");
});

test("FAIL is a check that ran, so the self-report guard and this reader never both fire on it", () => {
  const prose = "fold-state CLEAN, migration-quality FAIL, database DB-UNAVAILABLE";
  assert.equal(statedSubChecks({ prose })["migration-quality"].answered, true);
  const stage = classifyStage({
    stage: stageOf(3),
    entry: { state: "MERGED", failureClass: null, attempts: 0, evidence: {} },
    tag: "nightly/2026-09-17/stage-3/pr-1850",
    declared: { status: "CLEAN", target: "Codebase", summary: prose },
    history: null,
  });
  assert.equal(stage.selfReportedFailure, true);
  const spots = evaluateBlindSpots([{ date: "2026-09-17", stated: statedSubChecks({ prose }) }], "2026-09-17", { stage: 3 });
  assert.deepEqual(spots.map(s => s.check), ["database-verification"]);
});

// --- Whole runs --------------------------------------------------------------

/**
 * A ledger, tags and coverage logs for `dates`, every stage merged and CLEAN,
 * with Stage 3's summary per date taken from `s03` (absent = a plain summary
 * that states no sub-check).
 */
function runs(dates, { s03 = {}, extra = {}, rescued = [], stuck = [] } = {}) {
  const ledger = { schemaVersion: 1, runs: {} };
  const coverage = {};
  const tags = [];
  for (const date of dates) {
    ledger.runs[date] = {};
    for (const stage of registry.stages) {
      const evidenceDate = evidenceDateFor(stage.number, date);
      const isStuck = stuck.includes(stage.number) && date === dates.at(-1);
      ledger.runs[date][String(stage.number)] = isStuck
        ? { state: "NO_OUTPUT", failureClass: "JULES_SESSION_STUCK", attempts: 0, evidence: {} }
        : rescued.includes(stage.number) && date === dates.at(-1)
          ? { state: "RECOVERABLE", failureClass: "RECOVERED_AFTER_NUDGE", attempts: 1, evidence: {} }
          : { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
      if (isStuck) continue;
      tags.push(`nightly/${evidenceDate}/stage-${stage.number}/pr-${stage.number}`);
      const summary = stage.number === 3 ? (s03[date] || "0 pending migrations") : (extra[stage.number]?.[date] || "nothing to do");
      coverage[stage.number] = `${coverage[stage.number] || ""}* [${evidenceDate}] [Stage ${stage.number}] CLEAN: Codebase -- ${summary}\n`;
    }
  }
  return { ledger, registry, coverageByStage: coverage, prHistory: "", tags };
}

const recapOf = (dates, options) => buildRecap({ ...runs(dates, options), date: dates.at(-1) });
const s03Spots = recap => recap.stages.find(s => s.stage === 3).blindSpots;

test("NEVER: a check that has never run is standing, keeps the 10, and qualifies it", () => {
  const recap = recapOf(["2026-09-01", "2026-09-02"], {
    s03: { "2026-09-01": "fold-state CLEAN, database DB-UNAVAILABLE", "2026-09-02": "fold-state CLEAN, database DB-UNAVAILABLE" },
  });
  assert.deepEqual(s03Spots(recap).map(s => s.kind), ["NEVER"]);
  assert.equal(recap.grade, 10);
  assert.match(recap.rationale, /^Optimal run within standing limits: every stage completed unaided\. 1 check could not run, as on the nights before; see Blind spots\.$/);
  const text = renderRecap(recap);
  assert.match(text, /^\*\*S03 BASELINE CONSOLIDATION\*\* \| Clean, 1 check could not run \| PR #3$/m);
  assert.match(text, /^- S03 database verification: has never been able to run \(DB-UNAVAILABLE on all 2 nights it reported, since 2026-09-01\)\.$/m);
  assert.match(text, /S03 baseline consolidation's clean result does not cover everything: its database verification has never been able to run\./);
  assert.match(text, /Nothing in this run needs you to do anything\./, "a standing limit is not a call on the reader");
});

test("NEW compares against the last STATED night, not the previous calendar night", () => {
  const recap = recapOf(["2026-09-12", "2026-09-13", "2026-09-14"], {
    s03: { "2026-09-12": "fold-state CLEAN", "2026-09-14": "fold-state DEGRADED" },
  });
  const [spot] = s03Spots(recap);
  assert.equal(spot.kind, "NEW");
  assert.equal(spot.lastAnswered.date, "2026-09-12");
  assert.equal(recap.grade, 8);
  assert.match(recap.rationale, /^Lost check: every stage completed, but S03's fold-state check could not run tonight after running on 2026-09-12, the last night it reported/);
  const text = renderRecap(recap);
  assert.match(text, /^- S03 fold-state check: new tonight\. It reported DEGRADED; on 2026-09-12, the last night it reported, it ran \(CLEAN\)\.$/m);
  assert.match(text, /The part worth your attention is S03 baseline consolidation, detailed below\./);
  assert.match(text, /^Blind spots: 1 check could not run tonight, new tonight\.$/m);
});

test("ONGOING: two unanswered stated nights after one that ran is standing, not new", () => {
  const recap = recapOf(["2026-09-12", "2026-09-14", "2026-09-15"], {
    s03: { "2026-09-12": "fold-state CLEAN", "2026-09-14": "fold-state DEGRADED", "2026-09-15": "fold-state DEGRADED" },
  });
  const [spot] = s03Spots(recap);
  assert.equal(spot.kind, "ONGOING");
  assert.equal(recap.grade, 10);
  assert.match(renderRecap(recap), /^- S03 fold-state check: DEGRADED on every night it reported since 2026-09-14 \(2 nights\); it last ran on 2026-09-12 \(CLEAN\)\.$/m);
  assert.match(renderRecap(recap), /its fold-state check has been unable to run since 2026-09-14/);
});

test("RESTORED and FIRST_RUN are printed as news and change no grade", () => {
  const restored = recapOf(["2026-09-06", "2026-09-07", "2026-09-09"], {
    s03: { "2026-09-06": "fold-state FOLDED", "2026-09-07": "fold-state DEGRADED", "2026-09-09": "fold-state CLEAN" },
  });
  assert.deepEqual(s03Spots(restored).map(s => s.kind), ["RESTORED"]);
  assert.equal(restored.grade, 10);
  assert.equal(restored.rationale, "Optimal run: every stage completed unaided.");
  assert.match(renderRecap(restored), /^- S03 fold-state check: ran again tonight \(CLEAN\) after DEGRADED on 2026-09-07\.$/m);
  assert.match(renderRecap(restored), /^\*\*S03 BASELINE CONSOLIDATION\*\* \| Clean \| PR #3$/m);

  const first = recapOf(["2026-09-01", "2026-09-02", "2026-09-03"], {
    s03: { "2026-09-01": "database DB-UNAVAILABLE", "2026-09-02": "database DB-UNAVAILABLE", "2026-09-03": "database DB-AVAILABLE" },
  });
  assert.deepEqual(s03Spots(first).map(s => s.kind), ["FIRST_RUN"]);
  assert.equal(first.grade, 10);
  assert.match(renderRecap(first), /^- S03 database verification: ran for the first time tonight \(DB-AVAILABLE\) after DB-UNAVAILABLE on all 2 nights before\.$/m);
});

test("a stage that stops mentioning an unanswered check is unknown, never fixed", () => {
  const recap = recapOf(["2026-09-12", "2026-09-13"], { s03: { "2026-09-12": "fold-state CLEAN, database DB-UNAVAILABLE" } });
  const [spot] = s03Spots(recap);
  assert.equal(spot.kind, "UNSTATED");
  assert.notEqual(spot.kind, "RESTORED");
  assert.equal(recap.standingBlindSpots.length, 1);
  const text = renderRecap(recap);
  assert.match(text, /^- S03 database verification: not reported tonight\. It has never been able to run \(DB-UNAVAILABLE on 2026-09-12, the only night it reported\), so tonight is unknown, not fixed\.$/m);
  assert.match(text, /^\*\*S03 BASELINE CONSOLIDATION\*\* \| Clean, 1 check not reported \| PR #3$/m);
  assert.match(recap.rationale, /1 check that could not run before was not reported; see Blind spots\./);
});

test("with no evidence at all the section says not measured, never none", () => {
  const recap = recapOf(["2026-08-20"]);
  assert.deepEqual(recap.blindSpotCoverage, { everReported: [], reportedTonight: [] });
  assert.equal(recap.rationale, "Optimal run: every stage completed unaided.");
  const text = renderRecap(recap);
  assert.match(text, /^Blind spots: not measured\. No stage had reported whether its checks could run on or before this date, so this run cannot say whether any check was skipped\.$/m);
  assert.doesNotMatch(text, /Blind spots: none/);

  // The measured "none" has to read differently from the unmeasured one.
  const ran = recapOf(["2026-09-09"], { s03: { "2026-09-09": "fold-state CLEAN, migration-quality PASS" } });
  assert.match(renderRecap(ran), /^Blind spots: none\. Every check S03 reported on tonight ran\.$/m);
});

test("reporters silent tonight, with nothing standing, is not measured tonight", () => {
  const recap = recapOf(["2026-09-11", "2026-09-12"], {
    s03: { "2026-09-11": "fold-state CLEAN" },
    extra: { 12: { "2026-09-11": "apk-ux-audit-status.txt: PASS" } },
  });
  assert.deepEqual(recap.blindSpotCoverage, { everReported: [3, 12], reportedTonight: [] });
  assert.match(renderRecap(recap), /^Blind spots: not measured tonight\. S03 and S12 report this, and neither did tonight\.$/m);
});

test("a line dated after the selected date never changes that date's reading", () => {
  const through = runs(["2026-09-12", "2026-09-14"], { s03: { "2026-09-12": "fold-state CLEAN", "2026-09-14": "fold-state DEGRADED" } });
  const later = runs(["2026-09-12", "2026-09-14", "2026-09-15"], {
    s03: { "2026-09-12": "fold-state CLEAN", "2026-09-14": "fold-state DEGRADED", "2026-09-15": "fold-state CLEAN" },
  });
  const a = buildRecap({ ...through, date: "2026-09-14" });
  const b = buildRecap({ ...later, date: "2026-09-14" });
  assert.deepEqual(s03Spots(b), s03Spots(a));
  assert.equal(b.grade, a.grade);
});

test("Stage 1's previous-day logging is read against its own run date", () => {
  // Stage 1 logs under the day before the run, so its 2026-09-13 record is
  // the 2026-09-14 run. The verdict must be keyed by run date.
  const coverageByStage = {
    1: "* [2026-09-12] [Stage 1] CLEAN: Codebase -- fold-state CLEAN\n* [2026-09-13] [Stage 1] CLEAN: Codebase -- fold-state DEGRADED\n",
  };
  const history = subCheckHistory({ registry, coverageByStage, historyByStage: {}, date: "2026-09-14" });
  assert.deepEqual(history[1].map(n => n.date), ["2026-09-13", "2026-09-14"]);
  const [spot] = evaluateBlindSpots(history[1], "2026-09-14", { stage: 1 });
  assert.equal(spot.kind, "NEW");
  // The 2026-09-13 run date reads only the record dated 2026-09-12.
  const before = subCheckHistory({ registry, coverageByStage, historyByStage: {}, date: "2026-09-13" });
  assert.deepEqual(before[1].map(n => n.date), ["2026-09-13"]);
});

test("only the first record of a date counts, as it does for the declared status", () => {
  const coverageByStage = {
    3: "* [2026-09-14] [Stage 3] CLEAN: Codebase -- fold-state DEGRADED\n* [2026-09-14] [Stage 3] CLEAN: Codebase -- fold-state CLEAN\n",
  };
  const history = subCheckHistory({ registry, coverageByStage, historyByStage: {}, date: "2026-09-14" });
  assert.equal(history[3][0].stated["fold-state"].value, "DEGRADED");
});

test("the grade-8 rule sits below a stuck stage and above a rescue", () => {
  const nights = { "2026-09-12": "fold-state CLEAN", "2026-09-14": "fold-state DEGRADED" };
  const rescued = recapOf(["2026-09-12", "2026-09-14"], { s03: nights, rescued: [5] });
  assert.equal(rescued.grade, 8, "a lost check outranks a watchdog nudge");
  const stuck = recapOf(["2026-09-12", "2026-09-14"], { s03: nights, stuck: [1] });
  assert.equal(stuck.grade, 7, "a stuck stage still outranks a lost check");
  // And the rule reads nothing it was not given: hand-built stages with no
  // blindSpots field grade exactly as before.
  assert.equal(gradeRun(Array.from({ length: 13 }, () => ({ outcome: "CLEAN", merged: true, rescued: false, observed: true }))).grade, 10);
});

test("a self-reported failure outranks a lost check on the same night", () => {
  // 2026-09-07: fold-state went DEGRADED (NEW) on the night migration-quality
  // reported FAIL. The self-report 6 must win, and the 8 must not mask it.
  const recap = recapOf(["2026-09-06", "2026-09-07"], {
    s03: { "2026-09-06": "fold-state FOLDED", "2026-09-07": "fold-state DEGRADED, migration-quality FAIL" },
  });
  assert.deepEqual(s03Spots(recap).map(s => s.kind), ["NEW"]);
  assert.equal(recap.grade, 6);
  assert.match(recap.rationale, /^Self-report gap:/);
});

test("the overview caveats are one list that is empty when nothing needs qualifying", () => {
  assert.deepEqual(overviewCaveats(recapOf(["2026-09-09"])), [], "a night with no blind spot adds no sentence");
  assert.deepEqual(overviewCaveats({}), [], "no stages at all is no caveat, not a throw");
  const recap = recapOf(["2026-09-01", "2026-09-02"], {
    s03: { "2026-09-01": "fold-state CLEAN, database DB-UNAVAILABLE", "2026-09-02": "fold-state CLEAN, database DB-UNAVAILABLE" },
  });
  const caveats = overviewCaveats(recap);
  assert.deepEqual(caveats, ["S03 baseline consolidation's clean result does not cover everything: its database verification has never been able to run."]);
  // Rendered straight after the claim it qualifies, not somewhere else.
  const text = renderRecap(recap);
  assert.ok(text.includes(`found nothing that needed fixing, which for auditing stages is the job being done rather than a wasted run. ${caveats[0]}`));
});

// --- The real record ---------------------------------------------------------
//
// Every Stage 3 first coverage record from 2026-08-31, when the sub-check
// vocabulary began, to 2026-09-22, verbatim, plus the PR-history Results still
// held for the last eight of those nights. This pins what the design measured
// against the whole record: a lost check on 2026-09-07 and 2026-09-14 and on
// no other night, fold-state back on 2026-09-09, and a database check that has
// never once been able to run.

const S03_RECORDS = `* [2026-08-31] [Stage 3] CLEAN: Codebase -- Baseline current (0 unfolded migrations, 160 baseline objects, migration-quality PASS, fold-state CLEAN, DB-UNAVAILABLE)
* [2026-09-01] [Stage 3] CLEAN: Codebase -- clean calibration pass: 0 pending migrations, 25 migrations examined, migration-quality PASS, fold-state CLEAN, database-verification DB-UNAVAILABLE
* [2026-09-02] [Stage 3] CLEAN: Codebase -- Read-only baseline audit verified master migration schema is current
* [2026-09-03] [Stage 3] CLEAN: Codebase -- 0 pending migrations (clean-since-calibration: 1); read-only RLS, search_path, and formatting audit completed with zero source changes required
* [2026-09-04] [Stage 3] [01:08Z-01:12Z 4m] CHANGED: Backend/supabase/migrations/20260531232406_master_migration.sql -- Folded 3 pending migrations into master migration baseline
* [2026-09-05] [Stage 3] [01:30Z-01:33Z 4m] CLEAN: Codebase -- Baseline consolidation audit completed cleanly; master migration is fully up to date.
* [2026-09-06] [Stage 3] [01:31Z-01:34Z 3m] CLEAN: Codebase -- Read-only baseline schema audit complete; 0 pending migrations, fold-state FOLDED, migration-quality PASS, database verification DB-UNAVAILABLE
* [2026-09-07] [Stage 3] [01:25Z-01:35Z 10m] CLEAN: Codebase -- Read-only baseline audit verified RLS, search_path isolation, and formatting on master migration (0 pending migrations, fold-state DEGRADED, migration-quality FAIL, database-verification DB-UNAVAILABLE)
* [2026-09-08] [Stage 3] [01:14Z-01:24Z 10m] CHANGED: Backend/supabase/migrations/20260531232406_master_migration.sql -- Folded 4 pending migrations into baseline
* [2026-09-09] [Stage 3] [01:05Z-01:07Z 2m] CLEAN: Codebase -- Baseline current (0 pending migrations, fold-state: CLEAN, migration-quality: PASS, DB: DB-UNAVAILABLE)
* [2026-09-11] [Stage 3] [01:13Z-01:17Z 3m] CLEAN: Codebase -- Baseline current across 32 migrations with 0 pending. Read-only audit confirmed RLS compliance, search_path isolation, and formatting rules.
* [2026-09-12] [Stage 3] [01:15Z-01:19Z 4m] CLEAN: Codebase -- Baseline current (0 pending migrations, migration-quality PASS, fold-state CLEAN, db DB-UNAVAILABLE). Read-only baseline audit verified RLS compliance, search_path isolation, and zero formatting deviations.
* [2026-09-13] [Stage 3] [01:09Z-01:12Z 3m] CLEAN: Codebase -- Audited master migration 20260531232406_master_migration.sql against 33 replayed migrations with 0 pending migrations; verified RLS compliance, search_path isolation, and zero em-dash/emoji formatting constraints.
* [2026-09-14] [Stage 3] [01:11Z-01:14Z 3m] CLEAN: Codebase -- Baseline current (0 pending migrations, 4 clean since calibration). Static migration-quality PASS, fold-state DEGRADED, db-verification DB-UNAVAILABLE. RLS, search_path, and formatting compliant.
* [2026-09-15] [Stage 3] [01:21Z-01:24Z 3m] CLEAN: Codebase -- Completed read-only baseline consolidation audit. Pending migrations count: 0. Migration quality: PASS. Fold-state: DEGRADED. Database verification: DB-UNAVAILABLE. Clean calibration streak: 5 (since calibration: 0).
* [2026-09-16] [Stage 3] [01:24Z-01:27Z 3m] CLEAN: Codebase -- 0 pending migrations; read-only baseline RLS/search_path/formatting audit CLEAN
* [2026-09-17] [Stage 3] [01:02Z-01:05Z 3m] CLEAN: Codebase -- Audited master_migration.sql baseline with 0 pending migrations; verified RLS compliance (29 directives on tables), search_path isolation, and formatting; fold-state DEGRADED, migration-quality FAIL, database DB-UNAVAILABLE.
* [2026-09-18] [Stage 3] [01:12Z-01:16Z 4m] CLEAN: Codebase -- Baseline current across 0 pending migrations; read-only RLS and search_path audit clean.
* [2026-09-19] [Stage 3] [01:18Z-01:20Z 3m] CLEAN: Codebase -- 0 pending migrations; fold-state DEGRADED; migration-quality PASS; database-verification DB-UNAVAILABLE; read-only RLS and search_path baseline audit clean
* [2026-09-20] [Stage 3] [01:28Z-01:31Z 3m] CLEAN: Codebase -- Completed read-only audit of master migration baseline with 0 pending migrations; verified RLS compliance, search_path isolation, and clean formatting.
* [2026-09-21] [Stage 3] [01:19Z-01:22Z 3m] CLEAN: Codebase -- Baseline current across 0 pending migrations (calibration-due: NO, consecutive CLEAN: 11); read-only RLS, search_path, and formatting audit verified clean
* [2026-09-22] [Stage 3] [01:26Z-01:34Z 7m] CLEAN: Codebase -- 0 pending migrations; master baseline verified clean
`;

const S03_RESULTS = {
  "2026-09-15": "Static audit PASS, fold-state DEGRADED (semantic DO patch requirement in DB-UNAVAILABLE environment).",
  "2026-09-16": "migration-quality PASS, fold-state DEGRADED (dynamic DO patch), DB-UNAVAILABLE, calibration-due NO",
  "2026-09-17": "Static fold-state DEGRADED (exit 2, 0 pending migrations), migration-quality FAIL (6 historical violations), database DB-UNAVAILABLE.",
  "2026-09-18": "0 pending migrations, migration-quality PASS, fold-state DEGRADED, database verification DB-UNAVAILABLE.",
  "2026-09-19": "Audit pass with 0 pending migrations and DB-UNAVAILABLE semantic status",
  "2026-09-20": "Static audit PASS (migration-quality: PASS, fold-state: DEGRADED, DB: DB-UNAVAILABLE). Clean-since-calibration count: 4, pending migrations: 0.",
  "2026-09-21": "Pending migrations: 0; migration-quality: PASS; fold-state: DEGRADED; database-verification: DB-UNAVAILABLE",
  "2026-09-22": "migration-quality: PASS; fold-state: DEGRADED (static unsupported constructs require semantic verification); database-verification: DB-UNAVAILABLE",
};

function realS03Verdicts() {
  const historyByStage = { 3: Object.entries(S03_RESULTS).map(([date, result]) => ({ date, change: null, result })) };
  const verdicts = {};
  for (let day = new Date("2026-08-31T00:00:00Z"); day <= new Date("2026-09-22T00:00:00Z"); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    const nights = subCheckHistory({ registry, coverageByStage: { 3: S03_RECORDS }, historyByStage, date })[3];
    verdicts[date] = evaluateBlindSpots(nights, date, { stage: 3 });
  }
  return verdicts;
}

test("the real S03 record reads as the design measured it", () => {
  const verdicts = realS03Verdicts();
  const on = kind => Object.entries(verdicts).filter(([, spots]) => spots.some(s => s.kind === kind)).map(([date]) => date);
  assert.deepEqual(on("NEW"), ["2026-09-07", "2026-09-14"]);
  assert.deepEqual(on("RESTORED"), ["2026-09-09"]);
  assert.deepEqual(on("FIRST_RUN"), []);
  for (const [date, spots] of Object.entries(verdicts)) {
    const db = spots.find(s => s.check === "database-verification");
    assert.ok(db && ["NEVER", "UNSTATED"].includes(db.kind), `${date}: database verification must read as never run or unknown, got ${db?.kind}`);
  }
  // The night that carried the brief: two standing blind spots, nothing new.
  const last = verdicts["2026-09-22"];
  assert.deepEqual(last.map(s => [s.check, s.kind]), [["database-verification", "NEVER"], ["fold-state", "ONGOING"]]);
  assert.equal(last[1].streakStart, "2026-09-14");
  assert.equal(last[1].lastAnswered.date, "2026-09-12");
  // migration-quality FAIL (09-07, 09-17) belongs to the self-report guard.
  assert.equal(Object.values(verdicts).flat().some(s => s.check === "migration-quality"), false);
});

// --- The producer vocabulary -------------------------------------------------

test("every status the context script can write is classified exactly once", () => {
  // Parsed from the producer itself, so a value added there fails here until
  // it is classified. A status file with no entry would be a check this reader
  // cannot see at all.
  const script = readFileSync(new URL("./update-nightly-context.sh", import.meta.url), "utf8");
  const pairs = [...script.matchAll(/echo "([A-Z][A-Z0-9_-]*)" > "\$CONTEXT_DIR\/([a-z0-9-]+)-status\.txt"/g)]
    .map(([, value, id]) => ({ id, value }));
  assert.ok(pairs.length > 0, "the producer pattern matched nothing, so this pin would pass vacuously");

  for (const { id, value } of pairs) {
    const check = SUB_CHECKS.find(c => c.id === id);
    assert.ok(check, `${id}-status.txt has no SUB_CHECKS entry`);
    const inAnswered = check.answered.includes(value);
    const inUnanswered = check.unanswered.includes(value);
    assert.ok(inAnswered !== inUnanswered, `${id}=${value} must be in exactly one of answered/unanswered`);
  }
  const produced = new Set(pairs.map(p => p.id));
  for (const check of SUB_CHECKS) {
    assert.ok(produced.has(check.id), `${check.id} is not written by the producer; its entry is stale`);
  }
});

// --- Review findings (2026-09-23) --------------------------------------------
//
// Four low-severity findings from the first review of this feature, each
// verified against real inputs before being reported. Fixed here, with the
// test that would have caught it.

test("a stage whose turn has not come yet is not called silent", () => {
  // S12 reported apk-ux-audit on 2026-09-20 (so it is a known reporter), but
  // tonight (2026-09-21) the run has only reached stage 11: S12 has not run,
  // and calling that "did not report tonight" would be a claim about a night
  // still ahead, the same mistake buildRecap's own PENDING guard exists to
  // avoid for blindSpots itself.
  const priorDate = "2026-09-20";
  const date = "2026-09-21";
  const ledger = { schemaVersion: 1, runs: { [date]: {} } };
  for (const stage of registry.stages) {
    ledger.runs[date][String(stage.number)] = stage.number <= 11
      ? { state: "MERGED", failureClass: null, attempts: 0, evidence: {} }
      : { state: "EXPECTED", failureClass: null, attempts: 0, evidence: {} };
  }
  const tags = registry.stages
    .filter(stage => stage.number <= 11)
    .map(stage => `nightly/${evidenceDateFor(stage.number, date)}/stage-${stage.number}/pr-${1900 + stage.number}`);
  const coverageByStage = {
    12: `* [${evidenceDateFor(12, priorDate)}] [Stage 12] CLEAN: Codebase -- apk-ux-audit-status.txt: PASS\n`,
  };

  const recap = buildRecap({ ledger, registry, date, coverageByStage, prHistory: "", tags });

  assert.equal(recap.stages.find(s => s.stage === 12).outcome, "PENDING");
  assert.deepEqual(recap.blindSpotCoverage, { everReported: [12], reportedTonight: [] });
  const text = renderRecap(recap);
  assert.match(text, /^Blind spots: not measured yet tonight\. S12 reports this and has not run yet\.$/m);
  assert.doesNotMatch(text, /did not tonight/);

  // Mixed case: a reporter that has run and stayed silent, alongside one still
  // pending, must name each separately rather than lumping them together.
  const ledger2 = { schemaVersion: 1, runs: { [date]: { ...ledger.runs[date] } } };
  ledger2.runs[date]["3"] = { state: "MERGED", failureClass: null, attempts: 0, evidence: {} };
  const tags2 = [...tags, `nightly/${evidenceDateFor(3, date)}/stage-3/pr-1903`];
  const coverageByStage2 = {
    ...coverageByStage,
    3: `* [${evidenceDateFor(3, priorDate)}] [Stage 3] CLEAN: Codebase -- fold-state CLEAN\n* [${evidenceDateFor(3, date)}] [Stage 3] CLEAN: Codebase -- nothing to do\n`,
  };
  const mixed = buildRecap({ ledger: ledger2, registry, date, coverageByStage: coverageByStage2, prHistory: "", tags: tags2 });
  const mixedText = renderRecap(mixed);
  assert.match(mixedText, /^Blind spots: not measured tonight\. S03 reports this, and did not tonight; S12 has not run yet\.$/m);
});

test("a mixed streak of DEGRADED and SKIPPED never claims one status for every night", () => {
  const nights = {
    "2026-08-31": "fold-state CLEAN",
    "2026-09-01": "fold-state DEGRADED",
    "2026-09-02": "fold-state SKIPPED",
    "2026-09-03": "fold-state DEGRADED",
  };
  const recap = recapOf(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"], { s03: nights });
  const [spot] = s03Spots(recap);
  assert.equal(spot.kind, "ONGOING");
  assert.equal(spot.streakValue, null, "the streak mixes two values, so no single one is true of every night");
  const text = renderRecap(recap);
  assert.match(text, /S03 fold-state check: could not run on every night it reported since 2026-09-01/);
  assert.doesNotMatch(text, /DEGRADED on every night/);
});

test("only the reporters that have reported so far scope the coverage sentence", () => {
  const recap = recapOf(["2026-09-11", "2026-09-12"], {
    s03: { "2026-09-11": "fold-state CLEAN", "2026-09-12": "fold-state DEGRADED" },
    extra: { 12: { "2026-09-11": "apk-ux-audit-status.txt: PASS", "2026-09-12": "apk-ux-audit-status.txt: PASS" } },
  });
  const text = renderRecap(recap);
  assert.match(text, /Only S03 and S12 have ever reported whether their checks ran, so this says nothing about the other 11 stages\./);
});

test("a single-night NEVER or UNSTATED reading names that one night, not \"all 1 nights\"", () => {
  const never = recapOf(["2026-09-09"], { s03: { "2026-09-09": "fold-state DEGRADED" } });
  assert.match(renderRecap(never), /^- S03 fold-state check: has never been able to run \(DEGRADED on 2026-09-09, the only night it reported\)\.$/m);

  const unstated = recapOf(["2026-09-09", "2026-09-10"], { s03: { "2026-09-09": "fold-state DEGRADED" } });
  assert.match(renderRecap(unstated), /^- S03 fold-state check: not reported tonight\. It has never been able to run \(DEGRADED on 2026-09-09, the only night it reported\), so tonight is unknown, not fixed\.$/m);
  assert.doesNotMatch(renderRecap(unstated), /all 1 nights/);
});

test("two blind-spot phrases for one stage read as two clauses, not one run-on sentence", () => {
  // Both checks land on the same UNSTATED night, so each phrase already
  // carries its own comma ("... tonight, after it last could not run").
  // joinList's ", ... and ..." used to erase the seam between them.
  const recap = recapOf(["2026-09-09", "2026-09-10"], {
    s03: { "2026-09-09": "fold-state DEGRADED, migration-quality PASS, DB-UNAVAILABLE" },
  });
  const text = renderRecap(recap);
  assert.match(
    text,
    /S03 baseline consolidation's clean result does not cover everything: its database verification was not reported tonight, after it last could not run; its fold-state check was not reported tonight, after it last could not run\./,
  );
});
