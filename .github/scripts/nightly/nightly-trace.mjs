// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { spawnSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getExecutionProvenance } from "./nightly-provenance.mjs";
import { createRedactor, redactDeep } from "./nightly-redact.mjs";

export const NIGHTLY_TRACE_VERSION = 1;

/** Diagnostic spans, not a second ledger: never changes the wrapped result. */
export function createNightlyTrace({ environment = process.env, append = appendFileSync, warn = console.error } = {}) {
  const destination = environment.NIGHTLY_TRACE_PATH;
  const storage = new AsyncLocalStorage();
  const invocationId = randomUUID();
  const redact = createRedactor([environment.GITHUB_TOKEN, environment.GH_TOKEN, environment.JULES_API_KEY]);
  let sequence = 0;
  let unavailable = false;
  let execution;
  const write = event => {
    if (!destination || unavailable) return;
    try {
      mkdirSync(path.dirname(destination), { recursive: true });
      append(destination, `${JSON.stringify(redactDeep(event, redact))}\n`, "utf8");
    } catch (error) {
      unavailable = true;
      warn(`Nightly trace unavailable: ${redact(error.message)}. Workflow behavior is unchanged; diagnostic evidence is incomplete.`);
    }
  };
  return {
    measure(operation, details, callback) {
      if (!destination || unavailable) return callback();
      try {
        if (!execution) {
          execution = getExecutionProvenance(environment);
          const revision = spawnSync("git", ["-c", "core.fsmonitor=false", "rev-parse", "HEAD"], { encoding: "utf8" });
          execution.processRevision = revision.status === 0 ? revision.stdout.trim() : null;
          execution.workflowRevision = environment.GITHUB_WORKFLOW_SHA || null;
        }
      }
      catch (error) {
        unavailable = true;
        warn(`Nightly trace identity unavailable: ${redact(error.message)}.`);
        return callback();
      }
      const parent = storage.getStore();
      const spanId = `${invocationId}:${++sequence}`;
      const context = { controlAttempt: environment.NIGHTLY_CONTROL_ATTEMPT || null, ...parent?.context, ...details };
      const common = { schemaVersion: NIGHTLY_TRACE_VERSION, executionId: execution.executionId, invocationId,
        spanId, parentId: parent?.spanId || null, operation, context };
      const started = performance.now();
      write({ ...common, type: "START", recordedAt: new Date().toISOString(), ...(!parent ? { execution } : {}) });
      const finish = (value, error) => {
        const exitCode = value?.exitCode ?? (context.kind !== "http" && value?.ok === false ? value.status : null);
        write({ ...common, type: "END", recordedAt: new Date().toISOString(),
          durationMs: Math.round((performance.now() - started) * 1000) / 1000,
          status: error ? "ERROR" : exitCode || value?.ok === false ? "NONZERO" : "OK",
          exitCode,
          ...(context.kind === "http" ? { httpStatus: value?.status ?? error?.status ?? null } : {}),
          error: error ? { name: error.name || "Error", message: error.message || String(error), code: error.status ?? error.code ?? null }
            : value?.ok === false ? { message: value.stderr || "Command returned a nonzero exit status." } : null,
        });
      };
      return storage.run({ spanId, context }, () => {
        try {
          const value = callback();
          if (value && typeof value.then === "function") return Promise.resolve(value).then(
            result => { finish(result); return result; },
            error => { finish(undefined, error); throw error; },
          );
          finish(value);
          return value;
        } catch (error) { finish(undefined, error); throw error; }
      });
    },
  };
}

let currentTrace;
export function traceNightlyOperation(operation, details, callback) {
  currentTrace ||= createNightlyTrace();
  return currentTrace.measure(operation, details, callback);
}

/** Cancellation can leave START without END, or an incomplete final write. */
export function parseNightlyTrace(text) {
  const operations = new Map();
  const executions = new Map();
  const warnings = [];
  const lines = String(text).split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch {
      if (index === lines.length - 1 && !text.endsWith("\n")) { warnings.push("Trailing record is truncated; evidence is incomplete."); continue; }
      throw new Error(`Invalid trace JSON at line ${index + 1}.`);
    }
    if (record.schemaVersion !== NIGHTLY_TRACE_VERSION || !record.spanId || !record.operation
      || !["START", "END"].includes(record.type) || !record.executionId || !record.invocationId
      || !Number.isFinite(Date.parse(record.recordedAt))
      || (record.type === "END" && (!["OK", "NONZERO", "ERROR"].includes(record.status) || !Number.isFinite(record.durationMs) || record.durationMs < 0))) {
      throw new Error(`Invalid trace record at line ${index + 1}.`);
    }
    if (record.execution) executions.set(`${record.executionId}:${record.invocationId}`, { ...record.execution, invocationId: record.invocationId });
    const entry = operations.get(record.spanId) || {};
    if (entry[record.type]) throw new Error(`Duplicate ${record.type} for trace span ${record.spanId}.`);
    const previous = entry.START || entry.END;
    if (previous && ["executionId", "invocationId", "operation", "parentId"].some(key => previous[key] !== record[key])) throw new Error(`Conflicting trace identity for ${record.spanId}.`);
    entry[record.type] = record;
    operations.set(record.spanId, entry);
  }
  return { schemaVersion: NIGHTLY_TRACE_VERSION, executions: [...executions.values()], warnings,
    operations: [...operations.values()].map(entry => ({ ...(entry.START || entry.END), ...entry.END,
      status: !entry.START ? "START_MISSING" : entry.END?.status || "INCOMPLETE" })) };
}

