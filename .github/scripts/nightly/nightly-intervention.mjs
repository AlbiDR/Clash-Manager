// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Typed interpretation of recovery evidence recorded by the nightly control
 * plane. A successful API request is only an accepted intervention. Recovery
 * requires the separate publication postcondition represented by `merged`.
 */

const RECOVERED_FAILURE_CLASSES = new Set([
  "RECOVERED_AFTER_NUDGE",
  "RECOVERED_BY_FALLBACK_PUBLISH",
]);

export const INTERVENTION_OUTCOMES = Object.freeze({
  NONE: "NONE",
  REQUEST_REJECTED: "REQUEST_REJECTED",
  REQUEST_UNKNOWN: "REQUEST_UNKNOWN",
  ACCEPTED_NO_DELIVERY: "ACCEPTED_NO_DELIVERY",
  EFFECTIVE: "EFFECTIVE",
});

export const REDISPATCH_NOT_SENT_MARKER = "before the request, so it was not sent:";

export const INTERVENTION_CHANNELS = Object.freeze({
  WATCHDOG_NUDGE: "watchdog-nudge",
  FALLBACK_PUBLISH: "fallback-publish",
  // A fresh Jules session started by the watchdog because the stage's own
  // session ended FAILED (evidence.redispatch). Added 2026-10-06, the night
  // Stage 3's session 17685247323826051852 failed after 42 minutes and the
  // stage lost the whole run with nothing retrying it. A stage that merges
  // through the fresh session did NOT succeed unaided: the scheduled session
  // produced nothing, so this is an intervention in every reader that asks.
  WATCHDOG_REDISPATCH: "watchdog-redispatch",
  LEGACY_RECOVERY: "legacy-recovery",
});

/**
 * Classifies intervention evidence without consulting prose or attempt counts.
 * `attempts` is deliberately excluded because the dispatcher and watchdog have
 * both written that field, so it cannot identify an intervention reliably.
 * `dispatchAttempts` is excluded for the same reason: the redispatch increments
 * it, but so does the dispatcher's own first dispatch, which is not a rescue.
 * The durable evidence key is what identifies the channel, never a counter.
 */
export function classifyIntervention(entry, { merged = entry?.state === "MERGED" } = {}) {
  const recovery = entry?.evidence?.recovery;
  const fallbackPublish = entry?.evidence?.fallbackPublish;
  const redispatch = entry?.evidence?.redispatch;
  const recoveredFailureClass = RECOVERED_FAILURE_CLASSES.has(entry?.failureClass);
  const attempted = Boolean(recovery || fallbackPublish || redispatch || recoveredFailureClass);

  if (!attempted) {
    return {
      attempted: false,
      requestAccepted: null,
      effective: false,
      channel: null,
      channels: [],
      outcome: INTERVENTION_OUTCOMES.NONE,
    };
  }

  // Every rung that left evidence, in the order the watchdog climbs them. A
  // fresh session can itself strand and need the nudge or the fallback
  // publisher, and naming only the last rung would hide that the first session
  // failed outright, which is the costlier of the two facts.
  const channels = [
    redispatch ? INTERVENTION_CHANNELS.WATCHDOG_REDISPATCH : null,
    recovery ? INTERVENTION_CHANNELS.WATCHDOG_NUDGE : null,
    fallbackPublish ? INTERVENTION_CHANNELS.FALLBACK_PUBLISH : null,
  ].filter(Boolean);

  // `channel` stays singular and names the rung that delivered, so the latest
  // one wins: a redispatched session that then needed a nudge was rescued by
  // the nudge, after the redispatch had made a nudge possible at all.
  const channel = fallbackPublish
    ? INTERVENTION_CHANNELS.FALLBACK_PUBLISH
    : recovery
      ? INTERVENTION_CHANNELS.WATCHDOG_NUDGE
      : redispatch
        ? INTERVENTION_CHANNELS.WATCHDOG_REDISPATCH
        : INTERVENTION_CHANNELS.LEGACY_RECOVERY;
  // A redispatch is recorded BEFORE the request leaves (see
  // redispatchFailedStages). A transport exception or a runner killed mid-call
  // leaves acceptance unknown. Only an explicit recorded boolean, an observed
  // replacement session, or independent merge evidence can resolve it.
  const observedSessionName = entry?.evidence?.session?.name || entry?.evidence?.julesSession?.name;
  const replacementObserved = Boolean(
    redispatch?.failedSessionName && observedSessionName && observedSessionName !== redispatch.failedSessionName,
  );
  const redispatchNotSent = typeof redispatch?.error === "string"
    && redispatch.error.includes(REDISPATCH_NOT_SENT_MARKER);
  const redispatchAccepted = redispatch
    ? redispatch.ok === true
      ? true
      : redispatchNotSent
        ? false
        : (replacementObserved || merged ? true : null)
    : null;
  const requestAccepted = fallbackPublish
    ? true
    : recovery
      ? recovery.ok === true
      : redispatch
        ? redispatchAccepted
        : true;
  const effective = Boolean(merged && requestAccepted);
  const outcome = effective
    ? INTERVENTION_OUTCOMES.EFFECTIVE
    : requestAccepted === true
      ? INTERVENTION_OUTCOMES.ACCEPTED_NO_DELIVERY
      : requestAccepted === false
        ? INTERVENTION_OUTCOMES.REQUEST_REJECTED
        : INTERVENTION_OUTCOMES.REQUEST_UNKNOWN;

  return { attempted, requestAccepted, effective, channel, channels, outcome };
}

export function hasInterventionEvidence(entry) {
  return classifyIntervention(entry).attempted;
}

/**
 * Reads the dedicated counter first and falls back to the legacy shared field
 * only when the same row contains explicit intervention evidence.
 *
 * This is the NUDGE budget. A redispatch deliberately does not spend it: the
 * fresh session is a different session, and if it strands it deserves the same
 * two nudges any other stranded session gets.
 */
export function getInterventionAttemptCount(entry) {
  if (Number.isInteger(entry?.interventionAttempts) && entry.interventionAttempts >= 0) {
    return entry.interventionAttempts;
  }
  if (hasInterventionEvidence(entry) && Number.isInteger(entry?.attempts) && entry.attempts >= 0) {
    return entry.attempts;
  }
  return 0;
}
