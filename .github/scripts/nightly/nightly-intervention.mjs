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
  ACCEPTED_NO_DELIVERY: "ACCEPTED_NO_DELIVERY",
  EFFECTIVE: "EFFECTIVE",
});

export const INTERVENTION_CHANNELS = Object.freeze({
  WATCHDOG_NUDGE: "watchdog-nudge",
  FALLBACK_PUBLISH: "fallback-publish",
  LEGACY_RECOVERY: "legacy-recovery",
});

/**
 * Classifies intervention evidence without consulting prose or attempt counts.
 * `attempts` is deliberately excluded because the dispatcher and watchdog have
 * both written that field, so it cannot identify an intervention reliably.
 */
export function classifyIntervention(entry, { merged = entry?.state === "MERGED" } = {}) {
  const recovery = entry?.evidence?.recovery;
  const fallbackPublish = entry?.evidence?.fallbackPublish;
  const recoveredFailureClass = RECOVERED_FAILURE_CLASSES.has(entry?.failureClass);
  const attempted = Boolean(recovery || fallbackPublish || recoveredFailureClass);

  if (!attempted) {
    return {
      attempted: false,
      requestAccepted: null,
      effective: false,
      channel: null,
      outcome: INTERVENTION_OUTCOMES.NONE,
    };
  }

  const channel = fallbackPublish
    ? INTERVENTION_CHANNELS.FALLBACK_PUBLISH
    : recovery
      ? INTERVENTION_CHANNELS.WATCHDOG_NUDGE
      : INTERVENTION_CHANNELS.LEGACY_RECOVERY;
  const requestAccepted = fallbackPublish
    ? true
    : recovery
      ? recovery.ok === true
      : true;
  const effective = Boolean(merged && requestAccepted);
  const outcome = effective
    ? INTERVENTION_OUTCOMES.EFFECTIVE
    : requestAccepted
      ? INTERVENTION_OUTCOMES.ACCEPTED_NO_DELIVERY
      : INTERVENTION_OUTCOMES.REQUEST_REJECTED;

  return { attempted, requestAccepted, effective, channel, outcome };
}

export function hasInterventionEvidence(entry) {
  return classifyIntervention(entry).attempted;
}

/**
 * Reads the dedicated counter first and falls back to the legacy shared field
 * only when the same row contains explicit intervention evidence.
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
