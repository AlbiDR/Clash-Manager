// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
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
