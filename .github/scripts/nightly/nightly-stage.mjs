// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FINAL_STATUSES = new Set(["CHANGED", "CLEAN", "SKIPPED", "PARTIAL-RUN"]);
const REGISTRY_PATH = ".github/nightly-config/stages.json";
const AGENT_LOADER_PATH = "AGENTS.md";
const NIGHTLY_AGENT_CONTRACT_PATH = ".github/nightly-prompts/00-nightly-agent-contract.md";
const HISTORY_PATH = ".github/nightly-logs/00-pr-history.md";
const PIPELINE_INTELLIGENCE_PATH = ".github/nightly-logs/00-pipeline-intelligence.md";
const SELF_HEALING_PATH = ".github/nightly-logs/13-self-healing-protocol.md";
const WORD_LIMIT = 2_000;
const STAGE_13_WORD_LIMIT = 2_600;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRepoPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function isSafeRepoPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return (
    normalized.length > 0 &&
    !path.isAbsolute(normalized) &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../")
  );
}

export function validateRegistryData(registry) {
  invariant(registry && typeof registry === "object", "Nightly registry must be an object.");
  invariant(registry.schemaVersion === 1, "Nightly registry schemaVersion must be 1.");
  invariant(registry.targetBranch === "Nightly", "Nightly registry targetBranch must be Nightly.");
  invariant(
    Number.isInteger(registry.workBudgetMinutes) && registry.workBudgetMinutes > 0,
    "workBudgetMinutes must be a positive integer.",
  );
  invariant(
    Number.isInteger(registry.sessionBudgetMinutes) &&
      registry.sessionBudgetMinutes > registry.workBudgetMinutes,
    "sessionBudgetMinutes must exceed workBudgetMinutes.",
  );
  invariant(Array.isArray(registry.stages) && registry.stages.length === 13, "Registry must define 13 stages.");

  const prompts = new Set();
  const logs = new Set();
  const slugs = new Set();

  for (let index = 0; index < registry.stages.length; index += 1) {
    const stage = registry.stages[index];
    const expectedNumber = index + 1;
    invariant(stage.number === expectedNumber, `Registry stage ${expectedNumber} is missing or out of order.`);
    invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stage.slug), `Stage ${expectedNumber} has an invalid slug.`);
    invariant(typeof stage.name === "string" && stage.name.length > 0, `Stage ${expectedNumber} needs a name.`);
    invariant(isSafeRepoPath(stage.prompt), `Stage ${expectedNumber} has an unsafe prompt path.`);
    invariant(isSafeRepoPath(stage.coverageLog), `Stage ${expectedNumber} has an unsafe coverage-log path.`);
    invariant(
      stage.prompt.startsWith(".github/nightly-prompts/") && stage.prompt.endsWith(".md"),
      `Stage ${expectedNumber} prompt path is outside nightly-prompts.`,
    );
    invariant(
      stage.coverageLog.startsWith(".github/nightly-logs/") && stage.coverageLog.endsWith("-coverage.log"),
      `Stage ${expectedNumber} coverage log is invalid.`,
    );
    invariant(
      stage.branchPrefix.startsWith(`nightly/stage-${expectedNumber}-`) && stage.branchPrefix.endsWith("-"),
      `Stage ${expectedNumber} branchPrefix is invalid.`,
    );
    invariant(typeof stage.domain === "string" && stage.domain.length > 0, `Stage ${expectedNumber} needs a domain.`);
    invariant(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stage.commitScope),
      `Stage ${expectedNumber} has an invalid commitScope.`,
    );
    invariant(typeof stage.baselineTests === "boolean", `Stage ${expectedNumber} baselineTests must be boolean.`);
    invariant(
      typeof stage.dependencyCruiser === "boolean",
      `Stage ${expectedNumber} dependencyCruiser must be boolean.`,
    );
    invariant(typeof stage.historyAging === "boolean", `Stage ${expectedNumber} historyAging must be boolean.`);
    invariant(!prompts.has(stage.prompt), `Duplicate prompt path: ${stage.prompt}`);
    invariant(!logs.has(stage.coverageLog), `Duplicate coverage log: ${stage.coverageLog}`);
    invariant(!slugs.has(stage.slug), `Duplicate stage slug: ${stage.slug}`);
    prompts.add(stage.prompt);
    logs.add(stage.coverageLog);
    slugs.add(stage.slug);
  }

  invariant(
    registry.stages.filter(stage => stage.baselineTests).map(stage => stage.number).join(",") === "2",
    "Only Stage 2 may run baseline tests during context generation.",
  );
  invariant(
    registry.stages.filter(stage => stage.dependencyCruiser).map(stage => stage.number).join(",") === "9",
    "Only Stage 9 may run dependency-cruiser during context generation.",
  );
  invariant(
    registry.stages.filter(stage => stage.historyAging).map(stage => stage.number).join(",") === "1",
    "Only Stage 1 may own history aging.",
  );

  return registry;
}

