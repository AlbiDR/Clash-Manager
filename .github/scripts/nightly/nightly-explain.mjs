// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getContractFingerprint } from "./nightly-contract.mjs";
import {
  getCanonicalJson,
  getCycleExecutionEvents,
  getCycleId,
  getProjectedStageEntry,
  getStageEvents,
  validateNightlyEvents,
} from "./nightly-events.mjs";
import { validateExecutionProvenance } from "./nightly-provenance.mjs";
import {
  buildRecap,
  declaredCoverageRecord,
  evidenceDateFor,
  loadRecapInputs,
  parsePrHistoryEntry,
  runProgress,
} from "./nightly-recap.mjs";

export const NIGHTLY_EXPLANATION_VERSION = 1;

function assertExplanation(condition, message) {
  if (!condition) throw new Error(message);
}

function getSemanticSnapshot(entry) {
  if (!entry) return null;
  const snapshot = Object.fromEntries([
    "date",
    "stage",
    "cycleId",
    "state",
    "failureClass",
    "expectedAfterUtc",
    "deadlineUtc",
    "evidence",
    "attempts",
    "dispatchAttempts",
    "interventionAttempts",
  ].map(key => [key, entry[key] ?? (key === "evidence" ? {} : null)]));
  for (const key of ["attempts", "dispatchAttempts", "interventionAttempts"]) {
    snapshot[key] = entry[key] ?? 0;
  }
  return snapshot;
}

function getEventIntegrity(ledger, stageEvents, entry) {
  if (ledger?.events === undefined) {
    return {
      status: "LEGACY_SNAPSHOT",
      verified: false,
      reason: "This run predates append-only event recording; only its final ledger snapshot is available.",
    };
  }
  validateNightlyEvents(ledger);
  if (stageEvents.length === 0) {
    const firstEventDate = (ledger.events || []).map(event => event.date).sort()[0] || null;
    if (entry?.date && firstEventDate && entry.date < firstEventDate) {
      return {
        status: "LEGACY_SNAPSHOT",
        verified: false,
        reason: `This run predates the first recorded event cycle (${firstEventDate}); only its final ledger snapshot is available.`,
      };
    }
    return {
      status: "NO_STAGE_EVENTS",
      verified: true,
      reason: "The event chain is valid, but it contains no events for this stage and cycle.",
    };
  }
  const projected = getProjectedStageEntry(stageEvents);
  if (getCanonicalJson(getSemanticSnapshot(projected)) !== getCanonicalJson(getSemanticSnapshot(entry))) {
    return {
      status: "SNAPSHOT_DIVERGED",
      verified: false,
      reason: "The event chain is valid, but its projected stage state does not match the mutable ledger snapshot.",
    };
  }
  if (stageEvents[0].type === "STAGE_SNAPSHOT_IMPORTED") {
    return {
      status: "IMPORTED_BASELINE",
      verified: true,
      reason: `${stageEvents.length} stage event(s) verified from an imported pre-event snapshot; earlier transitions are not available.`,
    };
  }
  return {
    status: "VERIFIED",
    verified: true,
    reason: `${stageEvents.length} stage event(s) verified, and their projection matches the ledger snapshot.`,
  };
}

function getExecutionIntegrity(ledger, date) {
  const events = getCycleExecutionEvents(ledger, date);
  if (events.length === 0) {
    return {
      status: "UNRECORDED",
      verified: false,
      reason: "No workflow execution provenance was recorded for this cycle.",
      executions: [],
    };
  }

  const executions = events.map(event => ({
    ...event.payload?.execution,
    recordedAt: event.recordedAt,
  }));
  try {
    executions.forEach(({ recordedAt: _recordedAt, ...execution }) => validateExecutionProvenance(execution));
  } catch (error) {
    return {
      status: "INVALID",
      verified: false,
      reason: `Execution provenance is malformed: ${error.message}`,
      executions,
    };
  }

  const stored = ledger?.cycles?.[date]?.executions || {};
  const eventExecutionIds = new Set(executions.map(execution => execution.executionId));
  const matchesSnapshot = executions.every(({ recordedAt: _recordedAt, ...execution }) =>
    getCanonicalJson(stored[execution.executionId]) === getCanonicalJson(execution),
  ) && Object.keys(stored).every(executionId => eventExecutionIds.has(executionId));
  if (!matchesSnapshot) {
    return {
      status: "SNAPSHOT_DIVERGED",
      verified: false,
      reason: "Execution provenance events do not match the cycle execution snapshot.",
      executions,
    };
  }
  return {
    status: "VERIFIED",
    verified: true,
    reason: `${executions.length} workflow execution record(s) are anchored in the event stream.`,
    executions,
  };
}

