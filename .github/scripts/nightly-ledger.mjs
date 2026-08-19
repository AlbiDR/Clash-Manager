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

export function upsertStageEntry(ledger, registry, date, stageNumber, patch = {}) {
  ensureRunEntries(ledger, registry, date);
  const key = String(stageNumber);
  const current = ledger.runs[date][key];
  const next = {
    ...current,
    ...patch,
    date,
    stage: Number(stageNumber),
    evidence: {
      ...(current.evidence || {}),
      ...(patch.evidence || {}),
    },
    lastObservedAt: patch.lastObservedAt || new Date().toISOString(),
  };
  assertLedger(LEDGER_STATES.has(next.state), `Nightly ledger entry ${date}/${key} has invalid state.`);
  ledger.runs[date][key] = next;
  return next;
}

export function stageEntry(ledger, date, stageNumber) {
  return ledger.runs?.[date]?.[String(stageNumber)] || null;
}
