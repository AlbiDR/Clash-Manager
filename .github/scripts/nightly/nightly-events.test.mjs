// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createEmptyLedger,
  ensureRunEntries,
  recordCycleExecution,
  upsertStageEntry,
  validateLedger,
} from "./nightly-ledger.mjs";
import {
  NIGHTLY_EVENT_SOURCES,
  getCycleDate,
  getCycleId,
  getEvidenceDate,
  getCycleExecutionEvents,
  getNightlyEventId,
  getProjectedStageEntry,
  getStageEvents,
} from "./nightly-events.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const DATE = "2026-09-15";

function execution(id = "watchdog:123:1") {
  return {
    schemaVersion: 1,
    executionId: id,
    workflow: { name: "Nightly Watchdog", path: ".github/workflows/nightly-watchdog.yml", runId: "123", attempt: 1 },
    checkout: { branch: "Nightly", sha: "abc123" },
    runtime: { node: "v24.0.0", platform: "linux", arch: "x64", runnerOs: "Linux", runnerImage: "ubuntu" },
    controlPlane: { registryDigest: "registry", workflowDigest: "workflow" },
  };
}

test("cycle identity is stable and Stage 1 maps its previous-day evidence into that cycle", () => {
  assert.equal(getCycleId(DATE), "nightly-cycle/2026-09-15");
  assert.equal(getEvidenceDate(1, DATE), "2026-09-14");
  assert.equal(getCycleDate(1, "2026-09-14"), DATE);
  assert.equal(getEvidenceDate(2, DATE), DATE);
  assert.equal(getCycleDate(2, DATE), DATE);
});

test("stage transitions form one ordered content-addressed hash chain", () => {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE, {
    now: `${DATE}T00:00:00.000Z`,
    source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER,
  });
  upsertStageEntry(ledger, registry, DATE, 3, {
    state: "RUNNING",
    evidence: { julesSession: { id: "session-3" } },
    lastObservedAt: `${DATE}T00:01:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER });
  upsertStageEntry(ledger, registry, DATE, 3, {
    state: "MERGED",
    evidence: { tag: `nightly/${DATE}/stage-3/pr-123` },
    lastObservedAt: `${DATE}T00:02:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER });

  const events = getStageEvents(ledger, DATE, 3);
  assert.equal(events.length, 3);
  assert.equal(events[0].type, "STAGE_EXPECTED");
  assert.equal(events[1].payload.before.state, "EXPECTED");
  assert.equal(events[1].payload.after.state, "RUNNING");
  assert.equal(events[2].payload.after.state, "MERGED");
  assert.equal(events[1].previousEventId, ledger.events[events[1].sequence - 2].eventId);
  assert.equal(events[2].eventId, getNightlyEventId(events[2]));
  assert.equal(ledger.runs[DATE]["3"].cycleId, getCycleId(DATE));
  const projected = getProjectedStageEntry(events);
  assert.equal(projected.state, ledger.runs[DATE]["3"].state);
  assert.deepEqual(projected.evidence, ledger.runs[DATE]["3"].evidence);
  validateLedger(ledger);
});

test("cycle execution provenance is hash-chained, snapshot-anchored, and idempotent", () => {
  const ledger = createEmptyLedger();
  const first = recordCycleExecution(ledger, DATE, execution(), {
    source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER,
    recordedAt: `${DATE}T00:00:00.000Z`,
  });
  const count = ledger.events.length;
  const repeated = recordCycleExecution(ledger, DATE, execution(), {
    source: NIGHTLY_EVENT_SOURCES.WATCHDOG_OBSERVER,
    recordedAt: `${DATE}T00:01:00.000Z`,
  });

  assert.equal(first.recorded, true);
  assert.equal(repeated.recorded, false);
  assert.equal(ledger.events.length, count);
  assert.deepEqual(ledger.cycles[DATE].executions[execution().executionId], execution());
  const [event] = getCycleExecutionEvents(ledger, DATE);
  assert.equal(event.stage, 0);
  assert.equal(event.type, "CYCLE_EXECUTION_RECORDED");
  assert.equal(event.payload.execution.checkout.sha, "abc123");
  validateLedger(ledger);
});

test("stage entry events label their lifecycle transition", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 4, {
    dispatchAttempts: 1,
    evidence: { dispatch: { requestedAt: `${DATE}T00:00:00.000Z` } },
    lastObservedAt: `${DATE}T00:00:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.DISPATCHER });
  upsertStageEntry(ledger, registry, DATE, 4, {
    state: "RUNNING",
    evidence: { dispatchSessionName: "sessions/4" },
    lastObservedAt: `${DATE}T00:01:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.DISPATCHER });

  const events = getStageEvents(ledger, DATE, 4);
  assert.deepEqual(events.at(-2).payload.transition, {
    name: "JULES_DISPATCH_REQUESTED",
    from: "EXPECTED",
    to: "EXPECTED",
  });
  assert.deepEqual(events.at(-1).payload.transition, {
    name: "JULES_SESSION_DISPATCHED",
    from: "EXPECTED",
    to: "RUNNING",
  });
});

