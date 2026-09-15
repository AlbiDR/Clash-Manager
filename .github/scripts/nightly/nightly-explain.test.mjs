// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildStageExplanation, renderStageExplanation } from "./nightly-explain.mjs";
import { createEmptyLedger, upsertStageEntry } from "./nightly-ledger.mjs";
import { NIGHTLY_EVENT_SOURCES } from "./nightly-events.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const DATE = "2026-09-15";

function inputsFor(ledger, overrides = {}) {
  return {
    ledger,
    registry,
    date: DATE,
    coverageByStage: Object.fromEntries(registry.stages.map(stage => [stage.number, ""])),
    prHistory: "",
    // A later tag is positive evidence that this cycle is over, so a stage with
    // no result is judged rather than left PENDING.
    tags: ["nightly/2026-09-16/stage-2/pr-999"],
    ...overrides,
  };
}

test("explain traces an accepted intervention without delivery to STUCK", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 1, {
    state: "ESCALATED",
    failureClass: "JULES_SESSION_FAILED",
    evidence: {
      recovery: {
        nudgedAt: `${DATE}T01:00:00.000Z`,
        sessionName: "sessions/one",
        ok: true,
        error: null,
      },
    },
    lastObservedAt: `${DATE}T01:01:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_RECOVERY });

  const explanation = buildStageExplanation(inputsFor(ledger), 1);
  assert.equal(explanation.cycleId, `nightly-cycle/${DATE}`);
  assert.equal(explanation.evidenceDate, "2026-09-14");
  assert.equal(explanation.eventIntegrity.status, "VERIFIED");
  assert.equal(explanation.contractIntegrity.status, "MATCHED");
  assert.equal(explanation.classification.outcome, "STUCK");
  assert.equal(explanation.classification.rescued, false);
  assert.equal(explanation.rules.find(rule => rule.id === "INTERVENTION_EFFECT").result, "ACCEPTED_NO_DELIVERY");
  assert.match(renderStageExplanation(explanation), /accepted, but no durable merge followed/);
  assert.match(renderStageExplanation(explanation), /Result: STUCK/);
});

test("explain ties a successful recovery to its promotion tag and channel", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 5, {
    state: "MERGED",
    failureClass: null,
    evidence: {
      recovery: { nudgedAt: `${DATE}T03:00:00.000Z`, sessionName: "sessions/five", ok: true, error: null },
      tag: `nightly/${DATE}/stage-5/pr-500`,
    },
    lastObservedAt: `${DATE}T03:01:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER });

  const explanation = buildStageExplanation(inputsFor(ledger, {
    tags: [`nightly/${DATE}/stage-5/pr-500`],
  }), 5);
  assert.equal(explanation.classification.merged, true);
  assert.equal(explanation.classification.rescued, true);
  assert.equal(explanation.classification.rescuedBy, "watchdog-nudge");
  assert.match(renderStageExplanation(explanation), /Auto-recovered: yes \(watchdog-nudge\)/);
});

test("explain labels historical rows honestly when no append-only events exist", () => {
  const ledger = {
    schemaVersion: 1,
    runs: {
      [DATE]: {
        "2": { date: DATE, stage: 2, state: "MERGED", failureClass: null, evidence: {} },
      },
    },
  };
  const explanation = buildStageExplanation(inputsFor(ledger), 2);
  assert.equal(explanation.eventIntegrity.status, "LEGACY_SNAPSHOT");
  assert.equal(explanation.contractIntegrity.status, "UNRECORDED");
  assert.equal(explanation.eventIntegrity.verified, false);
  assert.match(renderStageExplanation(explanation), /predates append-only event recording/);
});

test("the projection fingerprint is stable for the same facts and changes with the decision", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 3, {
    state: "MERGED",
    lastObservedAt: `${DATE}T04:00:00.000Z`,
  });
  const first = buildStageExplanation(inputsFor(ledger), 3);
  const second = buildStageExplanation(inputsFor(ledger), 3);
  assert.equal(first.projectionFingerprint, second.projectionFingerprint);

  const changed = buildStageExplanation(inputsFor(ledger, {
    coverageByStage: {
      ...inputsFor(ledger).coverageByStage,
      3: `* [${DATE}] [Stage 3] CLEAN: imports -- dependency-cruiser reported 0 violations`,
    },
  }), 3);
  assert.notEqual(first.projectionFingerprint, changed.projectionFingerprint);
  assert.equal(changed.classification.outcome, "CLEAN");
});

test("explain reports when a mutable snapshot no longer agrees with its valid event history", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 7, {
    state: "RUNNING",
    lastObservedAt: `${DATE}T05:00:00.000Z`,
  });
  ledger.runs[DATE]["7"].state = "BLOCKED";
  const explanation = buildStageExplanation(inputsFor(ledger), 7);
  assert.equal(explanation.eventIntegrity.status, "SNAPSHOT_DIVERGED");
  assert.equal(explanation.eventIntegrity.verified, false);
});

test("explain distinguishes a mid-cycle imported baseline from a complete event timeline", () => {
  const ledger = {
    schemaVersion: 1,
    runs: {
      [DATE]: Object.fromEntries(registry.stages.map(stage => [String(stage.number), {
        date: DATE,
        stage: stage.number,
        state: "EXPECTED",
        failureClass: null,
        evidence: {},
      }])),
    },
  };
  upsertStageEntry(ledger, registry, DATE, 8, {
    state: "RUNNING",
    lastObservedAt: `${DATE}T07:00:00.000Z`,
  });
  const explanation = buildStageExplanation(inputsFor(ledger), 8);
  assert.equal(explanation.eventIntegrity.status, "IMPORTED_BASELINE");
  assert.match(explanation.eventIntegrity.reason, /earlier transitions are not available/);
});

test("old runs remain legacy snapshots after newer cycles begin recording events", () => {
  const laterDate = "2026-09-16";
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, laterDate, 2, {
    state: "RUNNING",
    lastObservedAt: `${laterDate}T01:00:00.000Z`,
  });
  ledger.runs[DATE] = {
    "2": { date: DATE, stage: 2, state: "MERGED", failureClass: null, evidence: {} },
  };
  const explanation = buildStageExplanation(inputsFor(ledger), 2);
  assert.equal(explanation.eventIntegrity.status, "LEGACY_SNAPSHOT");
  assert.equal(explanation.eventIntegrity.verified, false);
  assert.match(explanation.eventIntegrity.reason, /predates the first recorded event cycle/);
});
