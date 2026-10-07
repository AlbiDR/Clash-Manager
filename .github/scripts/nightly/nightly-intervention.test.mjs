// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVENTION_CHANNELS,
  INTERVENTION_OUTCOMES,
  classifyIntervention,
  getInterventionAttemptCount,
  hasInterventionEvidence,
} from "./nightly-intervention.mjs";

test("a dispatch attempt is not intervention evidence", () => {
  const intervention = classifyIntervention({ state: "MERGED", attempts: 1, evidence: {} });

  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.NONE);
  assert.equal(intervention.attempted, false);
  assert.equal(hasInterventionEvidence({ state: "MERGED", attempts: 1, evidence: {} }), false);
});

test("an accepted nudge without delivery is not a recovery", () => {
  const intervention = classifyIntervention({
    state: "ESCALATED",
    failureClass: "JULES_SESSION_FAILED",
    attempts: 1,
    evidence: { recovery: { ok: true } },
  }, { merged: false });

  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.ACCEPTED_NO_DELIVERY);
  assert.equal(intervention.requestAccepted, true);
  assert.equal(intervention.effective, false);
  assert.equal(intervention.channel, "watchdog-nudge");
});

test("a nudge followed by a merge is an effective recovery", () => {
  const intervention = classifyIntervention({
    state: "MERGED",
    evidence: { recovery: { ok: true } },
  }, { merged: true });

  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.EFFECTIVE);
  assert.equal(intervention.effective, true);
});

test("a rejected nudge remains distinguishable from an ineffective accepted nudge", () => {
  const intervention = classifyIntervention({
    state: "ESCALATED",
    evidence: { recovery: { ok: false, error: "unauthorized" } },
  }, { merged: false });

  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.REQUEST_REJECTED);
  assert.equal(intervention.requestAccepted, false);
  assert.equal(intervention.effective, false);
});

test("fallback publication becomes effective only after merge evidence exists", () => {
  const entry = { state: "RECOVERABLE", evidence: { fallbackPublish: { status: "CLEAN" } } };

  assert.equal(classifyIntervention(entry, { merged: false }).effective, false);
  assert.equal(classifyIntervention(entry, { merged: true }).effective, true);
});

test("dedicated attempt counters do not inherit dispatch attempts", () => {
  assert.equal(getInterventionAttemptCount({ dispatchAttempts: 2, attempts: 2, evidence: {} }), 0);
  assert.equal(getInterventionAttemptCount({ interventionAttempts: 1, attempts: 2, evidence: {} }), 1);
  assert.equal(getInterventionAttemptCount({ attempts: 2, evidence: { recovery: { ok: true } } }), 2);
});

// --- The watchdog's restart of a FAILED session -----------------------------------
//
// 2026-10-06: Stage 3's session went FAILED and nothing retried it. The watchdog
// now starts one fresh session, recorded as evidence.redispatch BEFORE the
// request leaves. A stage that merges through it was not unaided.

const restarted = (redispatch, extra = {}) => ({
  state: "MERGED", failureClass: null, evidence: { redispatch }, ...extra,
});
const ACCEPTED = { failedSessionName: "sessions/one", sessionName: "sessions/two", ok: true };

test("a stage that merges through the watchdog's restart is an intervention, never an unaided success", () => {
  const entry = restarted(ACCEPTED);
  assert.equal(hasInterventionEvidence(entry), true);
  const intervention = classifyIntervention(entry);
  assert.equal(intervention.channel, INTERVENTION_CHANNELS.WATCHDOG_REDISPATCH);
  assert.deepEqual(intervention.channels, ["watchdog-redispatch"]);
  assert.equal(intervention.effective, true);
  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.EFFECTIVE);
});

test("a restart whose session never published is accepted without delivery, not a recovery", () => {
  const intervention = classifyIntervention(restarted(ACCEPTED, { state: "ESCALATED" }), { merged: false });
  assert.equal(intervention.requestAccepted, true);
  assert.equal(intervention.effective, false);
  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.ACCEPTED_NO_DELIVERY);
});

test("a restart request Jules rejected is not a recovery", () => {
  const intervention = classifyIntervention(restarted({
    failedSessionName: "sessions/one",
    ok: false,
    error: "ledger could not be saved before the request, so it was not sent: disk full",
  }), { merged: false });
  assert.equal(intervention.requestAccepted, false);
  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.REQUEST_REJECTED);
});

test("a restart whose answer was lost is judged by whether the stage merged", () => {
  // The record is written before the request leaves, so a runner killed mid-request
  // leaves ok unwritten. Calling it rejected would deny a stage that merged through
  // the fresh session, and calling it accepted would claim a session nobody saw, so
  // the one durable fact decides: merged is a recovery, not merged is not one.
  const lost = { failedSessionName: "sessions/one", sessionName: null, ok: null };
  const merged = classifyIntervention(restarted(lost), { merged: true });
  assert.equal(merged.outcome, INTERVENTION_OUTCOMES.EFFECTIVE);
  assert.equal(merged.effective, true);
  const unmerged = classifyIntervention(restarted(lost, { state: "ESCALATED" }), { merged: false });
  assert.equal(unmerged.effective, false);
  assert.equal(unmerged.requestAccepted, null);
  assert.equal(unmerged.outcome, INTERVENTION_OUTCOMES.REQUEST_UNKNOWN);
});

test("a recorded replacement resolves an ambiguous restart as accepted without claiming delivery", () => {
  const entry = {
    ...restarted({ failedSessionName: "sessions/one", sessionName: null, ok: null, error: "request timed out" }),
    state: "RUNNING",
    evidence: {
      redispatch: { failedSessionName: "sessions/one", sessionName: null, ok: null, error: "request timed out" },
      session: { name: "sessions/two", state: "RUNNING" },
    },
  };
  const intervention = classifyIntervention(entry, { merged: false });
  assert.equal(intervention.requestAccepted, true);
  assert.equal(intervention.effective, false);
  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.ACCEPTED_NO_DELIVERY);
});

test("a legacy false flag with only a transport error remains unknown", () => {
  const intervention = classifyIntervention(restarted({
    failedSessionName: "sessions/one",
    sessionName: null,
    ok: false,
    error: "Jules API 500 Error: response lost after acceptance",
  }), { merged: false });
  assert.equal(intervention.requestAccepted, null);
  assert.equal(intervention.outcome, INTERVENTION_OUTCOMES.REQUEST_UNKNOWN);
});

test("a restarted session that also needed a nudge names both rungs and credits the one that delivered", () => {
  const intervention = classifyIntervention(restarted(ACCEPTED, {
    evidence: { redispatch: ACCEPTED, recovery: { ok: true } },
  }));
  assert.deepEqual(intervention.channels, ["watchdog-redispatch", "watchdog-nudge"]);
  assert.equal(intervention.channel, INTERVENTION_CHANNELS.WATCHDOG_NUDGE);
});

test("a restart is a dispatch, not a nudge: it never spends the nudge budget or reads as one by itself", () => {
  const entry = { state: "ESCALATED", dispatchAttempts: 1, evidence: { redispatch: ACCEPTED } };
  assert.equal(getInterventionAttemptCount(entry), 0);
  // A dispatch counter on its own is not evidence of anything (see the first test in this file).
  assert.equal(hasInterventionEvidence({ state: "MERGED", dispatchAttempts: 1, evidence: {} }), false);
});