test("a rejected dispatch has a distinct lifecycle transition and retained diagnostic", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 2, {
    evidence: { dispatch: { requestedAt: `${DATE}T00:00:00.000Z`, error: "Jules API 503 Service Unavailable" } },
    lastObservedAt: `${DATE}T00:00:01.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.DISPATCHER });

  const event = getStageEvents(ledger, DATE, 2).at(-1);
  assert.equal(event.payload.transition.name, "JULES_DISPATCH_FAILED");
  assert.equal(event.payload.requested.evidence.set.dispatch.error, "Jules API 503 Service Unavailable");
});

test("changing any recorded fact breaks event integrity", () => {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE, { now: `${DATE}T00:00:00.000Z` });
  ledger.events[0].payload.after.state = "MERGED";
  assert.throws(() => validateLedger(ledger), /content does not match its eventId/);
});

test("removing the hash-chain tail without its anchored head is detected", () => {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE, { now: `${DATE}T00:00:00.000Z` });
  ledger.events.pop();
  assert.throws(() => validateLedger(ledger), /event count does not match/);
});

test("repeated observations that change only lastObservedAt do not grow the event stream", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 4, {
    state: "RUNNING",
    evidence: { julesSession: { id: "session-4", state: "IN_PROGRESS" } },
    lastObservedAt: `${DATE}T00:01:00.000Z`,
  });
  const count = ledger.events.length;
  upsertStageEntry(ledger, registry, DATE, 4, {
    state: "RUNNING",
    evidence: { julesSession: { id: "session-4", state: "IN_PROGRESS" } },
    lastObservedAt: `${DATE}T00:02:00.000Z`,
  });
  assert.equal(ledger.events.length, count);
  assert.equal(ledger.runs[DATE]["4"].lastObservedAt, `${DATE}T00:02:00.000Z`);
});

test("the durable-tag guard records both the requested demotion and why it was refused", () => {
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, DATE, 1, {
    state: "MERGED",
    evidence: { tag: "nightly/2026-09-14/stage-1/pr-500" },
    lastObservedAt: `${DATE}T01:00:00.000Z`,
  });
  upsertStageEntry(ledger, registry, DATE, 1, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    lastObservedAt: `${DATE}T01:01:00.000Z`,
  }, { source: NIGHTLY_EVENT_SOURCES.MERGE_COORDINATOR });

  const event = getStageEvents(ledger, DATE, 1).at(-1);
  assert.equal(event.payload.requested.state, "BLOCKED");
  assert.equal(event.payload.after.state, "MERGED");
  assert.deepEqual(event.payload.rules[0], {
    failureClassGuarded: true,
    id: "TAGGED_MERGE_IS_DURABLE",
    outcome: "APPLIED",
    stateGuarded: true,
  });
});

test("legacy snapshot ledgers remain valid until their first event-producing write", () => {
  const legacy = { schemaVersion: 1, runs: {} };
  assert.equal(validateLedger(legacy), legacy);
  upsertStageEntry(legacy, registry, DATE, 2, {
    state: "RUNNING",
    lastObservedAt: `${DATE}T02:00:00.000Z`,
  });
  assert.equal(legacy.eventStreamVersion, 1);
  assert.equal(legacy.cycles[DATE].cycleId, getCycleId(DATE));
  assert.ok(legacy.events.length > 0);
  validateLedger(legacy);
});

test("a cycle already in progress starts with an honest imported snapshot baseline", () => {
  const legacy = {
    schemaVersion: 1,
    runs: {
      [DATE]: Object.fromEntries(registry.stages.map(stage => [String(stage.number), {
        date: DATE,
        stage: stage.number,
        state: stage.number === 2 ? "RUNNING" : "EXPECTED",
        failureClass: null,
        evidence: stage.number === 2 ? { julesSession: { id: "already-running" } } : {},
      }])),
    },
  };
  upsertStageEntry(legacy, registry, DATE, 2, {
    state: "MERGED",
    lastObservedAt: `${DATE}T06:00:00.000Z`,
  });
  const events = getStageEvents(legacy, DATE, 2);
  assert.equal(events[0].type, "STAGE_SNAPSHOT_IMPORTED");
  assert.equal(events[0].payload.after.state, "RUNNING");
  assert.equal(events[1].payload.after.state, "MERGED");
  assert.equal(getProjectedStageEntry(events).state, "MERGED");
});