export function renderNightlyTrace(trace) {
  const lines = ["Nightly operation trace", ""];
  for (const execution of trace.executions) {
    lines.push(`Execution: ${execution.executionId}`,
      `Invocation: ${execution.invocationId}`,
      `Checkout: ${execution.checkout.branch} @ ${execution.checkout.sha || "unrecorded"}`,
      `Process revision: ${execution.processRevision || "unrecorded"}`,
      `Workflow definition revision: ${execution.workflowRevision || "unrecorded"}`);
    if (execution.workflow.runId) lines.push(`GitHub run: ${execution.workflow.runId}, attempt ${execution.workflow.attempt}`);
  }
  const counts = Object.fromEntries(["ERROR", "NONZERO", "INCOMPLETE", "START_MISSING"].map(status => [status, trace.operations.filter(operation => operation.status === status).length]));
  lines.push(`Operations: ${trace.operations.length}; errors: ${counts.ERROR}; nonzero results: ${counts.NONZERO}; incomplete: ${counts.INCOMPLETE + counts.START_MISSING}`);
  lines.push("", ...trace.warnings.map(message => `WARNING: ${message}`));
  for (const operation of trace.operations) {
    lines.push(`[${operation.status}] ${operation.operation} (${operation.durationMs == null ? "duration unrecorded" : `${operation.durationMs} ms`})`,
      `  Span: ${operation.spanId}; parent: ${operation.parentId || "root"}`);
    if (operation.context && Object.keys(operation.context).length) lines.push(`  Context: ${JSON.stringify(operation.context)}`);
    if (operation.httpStatus != null) lines.push(`  HTTP status: ${operation.httpStatus}`);
    if (operation.error) lines.push(`  Detail: ${operation.error.message}`);
  }
  if (trace.operations.length === 0) lines.push("No operations recorded; this is not evidence of success.");
  return lines.join("\n");
}

/** Keep step outcomes, never step outputs or the complete environment. */
export function getNightlyTraceIndex(environment, trace) {
  const execution = trace?.executions[0] || getExecutionProvenance(environment);
  const steps = JSON.parse(environment.NIGHTLY_TRACE_STEPS || "{}");
  return {
    schemaVersion: NIGHTLY_TRACE_VERSION,
    execution,
    workflowUrl: environment.GITHUB_SERVER_URL && environment.GITHUB_REPOSITORY && execution.workflow.runId
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${execution.workflow.runId}` : null,
    jobStatus: environment.NIGHTLY_TRACE_JOB_STATUS || "unrecorded",
    steps: Object.entries(steps).map(([id, step]) => ({ id, outcome: step.outcome || "unrecorded", conclusion: step.conclusion || "unrecorded" })),
    trace: trace ? { operations: trace.operations.length, incomplete: trace.operations.filter(operation => ["INCOMPLETE", "START_MISSING"].includes(operation.status)).length, warnings: trace.warnings } : { status: "UNAVAILABLE" },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--finalize")) {
      const file = process.env.NIGHTLY_TRACE_PATH;
      if (!file) throw new Error("NIGHTLY_TRACE_PATH is required for finalization.");
      let trace = null;
      try { trace = parseNightlyTrace(readFileSync(file, "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      writeFileSync(`${file}.index.json`, `${JSON.stringify(getNightlyTraceIndex(process.env, trace), null, 2)}\n`);
    } else {
    const file = process.argv.indexOf("--file");
    if (file < 0 || !process.argv[file + 1]) throw new Error("Usage: pnpm nightly:trace --file <nightly-trace.jsonl> [--json]");
    const trace = parseNightlyTrace(readFileSync(process.argv[file + 1], "utf8"));
    console.log(process.argv.includes("--json") ? JSON.stringify(trace, null, 2) : renderNightlyTrace(trace));
    }
  } catch (error) { console.error(`Nightly trace failed: ${error.message}`); process.exitCode = 1; }
}
