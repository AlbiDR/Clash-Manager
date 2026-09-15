// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createHash } from "node:crypto";

export const NIGHTLY_EVENT_SCHEMA_VERSION = 1;
export const NIGHTLY_EVENT_STREAM_VERSION = 1;

export const NIGHTLY_EVENT_TYPES = Object.freeze({
  STAGE_EXPECTED: "STAGE_EXPECTED",
  STAGE_SNAPSHOT_IMPORTED: "STAGE_SNAPSHOT_IMPORTED",
  STAGE_ENTRY_UPDATED: "STAGE_ENTRY_UPDATED",
});

export const NIGHTLY_EVENT_SOURCES = Object.freeze({
  DISPATCHER: "nightly-dispatch",
  LEDGER: "nightly-ledger",
  MERGE_COORDINATOR: "merge-nightly-core",
  WATCHDOG_BODY_REPAIR: "nightly-watchdog/body-repair",
  WATCHDOG_FALLBACK: "nightly-watchdog/fallback-publish",
  WATCHDOG_HEALTH: "nightly-watchdog/health",
  WATCHDOG_OBSERVER: "nightly-watchdog/observer",
  WATCHDOG_RECOVERY: "nightly-watchdog/recovery",
});

const EVENT_TYPE_VALUES = new Set(Object.values(NIGHTLY_EVENT_TYPES));