function getOutcomeReason({ classification, declared, entry, progress }) {
  if (classification.outcome === "STUCK" && entry?.state && !["MERGED", "RECOVERABLE"].includes(entry.state)) {
    return `The ledger recorded ${entry.state}${entry.failureClass ? ` with ${entry.failureClass}` : ""}, and no durable merge superseded it.`;
  }
  if (declared) return `The stage coverage record declared ${declared.status}.`;
  if (classification.merged) return "Durable merge evidence exists, but no stage coverage declaration was readable, so the result defaults to CHANGED.";
  if (classification.outcome === "PENDING") {
    return progress.over
      ? "The stage is pending even though the cycle is over."
      : `The cycle is still open and its observed frontier is S${String(progress.frontier).padStart(2, "0")}.`;
  }
  return "No durable merge or readable coverage result exists, and the cycle is no longer waiting for this stage.";
}

export function buildStageExplanation(inputs, stageNumber) {
  assertExplanation(Number.isInteger(stageNumber), "A numeric stage is required.");
  const stage = inputs.registry.stages.find(candidate => candidate.number === stageNumber);
  assertExplanation(stage, `Stage ${stageNumber} is not registered.`);

  const recap = buildRecap(inputs);
  const classification = recap.stages.find(candidate => candidate.stage === stageNumber);
  const evidenceDate = evidenceDateFor(stageNumber, inputs.date);
  const tag = (inputs.tags || []).find(candidate => candidate.startsWith(`nightly/${evidenceDate}/stage-${stageNumber}/pr-`)) || null;
  const declared = declaredCoverageRecord(inputs.coverageByStage?.[stageNumber], stageNumber, evidenceDate);
  const history = parsePrHistoryEntry(inputs.prHistory, stageNumber, evidenceDate);
  const progress = runProgress(inputs);
  const entry = inputs.ledger?.runs?.[inputs.date]?.[String(stageNumber)] || null;
  const events = getStageEvents(inputs.ledger, inputs.date, stageNumber);
  const eventIntegrity = getEventIntegrity(inputs.ledger, events, entry);
  const executionIntegrity = getExecutionIntegrity(inputs.ledger, inputs.date);
  const latestExecution = executionIntegrity.executions.at(-1) || null;
  const contractFingerprint = getContractFingerprint(stage);
  const recordedContractFingerprints = [...new Set(events.map(event => event.contractFingerprint).filter(Boolean))];
  const contractIntegrity = recordedContractFingerprints.length === 0
    ? { status: "UNRECORDED", recorded: [], matchesCurrent: null }
    : recordedContractFingerprints.length === 1 && recordedContractFingerprints[0] === contractFingerprint
      ? { status: "MATCHED", recorded: recordedContractFingerprints, matchesCurrent: true }
      : { status: recordedContractFingerprints.length > 1 ? "MIXED" : "CHANGED", recorded: recordedContractFingerprints, matchesCurrent: false };

  const rules = [
    {
      id: "MERGE_EVIDENCE",
      inputs: { tag, ledgerState: entry?.state || null },
      result: classification.merged,
      reason: classification.merged
        ? tag ? `Promotion tag ${tag} is durable merge evidence.` : "The ledger state is MERGED."
        : "Neither a promotion tag nor a MERGED ledger state exists.",
    },
    {
      id: "COVERAGE_DECLARATION",
      inputs: { evidenceDate, coverageLog: stage.coverageLog },
      result: declared?.status || null,
      reason: declared
        ? `The coverage log declared ${declared.status} for ${declared.target}.`
        : "No readable terminal coverage record exists for this evidence date.",
    },
    {
      id: "RUN_FRONTIER",
      inputs: { stage: stageNumber, frontier: progress.frontier, cycleOver: progress.over },
      result: classification.outcome === "PENDING" ? "WAIT" : "JUDGE",
      reason: classification.outcome === "PENDING"
        ? "The stage has not produced a result and the cycle has not advanced far enough to judge it."
        : "The cycle contains enough evidence to classify this stage.",
    },
    {
      id: "INTERVENTION_EFFECT",
      inputs: {
        attempted: classification.intervention.attempted,
        requestAccepted: classification.intervention.requestAccepted,
        merged: classification.merged,
        channel: classification.intervention.channel,
      },
      result: classification.intervention.outcome,
      reason: classification.intervention.effective
        ? "The intervention request was accepted and durable merge evidence exists."
        : classification.intervention.attempted
          ? classification.intervention.requestAccepted
            ? "The intervention request was accepted, but no durable merge followed."
            : "The intervention request was rejected."
          : "No explicit intervention evidence was recorded.",
    },
    {
      id: "OUTCOME_PRECEDENCE",
      inputs: {
        declaredStatus: declared?.status || null,
        merged: classification.merged,
        ledgerState: entry?.state || null,
        pending: classification.outcome === "PENDING",
      },
      result: classification.outcome,
      reason: getOutcomeReason({ classification, declared, entry, progress }),
    },
  ];

  const facts = {
    cycleId: getCycleId(inputs.date),
    cycleDate: inputs.date,
    evidenceDate,
    contractFingerprint,
    ledgerState: entry?.state || null,
    failureClass: entry?.failureClass || null,
    tag,
    coverage: declared,
    historyPr: history?.prNumber || null,
    executionId: latestExecution?.executionId || null,
    executionBranch: latestExecution?.checkout?.branch || null,
    executionSha: latestExecution?.checkout?.sha || null,
    stageExecutionRevision: entry?.evidence?.stageExecution?.revision || null,
  };
  const projection = {
    version: NIGHTLY_EXPLANATION_VERSION,
    facts,
    rules,
    result: {
      outcome: classification.outcome,
      merged: classification.merged,
      rescued: classification.rescued,
      rescuedBy: classification.rescuedBy,
    },
  };
  const projectionFingerprint = createHash("sha256").update(getCanonicalJson(projection)).digest("hex");

  return {
    schemaVersion: NIGHTLY_EXPLANATION_VERSION,
    ...facts,
    stage: stageNumber,
    slug: stage.slug,
    name: stage.name,
    contract: stage.contract,
    contractIntegrity,
    eventIntegrity,
    executionIntegrity,
    events,
    rules,
    classification: projection.result,
    projectionFingerprint,
  };
}

