// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from "node:fs";
import path from "node:path";

import { getContractFingerprint } from "./nightly-contract.mjs";
import {
  NIGHTLY_EVENT_SOURCES,
  NIGHTLY_EVENT_STREAM_VERSION,
  NIGHTLY_EVENT_TYPES,
  createNightlyEvent,
  getCanonicalJson,
  getCycleId,
  validateNightlyEvents,
} from "./nightly-events.mjs";
import { validateExecutionProvenance } from "./nightly-provenance.mjs";

export const LEDGER_PATH = path.join(".github", "nightly-logs", "nightly-run-ledger.json");

export const LEDGER_STATES = new Set([
  "EXPECTED",
  "RUNNING",
  "PR_OPEN",
  "MERGED",
  "RECOVERABLE",
  "NO_OUTPUT",
  "BLOCKED",
  "ESCALATED",
  "DEGRADED",
]);

/**
 * Every failure class a ledger row may carry, as the single vocabulary two
 * different writers share.
 *
 * Lives here rather than in the watchdog because the watchdog is not the only
 * emitter: MERGE_COORDINATOR comes from merge-nightly-core.mjs. A vocabulary
 * defined inside one of its two writers is not a vocabulary, it is that
 * writer's opinion, and the other one is free to disagree.
 *
 * Names map to themselves so emitters can reference members instead of writing
 * string literals. That is the point: a class that is not in here cannot be
 * emitted, so this set cannot silently fall behind the code the way a
 * hand-maintained list would. The alternative considered was scanning the
 * sources for `failureClass:` assignments, which was tried and abandoned: the
 * watchdog assigns Jules session states through ternaries of identical shape,
 * so a scan matched "COMPLETED" and "FAILED" as if they were failure classes
 * and demanded prose for classes that do not exist.
 *
 * Deliberately NOT validated on write, unlike LEDGER_STATES. An unknown class
 * should not throw inside the control plane at 3am; the constant-reference
 * discipline above is what keeps it honest, and a test asserts the ledger's
 * real contents stay inside it.
 */
export const FAILURE_CLASSES = Object.freeze({
  // Jules-side outcomes.
  JULES_SESSION_STUCK: "JULES_SESSION_STUCK",
  JULES_SESSION_FAILED: "JULES_SESSION_FAILED",
  // Completed, and holding nothing. Distinct from STUCK, which means a session
  // is sitting on finished work its publisher never shipped: there the work
  // exists and only its delivery failed, which is what the nudge and the
  // fallback publisher are both built to rescue. Here there is nothing to
  // deliver, so neither can help and calling it STUCK sends a reader looking
  // for work that was never produced. Observed on Stage 13, 2026-09-06:
  // session 8009187047099259726 created 11:23Z, completed 11:39Z, outputs [].
  JULES_SESSION_EMPTY: "JULES_SESSION_EMPTY",
  JULES_API_UNAVAILABLE: "JULES_API_UNAVAILABLE",
  // Nothing published, and nothing to say why.
  NO_PUBLISHED_OUTPUT: "NO_PUBLISHED_OUTPUT",
  // Published, but something between the pull request and Nightly went wrong.
  OPEN_PR: "OPEN_PR",
  MALFORMED_BRANCH: "MALFORMED_BRANCH",
  UNCLASSIFIED_PR: "UNCLASSIFIED_PR",
  MERGE_COORDINATOR: "MERGE_COORDINATOR",
  UNFINALIZED_SENTINEL: "UNFINALIZED_SENTINEL",
  // The observer itself.
  WATCHDOG_OBSERVER_FAILURE: "WATCHDOG_OBSERVER_FAILURE",
  // Rescued rather than failed. Recorded so a run that needed help cannot be
  // read as one that did not.
  RECOVERED_AFTER_NUDGE: "RECOVERED_AFTER_NUDGE",
  RECOVERED_BY_FALLBACK_PUBLISH: "RECOVERED_BY_FALLBACK_PUBLISH",
});

