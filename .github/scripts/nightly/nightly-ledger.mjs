// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from "node:fs";
import path from "node:path";

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
    runs: {},
  };
}

function assertLedger(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateLedger(ledger) {
  assertLedger(ledger && typeof ledger === "object", "Nightly ledger must be an object.");
  assertLedger(ledger.schemaVersion === 1, "Nightly ledger schemaVersion must be 1.");
  assertLedger(ledger.runs && typeof ledger.runs === "object", "Nightly ledger runs must be an object.");

  for (const [date, stages] of Object.entries(ledger.runs)) {
    assertLedger(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid nightly ledger date: ${date}`);
    assertLedger(stages && typeof stages === "object", `Nightly ledger run ${date} must be an object.`);
    for (const [stageKey, entry] of Object.entries(stages)) {
      assertLedger(/^(?:[1-9]|1[0-3])$/.test(stageKey), `Invalid nightly ledger stage: ${stageKey}`);
      assertLedger(entry.date === date, `Nightly ledger entry ${date}/${stageKey} has mismatched date.`);
      assertLedger(entry.stage === Number(stageKey), `Nightly ledger entry ${date}/${stageKey} has mismatched stage.`);
      assertLedger(LEDGER_STATES.has(entry.state), `Nightly ledger entry ${date}/${stageKey} has invalid state.`);
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

  for (const stage of registry.stages) {
    const key = String(stage.number);
    if (run[key]) continue;
    run[key] = {
      date,
      stage: stage.number,
      expectedAfterUtc: options.expectedAfterUtc?.[stage.number] || null,
      deadlineUtc: options.deadlineUtc?.[stage.number] || null,
      state: "EXPECTED",
      evidence: {},
      attempts: 0,
      lastObservedAt: now,
      failureClass: null,
    };
  }

  ledger.runs[date] = Object.fromEntries(
    Object.entries(run).sort(([stageA], [stageB]) => Number(stageA) - Number(stageB)),
  );
  return ledger;
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
 */
function guardTaggedRow(current, patch) {
  const tagged = Boolean(current?.evidence?.tag) && current.state === "MERGED";
  if (!tagged) return patch;
  const demotesState = patch.state && patch.state !== "MERGED";
  if (!demotesState && !patch.failureClass) return patch;
  const guarded = { ...patch };
  if (demotesState) delete guarded.state;
  if (patch.failureClass) delete guarded.failureClass;
  return guarded;
}

export function upsertStageEntry(ledger, registry, date, stageNumber, patch = {}) {
  ensureRunEntries(ledger, registry, date);
  const key = String(stageNumber);
  const current = ledger.runs[date][key];
  const effective = guardTaggedRow(current, patch);
  const next = {
    ...current,
    ...effective,
    date,
    stage: Number(stageNumber),
    lastObservedAt: effective.lastObservedAt || new Date().toISOString(),
  };
  // Resolved after the spread so it sees the state and failure class this write
  // actually lands, not the ones the entry held before it.
  next.evidence = resolveEvidence(current.evidence, effective.evidence, next.state, next.failureClass);
  assertLedger(LEDGER_STATES.has(next.state), `Nightly ledger entry ${date}/${key} has invalid state.`);
  ledger.runs[date][key] = next;
  return next;
}

export function stageEntry(ledger, date, stageNumber) {
  return ledger.runs?.[date]?.[String(stageNumber)] || null;
}
