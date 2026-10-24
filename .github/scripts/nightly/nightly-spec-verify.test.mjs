// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ATTEMPTS_ALLOWED,
  CORRECTIONS_ALLOWED,
  EXIT,
  VERDICT,
  judgeAttempt,
  planChecks,
  verifySpec,
} from "./nightly-spec-verify.mjs";

const PWA_SPEC = "Frontend-PWA/src/core/services/services-tests/useProgressiveList.spec.ts";
const BACKEND_SPEC = "Backend/supabase/functions/ingest-royale-data/work-budget.spec.ts";

// A session whose attempt counter lives in a variable and whose checks answer
// from a script, so each fixture states exactly which checks fail on which try.
function session({ failing = [], phase = "WORK", prior = 0 } = {}) {
  const state = { attempts: prior, ran: [] };
  let queue = failing.map(round => new Set(round));
  return {
    state,
    options: {
      phase: () => phase,
      readAttempts: () => state.attempts,
      writeAttempts: count => { state.attempts = count; },
      runCheck: check => {
        state.ran.push(check.name);
        const failingNow = queue[0] ?? new Set();
        if (failingNow.has(`${check.name}:unavailable`)) return { ok: false, unavailable: true, output: "ENOEXEC" };
        return failingNow.has(check.name)
          ? { ok: false, output: `${check.name} exploded` }
          : { ok: true, output: "" };
      },
      advance: () => { queue = queue.slice(1); },
    },
  };
}

function attempt(sess, spec = PWA_SPEC) {
  const result = verifySpec({ specPath: spec, ...sess.options });
  sess.options.advance();
  return result;
}

test("the correction allowance is exactly one, as the prompt already states", () => {
  assert.equal(CORRECTIONS_ALLOWED, 1);
  assert.equal(ATTEMPTS_ALLOWED, 2);
});

test("a Frontend-PWA spec is checked by tests, lint and type-check, as the merge gate does", () => {
  const plan = planChecks(PWA_SPEC);
  assert.deepEqual(plan.checks.map(c => c.name), ["spec", "lint", "type-check"]);
  const lint = plan.checks.find(c => c.name === "lint");
  assert.deepEqual(lint.args, ["--dir", "Frontend-PWA", "exec", "eslint", "src/core/services/services-tests/useProgressiveList.spec.ts"]);
  assert.deepEqual(plan.checks.find(c => c.name === "type-check").args, ["--dir", "Frontend-PWA", "type-check"]);
});

test("a Backend spec gets its tests and an explicit note, never a check the gate would not run", () => {
  const plan = planChecks(BACKEND_SPEC);
  assert.deepEqual(plan.checks.map(c => c.name), ["spec"]);
  assert.match(plan.notes[0], /not applicable/);
});

test("paths Stage 2 does not own are refused before anything runs", () => {
  for (const bad of ["", undefined, "Frontend-PWA/src/a.ts", "Frontend-PWA/src/a.test.ts", "/etc/x.spec.ts", "Frontend-PWA/../x.spec.ts", "APK/x.spec.ts"]) {
    assert.ok(planChecks(bad).error, `expected a refusal for ${String(bad)}`);
  }
  const sess = session();
  const result = verifySpec({ specPath: "Frontend-PWA/src/a.test.ts", ...sess.options });
  assert.equal(result.verdict, VERDICT.REJECTED);
  assert.deepEqual(sess.state.ran, []);
});

test("all checks pass on the first attempt: verified, one attempt recorded", () => {
  const sess = session();
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.VERIFIED);
  assert.equal(sess.state.attempts, 1);
  assert.equal(EXIT[result.verdict], 0);
});

test("the 2026-10-24 case: tests pass, lint fails, so the stage gets its one correction", () => {
  const sess = session({ failing: [["lint"]] });
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.CORRECT);
  assert.deepEqual(result.failures.map(f => f.name), ["lint"]);
  assert.match(result.report, /FAILED lint/);
  assert.match(result.report, /ONE targeted correction/);
  assert.equal(EXIT[result.verdict], 1);
});

test("a type-check failure is handled the same way", () => {
  const sess = session({ failing: [["type-check"]] });
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.CORRECT);
  assert.deepEqual(result.failures.map(f => f.name), ["type-check"]);
});

test("every failing check is reported together so one correction can fix them all", () => {
  const sess = session({ failing: [["spec", "lint", "type-check"]] });
  const result = attempt(sess);
  assert.deepEqual(sess.state.ran, ["spec", "lint", "type-check"]);
  assert.deepEqual(result.failures.map(f => f.name), ["spec", "lint", "type-check"]);
});