export function createEmptyLedger() {
  return {
    schemaVersion: 1,
    eventStreamVersion: NIGHTLY_EVENT_STREAM_VERSION,
    eventCount: 0,
    eventHead: null,
    cycles: {},
    events: [],
    runs: {},
  };
}

function assertLedger(condition, message) {
  if (!condition) throw new Error(message);
}

function getEventAfter(entry) {
  return {
    state: entry.state,
    failureClass: entry.failureClass,
    expectedAfterUtc: entry.expectedAfterUtc ?? null,
    deadlineUtc: entry.deadlineUtc ?? null,
    evidence: entry.evidence || {},
    attempts: entry.attempts ?? 0,
    dispatchAttempts: entry.dispatchAttempts ?? 0,
    interventionAttempts: entry.interventionAttempts ?? 0,
  };
}

export function validateLedger(ledger) {
  assertLedger(ledger && typeof ledger === "object", "Nightly ledger must be an object.");
  assertLedger(ledger.schemaVersion === 1, "Nightly ledger schemaVersion must be 1.");
  assertLedger(ledger.runs && typeof ledger.runs === "object", "Nightly ledger runs must be an object.");
  validateNightlyEvents(ledger);

  for (const [date, cycle] of Object.entries(ledger.cycles || {})) {
    const executions = cycle?.executions;
    if (executions === undefined) continue;
    assertLedger(executions && typeof executions === "object" && !Array.isArray(executions), `Nightly cycle ${date} has invalid executions.`);
    for (const [executionId, execution] of Object.entries(executions)) {
      validateExecutionProvenance(execution);
      assertLedger(execution.executionId === executionId, `Nightly cycle ${date} execution key does not match its identity.`);
      const recorded = (ledger.events || []).some(event =>
        event.date === date
        && event.type === NIGHTLY_EVENT_TYPES.CYCLE_EXECUTION_RECORDED
        && event.payload?.execution?.executionId === executionId
        && getCanonicalJson(event.payload.execution) === getCanonicalJson(execution),
      );
      assertLedger(recorded, `Nightly cycle ${date} execution ${executionId} is not anchored in the event stream.`);
    }
  }

  for (const [date, stages] of Object.entries(ledger.runs)) {
    assertLedger(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid nightly ledger date: ${date}`);
    assertLedger(stages && typeof stages === "object", `Nightly ledger run ${date} must be an object.`);
    for (const [stageKey, entry] of Object.entries(stages)) {
      assertLedger(/^(?:[1-9]|1[0-3])$/.test(stageKey), `Invalid nightly ledger stage: ${stageKey}`);
      assertLedger(entry.date === date, `Nightly ledger entry ${date}/${stageKey} has mismatched date.`);
      assertLedger(entry.stage === Number(stageKey), `Nightly ledger entry ${date}/${stageKey} has mismatched stage.`);
      assertLedger(
        entry.cycleId === undefined || entry.cycleId === getCycleId(date),
        `Nightly ledger entry ${date}/${stageKey} has mismatched cycleId.`,
      );
      assertLedger(LEDGER_STATES.has(entry.state), `Nightly ledger entry ${date}/${stageKey} has invalid state.`);
      for (const counter of ["attempts", "dispatchAttempts", "interventionAttempts"]) {
        assertLedger(
          entry[counter] === undefined || (Number.isInteger(entry[counter]) && entry[counter] >= 0),
          `Nightly ledger entry ${date}/${stageKey} has invalid ${counter}.`,
        );
      }
    }
  }

  return ledger;
}

export function loadLedger(filePath = LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return createEmptyLedger();
  return validateLedger(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function saveLedger(ledger, filePath = LEDGER_PATH) {
  validateLedger(ledger);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

export function ensureRunEntries(ledger, registry, date, options = {}) {
  validateLedger(ledger);
  assertLedger(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid nightly ledger date: ${date}`);
  const run = ledger.runs[date] || {};
  const now = options.now || new Date().toISOString();
  const cycleId = getCycleId(date);

  for (const stage of registry.stages) {
    const key = String(stage.number);
    if (run[key]) {
      if (!run[key].cycleId) run[key].cycleId = cycleId;
      if (!run[key].evidence) run[key].evidence = {};
      if (!Number.isInteger(run[key].attempts)) run[key].attempts = 0;
      const hasStageEvent = (ledger.events || []).some(event => event.date === date && event.stage === stage.number);
      if (!hasStageEvent) {
        createNightlyEvent(ledger, {
          date,
          stage: stage.number,
          type: NIGHTLY_EVENT_TYPES.STAGE_SNAPSHOT_IMPORTED,
          source: options.source || NIGHTLY_EVENT_SOURCES.LEDGER,
          recordedAt: now,
          contractFingerprint: stage.contract ? getContractFingerprint(stage) : null,
          payload: {
            after: getEventAfter(run[key]),
            rules: [{ id: "IMPORT_LEGACY_SNAPSHOT", outcome: "APPLIED" }],
          },
        });
      }
      continue;
    }
    run[key] = {
      date,
      stage: stage.number,
      cycleId,
      expectedAfterUtc: options.expectedAfterUtc?.[stage.number] || null,
      deadlineUtc: options.deadlineUtc?.[stage.number] || null,
      state: "EXPECTED",
      evidence: {},
      dispatchAttempts: 0,
      interventionAttempts: 0,
      // Legacy intervention counter retained while existing ledger rows age
      // out. New writers use the two single-purpose counters above.
      attempts: 0,
      lastObservedAt: now,
      failureClass: null,
    };
    createNightlyEvent(ledger, {
      date,
      stage: stage.number,
      type: NIGHTLY_EVENT_TYPES.STAGE_EXPECTED,
      source: options.source || NIGHTLY_EVENT_SOURCES.LEDGER,
      recordedAt: now,
      contractFingerprint: stage.contract ? getContractFingerprint(stage) : null,
      payload: {
        after: getEventAfter(run[key]),
        rules: [{ id: "INITIALIZE_STAGE_EXPECTATION", outcome: "APPLIED" }],
      },
    });
  }

  ledger.runs[date] = Object.fromEntries(
    Object.entries(run).sort(([stageA], [stageB]) => Number(stageA) - Number(stageB)),
  );
  return ledger;
}

/**
 * Records which workflow and checkout produced a cycle observation.
 *
 * A cycle may be observed by dispatch, merge, and watchdog workflows, so the
 * execution map is keyed by GitHub's stable workflow-run identity rather than
 * pretending a pipeline cycle has one process. Repeating the same execution is
 * idempotent; a collision with different facts is corruption, not an update.
 */
export function recordCycleExecution(ledger, date, execution, context = {}) {
  validateExecutionProvenance(execution);
  assertLedger(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid nightly cycle date: ${date}`);
  const recordedAt = context.recordedAt || new Date().toISOString();
  const source = context.source || NIGHTLY_EVENT_SOURCES.LEDGER;
  const existing = ledger.cycles?.[date]?.executions?.[execution.executionId];
  if (existing) {
    assertLedger(
      getCanonicalJson(existing) === getCanonicalJson(execution),
      `Nightly cycle ${date} execution ${execution.executionId} was recorded with conflicting facts.`,
    );
    return { recorded: false, execution: existing };
  }

  createNightlyEvent(ledger, {
    date,
    stage: 0,
    type: NIGHTLY_EVENT_TYPES.CYCLE_EXECUTION_RECORDED,
    source,
    recordedAt,
    payload: { execution },
  });
  const cycle = ledger.cycles[date];
  cycle.executions = cycle.executions || {};
  cycle.executions[execution.executionId] = execution;
  validateLedger(ledger);
  return { recorded: true, execution };
}

// Evidence accumulates across observation passes: `upsertStageEntry` merges it
// rather than replacing it, so a key written by a failing pass used to survive
// every later pass forever, including the one that recorded success.
//
// Real consequence (2026-08-27): stage 1 read `state: MERGED, failureClass:
// null` while still carrying PR #1546's number, head ref and non-fast-forward
// `reason` from a failing pass three days earlier. The stage was healthy and
// its work had landed under an entirely different pull request (#1576), but
// every reader of the ledger, human or agent, saw a live blocker that no longer
// existed. The ledger is the primary evidence source for the nightly recap and
// for the watchdog's own escalation logic, so a permanent phantom blocker costs
// real time on exactly the nights when there is least of it.
//
// WHY THIS IS NARROWER THAN "DROP THE BLOCKER KEYS ON SUCCESS"
// That was the first attempt and it was wrong. A stage whose pull request was
// initially MALFORMED_BRANCH and which then merged under that same pull request
// records `prNumber` in the failing pass and `commitSha` in the succeeding one.
// There the pull request number is the stage's real provenance, not a leftover,
// and blanket-dropping it would have destroyed the stage-to-PR link for exactly
// the recoveries that worked. An existing test caught it.
//
// What separates the two cases is contradiction, not mere presence: in the
// #1546 case the merge tag named a DIFFERENT pull request than the carried
// `prNumber`. So the rule is:
//   1. `reason` explains a blocker. Once a stage is MERGED with no failure
//      class there is no blocker to explain, so it goes.
//   2. The pull request identity goes only when the merge evidence positively
//      contradicts it, meaning the tag names a different PR number.
// Anything this pass supplied itself is always kept: a pass describing the
// present is never overruled by a rule about the past.
export const RESOLVED_BLOCKER_KEYS = ["reason"];
export const SUPERSEDED_PR_KEYS = ["prNumber", "prUrl", "headRef"];
export const BLOCKER_EVIDENCE_KEYS = [...RESOLVED_BLOCKER_KEYS, ...SUPERSEDED_PR_KEYS];

// Merge tags are `nightly/<date>/stage-<n>/pr-<number>`; the trailing number is
// the pull request the stage actually merged under.
export function prNumberFromTag(tag) {
  const match = /\/pr-(\d+)$/.exec(String(tag ?? ""));
  return match ? Number(match[1]) : null;
}

// Durable keys (`tag`, `commitSha`, `coverageLog`, `julesSession`, `recovery`,
// `julesApiError`, `dispatchSessionName`) are deliberately never cleared: they
// are the audit trail of what actually happened, a successful nudge included.
export function resolveEvidence(currentEvidence, patchEvidence, state, failureClass) {
  const merged = { ...(currentEvidence || {}), ...(patchEvidence || {}) };
  if (state !== "MERGED" || failureClass) return merged;

  const suppliedNow = key => Boolean(patchEvidence) && Object.prototype.hasOwnProperty.call(patchEvidence, key);

  for (const key of RESOLVED_BLOCKER_KEYS) {
    if (!suppliedNow(key)) delete merged[key];
  }

  const mergedUnderPr = prNumberFromTag(merged.tag);
  const contradicted =
    mergedUnderPr !== null
    && merged.prNumber !== null
    && merged.prNumber !== undefined
    && Number(merged.prNumber) !== mergedUnderPr;
  if (contradicted) {
    for (const key of SUPERSEDED_PR_KEYS) {
      if (!suppliedNow(key)) delete merged[key];
    }
  }

  return merged;
}

/**
 * A promotion tag is a durable history fact: it exists only because the stage's
 * PR actually merged and was tagged. Nothing observed later can make that
 * untrue, so a write that would move a tagged, already-MERGED row into a
 * failure state is refused rather than applied.
 *
 * Real corruption this prevents (2026-08-25 and 2026-08-26): the merge
 * coordinator's failure path writes `state: BLOCKED, failureClass:
 * MERGE_COORDINATOR` keyed on `new Date()`, with no check for an existing
 * merge. Because it kept re-selecting the same stale open PR #1546 on three
 * consecutive nights, it stamped BLOCKED onto stage-1 rows that already held
 * `nightly/2026-08-24/stage-1/pr-1547` and `nightly/2026-08-25/stage-1/pr-1563`
 * - both genuinely merged. The rows ended up self-contradictory, claiming a
 * blocked stage while carrying the tag proving it merged, which is why an
 * eight-night clean streak read as six.
 *
 * The failure detail is still recorded: only `state` and `failureClass` are
 * withheld, so the reason and PR number remain visible in evidence.
 *
 * Refinement (2026-09-10): the guard protects `state`, not the diagnosis, but
 * it used to drop the classification outright. `attempts` and
 * `evidence.recovery` still distinguished a rescued night from a clean one, so
 * the ledger was never blind to THAT a rescue happened -- but WHICH failure
 * mode was observed was gone the moment the stage later merged, which is the
 * case for almost every rescue. A week dominated by JULES_SESSION_STUCK was
 * therefore indistinguishable from one dominated by anything else, and that
 * is the trend a self-healing lane exists to act on. The class is now kept in
 * `evidence.withheldFailureClasses`, deduped and sorted, under a key nothing
 * reads as current state. It is not in RESOLVED_BLOCKER_KEYS, so a clean merge
 * does not clear it.
 */
function guardTaggedRow(current, patch) {
  const tagged = Boolean(current?.evidence?.tag) && current.state === "MERGED";
  if (!tagged) return patch;
  const demotesState = patch.state && patch.state !== "MERGED";
  if (!demotesState && !patch.failureClass) return patch;
  const guarded = { ...patch };
  if (demotesState) delete guarded.state;
  if (patch.failureClass) {
    const alreadySeen = current?.evidence?.withheldFailureClasses || [];
    guarded.evidence = {
      ...(patch.evidence || {}),
      withheldFailureClasses: [...new Set([...alreadySeen, patch.failureClass])].sort(),
    };
    delete guarded.failureClass;
  }
  return guarded;
}

function getChangedEvidence(before = {}, after = {}) {
  const set = {};
  const removed = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (getCanonicalJson(before[key]) === getCanonicalJson(after[key])) continue;
    if (Object.prototype.hasOwnProperty.call(after, key)) set[key] = after[key];
    else removed.push(key);
  }
  return { set, removed: removed.sort() };
}

function getRequestedFacts(patch, current, next, stateGuarded, failureClassGuarded) {
  const requested = {};
  for (const [key, value] of Object.entries(patch)) {
    if (["lastObservedAt", "evidence"].includes(key)) continue;
    if (key === "state" && stateGuarded) requested[key] = value;
    else if (key === "failureClass" && failureClassGuarded) requested[key] = value;
    else if (getCanonicalJson(current[key]) !== getCanonicalJson(next[key])) requested[key] = value;
  }
  const evidence = getChangedEvidence(current.evidence, next.evidence);
  if (Object.keys(evidence.set).length > 0 || evidence.removed.length > 0) requested.evidence = evidence;
  return requested;
}

/**
 * Human-readable lifecycle labels are recorded beside state deltas. They do
 * not replace the state machine; they make the source and purpose of each
 * transition visible without requiring a reader to infer it from opaque fields.
 */
export function getStageTransition({ current, next, requested, source }) {
  const evidence = requested.evidence?.set || {};
  let name = "OBSERVATION_UPDATED";
  if (source === NIGHTLY_EVENT_SOURCES.DISPATCHER && next.state === "RUNNING") name = "JULES_SESSION_DISPATCHED";
  else if (source === NIGHTLY_EVENT_SOURCES.DISPATCHER && evidence.dispatch?.error) name = "JULES_DISPATCH_FAILED";
  else if (source === NIGHTLY_EVENT_SOURCES.DISPATCHER && evidence.dispatch) name = "JULES_DISPATCH_REQUESTED";
  else if (source === NIGHTLY_EVENT_SOURCES.WATCHDOG_RECOVERY && evidence.recovery) name = "RECOVERY_REQUESTED";
  else if (source === NIGHTLY_EVENT_SOURCES.WATCHDOG_FALLBACK && evidence.fallbackPublish) name = "FALLBACK_PUBLICATION_REQUESTED";
  else if (source === NIGHTLY_EVENT_SOURCES.WATCHDOG_BODY_REPAIR) name = "PULL_REQUEST_BODY_REPAIRED";
  else if (source === NIGHTLY_EVENT_SOURCES.WATCHDOG_HEALTH) name = "HEALTH_EVALUATED";
  else if (next.state === "PR_OPEN") name = "PULL_REQUEST_OBSERVED";
  else if (next.state === "MERGED") name = "MERGE_CONFIRMED";
  else if (["NO_OUTPUT", "BLOCKED", "ESCALATED", "DEGRADED"].includes(next.state)) name = "FAILURE_OBSERVED";
  else if (next.state === "RUNNING") name = "JULES_SESSION_OBSERVED";
  return { name, from: current.state, to: next.state };
}

export function upsertStageEntry(ledger, registry, date, stageNumber, patch = {}, context = {}) {
  const observedAt = patch.lastObservedAt || context.recordedAt || new Date().toISOString();
  const source = context.source || NIGHTLY_EVENT_SOURCES.LEDGER;
  ensureRunEntries(ledger, registry, date, { now: observedAt, source });
  const key = String(stageNumber);
  const current = ledger.runs[date][key];
  const effective = guardTaggedRow(current, patch);
  const next = {
    ...current,
    ...effective,
    date,
    stage: Number(stageNumber),
    cycleId: getCycleId(date),
    lastObservedAt: observedAt,
  };
  // Resolved after the spread so it sees the state and failure class this write
  // actually lands, not the ones the entry held before it.
  next.evidence = resolveEvidence(current.evidence, effective.evidence, next.state, next.failureClass);
  assertLedger(LEDGER_STATES.has(next.state), `Nightly ledger entry ${date}/${key} has invalid state.`);
  ledger.runs[date][key] = next;
  const stage = registry.stages.find(candidate => candidate.number === Number(stageNumber));
  const stateGuarded = Boolean(patch.state && patch.state !== effective.state);
  const failureClassGuarded = Boolean(patch.failureClass && patch.failureClass !== effective.failureClass);
  const requested = getRequestedFacts(patch, current, next, stateGuarded, failureClassGuarded);
  if (Object.keys(requested).length > 0 || stateGuarded || failureClassGuarded) {
    createNightlyEvent(ledger, {
      date,
      stage: Number(stageNumber),
      type: NIGHTLY_EVENT_TYPES.STAGE_ENTRY_UPDATED,
      source,
      recordedAt: observedAt,
      contractFingerprint: stage?.contract ? getContractFingerprint(stage) : null,
      payload: {
        before: {
          state: current.state,
          failureClass: current.failureClass,
          attempts: current.attempts,
          dispatchAttempts: current.dispatchAttempts,
          interventionAttempts: current.interventionAttempts,
        },
        requested,
        after: {
          state: next.state,
          failureClass: next.failureClass,
          attempts: next.attempts,
          dispatchAttempts: next.dispatchAttempts,
          interventionAttempts: next.interventionAttempts,
        },
        transition: getStageTransition({ current, next, requested, source }),
        rules: [
          {
            id: "TAGGED_MERGE_IS_DURABLE",
            outcome: stateGuarded || failureClassGuarded ? "APPLIED" : "NOT_APPLICABLE",
            stateGuarded,
            failureClassGuarded,
          },
          { id: "EVIDENCE_ACCUMULATES", outcome: "APPLIED" },
        ],
      },
    });
  }
  return next;
}

export function stageEntry(ledger, date, stageNumber) {
  return ledger.runs?.[date]?.[String(stageNumber)] || null;
}
