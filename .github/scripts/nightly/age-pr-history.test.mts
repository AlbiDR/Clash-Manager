// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// The port's own tests. age-pr-history was Python until 2026-09-05 and had no
// tests at all, because nothing in this suite could import it. That is not a
// coincidence: it is the cost the language boundary was charging, and it is why
// the format it owns was the one shared contract in the pipeline with no guard.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { addEntry, ageHistory, daysBetween, isoWeekKey, isoWeekStart, parseDate, sweepOrphanEntries } from "./age-pr-history.mts";

const HEADER = [
  "<!--",
  "TIER_CONFIG:",
  "LAST_AGED:   2026-01-01",
  "-->",
  "",
  "## T1 -- Active (last 7 days)",
].join("\n");

function document({ t1 = "", t2 = "", t3 = "", t4 = "\n" }): string {
  return `${HEADER}\n${t1}\n## T2 -- Recent (8-30 days)\n${t2}\n## T3 -- Historical (31-90 days)\n${t3}\n## T4 -- Archive (90+ days)${t4}`;
}

function block(date: string, pr: number, stage: string, title: string): string {
  return [
    `### [${date}] PR #${pr} [${stage}]: ${title}`,
    `**Domain:** apk | **Commit:** abc1234 | [View PR](https://example.invalid/${pr})`,
    "**Files:** a.log",
    "**Why:** because",
    `**Change:** ${title}`,
    "**Result:** passed",
  ].join("\n");
}

test("ISO week keys and their Monday round-trip", () => {
  // 2026-01-01 is a Thursday, so it belongs to ISO week 1 of 2026.
  assert.equal(isoWeekKey(parseDate("2026-01-01") as Date), "2026-W01");
  // A Sunday belongs to the week that started the previous Monday.
  assert.equal(isoWeekKey(parseDate("2026-09-06") as Date), "2026-W36");
  assert.equal(isoWeekKey(parseDate("2026-09-07") as Date), "2026-W37");
  assert.equal((isoWeekStart("2026-W37") as Date).toISOString().slice(0, 10), "2026-09-07");
  // An unparseable key returns null, which the caller treats as "keep", because
  // preserving a week nobody can date beats silently deleting it.
  assert.equal(isoWeekStart("not-a-week"), null);
});

test("day arithmetic matches whole UTC days", () => {
  assert.equal(daysBetween(parseDate("2026-09-08") as Date, parseDate("2026-09-01") as Date), 7);
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate("nonsense"), null);
});