function renderEvent(event) {
  const before = event.payload?.before?.state || "none";
  const after = event.payload?.after?.state || "unknown";
  const requested = Object.keys(event.payload?.requested || {}).sort();
  const transition = event.payload?.transition;
  const dispatch = event.payload?.requested?.evidence?.set?.dispatch;
  const detail = dispatch?.error ? `Dispatch error: ${dispatch.error}` : null;
  return [
    `  #${event.sequence} ${event.recordedAt} [${event.source}] ${event.type}`,
    `    State: ${before} -> ${after}`,
    `    Requested facts: ${requested.length > 0 ? requested.join(", ") : "initial expectation"}`,
    `    Transition: ${transition ? `${transition.name} (${transition.from} -> ${transition.to})` : "legacy event"}`,
    ...(detail ? [`    ${detail}`] : []),
    `    Event: ${event.eventId}`,
  ];
}

export function renderStageExplanation(explanation) {
  const lines = [
    `Nightly Explanation: ${explanation.cycleDate} S${String(explanation.stage).padStart(2, "0")}`,
    "",
    `Cycle: ${explanation.cycleId}`,
    `Stage: ${explanation.name}`,
    `Evidence date: ${explanation.evidenceDate}`,
    `Contract: ${explanation.contractFingerprint}`,
    `Recorded contract: ${explanation.contractIntegrity.status}`,
    `Event integrity: ${explanation.eventIntegrity.status} - ${explanation.eventIntegrity.reason}`,
    `Execution provenance: ${explanation.executionIntegrity.status} - ${explanation.executionIntegrity.reason}`,
    "",
    "Observed facts:",
    `  Ledger state: ${explanation.ledgerState || "absent"}`,
    `  Failure class: ${explanation.failureClass || "none"}`,
    `  Promotion tag: ${explanation.tag || "absent"}`,
    `  Coverage result: ${explanation.coverage?.status || "absent"}`,
    `  History PR: ${explanation.historyPr || "absent"}`,
    `  Executed branch: ${explanation.executionBranch || "unrecorded"}`,
    `  Executed SHA: ${explanation.executionSha || "unrecorded"}`,
    `  Jules checkout SHA: ${explanation.stageExecutionRevision || "unrecorded"}`,
    "",
    "Workflow executions:",
  ];

  if (explanation.executionIntegrity.executions.length === 0) lines.push("  No execution provenance was recorded for this cycle.");
  else explanation.executionIntegrity.executions.forEach(execution => {
    lines.push(`  ${execution.recordedAt} ${execution.workflow?.name || execution.workflow?.path || "unknown workflow"}`);
    lines.push(`    Run: ${execution.workflow?.runId || "local"} attempt ${execution.workflow?.attempt || "unknown"}`);
    lines.push(`    Checkout: ${execution.checkout?.branch || "unknown"} @ ${execution.checkout?.sha || "unrecorded"}`);
  });

  lines.push(
    "",
    "Event timeline:",
  );

  if (explanation.events.length === 0) lines.push("  No append-only events were recorded for this stage and cycle.");
  else explanation.events.forEach(event => lines.push(...renderEvent(event)));

  lines.push("", "Decision trace:");
  explanation.rules.forEach((rule, index) => {
    lines.push(`  ${index + 1}. ${rule.id} -> ${String(rule.result)}`);
    lines.push(`     ${rule.reason}`);
  });
  lines.push(
    "",
    `Result: ${explanation.classification.outcome}`,
    `Merged: ${explanation.classification.merged ? "yes" : "no"}`,
    `Auto-recovered: ${explanation.classification.rescued ? `yes (${explanation.classification.rescuedBy})` : "no"}`,
    `Projection: ${explanation.projectionFingerprint}`,
  );
  return lines.join("\n");
}