test("a failed first attempt followed by a clean rerun is verified", () => {
  const sess = session({ failing: [["lint"], []] });
  assert.equal(attempt(sess).verdict, VERDICT.CORRECT);
  const second = attempt(sess);
  assert.equal(second.verdict, VERDICT.VERIFIED);
  assert.equal(sess.state.attempts, 2);
});

test("the budget is shared across checks: a spec failure then a lint failure ends the allowance", () => {
  const sess = session({ failing: [["spec"], ["lint"]] });
  assert.equal(attempt(sess).verdict, VERDICT.CORRECT);
  const second = attempt(sess);
  assert.equal(second.verdict, VERDICT.RESTORE);
  assert.match(second.report, /PARTIAL-RUN/);
  assert.match(second.report, /Restore or delete only the spec/);
  assert.equal(EXIT[second.verdict], 2);
});

test("after the allowance is spent nothing is run again, however often it is called", () => {
  const sess = session({ failing: [["lint"], ["lint"]] });
  attempt(sess);
  attempt(sess);
  const ranBefore = sess.state.ran.length;
  for (let call = 0; call < 3; call += 1) {
    const result = attempt(sess);
    assert.equal(result.verdict, VERDICT.RESTORE);
  }
  assert.equal(sess.state.ran.length, ranBefore);
  assert.equal(sess.state.attempts, ATTEMPTS_ALLOWED);
});

test("a spent time budget returns SUBMIT, runs nothing and does not consume an attempt", () => {
  const sess = session({ phase: "SUBMIT" });
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.SUBMIT);
  assert.deepEqual(sess.state.ran, []);
  assert.equal(sess.state.attempts, 0);
  assert.equal(EXIT[result.verdict], 3);
});

test("a Backend spec failing its tests uses the same single correction", () => {
  const sess = session({ failing: [["spec"], ["spec"]] });
  assert.equal(attempt(sess, BACKEND_SPEC).verdict, VERDICT.CORRECT);
  assert.equal(attempt(sess, BACKEND_SPEC).verdict, VERDICT.RESTORE);
  assert.deepEqual([...new Set(sess.state.ran)], ["spec"]);
});

test("a check that cannot start is UNVERIFIED, not a failure, and spends no correction", () => {
  const sess = session({ failing: [["spec:unavailable", "lint:unavailable", "type-check:unavailable"]] });
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.UNVERIFIED);
  assert.match(result.report, /COULD NOT RUN lint/);
  assert.match(result.report, /environment problem/);
  assert.doesNotMatch(result.report, /ONE targeted correction/);
  assert.equal(sess.state.attempts, 0, "no attempt may be consumed by an environment failure");
  assert.equal(EXIT[result.verdict], 5);
});

test("a real failure beside an unavailable check still gets the correction", () => {
  const sess = session({ failing: [["lint", "type-check:unavailable"]] });
  const result = attempt(sess);
  assert.equal(result.verdict, VERDICT.CORRECT);
  assert.deepEqual(result.failures.map(f => f.name), ["lint"]);
  assert.deepEqual(result.unavailable.map(f => f.name), ["type-check"]);
});

test("passing checks beside an unavailable one are not enough to claim VERIFIED", () => {
  const sess = session({ failing: [["type-check:unavailable"]] });
  assert.equal(attempt(sess).verdict, VERDICT.UNVERIFIED);
});

test("judgeAttempt is the whole policy: pass, one more try, then stop", () => {
  assert.equal(judgeAttempt(0, []).verdict, VERDICT.VERIFIED);
  assert.equal(judgeAttempt(0, [{ name: "lint" }]).verdict, VERDICT.CORRECT);
  assert.equal(judgeAttempt(1, [{ name: "lint" }]).verdict, VERDICT.RESTORE);
  assert.equal(judgeAttempt(1, []).verdict, VERDICT.VERIFIED);
});

test("the CLI persists attempts in the context dir and refuses without a spec", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "spec-verify-"));
  const previous = process.env.NIGHTLY_CONTEXT_DIR;
  process.env.NIGHTLY_CONTEXT_DIR = dir;
  try {
    const { runCli } = await import("./nightly-spec-verify.mjs");
    assert.equal(runCli([], path.resolve(import.meta.dirname, "../../..")), EXIT[VERDICT.REJECTED]);
    assert.throws(() => readFileSync(path.join(dir, "spec-verify-attempts.txt")));
  } finally {
    if (previous === undefined) delete process.env.NIGHTLY_CONTEXT_DIR;
    else process.env.NIGHTLY_CONTEXT_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
