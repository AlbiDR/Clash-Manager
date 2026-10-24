// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Stage 2 pre-finalize verification: the spec, lint and type-check as ONE attempt.
//
// Why this exists. On 2026-10-24 Stage 2 merged nothing. Its new spec passed
// every test, then the merge gate ("Suite must not regress") ran
// `pnpm verify:push`, which is type-check, lint and tests, and ESLint refused
// `let remainingValues` (prefer-const). The stage was only ever told to run the
// tests, so it was held to a weaker standard than the gate that judges it, and
// Stage 2 writes nothing but test files, which makes it the stage most likely
// to trip a style rule and the one least checked for it.
//
// Why it is not in `finalize`. Finalize is bookkeeping that fails open so that
// no throw costs a stage its night, and it has no way to hand a correction back
// to the session. The one moment the session can still act on a failure is
// before it calls finalize, so the check lives there, as a command the prompt
// tells the session to run in place of running the spec by hand.
//
// The correction budget is shared. The prompt already allows one targeted
// correction and one rerun. Running the spec, lint and type-check as three
// independent commands would quietly turn that into three. So one invocation
// runs every check, reports every failure together (the single correction can
// then fix all of them), and counts as one attempt. A second failing attempt
// ends the correction allowance: restore the spec and finalize PARTIAL-RUN.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The prompt's own rule: "make one targeted correction and rerun the same spec
// once". Two attempts in total, so one correction.
export const CORRECTIONS_ALLOWED = 1;
export const ATTEMPTS_ALLOWED = CORRECTIONS_ALLOWED + 1;

export const VERDICT = Object.freeze({
  VERIFIED: "VERIFIED",
  CORRECT: "CORRECT",
  RESTORE: "RESTORE",
  SUBMIT: "SUBMIT",
  REJECTED: "REJECTED",
  UNVERIFIED: "UNVERIFIED",
});

// Exit codes are part of the contract with the prompt: 0 continue, 1 one
// correction left, 2 stop and restore, 3 budget gone, 4 bad invocation, 5 a
// check could not run at all.
export const EXIT = Object.freeze({
  [VERDICT.VERIFIED]: 0,
  [VERDICT.CORRECT]: 1,
  [VERDICT.RESTORE]: 2,
  [VERDICT.SUBMIT]: 3,
  [VERDICT.REJECTED]: 4,
  [VERDICT.UNVERIFIED]: 5,
});

const ATTEMPTS_FILE = "spec-verify-attempts.txt";
const STAGE_COMMAND = ".github/scripts/nightly/nightly-stage.mjs";
const STAGE_NUMBER = 2;
const PWA_DIR = "Frontend-PWA";
const BACKEND_DIR = "Backend";
const PWA_PACKAGE = "clash-manager-pwa";
const BACKEND_PACKAGE = "clash-manager-backend";

/**
 * Which checks apply to a spec path, or why the path is refused.
 *
 * Lint and type-check mirror the merge gate exactly: it runs them for
 * Frontend-PWA only (`pnpm --dir Frontend-PWA type-check` and `lint`), so a
 * Backend spec gets its tests and an explicit note, never a check the gate
 * would not apply.
 */
export function planChecks(specPath) {
  const spec = String(specPath ?? "").trim().replace(/\\/g, "/");
  if (!spec) return { error: "Pass the spec to verify with --spec <repo-relative path>." };
  if (path.posix.isAbsolute(spec) || spec.split("/").includes("..")) {
    return { error: `The spec path must be repo-relative and stay inside the repo: ${spec}` };
  }
  if (spec.endsWith(".test.ts")) return { error: `Stage 2 never creates *.test.ts files: ${spec}` };
  if (!spec.endsWith(".spec.ts")) return { error: `Stage 2 owns only *.spec.ts files: ${spec}` };

  const env = { CI: "true", DEBIAN_FRONTEND: "noninteractive" };
  if (spec.startsWith(`${PWA_DIR}/`)) {
    const inPackage = spec.slice(PWA_DIR.length + 1);
    return {
      spec,
      checks: [
        { name: "spec", command: "pnpm", args: ["-F", PWA_PACKAGE, "test", "--", spec], env },
        { name: "lint", command: "pnpm", args: ["--dir", PWA_DIR, "exec", "eslint", inPackage], env },
        { name: "type-check", command: "pnpm", args: ["--dir", PWA_DIR, "type-check"], env },
      ],
      notes: [],
    };
  }
  if (spec.startsWith(`${BACKEND_DIR}/`)) {
    return {
      spec,
      checks: [{ name: "spec", command: "pnpm", args: ["-F", BACKEND_PACKAGE, "test", "--", spec], env }],
      notes: ["lint and type-check: not applicable, the merge gate runs them for Frontend-PWA only"],
    };
  }
  return { error: `The spec must live under ${PWA_DIR}/ or ${BACKEND_DIR}/: ${spec}` };
}

/**
 * Decide the outcome of one attempt. Pure, so the budget policy is testable
 * without spawning anything.
 *
 * `priorAttempts` counts attempts already consumed. This attempt is number
 * priorAttempts + 1.
 */
export function judgeAttempt(priorAttempts, failures) {
  const attempt = priorAttempts + 1;
  if (failures.length === 0) return { verdict: VERDICT.VERIFIED, attempt };
  if (attempt < ATTEMPTS_ALLOWED) return { verdict: VERDICT.CORRECT, attempt };
  return { verdict: VERDICT.RESTORE, attempt };
}

// Enough tail to show an ESLint or tsc report; the head is install noise.
const OUTPUT_TAIL_CHARS = 4000;

function trimOutput(text) {
  const value = String(text ?? "").trim();
  return value.length > OUTPUT_TAIL_CHARS ? `...${value.slice(-OUTPUT_TAIL_CHARS)}` : value;
}

