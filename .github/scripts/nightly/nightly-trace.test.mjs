// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createNightlyTrace, getNightlyTraceIndex, parseNightlyTrace, renderNightlyTrace } from "./nightly-trace.mjs";

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "nightly-trace-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const environment = { NIGHTLY_TRACE_PATH: path.join(directory, "trace.jsonl"),
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2", GITHUB_WORKFLOW: "Nightly Watchdog",
    NIGHTLY_WORKFLOW_PATH: ".github/workflows/nightly-watchdog.yml",
    NIGHTLY_EXECUTION_SHA: "executed-code", GITHUB_SHA: "different-trigger-code", NIGHTLY_EXECUTION_BRANCH: "Nightly",
    GITHUB_TOKEN: "token-secret-value", JULES_API_KEY: "AIza1234567890SECRET" };
  const trace = createNightlyTrace({ environment });
  const read = () => parseNightlyTrace(readFileSync(environment.NIGHTLY_TRACE_PATH, "utf8"));
  return { environment, trace, read };
}

test("parallel operations retain their own parent, cycle, stage and actual checkout identity", async t => {
  const { trace, read } = fixture(t);
  await trace.measure("watchdog.run", { cycleId: "nightly-cycle/2026-10-21" }, async () => {
    await Promise.all([3, 11].map(stage => trace.measure("stage", { stage }, async () => {
      await new Promise(resolve => setTimeout(resolve, stage));
      return trace.measure("fetch", {}, async () => "same result");
    })));
  });
  const result = read();
  assert.equal(result.operations.length, 5);
  assert.equal(result.executions[0].checkout.sha, "executed-code");
  for (const child of result.operations.filter(operation => operation.operation === "fetch")) {
    const parent = result.operations.find(operation => operation.spanId === child.parentId);
    assert.equal(parent.context.stage, child.context.stage);
    assert.equal(child.context.cycleId, "nightly-cycle/2026-10-21");
    assert.equal(child.status, "OK");
    assert.ok(child.durationMs >= 0);
  }
});

test("handled Git failures retain stderr and secrets are redacted throughout", t => {
  const { environment, trace, read } = fixture(t);
  const value = { ok: false, status: 128, stderr: `denied ${environment.GITHUB_TOKEN} ${environment.JULES_API_KEY}` };
  assert.equal(trace.measure("git.command", { argv: ["push", `https://x-access-token:${environment.GITHUB_TOKEN}@github.com/owner/repo`] }, () => value), value);
  const report = read();
  assert.equal(report.operations[0].status, "NONZERO");
  assert.equal(report.operations[0].exitCode, 128);
  const raw = readFileSync(environment.NIGHTLY_TRACE_PATH, "utf8");
  assert.ok(!raw.includes(environment.GITHUB_TOKEN));
  assert.ok(!raw.includes(environment.JULES_API_KEY));
  assert.match(raw, /REDACTED/);
  assert.match(renderNightlyTrace(report), /denied/);
});

test("exceptions remain the identical exception and a later retry does not erase failure", async t => {
  const { environment, trace, read } = fixture(t);
  const error = Object.assign(new Error("HTTP denied"), { status: 403 });
  await assert.rejects(trace.measure("request", {}, async () => { throw error; }), actual => actual === error);
  const retry = createNightlyTrace({ environment });
  assert.equal(await retry.measure("request", {}, async () => 42), 42);
  const result = read();
  assert.deepEqual(result.operations.map(operation => operation.status), ["ERROR", "OK"]);
  assert.equal(result.operations[0].error.code, 403);
  assert.notEqual(result.operations[0].invocationId, result.operations[1].invocationId);
  assert.deepEqual(result.executions.map(execution => execution.invocationId), result.operations.map(operation => operation.invocationId));
  assert.match(renderNightlyTrace(result), /Invocation:/);
});