function getArguments(argv) {
  const dateAt = argv.indexOf("--date");
  const stageAt = argv.indexOf("--stage");
  const date = dateAt >= 0 ? argv[dateAt + 1] : null;
  const stage = stageAt >= 0 ? Number(argv[stageAt + 1]) : null;
  if (date) assertExplanation(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid --date: ${date}`);
  assertExplanation(Number.isInteger(stage) && stage >= 1 && stage <= 13, "Usage: nightly:explain --stage <1-13> [--date YYYY-MM-DD] [--json]");
  return { date, stage, json: argv.includes("--json") };
}

export function executeExplanationCli(argv = process.argv.slice(2)) {
  const options = getArguments(argv);
  spawnSync("git", ["fetch", "--tags", "--quiet", "origin", "Nightly"], { encoding: "utf8" });
  const inputs = loadRecapInputs(options.date);
  const localRegistry = JSON.parse(readFileSync(".github/nightly-config/stages.json", "utf8"));
  const localContracts = new Map(localRegistry.stages.map(stage => [stage.number, stage.contract]));
  inputs.registry = {
    ...inputs.registry,
    stages: inputs.registry.stages.map(stage => ({ ...stage, contract: localContracts.get(stage.number) || stage.contract })),
  };
  const explanation = buildStageExplanation(inputs, options.stage);
  console.log(options.json ? JSON.stringify(explanation, null, 2) : renderStageExplanation(explanation));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    executeExplanationCli();
  } catch (error) {
    console.error(`Nightly explanation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
