// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEmptyLedger, ensureRunEntries, upsertStageEntry } from "./nightly-ledger.mjs";
import { evaluateNightlyRun, expectedEvidenceDate, matchJulesSession, renderSummary } from "./nightly-watchdog.mjs";

const registry = JSON.parse(readFileSync(new URL("../nightly-config/stages.json", import.meta.url), "utf8"));

function mergedObserved(date) {
  return {
    prs: [],
    tags: new Set(registry.stages.map(stage => `nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`)),
    coverageStages: new Set(),
  };
}

test("watchdog succeeds when all thirteen stages have durable tag evidence", () => {
  const date = "2026-08-11";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: mergedObserved(date),
    previousLedger: createEmptyLedger(),
  });

  assert.equal(entries.length, 13);
  assert.equal(entries.every(entry => entry.state === "MERGED"), true);
  assert.match(renderSummary(date, entries), /Merged: 13/);
});

test("watchdog accepts Stage 1 evidence from the previous UTC date", () => {
  assert.equal(expectedEvidenceDate(1, "2026-08-11"), "2026-08-10");
  assert.equal(expectedEvidenceDate(2, "2026-08-11"), "2026-08-11");

  const observed = {
    prs: [],
    tags: new Set(["nightly/2026-08-10/stage-1/pr-1416"]),
    coverageStages: new Set(registry.stages.filter(stage => stage.number !== 1).map(stage => stage.number)),
  };
  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: createEmptyLedger(),
  });

  assert.equal(entries.find(entry => entry.stage === 1).state, "MERGED");
  assert.equal(entries.every(entry => entry.state === "MERGED"), true);
});

test("watchdog reports malformed open PRs as recoverable", () => {
  const observed = mergedObserved("2026-08-11");
  observed.tags.delete("nightly/2026-08-11/stage-3/pr-1403");
  observed.prs.push({
    number: 1418,
    state: "OPEN",
    created_at: "2026-08-11T01:13:17Z",
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "Nightly-1085819592077280237" },
    html_url: "https://github.com/AlbiDR/Clash-Manager/pull/1418",
    files: [".github/nightly-logs/03-baseline-consolidation-coverage.log"],
  });

  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage3 = entries.find(entry => entry.stage === 3);
  assert.equal(stage3.state, "RECOVERABLE");
  assert.equal(stage3.failureClass, "MALFORMED_BRANCH");
  assert.equal(stage3.evidence.prNumber, 1418);
});

test("watchdog marks missing output and escalates repeated missing output", () => {
  const observed = mergedObserved("2026-08-11");
  observed.tags.delete("nightly/2026-08-11/stage-6/pr-1406");
  observed.tags.delete("nightly/2026-08-11/stage-12/pr-1412");
  observed.tags.delete("nightly/2026-08-11/stage-13/pr-1413");

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-11");
  upsertStageEntry(ledger, registry, "2026-08-11", 12, {
    state: "NO_OUTPUT",
    failureClass: "NO_PUBLISHED_OUTPUT",
  });

  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: ledger,
  });

  assert.equal(entries.find(entry => entry.stage === 6).state, "NO_OUTPUT");
  assert.equal(entries.find(entry => entry.stage === 12).state, "ESCALATED");
  assert.equal(entries.find(entry => entry.stage === 13).state, "NO_OUTPUT");
  assert.match(renderSummary("2026-08-11", entries), /Failing states: Stage 6 NO_OUTPUT, Stage 13 NO_OUTPUT/);
});

test("watchdog marks an in-flight Jules session as RUNNING instead of NO_OUTPUT", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-6/pr-1406`);
  observed.julesSessions = [
    {
      id: "session-6-running",
      state: "IN_PROGRESS",
      createTime: `${date}T02:00:00Z`,
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
  ];

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage6 = entries.find(entry => entry.stage === 6);
  assert.equal(stage6.state, "RUNNING");
  assert.equal(stage6.failureClass, null);
  assert.equal(stage6.evidence.julesSession.id, "session-6-running");
});

test("watchdog classifies a completed-but-unmerged Jules session as stuck", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-13/pr-1413`);
  observed.julesSessions = [
    {
      id: "session-13-completed",
      state: "COMPLETED",
      createTime: `${date}T05:00:00Z`,
      prompt: "# [Stage 13] Self-Healing Protocol",
    },
  ];

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage13 = entries.find(entry => entry.stage === 13);
  assert.equal(stage13.state, "NO_OUTPUT");
  assert.equal(stage13.failureClass, "JULES_SESSION_STUCK");
  assert.equal(stage13.evidence.julesSession.state, "COMPLETED");
});

test("matchJulesSession disambiguates same-header sessions by date", () => {
  const stage = registry.stages.find(entry => entry.number === 6);
  const sessions = [
    {
      id: "yesterday",
      state: "COMPLETED",
      createTime: "2026-08-10T23:00:00Z",
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
    {
      id: "today",
      state: "IN_PROGRESS",
      createTime: "2026-08-11T02:00:00Z",
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
  ];

  const match = matchJulesSession(sessions, stage, "2026-08-11");
  assert.equal(match.id, "today");
});