export function renderReport({ verdict, attempt, failures, unavailable = [], notes, spec }) {
  const lines = [`${verdict} ${spec} (attempt ${attempt} of ${ATTEMPTS_ALLOWED})`];
  for (const failure of failures) {
    lines.push(`FAILED ${failure.name}:`, trimOutput(failure.output));
  }
  for (const missing of unavailable) {
    lines.push(`COULD NOT RUN ${missing.name}:`, trimOutput(missing.output));
  }
  for (const note of notes) lines.push(`note: ${note}`);
  if (verdict === VERDICT.CORRECT) {
    lines.push(
      `Make ONE targeted correction that fixes every failure above, then run this same command again.`,
      `That rerun is the only one the stage allows; a second failure means restore.`,
    );
  } else if (verdict === VERDICT.RESTORE) {
    lines.push(
      `The correction allowance is spent. Restore or delete only the spec this run edited,`,
      `then finalize PARTIAL-RUN. Do not retry.`,
    );
  } else if (verdict === VERDICT.UNVERIFIED) {
    lines.push(
      `A check that could not start is an environment problem, not a defect in the spec, so no correction`,
      `was used. Keep the spec, say in your verification result which check could not run, and continue.`,
    );
  } else if (verdict === VERDICT.VERIFIED) {
    lines.push(`Every check passed. Carry on to the mutation proof, then finalize.`);
  }
  return lines.join("\n");
}

/**
 * One full verification attempt. Every collaborator is injected so the fixtures
 * can drive each branch (lint failure, type-check failure, exhausted budget)
 * without a toolchain.
 */
export function verifySpec({ specPath, phase, readAttempts, writeAttempts, runCheck }) {
  const plan = planChecks(specPath);
  if (plan.error) return { verdict: VERDICT.REJECTED, report: plan.error };

  // A spent time budget is checked first and does not consume an attempt: the
  // stage was out of time, not out of corrections.
  if (phase() !== "WORK") {
    return {
      verdict: VERDICT.SUBMIT,
      report: `${VERDICT.SUBMIT}: the work budget is spent. Stop source work, restore any unverified spec edit, and follow the fallback rules in the shared contract.`,
    };
  }

  const prior = readAttempts();
  if (prior >= ATTEMPTS_ALLOWED) {
    return {
      verdict: VERDICT.RESTORE,
      attempt: prior,
      report: `${VERDICT.RESTORE} ${plan.spec}: both attempts are used. Restore or delete only the spec this run edited, then finalize PARTIAL-RUN. Do not retry.`,
    };
  }

  // Every check runs even after one fails, so a single correction can address
  // all of them at once.
  //
  // A check that could not START (no toolchain, no pnpm) is not a failing
  // check. Reporting it as one would tell the session to "correct" a spec that
  // is fine, and would spend its only correction on the environment.
  const failures = [];
  const unavailable = [];
  for (const check of plan.checks) {
    const outcome = runCheck(check);
    if (outcome.ok) continue;
    (outcome.unavailable ? unavailable : failures).push({ name: check.name, output: outcome.output });
  }

  if (failures.length === 0 && unavailable.length > 0) {
    // Not VERIFIED: a check that never ran proved nothing. Not an attempt
    // either, because nothing the session could correct was found.
    const attempt = prior + 1;
    return {
      verdict: VERDICT.UNVERIFIED,
      attempt,
      failures,
      unavailable,
      report: renderReport({ verdict: VERDICT.UNVERIFIED, attempt, failures, unavailable, notes: plan.notes, spec: plan.spec }),
    };
  }

  const judged = judgeAttempt(prior, failures);
  writeAttempts(judged.attempt);
  return {
    verdict: judged.verdict,
    attempt: judged.attempt,
    failures,
    unavailable,
    report: renderReport({ ...judged, failures, unavailable, notes: plan.notes, spec: plan.spec }),
  };
}

function contextRoot() {
  return process.env.NIGHTLY_CONTEXT_DIR || "/tmp/nightly";
}

function attemptsPath() {
  return path.join(contextRoot(), ATTEMPTS_FILE);
}

function readAttemptCount() {
  try {
    const value = Number.parseInt(readFileSync(attemptsPath(), "utf8").trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeAttemptCount(count) {
  mkdirSync(contextRoot(), { recursive: true });
  writeFileSync(attemptsPath(), `${count}\n`);
}

function repoRootFrom(cwd) {
  let dir = cwd;
  while (!existsSync(path.join(dir, STAGE_COMMAND))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Run this from inside the Clash Manager repository.");
    dir = parent;
  }
  return dir;
}

// The same fail-closed reading the budget command applies to itself: anything
// other than the word WORK counts as SUBMIT.
function budgetPhaseFromStage(repoRoot) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, STAGE_COMMAND), "budget", "--stage", String(STAGE_NUMBER)], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  return String(result.stdout ?? "").trim().split("\n").pop() === "WORK" ? "WORK" : "SUBMIT";
}

function spawnCheck(repoRoot, check) {
  const result = spawnSync(check.command, check.args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...check.env },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) return { ok: false, unavailable: true, output: String(result.error.message) };
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const flag = argv.indexOf("--spec");
  const specPath = flag >= 0 ? argv[flag + 1] : undefined;
  const repoRoot = repoRootFrom(cwd);
  const result = verifySpec({
    specPath,
    phase: () => budgetPhaseFromStage(repoRoot),
    readAttempts: readAttemptCount,
    writeAttempts: writeAttemptCount,
    runCheck: check => spawnCheck(repoRoot, check),
  });
  console.log(result.report);
  return EXIT[result.verdict];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = EXIT[VERDICT.REJECTED];
  }
}