test("a block inside the 7 day window stays in T1", () => {
  const content = document({ t1: `\n${block("2026-09-05", 1700, "Stage 4", "Recent work")}\n` });
  const aged = ageHistory(content, "2026-09-08");
  assert.match(aged, /### \[2026-09-05\] PR #1700/);
  assert.doesNotMatch(aged, /\* \[2026-09-05\] PR #1700/, "not yet a T2 one-liner");
});

test("a block past 7 days becomes a T2 line carrying its domain and commit", () => {
  const content = document({ t1: `\n${block("2026-09-01", 1700, "Stage 4", "Older work")}\n` });
  const aged = ageHistory(content, "2026-09-20");
  assert.doesNotMatch(aged, /### \[2026-09-01\]/);
  assert.match(aged, /\* \[2026-09-01\] PR #1700 \[apk\]: Older work \(``abc1234``\) \[View\]\(https:\/\/example\.invalid\/1700\)/);
});

// MERGE FAILED blocks record an incident that either recurred, in which case a
// fresher one exists, or did not, in which case it is noise.
test("an aged-out MERGE FAILED block is dropped rather than aged", () => {
  const content = document({ t1: "\n## [2026-09-01] MERGE FAILED\nSomething went wrong\n" });
  const aged = ageHistory(content, "2026-09-20");
  assert.doesNotMatch(aged, /MERGE FAILED/);
  assert.doesNotMatch(aged, /\* \[2026-09-01\]/, "it is dropped, not folded into T2");
});

test("a T2 line past 30 days is regrouped into T3 by ISO week and domain", () => {
  const content = document({ t2: "\n* [2026-07-01] PR #1500 [apk]: Old thing (``c``) [View](u)\n* [2026-07-02] PR #1501 [apk]: Other (``c``) [View](u)\n" });
  const aged = ageHistory(content, "2026-09-20");
  assert.match(aged, /#### 2026-W27/);
  assert.match(aged, /\* 2 PRs \[apk\]: #1500, #1501/);
});

// Faithful to the Python: PR ids are sorted as strings, so #1000 precedes #999.
// Asserted so that a well-meaning "fix" to numeric sorting has to be a decision
// rather than an accident, since it would rewrite live history on the next run.
test("T3 pull request ids sort as strings, not numbers", () => {
  const content = document({
    t3: "\n#### 2026-W27\n* 3 PRs [apk]: #999, #1000, #98\n",
  });
  const aged = ageHistory(content, "2026-09-20");
  assert.match(aged, /\* 3 PRs \[apk\]: #1000, #98, #999/);
});

test("a T3 week past 90 days is dropped", () => {
  const content = document({ t3: "\n#### 2026-W10\n* 1 PRs [apk]: #100\n" });
  assert.doesNotMatch(ageHistory(content, "2026-09-20"), /2026-W10/);
});

test("the aging pass stamps LAST_AGED and is idempotent", () => {
  const content = document({ t1: `\n${block("2026-09-05", 1700, "Stage 4", "Work")}\n` });
  const once = ageHistory(content, "2026-09-08");
  assert.match(once, /LAST_AGED:   2026-09-08/);
  assert.equal(ageHistory(once, "2026-09-08"), once, "aging twice on one date must change nothing");
});

test("an entry written above TIER_CONFIG is swept back into T1", () => {
  const orphan = block("2026-09-05", 1699, "Stage 6", "Written by hand");
  const content = `${orphan}\n\n${document({})}`;
  const swept = sweepOrphanEntries(content);
  assert.equal(swept.swept, 1);
  assert.ok(!swept.content.startsWith("### "), "no longer sitting above the config block");
  assert.ok(
    swept.content.indexOf("## T1 -- Active (last 7 days)") < swept.content.indexOf("PR #1699"),
    "and now sitting after the T1 marker",
  );
});

test("addEntry prepends a complete block to T1", () => {
  const added = addEntry(document({}), {
    today: "2026-09-05", stageName: "Stage 4", domain: "optimization", prNumber: "9999",
    files: "a.ts, b.ts", why: "reason", change: "did a thing", result: "tests passed",
  });
  assert.match(added, /### \[2026-09-05\] PR #9999 \[Stage 4\]: did a thing/);
  assert.match(added, /\*\*Domain:\*\* optimization \| \*\*Commit:\*\* PENDING \| \[View PR\]\(PENDING\)/);
  assert.match(added, /\*\*Result:\*\* tests passed/);
});

// THE CONTRACT THIS FILE EXISTS TO GUARD.
//
// This module writes the T1 block; nightly-recap.mjs parses it to recover each
// stage's Why and Result. Until the port those two lived in different
// languages, so nothing could assert they agreed, and this is the last of the
// pipeline's shared formats to get a guard. The two that already had one had
// both silently drifted before they got it.
test("a block this module writes is one the recap can read back", async () => {
  const { parsePrHistoryEntry } = await import("./nightly-recap.mjs");
  const added = addEntry(document({}), {
    today: "2026-09-05", stageName: "Stage 7", domain: "version", prNumber: "1700",
    files: "package.json, README.md", why: "drift check", change: "verified versions", result: "clean",
  });

  const parsed = parsePrHistoryEntry(added, 7, "2026-09-05");
  assert.ok(parsed, "the recap must be able to parse what this module writes");
  assert.equal(parsed.prNumber, 1700);
  assert.equal(parsed.title, "verified versions");
  assert.equal(parsed.why, "drift check");
  assert.equal(parsed.change, "verified versions");
  assert.equal(parsed.result, "clean");
  assert.deepEqual(parsed.files, ["package.json", "README.md"]);
});

// The same contract against the real file rather than a fixture, so a format
// that drifted in production is caught even if the fixture was updated to match.
test("the live history file is still readable by the recap", async () => {
  const { parsePrHistoryEntry } = await import("./nightly-recap.mjs");
  const live = readFileSync(new URL("../../nightly-logs/00-pr-history.md", import.meta.url), "utf8");
  const head = /^### \[(\d{4}-\d{2}-\d{2})\] PR #\d+ \[Stage (\d+)\]:/m.exec(live);
  assert.ok(head, "the live file must contain at least one T1 block");

  const parsed = parsePrHistoryEntry(live, Number(head[2]), head[1]);
  assert.ok(parsed, `the recap could not parse the newest live block (${head[0]})`);
  assert.ok(parsed.why, "Why survived into the live file");
  assert.ok(parsed.result, "Result survived into the live file");
});
