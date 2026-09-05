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
import { PLAIN_PREFIX, RESULT_LABEL, WHY_LABEL, changeLabel, countOf, displayArea } from "./nightly-prose.mjs";
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
    filePath === ".github/scripts/database/check-fold-state.py" ||
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

/**
 * What kind of thing each changed path is.
 *
 * The stage's own log directory is derived from its registry coverageLog
 * rather than named here, so moving the logs cannot silently reclassify every
 * run as a code change.
 */
export function classifyChangedPaths(stage, changedPaths) {
  const logDir = stage.coverageLog.slice(0, stage.coverageLog.lastIndexOf("/") + 1);
  const kinds = { log: [], test: [], docs: [], deps: [], code: [] };
  for (const filePath of changedPaths) {
    if (filePath.startsWith(logDir)) kinds.log.push(filePath);
    else if (/(^|\/)[^/]*-tests\//.test(filePath) || /\.(spec|test)\.[a-z]+$/.test(filePath)) kinds.test.push(filePath);
    else if (filePath.endsWith(".md")) kinds.docs.push(filePath);
    else if (/(^|\/)(pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json)$/.test(filePath)) kinds.deps.push(filePath);
    else kinds.code.push(filePath);
  }
  return kinds;
}

/**
 * One sentence telling a non-specialist what this pull request does to the
 * project.
 *
 * It is built ONLY from the status and the shape of the changed paths, never by
 * interpolating the free-text summary into a sentence frame. That restriction
 * is the entire point, and it fixes both defects of the paragraph it replaces:
 *
 * - Grammar. The old frame was `run focused on ${summary}`, and summaries are
 *   rarely noun phrases. Six of the ten well-formed bodies on 2026-09-03 read
 *   as broken English, including "run focused on harden useConnectionStatus"
 *   and "run focused on 43 candidate files, 0 dep-violations".
 * - Redundancy. The old paragraph restated the Change, Why and Result fields
 *   that are printed verbatim directly beneath it, so every body said the same
 *   thing twice in the rendered view.
 *
 * It therefore carries information found nowhere else in the body: whether
 * anything a user could notice actually changed. A test-only or docs-only diff
 * is the fact a reader most wants and the one the fields bury.
 */
export function renderPlainSummary(stage, status, changedPaths) {
  const kinds = classifyChangedPaths(stage, changedPaths);
  // The slug, not the domain: stages 10 and 11 share the domain "apk" and would
  // otherwise both report "checked the apk area".
  const area = displayArea(stage.slug);
  const touched = kinds.code.length + kinds.test.length + kinds.docs.length + kinds.deps.length;

  if (touched === 0) {
    if (status === "CLEAN") {
      return `${PLAIN_PREFIX}nothing needed fixing. This run checked the ${area} area and found it already correct, so the only file here is the log recording that the check happened.`;
    }
    return `${PLAIN_PREFIX}no change was made to the project. This run ended as ${status} and the only file here is the log recording that.`;
  }

  if (kinds.code.length === 0 && kinds.docs.length === 0 && kinds.deps.length === 0) {
    return `${PLAIN_PREFIX}this adds ${countOf(kinds.test, "test file")} in the ${area} area. No product code changed, so the app behaves exactly as it did before.`;
  }
  if (kinds.code.length === 0 && kinds.test.length === 0 && kinds.deps.length === 0) {
    return `${PLAIN_PREFIX}this is a documentation change to ${countOf(kinds.docs, "file")} in the ${area} area. Nothing about how the app runs is affected.`;
  }
  if (kinds.code.length === 0 && kinds.test.length === 0 && kinds.docs.length === 0) {
    return `${PLAIN_PREFIX}this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.`;
  }

  const parts = [
    kinds.code.length ? countOf(kinds.code, "code file") : null,
    kinds.docs.length ? countOf(kinds.docs, "documentation file") : null,
    kinds.deps.length ? countOf(kinds.deps, "dependency file") : null,
  ].filter(Boolean);
  const tests = kinds.test.length
    ? ` It also updates ${countOf(kinds.test, "test file")}.`
    : " No tests were added or changed alongside it.";
  // Deliberately no area clause here. Stage 6 is the TSDoc stage, so its diff is
  // a .ts file whose change is comments; "1 code file in the documentation area"
  // read as a contradiction. The hedge stays as "may be affected" rather than
  // being softened by the stage's mandate: the classifier can see that a source
  // file changed, it cannot see that the change was only comments, and trusting
  // the mandate over the diff is how a stage gets to assert its own safety.
  return `${PLAIN_PREFIX}this changes ${parts.join(" and ")}, so the app's behaviour may be affected.${tests}`;
}

export function renderPrBody(stage, status, summary, changedPaths, details = {}) {
  const normalizedSummary = cleanSummary(summary);
  const files = changedPaths.join(", ") || stage.coverageLog;
  const why = cleanPrDetail(details.why, defaultWhy(stage), "--why");
  const result = cleanPrDetail(details.result, defaultResult(status), "--result");
  const plain = renderPlainSummary(stage, status, changedPaths);

  return `### Nightly Stage ${stage.number}: ${stage.name}

**Status:** ${status}

${plain}

**${changeLabel(status)}:** ${normalizedSummary}

**${WHY_LABEL}:** ${why}

**${RESULT_LABEL}:** ${result}

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

/**
 * Composes the commit subject a stage suggests.
 *
 * Two defects lived in the one line this replaces,
 * `\`chore(${scope}): ${summary}\`.slice(0, 120)`, and both are visible in
 * git log today.
 *
 * A summary that already carried a conventional-commit prefix got a second one
 * bolted in front: 13 subjects on Nightly read `chore(docs): docs(tsdoc):
 * harden ...`. Stage prompts legitimately ask for a scoped summary, so the
 * prefix is stripped rather than the prompts being asked to stop producing it.
 *
 * And `.slice(120)` cut mid-word. 11 subjects sit exactly at the cap, including
 * `... migration-quality PASS, fold-stat`, which is `fold-state` with the last
 * two characters guillotined. Truncation now falls back to the last word
 * boundary and marks the cut with an ellipsis, so a reader can tell the
 * difference between a short summary and a severed one.
 */
export function composeCommitSubject(scope, summary, limit = 120) {
  // Strip one leading conventional-commit prefix, e.g. "docs(tsdoc): ".
  const withoutPrefix = String(summary).replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "").trim() || String(summary).trim();
  const subject = `chore(${scope}): ${withoutPrefix}`;
  if (subject.length <= limit) return subject;

  const head = subject.slice(0, limit - 1);
  const lastSpace = head.lastIndexOf(" ");
  // Only fall back to a word boundary if one exists late enough to keep the
  // subject meaningful; otherwise a hard cut is still better than nothing.
  const cut = lastSpace > `chore(${scope}): `.length ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,;:.-]+$/, "")}\u2026`;
}

/**
 * The block a stage returns as its final message.
 *
 * Jules' scheduled-task publisher uses the session's LAST MESSAGE as the pull
 * request description. The previous version of this function returned only
 * operational scaffolding, so that scaffolding became the public description of
 * real merged pull requests. PR #1657's entire body on GitHub reads "Suggested
 * branch: ...", "PR body: /tmp/nightly/pr-body.md", and "Do not run code
 * review, memory, reflection, git commit, or git push." Meanwhile the real body
 * renderPrBody composes was written to /tmp and read by nobody.
 *
 * The first fix put the instructions first and the body last, separated by a
 * marker, and asked the agent to return only what followed it. That comment
 * claimed the arrangement "can only improve the description, never break
 * publication". The 2026-09-03 run falsified it: 5 of 13 published bodies were
 * wrong, in three distinct ways. #1668 and #1675 published the marker line
 * itself. #1676 and #1677 discarded the template and ad-libbed a sentence.
 * #1674 published this file's own opening line, "Nightly Stage 8 finalized with
 * status CHANGED", while the stage had really bumped a dependency. The comment
 * had anticipated only the failure where an agent returns too MUCH, which is
 * harmless; every observed failure returned too LITTLE.
 *
 * The root cause is asking an agent to extract a document from a blob that also
 * addresses instructions to it. So this file no longer carries the body at all.
 * finalize already writes the body alone to /tmp/nightly/pr-body.md, and has
 * since before the marker existed; nothing pointed at it. The agent is now told
 * to return that file's contents, which makes two of the three failure modes
 * structurally impossible: there is no marker to leak, and the instructions
 * cannot be mistaken for the body because they are not in the same file.
 *
 * A stage that ignores the instruction entirely can still ad-lib. That is why
 * the watchdog now records whether a published body carried
 * NIGHTLY_PR_METADATA: the rate was invisible until someone read three PRs by
 * hand.
 */
export function renderHandoff(stage, status, summary, runId, bodyPath = prBodyPath()) {
  const normalizedSummary = cleanSummary(summary);
  const commitMessage = composeCommitSubject(stage.commitScope, normalizedSummary);
  return `Nightly Stage ${stage.number} is finalized with status ${status}.