test("failed trace storage is visible once and cannot change workflow results or errors", () => {
  const warnings = [];
  const trace = createNightlyTrace({ environment: { NIGHTLY_TRACE_PATH: path.join(tmpdir(), "nightly-trace-unwritable.jsonl") },
    append: () => { throw new Error("disk full"); }, warn: message => warnings.push(message) });
  assert.equal(trace.measure("work", {}, () => 7), 7);
  const original = new Error("original failure");
  assert.throws(() => trace.measure("work", {}, () => { throw original; }), actual => actual === original);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /incomplete/);
});

test("interrupted spans and truncated final writes never appear successful", t => {
  const { environment, trace } = fixture(t);
  trace.measure("work", {}, () => 1);
  const start = readFileSync(environment.NIGHTLY_TRACE_PATH, "utf8").split("\n")[0];
  const report = parseNightlyTrace(`${start}\n{"schemaVersion":`);
  assert.equal(report.operations[0].status, "INCOMPLETE");
  assert.equal(report.warnings.length, 1);
  assert.match(renderNightlyTrace(report), /INCOMPLETE/);
  assert.throws(() => parseNightlyTrace(`${start}\ninvalid\n`), /Invalid trace JSON/);
});

test("trace indexes record publication-step failures without retaining any outputs", t => {
  const { environment, trace, read } = fixture(t);
  trace.measure("work", {}, () => 1);
  const index = getNightlyTraceIndex({ ...environment, NIGHTLY_TRACE_JOB_STATUS: "failure",
    NIGHTLY_TRACE_STEPS: JSON.stringify({ ledger: { outcome: "failure", conclusion: "failure", outputs: { secret: "must not survive" } } }) }, read());
  assert.equal(index.steps[0].outcome, "failure");
  assert.ok(!JSON.stringify(index).includes("must not survive"));
  assert.equal(index.trace.operations, 1);
  assert.equal(getNightlyTraceIndex(environment, null).trace.status, "UNAVAILABLE");
});

test("all three control-plane workflows preserve diagnostics even after failure", () => {
  for (const name of ["merge-nightly-prs", "nightly-watchdog", "nightly-dispatch"]) {
    const source = readFileSync(new URL(`../../workflows/${name}.yml`, import.meta.url), "utf8");
    assert.match(source, /NIGHTLY_TRACE_PATH:.*runner.temp/);
    assert.match(source, /name: Preserve Nightly operation trace\n\s+if: always\(\)/);
    assert.match(source, /id: ledger/);
    assert.ok(!source.includes("toJSON(steps)"), "never expose future step outputs in public trace setup logs");
  }
});


test("real Git and Jules adapters emit failures and retry attempts without changing their results", t => {
  const { environment } = fixture(t);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { runCmd } from "./.github/scripts/nightly/merge-nightly-core.mjs";
    import { fetchJulesSessions } from "./.github/scripts/nightly/nightly-watchdog.mjs";
    import { traceNightlyOperation } from "./.github/scripts/nightly/nightly-trace.mjs";
    await traceNightlyOperation("integration", {}, async () => {
      const failure = runCmd(["rev-parse", "--verify", "refs/heads/does-not-exist-for-trace-test"], { allowFailure: true });
      if (failure.ok) throw Error("expected missing ref");
      let attempt = 0;
      const sessions = await fetchJulesSessions({ julesApiKey: "trace-test-api-key" }, async () => {
        attempt++;
        return attempt === 1 ? { ok: false, status: 503, statusText: "Unavailable" }
          : { ok: true, status: 200, json: async () => ({ sessions: [] }) };
      }, { sleepImpl: async () => {} });
      if (!sessions.available || attempt !== 2) throw Error("retry behavior changed");
    });
  `], { env: { ...process.env, ...environment }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const report = parseNightlyTrace(readFileSync(environment.NIGHTLY_TRACE_PATH, "utf8"));
  assert.ok(report.operations.some(operation => operation.operation === "git.command" && operation.status === "NONZERO"));
  const requests = report.operations.filter(operation => operation.operation === "jules.request");
  assert.deepEqual(requests.map(operation => operation.httpStatus), [503, 200]);
  assert.match(renderNightlyTrace(report), /HTTP status: 503/);
  assert.deepEqual(requests.map(operation => operation.context.attempt), [1, 2]);
});