function assertEvent(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function getCanonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function getCycleId(date) {
  assertEvent(/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")), `Invalid nightly cycle date: ${date}`);
  return `nightly-cycle/${date}`;
}

export function getEvidenceDate(stageNumber, cycleDate) {
  assertEvent(Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 13, `Invalid nightly stage: ${stageNumber}`);
  assertEvent(/^\d{4}-\d{2}-\d{2}$/.test(String(cycleDate || "")), `Invalid nightly cycle date: ${cycleDate}`);
  if (stageNumber !== 1) return cycleDate;
  const date = new Date(`${cycleDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getCycleDate(stageNumber, evidenceDate) {
  assertEvent(Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= 13, `Invalid nightly stage: ${stageNumber}`);
  assertEvent(/^\d{4}-\d{2}-\d{2}$/.test(String(evidenceDate || "")), `Invalid nightly evidence date: ${evidenceDate}`);
  if (stageNumber !== 1) return evidenceDate;
  const date = new Date(`${evidenceDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function getNightlyEventId(event) {
  const { eventId: _eventId, ...unsigned } = event;
  return createHash("sha256").update(getCanonicalJson(unsigned)).digest("hex");
}

export function validateNightlyEvents(ledger) {
  if (ledger.eventStreamVersion === undefined && ledger.events === undefined && ledger.cycles === undefined) {
    return ledger;
  }

  assertEvent(
    ledger.eventStreamVersion === NIGHTLY_EVENT_STREAM_VERSION,
    `Nightly event stream version must be ${NIGHTLY_EVENT_STREAM_VERSION}.`,
  );
  assertEvent(Array.isArray(ledger.events), "Nightly ledger events must be an array.");
  assertEvent(ledger.cycles && typeof ledger.cycles === "object", "Nightly ledger cycles must be an object.");
  assertEvent(ledger.eventCount === ledger.events.length, "Nightly event count does not match the stream length.");

  let previousEventId = null;
  ledger.events.forEach((event, index) => {
    const label = `Nightly event ${index + 1}`;
    assertEvent(event && typeof event === "object", `${label} must be an object.`);
    assertEvent(event.schemaVersion === NIGHTLY_EVENT_SCHEMA_VERSION, `${label} has an invalid schemaVersion.`);
    assertEvent(event.sequence === index + 1, `${label} has a non-contiguous sequence.`);
    assertEvent(event.previousEventId === previousEventId, `${label} breaks the event hash chain.`);
    assertEvent(EVENT_TYPE_VALUES.has(event.type), `${label} has an invalid type.`);
    assertEvent(typeof event.source === "string" && event.source.length > 0, `${label} needs a source.`);
    assertEvent(/^\d{4}-\d{2}-\d{2}$/.test(event.date), `${label} has an invalid date.`);
    assertEvent(event.cycleId === getCycleId(event.date), `${label} has an invalid cycleId.`);
    assertEvent(Number.isInteger(event.stage) && event.stage >= 1 && event.stage <= 13, `${label} has an invalid stage.`);
    assertEvent(!Number.isNaN(Date.parse(event.recordedAt)), `${label} has an invalid recordedAt.`);
    assertEvent(event.payload && typeof event.payload === "object", `${label} needs a payload.`);
    assertEvent(event.eventId === getNightlyEventId(event), `${label} content does not match its eventId.`);
    previousEventId = event.eventId;
  });
  assertEvent(ledger.eventHead === previousEventId, "Nightly event head does not match the hash-chain tail.");

  for (const [date, cycle] of Object.entries(ledger.cycles)) {
    assertEvent(cycle?.date === date, `Nightly cycle ${date} has a mismatched date.`);
    assertEvent(cycle?.cycleId === getCycleId(date), `Nightly cycle ${date} has an invalid cycleId.`);
    assertEvent(!Number.isNaN(Date.parse(cycle?.firstObservedAt)), `Nightly cycle ${date} has an invalid firstObservedAt.`);
  }

  return ledger;
}

export function createNightlyEvent(ledger, {
  date,
  stage,
  type,
  source = NIGHTLY_EVENT_SOURCES.LEDGER,
  recordedAt = new Date().toISOString(),
  contractFingerprint = null,
  payload = {},
}) {
  if (ledger.eventStreamVersion === undefined) ledger.eventStreamVersion = NIGHTLY_EVENT_STREAM_VERSION;
  if (!Array.isArray(ledger.events)) ledger.events = [];
  if (!ledger.cycles || typeof ledger.cycles !== "object") ledger.cycles = {};
  if (!Number.isInteger(ledger.eventCount)) ledger.eventCount = ledger.events.length;
  if (ledger.eventHead === undefined) ledger.eventHead = ledger.events.at(-1)?.eventId || null;

  const cycleId = getCycleId(date);
  if (!ledger.cycles[date]) {
    ledger.cycles[date] = { cycleId, date, firstObservedAt: recordedAt };
  }

  const previous = ledger.events[ledger.events.length - 1] || null;
  const event = {
    schemaVersion: NIGHTLY_EVENT_SCHEMA_VERSION,
    sequence: ledger.events.length + 1,
    previousEventId: previous?.eventId || null,
    cycleId,
    date,
    stage: Number(stage),
    type,
    source,
    recordedAt,
    contractFingerprint,
    payload: canonicalValue(payload),
  };
  event.eventId = getNightlyEventId(event);
  ledger.events.push(event);
  ledger.eventCount = ledger.events.length;
  ledger.eventHead = event.eventId;
  validateNightlyEvents(ledger);
  return event;
}

export function getStageEvents(ledger, date, stageNumber) {
  return (ledger?.events || []).filter(event => event.date === date && event.stage === stageNumber);
}

export function getProjectedStageEntry(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let projected = null;
  for (const event of events) {
    const after = event.payload?.after || {};
    if ([NIGHTLY_EVENT_TYPES.STAGE_EXPECTED, NIGHTLY_EVENT_TYPES.STAGE_SNAPSHOT_IMPORTED].includes(event.type)) {
      projected = {
        date: event.date,
        stage: event.stage,
        cycleId: event.cycleId,
        state: after.state,
        failureClass: after.failureClass,
        expectedAfterUtc: after.expectedAfterUtc ?? null,
        deadlineUtc: after.deadlineUtc ?? null,
        evidence: after.evidence || {},
        attempts: after.attempts ?? 0,
        dispatchAttempts: after.dispatchAttempts ?? 0,
        interventionAttempts: after.interventionAttempts ?? 0,
        lastObservedAt: event.recordedAt,
      };
      continue;
    }
    assertEvent(projected, `Stage event ${event.sequence} has no expectation event to project from.`);
    const requested = event.payload?.requested || {};
    for (const [key, value] of Object.entries(requested)) {
      if (key === "evidence") continue;
      projected[key] = value;
    }
    const evidence = requested.evidence || {};
    projected.evidence = { ...projected.evidence, ...(evidence.set || {}) };
    for (const key of evidence.removed || []) delete projected.evidence[key];
    for (const key of ["state", "failureClass", "attempts", "dispatchAttempts", "interventionAttempts"]) {
      if (Object.prototype.hasOwnProperty.call(after, key)) projected[key] = after[key];
    }
    projected.lastObservedAt = event.recordedAt;
  }
  return projected;
}