export function getStage(registry, stageNumber) {
  const value = String(stageNumber ?? "");
  invariant(/^(?:[1-9]|1[0-3])$/.test(value), `Invalid nightly stage: ${stageNumber}`);
  const parsed = Number.parseInt(value, 10);
  invariant(Number.isInteger(parsed) && parsed >= 1 && parsed <= 13, `Invalid nightly stage: ${stageNumber}`);
  const stage = registry.stages.find(candidate => candidate.number === parsed);
  invariant(stage, `Nightly stage ${parsed} is not registered.`);
  return stage;
}

export function computeLockFingerprint(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function needsDependencyRefresh(snapshotFingerprint, currentFingerprint) {
  return !snapshotFingerprint || snapshotFingerprint.trim() !== currentFingerprint.trim();
}

export function budgetPhase(startEpochSeconds, nowEpochSeconds, workBudgetMinutes) {
  const start = Number(startEpochSeconds);
  const now = Number(nowEpochSeconds);
  const budget = Number(workBudgetMinutes);
  invariant(Number.isFinite(start) && Number.isFinite(now), "Budget epochs must be finite numbers.");
  invariant(Number.isFinite(budget) && budget > 0, "Work budget must be a positive number.");
  return now >= start + budget * 60 ? "SUBMIT" : "WORK";
}

export function sentinelLine(date, stageNumber) {
  return `* [${date}] [Stage ${stageNumber}] IN-PROGRESS: session started`;
}

export function replaceSentinel(content, sentinel, finalLine) {
  const occurrences = content.split(sentinel).length - 1;
  if (occurrences === 0 && content.includes(finalLine)) {
    return { content, changed: false };
  }
  invariant(occurrences === 1, `Expected exactly one sentinel, found ${occurrences}.`);
  return { content: content.replace(sentinel, finalLine), changed: true };
}

function isAdministrativePipelinePath(filePath) {
  return (
    filePath === AGENT_LOADER_PATH ||
    filePath.startsWith(".github/nightly-prompts/") ||
    filePath.startsWith(".github/nightly-config/") ||
    filePath === PIPELINE_INTELLIGENCE_PATH ||
    filePath.startsWith(".github/scripts/nightly/nightly-stage") ||
    filePath === ".github/scripts/nightly/update-nightly-context.sh" ||
    filePath.startsWith(".github/scripts/nightly/merge-nightly-") ||
    filePath === ".github/scripts/nightly/age-pr-history.py" ||
    filePath === ".github/scripts/check-fold-state.py" ||
    filePath.startsWith(".github/workflows/")
  );
}

export function validateChangedPaths(stage, status, changedPaths) {
  invariant(FINAL_STATUSES.has(status), `Unsupported final status: ${status}`);
  const paths = [...new Set(changedPaths.map(normalizeRepoPath).filter(Boolean))];
  invariant(paths.includes(stage.coverageLog), `Final diff must include ${stage.coverageLog}.`);

  const otherCoverageLogs = paths.filter(
    filePath => filePath.endsWith("-coverage.log") && filePath !== stage.coverageLog,
  );
  invariant(otherCoverageLogs.length === 0, `Stage ${stage.number} modified another stage's coverage log.`);

  const forbiddenAdministrativePaths = paths.filter(isAdministrativePipelinePath);
  invariant(
    forbiddenAdministrativePaths.length === 0,
    `Nightly stages may not modify pipeline instructions or coordinators: ${forbiddenAdministrativePaths.join(", ")}`,
  );
  invariant(stage.historyAging || !paths.includes(HISTORY_PATH), `Only Stage 1 may modify ${HISTORY_PATH}.`);
  invariant(
    stage.number === 13 || !paths.includes(SELF_HEALING_PATH),
    `Only Stage 13 may modify ${SELF_HEALING_PATH}.`,
  );

  if (status === "SKIPPED" || status === "PARTIAL-RUN") {
    invariant(
      paths.length === 1 && paths[0] === stage.coverageLog,
      `${status} must be a log-only diff; restore all other changes first.`,
    );
  }

  if (status === "CLEAN") {
    const cleanAllowed = new Set([stage.coverageLog]);
    if (stage.historyAging) cleanAllowed.add(HISTORY_PATH);
    const unexpected = paths.filter(filePath => !cleanAllowed.has(filePath));
    invariant(unexpected.length === 0, `CLEAN contains unexpected changes: ${unexpected.join(", ")}`);
  }

  if (status === "CHANGED") {
    invariant(
      stage.number === 8 || paths.some(filePath => filePath !== stage.coverageLog),
      "CHANGED requires a non-coverage-log change.",
    );
  }

  if (stage.number === 2) {
    const invalidTests = paths.filter(
      filePath => filePath !== stage.coverageLog && !filePath.endsWith(".spec.ts"),
    );
    invariant(invalidTests.length === 0, `Stage 2 may only change *.spec.ts files: ${invalidTests.join(", ")}`);
  }

  if (stage.number === 5) {
    const invalidDocs = paths.filter(
      filePath => filePath !== stage.coverageLog && path.posix.basename(filePath).toLowerCase() !== "readme.md",
    );
    invariant(invalidDocs.length === 0, `Stage 5 may only change README.md files: ${invalidDocs.join(", ")}`);
  }

  if (stage.number === 13) {
    const allowed = new Set([stage.coverageLog, SELF_HEALING_PATH]);
    const invalidEvidence = paths.filter(filePath => !allowed.has(filePath));
    invariant(
      invalidEvidence.length === 0,
      `Stage 13 may only update its protocol and coverage log: ${invalidEvidence.join(", ")}`,
    );
  }

  return paths;
}

function cleanSummary(summary) {
  const cleaned = String(summary || "").replace(/\s+/g, " ").trim();
  invariant(cleaned.length > 0, "A non-empty --summary is required.");
  invariant(cleaned.length <= 240, "--summary must be 240 characters or fewer.");
  return cleaned;
}

function cleanPrDetail(value, fallback, label) {
  const cleaned = String(value || fallback || "").replace(/\s+/g, " ").trim();
  invariant(cleaned.length > 0, `A non-empty ${label} is required.`);
  invariant(cleaned.length <= 400, `${label} must be 400 characters or fewer.`);
  return cleaned;
}

function defaultWhy(stage) {
  return `Execute the scheduled Stage ${stage.number} ${stage.slug} audit.`;
}

function defaultResult(status) {
  if (status === "CHANGED") return "Required stage validation completed.";
  if (status === "CLEAN") return "Audit completed with no source change required.";
  return "The run degraded safely to a log-only result.";
}

function sentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function statusNarrative(status) {
  if (status === "CHANGED") return "It made a small, targeted update and left the branch with verified nightly maintenance.";
  if (status === "CLEAN") return "It found the audited area already healthy, so the PR records the completed check without unnecessary source churn.";
  if (status === "SKIPPED") return "It found no useful work for this stage on this run, and records that decision explicitly.";
  if (status === "PARTIAL-RUN") return "It kept the evidence from the run while avoiding source changes that were not safe to ship.";
  return "It records the stage outcome so the nightly pipeline remains auditable.";
}

function renderPrOverview(stage, status, summary, why, result) {
  return [
    `This Stage ${stage.number} ${stage.name} run focused on ${sentence(summary)}`,
    `${sentence(why)} ${statusNarrative(status)}`,
    sentence(result),
  ].join(" ");
}

export function renderPrBody(stage, status, summary, changedPaths, details = {}) {
  const normalizedSummary = cleanSummary(summary);
  const files = changedPaths.join(", ") || stage.coverageLog;
  const why = cleanPrDetail(details.why, defaultWhy(stage), "--why");
  const result = cleanPrDetail(details.result, defaultResult(status), "--result");
  const overview = renderPrOverview(stage, status, normalizedSummary, why, result);

  return `### Nightly Stage ${stage.number}: ${stage.name}

**Status:** ${status}

${overview}

**What changed:** ${normalizedSummary}

**Why:** ${why}

**Result:** ${result}

**Files changed:** ${files}

<!--
NIGHTLY_PR_METADATA:
  Domain: ${stage.domain}
  Why: ${why}
  Change: ${normalizedSummary}
  Result: ${result}
  Files: ${files}
-->
`;
}

export function renderHandoff(stage, status, summary, runId) {
  const normalizedSummary = cleanSummary(summary);
  const commitMessage = `chore(${stage.commitScope}): ${normalizedSummary}`.slice(0, 120);
  return `Nightly Stage ${stage.number} is finalized with status ${status}.

Suggested branch: ${stage.branchPrefix}${runId}
Suggested commit: ${commitMessage}
PR base: Nightly
PR draft: false
PR body: /tmp/nightly/pr-body.md

A published Pull Request is the required outcome of this session, not an optional next step. Return this exact result now as your absolute last message: nothing after it, no summary, no offer to do more, no question. If any distinct action, tool, or control is available to you to submit, complete, or hand off the session, separate from simply writing a message, invoke it now, because Jules' native scheduled-task publisher only creates the pull request once the session has actually, fully ended. Do not run code review, memory, reflection, git commit, or git push.
`;
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    invariant(token.startsWith("--"), `Unexpected argument: ${token}`);
    const key = token.slice(2);
    invariant(!options.has(key), `Duplicate option: --${key}`);
    if (key === "dry-run") {
      options.set(key, true);
      continue;
    }
    invariant(index + 1 < rest.length && !rest[index + 1].startsWith("--"), `${token} requires a value.`);
    options.set(key, rest[index + 1]);
    index += 1;
  }
  return { command, options };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    timeout: options.timeout,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  invariant(
    result.status === 0,
    `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
  );
  return String(result.stdout || "").trim();
}

function git(repoRoot, args) {
  return run("git", args, { cwd: repoRoot });
}

function findRepoRoot(cwd = process.cwd()) {
  return run("git", ["rev-parse", "--show-toplevel"], { cwd });
}

function loadRegistry(repoRoot) {
  const registryFile = path.join(repoRoot, REGISTRY_PATH);
  invariant(existsSync(registryFile), `Missing nightly registry: ${registryFile}`);
  return validateRegistryData(JSON.parse(readFileSync(registryFile, "utf8")));
}

function atomicWrite(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, content, "utf8");
  renameSync(temporaryPath, filePath);
}

function utcDate(now = new Date()) {
  const override = process.env.NIGHTLY_TODAY;
  const value = override || now.toISOString().slice(0, 10);
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(value), `Invalid NIGHTLY_TODAY value: ${value}`);
  invariant(
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    `Invalid UTC date: ${value}`,
  );
  return value;
}

function epochSeconds() {
  const override = process.env.NIGHTLY_NOW_EPOCH;
  const value = override ? Number(override) : Math.floor(Date.now() / 1_000);
  invariant(Number.isInteger(value) && value >= 0, `Invalid NIGHTLY_NOW_EPOCH value: ${override}`);
  return value;
}

function contextDir() {
  return process.env.NIGHTLY_CONTEXT_DIR || "/tmp/nightly";
}

function readOptional(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : "";
}

function appendSentinel(logPath, sentinel) {
  const existing = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  if (existing.includes(sentinel)) return false;
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  atomicWrite(logPath, `${existing}${separator}${sentinel}\n`);
  return true;
}

function parseStatusPaths(statusOutput) {
  const records = statusOutput.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    invariant(record.length >= 4, `Unable to parse git status record: ${record}`);
    const state = record.slice(0, 2);
    paths.push(normalizeRepoPath(record.slice(3)));
    if (state.includes("R") || state.includes("C")) index += 1;
  }
  return paths;
}

function changedPaths(repoRoot) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  invariant(result.status === 0, `git status failed: ${String(result.stderr || "").trim()}`);
  return parseStatusPaths(String(result.stdout || ""));
}

function startableWorktreeState(repoRoot, stage, date) {
  const branch = git(repoRoot, ["branch", "--show-current"]);
  invariant(branch === "Nightly", `Expected branch Nightly, found ${branch || "detached HEAD"}.`);
  const paths = changedPaths(repoRoot);
  if (paths.length === 0) return "clean";

  const logContent = readOptional(path.join(repoRoot, stage.coverageLog));
  const alreadyStarted =
    paths.length === 1 && paths[0] === stage.coverageLog && logContent.includes(sentinelLine(date, stage.number));
  invariant(alreadyStarted, `Stage must start from a clean Nightly worktree; found: ${paths.join(", ")}`);
  return "already-started";
}

function verifyCoreTools(repoRoot) {
  git(repoRoot, ["--version"]);
  run("bash", ["--version"], { cwd: repoRoot, timeout: 15_000 });
  run("date", ["-u", "+%Y-%m-%d"], { cwd: repoRoot, timeout: 15_000 });
  run("pnpm", ["--version"], { cwd: repoRoot, timeout: 30_000 });
}

function synchronizeNightly(repoRoot) {
  run("git", ["pull", "--ff-only", "origin", "Nightly"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: "true",
      DEBIAN_FRONTEND: "noninteractive",
      GIT_TERMINAL_PROMPT: "0",
    },
    timeout: 120_000,
  });
  invariant(git(repoRoot, ["branch", "--show-current"]) === "Nightly", "Nightly synchronization changed branches.");
  invariant(changedPaths(repoRoot).length === 0, "Nightly synchronization left a dirty worktree.");
}

function lockFingerprint(repoRoot) {
  const lockPath = path.join(repoRoot, "pnpm-lock.yaml");
  invariant(existsSync(lockPath), "pnpm-lock.yaml is required for the nightly environment.");
  return computeLockFingerprint(readFileSync(lockPath));
}

function runDependencyRefresh(repoRoot) {
  run("pnpm", ["install", "--frozen-lockfile"], {
    cwd: repoRoot,
    env: { ...process.env, CI: "true", DEBIAN_FRONTEND: "noninteractive" },
    stdio: "inherit",
    timeout: 600_000,
  });
}

function runContextUpdate(repoRoot, stage, targetContextDir) {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, ".github/scripts/nightly/update-nightly-context.sh"), "--stage", String(stage.number)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CI: "true",
        DEBIAN_FRONTEND: "noninteractive",
        NIGHTLY_CONTEXT_DIR: targetContextDir,
      },
      stdio: "inherit",
      timeout: 900_000,
    },
  );
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: `exit status ${result.status ?? "unknown"}` };
  return { ok: true, detail: "CURRENT" };
}

function startCommand(repoRoot, registry, stage, dryRun) {
  const date = utcDate();
  const startEpoch = epochSeconds();
  const targetContextDir = contextDir();
  const runId = randomBytes(4).toString("hex");

  verifyCoreTools(repoRoot);
  const worktreeState = startableWorktreeState(repoRoot, stage, date);
  if (!dryRun && worktreeState === "clean") synchronizeNightly(repoRoot);

  const currentFingerprint = lockFingerprint(repoRoot);
  const snapshotFingerprint = readOptional(path.join(targetContextDir, "snapshot-lock.sha256"));
  const refreshDependencies = needsDependencyRefresh(snapshotFingerprint, currentFingerprint);

  const state = {
    schemaVersion: 1,
    stage: stage.number,
    slug: stage.slug,
    date,
    runId,
    startEpoch,
    workDeadlineEpoch: startEpoch + registry.workBudgetMinutes * 60,
    sessionDeadlineEpoch: startEpoch + registry.sessionBudgetMinutes * 60,
    snapshotFingerprint: snapshotFingerprint || null,
    activeFingerprint: currentFingerprint,
    dependencyRefresh: refreshDependencies ? "required" : "not-required",
    contextRefresh: "pending",
    finalizedStatus: null,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          command: "start",
          dryRun: true,
          stage: stage.number,
          wouldSynchronize: worktreeState === "clean",
          refreshDependencies,
          state,
        },
        null,
        2,
      ),
    );
    return;
  }

  mkdirSync(targetContextDir, { recursive: true });
  atomicWrite(path.join(targetContextDir, "TODAY"), `${date}\n`);
  atomicWrite(path.join(targetContextDir, "session-state.json"), `${JSON.stringify(state, null, 2)}\n`);
  appendSentinel(path.join(repoRoot, stage.coverageLog), sentinelLine(date, stage.number));

  if (refreshDependencies) {
    runDependencyRefresh(repoRoot);
    atomicWrite(path.join(targetContextDir, "dependency-state.txt"), "REFRESHED\n");
  } else {
    atomicWrite(path.join(targetContextDir, "dependency-state.txt"), "CURRENT\n");
  }
  atomicWrite(path.join(targetContextDir, "active-lock.sha256"), `${currentFingerprint}\n`);

  const contextRefresh = runContextUpdate(repoRoot, stage, targetContextDir);
  const finalizedStartState = {
    ...state,
    contextRefresh: contextRefresh.ok ? "current" : `degraded: ${contextRefresh.detail}`,
  };
  atomicWrite(
    path.join(targetContextDir, "context-state.txt"),
    `${finalizedStartState.contextRefresh.toUpperCase()}\n`,
  );
  atomicWrite(
    path.join(targetContextDir, "session-state.json"),
    `${JSON.stringify(finalizedStartState, null, 2)}\n`,
  );
  if (!contextRefresh.ok) {
    console.warn(`Nightly context refresh degraded (${contextRefresh.detail}); stage work may continue.`);
  }
  const manifest = [
    `stage: ${stage.number}`,
    `slug: ${stage.slug}`,
    `prompt: ${stage.prompt}`,
    `coverage-log: ${stage.coverageLog}`,
    `target-branch: ${registry.targetBranch}`,
    `branch-prefix: ${stage.branchPrefix}`,
    `work-deadline-epoch: ${state.workDeadlineEpoch}`,
    `finalize: node .github/scripts/nightly/nightly-stage.mjs finalize --stage ${stage.number} --status <STATUS> --summary <WHAT_CHANGED> --why <RATIONALE> --result <VERIFICATION_RESULT>`,
  ].join("\n");
  atomicWrite(path.join(targetContextDir, "stage-manifest.txt"), `${manifest}\n`);
  console.log(`Nightly Stage ${stage.number} started. Work phase ends after ${registry.workBudgetMinutes} minutes.`);
}

function budgetCommand(stage) {
  try {
    const statePath = path.join(contextDir(), "session-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    invariant(state.stage === stage.number, `Session state belongs to Stage ${state.stage}, not Stage ${stage.number}.`);
    const workBudgetMinutes = state.workDeadlineEpoch
      ? (state.workDeadlineEpoch - state.startEpoch) / 60
      : 45;
    console.log(budgetPhase(state.startEpoch, epochSeconds(), workBudgetMinutes));
  } catch (error) {
    console.error(`Nightly budget state unavailable; submit now: ${error.message}`);
    console.log("SUBMIT");
  }
}

function finalLogLine(stage, status, summary, paths, date) {
  const target = paths.find(filePath => filePath !== stage.coverageLog) || "Codebase";
  return `* [${date}] [Stage ${stage.number}] ${status}: ${target} -- ${cleanSummary(summary)}`;
}

function finalizeCommand(repoRoot, stage, status, summary, dryRun, details = {}) {
  invariant(FINAL_STATUSES.has(status), `--status must be one of ${[...FINAL_STATUSES].join(", ")}.`);
  const normalizedSummary = cleanSummary(summary);
  const why = cleanPrDetail(details.why, defaultWhy(stage), "--why");
  const result = cleanPrDetail(details.result, defaultResult(status), "--result");
  const date = readOptional(path.join(contextDir(), "TODAY")) || utcDate();
  const paths = changedPaths(repoRoot);
  validateChangedPaths(stage, status, paths);

  const logPath = path.join(repoRoot, stage.coverageLog);
  const sentinel = sentinelLine(date, stage.number);
  const finalLine = finalLogLine(stage, status, normalizedSummary, paths, date);
  const replacement = replaceSentinel(readFileSync(logPath, "utf8"), sentinel, finalLine);

  const statePath = path.join(contextDir(), "session-state.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  invariant(!state.stage || state.stage === stage.number, "Session state belongs to a different stage.");
  const runId = state.runId || randomBytes(4).toString("hex");
  const prBody = renderPrBody(stage, status, normalizedSummary, paths, { why, result });
  const handoff = renderHandoff(stage, status, normalizedSummary, runId);

  if (dryRun) {
    console.log(JSON.stringify({ command: "finalize", dryRun: true, stage: stage.number, status, finalLine, why, result, paths }, null, 2));
    return;
  }

  if (replacement.changed) atomicWrite(logPath, replacement.content);
  invariant(
    !readFileSync(logPath, "utf8").includes(`[${date}] [Stage ${stage.number}] IN-PROGRESS:`),
    `Finalization left a current-cycle IN-PROGRESS sentinel in ${stage.coverageLog}.`,
  );
  atomicWrite(path.join(contextDir(), "pr-body.md"), prBody);
  atomicWrite(path.join(contextDir(), "final-handoff.txt"), handoff);
  atomicWrite(
    statePath,
    `${JSON.stringify({ ...state, stage: stage.number, runId, finalizedStatus: status, finalizedEpoch: epochSeconds() }, null, 2)}\n`,
  );
  console.log(handoff);
}

function wordCount(content) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function validatePrompt(repoRoot, stage) {
  const promptPath = path.join(repoRoot, stage.prompt);
  invariant(existsSync(promptPath), `Missing Stage ${stage.number} prompt: ${stage.prompt}`);
  const content = readFileSync(promptPath, "utf8");
  const limit = stage.number === 13 ? STAGE_13_WORD_LIMIT : WORD_LIMIT;
  const stageLabel = `S${String(stage.number).padStart(2, "0")}`;
  invariant(wordCount(content) <= limit, `Stage ${stage.number} prompt exceeds ${limit} words.`);
  invariant(
    content.includes(`# ${stageLabel}: ${stage.name}`),
    `Stage ${stage.number} prompt heading is incorrect.`,
  );
  invariant(new RegExp(`^stage:\\s*${stage.number}$`, "m").test(content), `Stage ${stage.number} front matter is incorrect.`);
  invariant(/^target branch:\s*Nightly$/m.test(content), `Stage ${stage.number} target branch is incorrect.`);
  invariant(content.includes(stage.coverageLog), `Stage ${stage.number} prompt omits its coverage log.`);
  invariant(
    content.includes(`node .github/scripts/nightly/nightly-stage.mjs start --stage ${stage.number}`),
    `Stage ${stage.number} prompt omits its start command.`,
  );
  invariant(!/git pull origin Nightly/i.test(content), `Stage ${stage.number} duplicates branch synchronization.`);
  invariant(
    content.includes(`node .github/scripts/nightly/nightly-stage.mjs budget --stage ${stage.number}`),
    `Stage ${stage.number} prompt omits its budget command.`,
  );
  invariant(
    content.includes(`node .github/scripts/nightly/nightly-stage.mjs finalize --stage ${stage.number}`),
    `Stage ${stage.number} prompt omits its finalize command.`,
  );
  invariant(
    content.includes(NIGHTLY_AGENT_CONTRACT_PATH),
    `Stage ${stage.number} prompt must defer shared behavior to ${NIGHTLY_AGENT_CONTRACT_PATH}.`,
  );
  invariant(!content.includes("## [Base "), `Stage ${stage.number} duplicates the shared Base contract.`);

  const forbiddenPatterns = [
    [/\bgit commit\b/i, "manual git commit"],
    [/\bgit push\b/i, "manual git push"],
    [/\bgh pr(?:\s+create)?\b/i, "manual PR creation"],
    [/PR Submission Retry/i, "PR submission retry"],
    [/Bypass Optional Review/i, "duplicated review-loop policy"],
    [/(?:read|load)[^\n]*(?:00-pr-history|00-pipeline-intelligence)[^\n]*in full/i, "unbounded shared-history read"],
    [/read all 13 prompt/i, "all-prompt read"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    invariant(!pattern.test(content), `Stage ${stage.number} contains ${label} instructions.`);
  }
  if (stage.number !== 1) {
    invariant(
      !/(?:write|append|update)[^\n.]*00-pr-history/i.test(content),
      `Stage ${stage.number} attempts to write successful PR history.`,
    );
  }
  if (stage.number === 12) {
    invariant(
      content.includes("/tmp/nightly/apk-ux-audit-status.txt") &&
        content.includes("/tmp/nightly/apk-ux-audit.json"),
      "Stage 12 prompt must consume the structured APK UX audit context.",
    );
  }
}

function validateBootstrap(repoRoot, registry) {
  const bootstrapPath = path.join(repoRoot, ".github/nightly-prompts/00-jules-bootstrap.md");
  const content = readFileSync(bootstrapPath, "utf8");
  invariant(content.includes("snapshot-lock.sha256"), "Bootstrap setup must record the lockfile fingerprint.");
  invariant(content.includes("snapshot-revision"), "Bootstrap setup must record the snapshot revision.");
  invariant(content.includes("git rev-parse --show-toplevel"), "Bootstrap setup must resolve the repository root dynamically.");
  invariant(content.includes('cd "$REPO_ROOT"'), "Bootstrap setup must execute from the resolved repository root.");
  invariant(content.includes("git pull --ff-only origin Nightly"), "Bootstrap setup must use a fast-forward-only pull.");
  invariant(content.includes("fold-state-status.txt"), "Bootstrap setup must seed fold-state status.");
  invariant(content.includes("apk-ux-audit-status.txt"), "Bootstrap setup must seed APK UX audit status.");
  invariant(content.includes("depcruise-state.txt"), "Bootstrap setup must seed dependency-cruiser status.");
  invariant(content.includes("clean-calibration.json"), "Bootstrap setup must seed CLEAN calibration status.");
  invariant(!content.includes("### Termination Contract"), "Bootstrap still contains the obsolete termination contract.");
  invariant(
    (content.match(/^### Completion Contract$/gm) || []).length === registry.stages.length,
    "Bootstrap must contain one completion contract per stage.",
  );

  const setupScript = content.match(/```bash\n([\s\S]*?)\n```/);
  invariant(setupScript, "Bootstrap setup script fence is missing.");
  const syntax = spawnSync("bash", ["-n"], { encoding: "utf8", input: setupScript[1] });
  invariant(syntax.status === 0, `Bootstrap setup script is invalid: ${String(syntax.stderr || "").trim()}`);

  for (const stage of registry.stages) {
    const stageLabel = `S${String(stage.number).padStart(2, "0")}`;
    invariant(
      content.includes(`## ${stageLabel}: ${stage.name}`),
      `Bootstrap omits ${stageLabel}: ${stage.name}.`,
    );
    invariant(content.includes(stage.prompt), `Bootstrap omits ${stage.prompt}.`);
    invariant(content.includes(stage.coverageLog), `Bootstrap omits ${stage.coverageLog}.`);
  }
}

function validateContracts(repoRoot, registry) {
  const misplacedNightlyScripts = readdirSync(path.join(repoRoot, ".github/scripts"), {
    withFileTypes: true,
  })
    .filter(
      entry =>
        entry.isFile() &&
        /^(?:nightly-|merge-nightly-|age[-_]pr[-_]history|append-pr-history|update-nightly-context)/.test(
          entry.name,
        ),
    )
    .map(entry => entry.name);
  invariant(
    misplacedNightlyScripts.length === 0,
    `Nightly-owned scripts must live in .github/scripts/nightly/: ${misplacedNightlyScripts.join(", ")}`,
  );

  for (const stage of registry.stages) validatePrompt(repoRoot, stage);
  validateBootstrap(repoRoot, registry);

  const loader = readFileSync(path.join(repoRoot, AGENT_LOADER_PATH), "utf8");
  invariant(
    loader.includes(NIGHTLY_AGENT_CONTRACT_PATH),
    `${AGENT_LOADER_PATH} must point to ${NIGHTLY_AGENT_CONTRACT_PATH}.`,
  );
  invariant(
    loader.includes("compatibility adapter for agent auto-discovery"),
    `${AGENT_LOADER_PATH} must remain a small auto-discovery adapter.`,
  );

  const contract = readFileSync(path.join(repoRoot, NIGHTLY_AGENT_CONTRACT_PATH), "utf8");
  invariant(
    contract.includes("native scheduled-task publisher"),
    `${NIGHTLY_AGENT_CONTRACT_PATH} must define native publication ownership.`,
  );
  invariant(
    contract.includes("git pull --ff-only"),
    `${NIGHTLY_AGENT_CONTRACT_PATH} must assign bounded branch synchronization to the lifecycle helper.`,
  );
  invariant(
    contract.includes("Missing tools, malformed output, unsupported input, timeouts"),
    `${NIGHTLY_AGENT_CONTRACT_PATH} must define degraded evidence handling.`,
  );
  invariant(
    contract.includes("Every finalization summary names the audited target, the verification method"),
    `${NIGHTLY_AGENT_CONTRACT_PATH} must define evidence-bearing summaries.`,
  );
  invariant(!/Skip PR on Zero-Diff/i.test(contract), `${NIGHTLY_AGENT_CONTRACT_PATH} still permits a no-PR outcome.`);
  invariant(!/\bgit commit\b/i.test(contract), `${NIGHTLY_AGENT_CONTRACT_PATH} still instructs manual commits.`);
  invariant(!/\bgit push\b/i.test(contract), `${NIGHTLY_AGENT_CONTRACT_PATH} still instructs manual pushes.`);

  const contextScript = readFileSync(path.join(repoRoot, ".github/scripts/nightly/update-nightly-context.sh"), "utf8");
  invariant(contextScript.includes("# BASELINE_TEST_STAGE=2"), "Context script lacks the Stage 2 policy marker.");
  invariant(contextScript.includes("# DEPENDENCY_CRUISER_STAGE=9"), "Context script lacks the Stage 9 policy marker.");
  invariant(contextScript.includes(".github/scripts/fold-state.mjs"), "Context script must use the SQL-aware fold-state checker.");
  invariant(contextScript.includes("migration-quality-status.txt"), "Context script must report migration-quality status.");
  invariant(contextScript.includes("database-verification-status.txt"), "Context script must report database-verification availability.");
  invariant(contextScript.includes("apk-ux-audit-status.txt"), "Context script must report APK UX audit status.");
  invariant(contextScript.includes(".github/scripts/audit-apk-ux.mjs"), "Context script must use the structured Stage 12 APK UX audit.");
  invariant(contextScript.includes(".github/scripts/nightly/nightly-clean-calibration.mjs"), "Context script must compute CLEAN calibration state.");
  invariant(contextScript.includes("clean-calibration.json"), "Context script must write CLEAN calibration JSON.");
  invariant(contextScript.includes("clean-calibration-due"), "Context script must report CLEAN calibration state in the toolchain manifest.");
  invariant(contextScript.includes('echo "DEGRADED" > "$CONTEXT_DIR/fold-state-status.txt"'), "Context script must preserve degraded fold state.");
  invariant(contextScript.includes('echo "SKIPPED" > "$CONTEXT_DIR/fold-state-status.txt"'), "Context script must report skipped fold scans.");
  invariant(contextScript.includes('echo "SKIPPED" > "$CONTEXT_DIR/depcruise-state.txt"'), "Context script must report skipped dependency scans.");

  const watchdogWorkflow = readFileSync(path.join(repoRoot, ".github/workflows/nightly-watchdog.yml"), "utf8");
  invariant(
    watchdogWorkflow.includes('cron: "35 0-12 * * *"'),
    "Nightly watchdog must keep the hourly stage-window recovery cadence.",
  );
  console.log("Nightly contracts validated: 13 stages, one lifecycle, zero duplicated Base contracts.");
}

export function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const { command, options } = parseCliArgs(argv);
  const repoRoot = findRepoRoot(cwd);
  const registry = loadRegistry(repoRoot);

  if (command === "validate") {
    invariant(options.size === 0, "validate does not accept options.");
    validateContracts(repoRoot, registry);
    return;
  }

  const stage = getStage(registry, options.get("stage"));
  const dryRun = options.get("dry-run") === true;
  if (command === "start") {
    invariant([...options.keys()].every(key => key === "stage" || key === "dry-run"), "start accepts only --stage and --dry-run.");
    startCommand(repoRoot, registry, stage, dryRun);
    return;
  }
  if (command === "budget") {
    invariant(options.size === 1, "budget accepts only --stage.");
    budgetCommand(stage);
    return;
  }
  if (command === "finalize") {
    invariant(
      [...options.keys()].every(key => ["stage", "status", "summary", "why", "result", "dry-run"].includes(key)),
      "finalize accepts only --stage, --status, --summary, --why, --result, and --dry-run.",
    );
    finalizeCommand(repoRoot, stage, options.get("status"), options.get("summary"), dryRun, {
      why: options.get("why"),
      result: options.get("result"),
    });
    return;
  }
  throw new Error("Usage: nightly-stage.mjs <start|budget|finalize|validate> [options]");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runCli();
  } catch (error) {
    console.error(`Nightly lifecycle error: ${error.message}`);
    process.exitCode = 1;
  }
}