Suggested branch: ${stage.branchPrefix}${runId}
Suggested commit: ${commitMessage}
PR base: Nightly
PR draft: false

A published Pull Request is the required outcome of this session, not an optional next step. If any distinct action, tool, or control is available to you to submit, complete, or hand off the session, separate from simply writing a message, invoke it now, because Jules' native scheduled-task publisher only creates the pull request once the session has actually, fully ended. Do not run code review, memory, reflection, git commit, or git push.

YOUR FINAL MESSAGE: return the exact contents of ${bodyPath}, and nothing else. Read that file and reproduce it verbatim. Do not summarize it, quote it, wrap it in anything, describe it, or add a single word before or after it. Do not return any part of THIS file: what you return becomes the pull request description, and this file is instructions, so returning it publishes the instructions instead of the description.
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

/**
 * The published pull request description, written alone so nothing has to be
 * extracted out of a document that also carries instructions.
 *
 * One helper rather than two literals: the handoff tells the agent to read this
 * exact path, and finalize writes it. A hardcoded "/tmp/nightly/pr-body.md"
 * would be wrong the moment NIGHTLY_CONTEXT_DIR is set, and would send the
 * agent to a file nothing had written.
 */
export function prBodyPath() {
  return path.join(contextDir(), "pr-body.md");
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

/**
 * The run window, as `[HH:MMZ-HH:MMZ NNm]`.
 *
 * The pipeline has always computed this and always thrown it away: `start`
 * stamps startEpoch, and budgetPhase compares elapsed against workBudgetMinutes
 * on every budget call, then reduces the whole thing to the word WORK or SUBMIT.
 * Nothing durable ever recorded when a stage ran or how long it took.
 *
 * That left the pipeline able to see only binary outcomes. A stage degrading
 * gets SLOWER before it fails, and a stage drifting from 20 minutes toward the
 * 45-minute budget was invisible until the night it breached and finalized
 * PARTIAL-RUN. This is the leading indicator that was missing.
 *
 * Deliberately NOT taken from Jules' own session timestamps: `updateTime` is
 * bulk-bumped, with 9 stages sharing one minute on 2026-08-29, which is what
 * produces the 1069.9-minute entries in the ledger. Those measure how long a
 * session object stayed alive, not how long the stage worked.
 */
export function formatRunWindow(startEpochSeconds, endEpochSeconds) {
  const start = Number(startEpochSeconds);
  const end = Number(endEpochSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const hhmm = epoch => new Date(epoch * 1000).toISOString().slice(11, 16);
  return `[${hhmm(start)}Z-${hhmm(end)}Z ${Math.round((end - start) / 60)}m]`;
}

function finalLogLine(stage, status, summary, paths, date, window) {
  const target = paths.find(filePath => filePath !== stage.coverageLog) || "Codebase";
  // The window sits in the bracket run, never in the ` -- ` payload, because the
  // recap splits that payload into target and summary. Optional so every line
  // written before this existed still parses.
  const timing = window ? `${window} ` : "";
  return `* [${date}] [Stage ${stage.number}] ${timing}${status}: ${target} -- ${cleanSummary(summary)}`;
}

function finalizeCommand(repoRoot, stage, status, summary, dryRun, details = {}) {
  invariant(FINAL_STATUSES.has(status), `--status must be one of ${[...FINAL_STATUSES].join(", ")}.`);
  const normalizedSummary = cleanSummary(summary);
  const why = cleanPrDetail(details.why, defaultWhy(stage), "--why");
  const result = cleanPrDetail(details.result, defaultResult(status), "--result");
  const date = readOptional(path.join(contextDir(), "TODAY")) || utcDate();
  const paths = changedPaths(repoRoot);
  validateChangedPaths(stage, status, paths);

  const statePath = path.join(contextDir(), "session-state.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};

  const logPath = path.join(repoRoot, stage.coverageLog);
  const sentinel = sentinelLine(date, stage.number);
  // A run whose state file is missing still finalizes, just without a window.
  // Losing the metric must never cost the stage its output.
  const window = formatRunWindow(state.startEpoch, epochSeconds());
  const finalLine = finalLogLine(stage, status, normalizedSummary, paths, date, window);
  const replacement = replaceSentinel(readFileSync(logPath, "utf8"), sentinel, finalLine);
  invariant(!state.stage || state.stage === stage.number, "Session state belongs to a different stage.");
  const runId = state.runId || randomBytes(4).toString("hex");
  const prBody = renderPrBody(stage, status, normalizedSummary, paths, { why, result });
  // The handoff no longer carries the body, only the path to it.
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
  atomicWrite(prBodyPath(), prBody);
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
  if ([1, 3, 4, 7, 9, 10, 11, 12].includes(stage.number)) {
    invariant(
      content.includes("CLEAN Evidence Floor"),
      `Stage ${stage.number} prompt must define its CLEAN evidence floor.`,
    );
  }
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
  const allowedRootEntries = new Set(["agents", "android", "database", "nightly", "project", "tsconfig.json"]);
  const unexpectedRootEntries = readdirSync(path.join(repoRoot, ".github/scripts"), {
    withFileTypes: true,
  })
    .filter(entry => !entry.name.startsWith(".") && !allowedRootEntries.has(entry.name))
    .map(entry => entry.name);
  invariant(
    unexpectedRootEntries.length === 0,
    `Scripts must live in a domain folder under .github/scripts/: ${unexpectedRootEntries.join(", ")}`,
  );

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
  invariant(contextScript.includes(".github/scripts/database/fold-state.mjs"), "Context script must use the SQL-aware fold-state checker.");
  invariant(contextScript.includes("migration-quality-status.txt"), "Context script must report migration-quality status.");
  invariant(contextScript.includes("database-verification-status.txt"), "Context script must report database-verification availability.");
  invariant(contextScript.includes("apk-ux-audit-status.txt"), "Context script must report APK UX audit status.");
  invariant(contextScript.includes(".github/scripts/android/audit-apk-ux.mjs"), "Context script must use the structured Stage 12 APK UX audit.");
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
