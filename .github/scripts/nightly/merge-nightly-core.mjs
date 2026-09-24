// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: NIGHTLY MERGE CORE
 * ----------------------------------------------------------------------------
 * Dependency-free ESM coordinator for the Jules nightly PR stream.
 *
 * Responsibilities:
 * - retarget nightly stage PRs to Nightly when needed
 * - merge allowed stage PRs in stage order, once the regression gate has
 *   judged them (an unfinished gate defers the PR to the next pass)
 * - recover known shared-log conflicts where possible
 * - tag successful stage merges as durable history facts
 * - compile recent tag facts into 00-pr-history.md
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { FAILURE_CLASSES, loadLedger, saveLedger, upsertStageEntry } from "./nightly-ledger.mjs";
import { NIGHTLY_EVENT_SOURCES } from "./nightly-events.mjs";
import { METADATA_PLACEHOLDERS, TAG_PLACEHOLDERS, isPlaceholderField } from "./nightly-prose.mjs";
import { prBodySidecarPath } from "./nightly-stage.mjs";

export const CONFIG = {
  owner: process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "",
  repo: process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "",
  targetBranch: "Nightly",
  // github-actions is required for the watchdog's fallback publisher: when a
  // stranded stage's work is published by this repository's own workflow rather
  // than by Jules, the pull request is authored by github-actions[bot], and an
  // unallowlisted author is classified as rejected and never merged. Widening
  // this does not widen what such a pull request may contain: it must still sit
  // on a `nightly/stage-N-` branch and its diff is validated against that
  // stage's write boundary before it is ever pushed.
  allowedAuthors: ["google-labs-jules", "AlbiDR", "github-actions"],
  token: process.env.GITHUB_TOKEN ?? "",
  julesApiKey: process.env.JULES_API_KEY ?? "",
  changelogPath: path.join(".github", "nightly-logs", "00-pr-history.md"),
  ledgerPath: path.join(".github", "nightly-logs", "nightly-run-ledger.json"),
  registryPath: path.join(".github", "nightly-config", "stages.json"),
  historyLookbackDays: 7,
};

const SECOND_PASS_SETTLE_MS = 15_000;
const FIRST_PASS_MERGEABLE_POLLS = 5;
const SECOND_PASS_MERGEABLE_POLLS = 8;
const MERGE_ATTEMPTS = 8;
const TAG_SPECIFICITY = {
  legacy: 0,
  prScoped: 1,
};

function log(msg, type = "info") {
  const labels = { info: "[INFO]   ", warn: "[NOTICE] ", error: "[FAIL]   ", success: "[DONE]   " };
  console.log(`${new Date().toISOString()} ${labels[type] ?? "[INFO]   "} ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function redactCommand(args) {
  return args.map(arg => String(arg).replace(/x-access-token:[^@]+@/g, "x-access-token:***@")).join(" ");
}

export function runCmd(args, options = {}) {
  const { allowFailure = false, cwd = process.cwd() } = options;
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (res.status !== 0 && !allowFailure) {
    const detail = (res.stderr || res.stdout || "").trim();
    throw new Error(`git ${redactCommand(args)} failed${detail ? `: ${detail}` : ""}`);
  }

  return {
    ok: res.status === 0,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
    status: res.status ?? 1,
  };
}

function gitStdout(args, options = {}) {
  return runCmd(args, options).stdout;
}

export function configureGitActor() {
  runCmd(["config", "user.name", "github-actions[bot]"]);
  runCmd(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);
}

export function parseStageBranch(ref) {
  const match = String(ref || "").match(/^nightly(?:\/|-)?stage-(\d+)(?:-|$)/i);
  if (!match) return null;
  return {
    stage: Number.parseInt(match[1], 10),
    ref,
  };
}

export function stageNumber(ref) {
  return parseStageBranch(ref)?.stage ?? 999;
}

function loadStageRegistry(config = CONFIG) {
  const registry = JSON.parse(fs.readFileSync(config.registryPath, "utf8"));
  if (!Array.isArray(registry.stages) || registry.stages.length !== 13) {
    throw new Error("Nightly stage registry must define 13 stages.");
  }
  return registry;
}

function stageFromCoverageLog(registry, filePath) {
  return registry.stages.find(stage => stage.coverageLog === filePath) || null;
}

export function inferStageFromChangedFiles(pr, registry) {
  const files = (pr?.files || pr?.changedFiles || []).map(file => {
    if (typeof file === "string") return file;
    return file?.filename || file?.path || "";
  }).filter(Boolean);
  const matchedStages = files
    .map(file => stageFromCoverageLog(registry, file))
    .filter(Boolean);
  const uniqueStageNumbers = [...new Set(matchedStages.map(stage => stage.number))];

  if (uniqueStageNumbers.length === 1) {
    return {
      ok: true,
      stage: uniqueStageNumbers[0],
      source: "coverage-log",
      files,
    };
  }
  if (uniqueStageNumbers.length > 1) {
    return {
      ok: false,
      reason: `multiple stage coverage logs changed: ${uniqueStageNumbers.join(", ")}`,
      files,
    };
  }
  return {
    ok: false,
    reason: "no registered stage coverage log changed",
    files,
  };
}

export function parseStageTag(tag) {
  const match = String(tag || "").match(/^nightly\/(\d{4}-\d{2}-\d{2})\/stage-(\d+)(?:\/pr-(\d+))?$/);
  if (!match) return null;
  return {
    date: match[1],
    stage: Number.parseInt(match[2], 10),
    prNum: match[3] ? `#${match[3]}` : null,
    specificity: match[3] ? TAG_SPECIFICITY.prScoped : TAG_SPECIFICITY.legacy,
    tag,
  };
}

export function isAllowedAuthor(login, allowedAuthors = CONFIG.allowedAuthors) {
  const normalized = String(login || "").toLowerCase();
  return allowedAuthors.some(author => {
    const expected = author.toLowerCase();
    return normalized === expected || normalized === `${expected}[bot]`;
  });
}

export function isNightlyStagePr(pr, config = CONFIG) {
  return (
    isAllowedAuthor(pr?.user?.login, config.allowedAuthors) &&
    pr?.base?.ref === config.targetBranch &&
    parseStageBranch(pr?.head?.ref) !== null
  );
}

export function classifyNightlyPr(pr, registry, config = CONFIG) {
  const allowed = isAllowedAuthor(pr?.user?.login, config.allowedAuthors);
  const isTargetBranch = pr?.base?.ref === config.targetBranch;
  const parsed = parseStageBranch(pr?.head?.ref);

  if (!isTargetBranch) {
    return { kind: "ignored", stage: null, reason: `base '${pr?.base?.ref}' is not ${config.targetBranch}` };
  }
  if (!allowed) {
    return { kind: "rejected", stage: null, reason: `author '${pr?.user?.login || "unknown"}' is not allowlisted` };
  }
  if (parsed) {
    return { kind: "canonical", stage: parsed.stage, reason: "canonical nightly stage branch" };
  }

  const inferred = inferStageFromChangedFiles(pr, registry);
  if (inferred.ok) {
    return {
      kind: "inferred",
      stage: inferred.stage,
      reason: `inferred Stage ${inferred.stage} from ${inferred.source}`,
      files: inferred.files,
    };
  }

  return {
    kind: "blocked",
    stage: null,
    reason: inferred.reason,
    files: inferred.files,
  };
}

function prStageNumber(pr) {
  return pr.nightlyClassification?.stage ?? stageNumber(pr.head.ref);
}

export function sortStagePrs(prs) {
  return [...prs].sort((a, b) => {
    const diff = prStageNumber(a) - prStageNumber(b);
    return diff !== 0 ? diff : a.number - b.number;
  });
}

function validateStageBranch(ref, stageOverride = null) {
  if (stageOverride) {
    return { stage: stageOverride, ref };
  }
  const parsed = parseStageBranch(ref);
  if (!parsed) {
    throw new Error(`Ref '${ref}' is not a valid nightly stage branch.`);
  }
  return parsed;
}

export function summarizeFiles(filePaths) {
  if (!filePaths || filePaths.length === 0) return "codebase";
  if (filePaths.length <= 5) return filePaths.join(", ");

  const dirs = new Set();
  for (const filePath of filePaths) {
    const parts = filePath.split("/");
    dirs.add(parts.length > 1 ? parts.slice(0, -1).join("/") : filePath);
  }
  return Array.from(dirs).slice(0, 3).map(dir => `${dir}/*`).join(", ") + ` (${filePaths.length} files)`;
}

export function extractMetadata(pr) {
  const body = pr?.body || "";
  const metaMatch = body.match(/NIGHTLY_PR_METADATA:\s*([\s\S]*?)-->/i);

  // Placeholders, not statements. Shared with the recap, which has to be able to
  // tell one from the other before printing a field as a stage's own words.
  const meta = {
    domain: METADATA_PLACEHOLDERS.domain,
    why: METADATA_PLACEHOLDERS.why,
    change: pr?.title || METADATA_PLACEHOLDERS.change,
    result: METADATA_PLACEHOLDERS.result,
    files: METADATA_PLACEHOLDERS.files,
    // The one field with NO placeholder, on purpose. Every other default here
    // stands in for something a stage failed to say; this one records whether
    // anybody looked, so inventing a value for it would destroy the only thing
    // it carries. Null means unmeasured and must stay distinguishable from "0".
    nudges: null,
    // The Jules checkout that executed the stage. Unlike the merge commit, it
    // identifies the code the agent inspected before it created its change.
    execution: null,
  };

  if (metaMatch) {
    for (const line of metaMatch[1].split("\n")) {
      const match = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (key in meta) meta[key] = value;
    }
    // Kept as a STRING rather than a number, and this is load-bearing:
    // isPlaceholderField tests `String(value || "")`, under which the number 0
    // is empty and therefore a placeholder, so a measured zero would be
    // discarded by preferStatedMetadata as though nobody had recorded it. "0"
    // survives that test. Anything not a plain count reverts to unmeasured,
    // because a malformed value is not evidence of zero nudges.
    meta.nudges = /^\d+$/.test(String(meta.nudges ?? "")) ? String(meta.nudges) : null;
    meta.execution = /^[a-f0-9]{7,64}$/i.test(String(meta.execution || "")) ? String(meta.execution) : null;
    return meta;
  }

  const whyMatch = body.match(/\*\*\[Why\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Reasoning\]\*\*:\s*([^\n]+)/i);
  const changeMatch = body.match(/\*\*\[Change\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Changes\]\*\*:\s*([^\n]+)/i);
  const resultMatch = body.match(/\*\*\[Result\]\*\*:\s*([^\n]+)/i) || body.match(/\*\*\[Verification\]\*\*:\s*([^\n]+)/i);
  if (whyMatch) meta.why = whyMatch[1].trim();
  if (changeMatch) meta.change = changeMatch[1].trim();
  if (resultMatch) meta.result = resultMatch[1].trim();

  return meta;
}

function sanitizeTagValue(value) {
  return String(value || "").replace(/[\x00-\x1F\x7F]/g, " ").trim();
}

export function parseTagContent(tagContent) {
  const parsed = {
    prNum: "PENDING",
    domain: TAG_PLACEHOLDERS.domain,
    files: TAG_PLACEHOLDERS.files,
    why: TAG_PLACEHOLDERS.why,
    change: TAG_PLACEHOLDERS.change,
    result: TAG_PLACEHOLDERS.result,
    // No placeholder: unmeasured must stay distinguishable from a measured 0.
    nudges: null,
    execution: null,
  };

  for (const line of String(tagContent || "").split("\n")) {
    if (line.startsWith("PR:")) parsed.prNum = line.replace("PR:", "").trim();
    if (line.startsWith("Domain:")) parsed.domain = line.replace("Domain:", "").trim();
    if (line.startsWith("Files:")) parsed.files = line.replace("Files:", "").trim();
    if (line.startsWith("Why:")) parsed.why = line.replace("Why:", "").trim();
    if (line.startsWith("Change:")) parsed.change = line.replace("Change:", "").trim();
    if (line.startsWith("Result:")) parsed.result = line.replace("Result:", "").trim();
    if (line.startsWith("Nudges:")) {
      const raw = line.replace("Nudges:", "").trim();
      // A malformed value reverts to unmeasured. It is not evidence of zero.
      parsed.nudges = /^\d+$/.test(raw) ? raw : null;
    }
    if (line.startsWith("Execution:")) {
      const raw = line.replace("Execution:", "").trim();
      parsed.execution = /^[a-f0-9]{7,64}$/i.test(raw) ? raw : null;
    }
  }

  return parsed;
}

function normalizePrNum(value) {
  const match = String(value || "").trim().match(/^#?(\d+)$/);
  return match ? `#${match[1]}` : "PENDING";
}

function prSortNumber(prNum) {
  const match = String(prNum || "").match(/#(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

export function renderHistoryBlock({ date, stage, prNum, domain, commitSha, prUrl, files, why, change, result, nudges = null }) {
  if (!prNum || prNum === "PENDING") {
    throw new Error("Cannot render finalized PR history without a PR number.");
  }
  if (!commitSha || commitSha === "PENDING") {
    throw new Error(`Cannot render finalized PR history for ${prNum} without a commit SHA.`);
  }
  if (!prUrl || prUrl.includes("PENDING")) {
    throw new Error(`Cannot render finalized PR history for ${prNum} without a PR URL.`);
  }

  return `### [${date}] PR ${prNum} [Stage ${stage}]: ${change}\n` +
    `**Domain:** ${domain} | **Commit:** ${commitSha} | [View PR](${prUrl})\n` +
    `**Files:** ${files}\n` +
    `**Why:** ${why}\n` +
    `**Change:** ${change}\n` +
    `**Result:** ${result}` +
    // Appended rather than interleaved so every entry written before this field
    // existed still parses unchanged, and omitted when unmeasured so an old
    // entry is never read as a measured zero.
    (/^\d+$/.test(String(nudges ?? "")) ? `\n**Nudges:** ${nudges}` : "");
}

export function getRecentDateStrings(days, now = new Date()) {
  const dates = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

async function githubApi(endpoint, method = "GET", body = null, isGraphQL = false, config = CONFIG) {
  const url = isGraphQL ? "https://api.github.com/graphql" : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "User-Agent": "Clash-Manager-Automation",
      Accept: isGraphQL ? "application/json" : "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
    error.status = res.status;
    error.responseText = text;
    throw error;
  }

  return res.json();
}

async function markReadyForReview(nodeId, config = CONFIG) {
  const query = `
    mutation($id: ID!) {
      markPullRequestReadyForReview(input: {pullRequestId: $id}) {
        pullRequest { id isDraft }
      }
    }
  `;
  const res = await githubApi("", "POST", { query, variables: { id: nodeId } }, true, config);
  if (res.errors) throw new Error(res.errors.map(error => error.message).join(", "));
}

export function isRetryableMergeError(error) {
  if (!error) return false;
  if (error.status === 405 || error.status === 409) return true;
  if (error.status === 502 || error.status === 503 || error.status === 504) return true;
  if (error.status !== 422) return false;

  const text = String(error.responseText || error.message || "").toLowerCase();
  return text.includes("secondary rate") ||
    text.includes("rate limit") ||
    text.includes("try again") ||
    text.includes("spam") ||
    text.includes("endpoint has been spammed");
}

export function isShaMismatch(error) {
  const text = String(error?.responseText || error?.message || "").toLowerCase();
  return error?.status === 409 && (text.includes("head") || text.includes("sha") || text.includes("does not match"));
}

async function fetchAllPullRequests(config = CONFIG) {
  const prs = [];
  let page = 1;
  while (true) {
    const pagePrs = await githubApi(
      `/repos/${config.owner}/${config.repo}/pulls?state=open&per_page=100&page=${page}`,
      "GET",
      null,
      false,
      config,
    );
    if (pagePrs.length === 0) break;
    prs.push(...pagePrs);
    page++;
  }
  return prs;
}

async function fetchPullRequestFiles(prNumber, config = CONFIG) {
  const files = [];
  let page = 1;
  while (true) {
    const pageFiles = await githubApi(
      `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      "GET",
      null,
      false,
      config,
    );
    if (pageFiles.length === 0) break;
    files.push(...pageFiles.map(file => file.filename).filter(Boolean));
    page++;
  }
  return files;
}

async function attachChangedFiles(prs, config = CONFIG) {
  for (const pr of prs) {
    if (!isAllowedAuthor(pr?.user?.login, config.allowedAuthors) || pr?.base?.ref !== config.targetBranch) continue;
    try {
      pr.files = await fetchPullRequestFiles(pr.number, config);
    } catch (error) {
      log(`Failed to fetch changed files for PR #${pr.number}: ${error.message}`, "warn");
      pr.files = [];
      pr.fileFetchError = error.message;
    }
  }
  return prs;
}

async function retargetNightlyPrs(prs, config = CONFIG) {
  for (const pr of prs) {
    const allowed = isAllowedAuthor(pr.user.login, config.allowedAuthors);
    const isNightlyBranch = parseStageBranch(pr.head.ref) !== null;
    const isWrongBase = pr.base.ref !== config.targetBranch;

    if (allowed && isNightlyBranch && isWrongBase) {
      log(`Detected PR #${pr.number} targeting '${pr.base.ref}' instead of '${config.targetBranch}'. Auto-retargeting...`);
      try {
        await githubApi(`/repos/${config.owner}/${config.repo}/pulls/${pr.number}`, "PATCH", { base: config.targetBranch }, false, config);
        pr.base.ref = config.targetBranch;
        log(`PR #${pr.number} successfully retargeted to '${config.targetBranch}'.`, "success");
      } catch (error) {
        log(`Failed to retarget PR #${pr.number}: ${error.message}`, "error");
      }
    }
  }
}

export function getMergeTargets(prs, registry, config = CONFIG) {
  return sortStagePrs(prs.filter(pr => {
    const classification = pr.nightlyClassification || classifyNightlyPr(pr, registry, config);
    pr.nightlyClassification = classification;

    if (classification.kind === "rejected") {
      log(`Skipping PR #${pr.number} -- ${classification.reason}.`, "warn");
    }
    if (classification.kind === "blocked") {
      log(`Blocking PR #${pr.number} -- head '${pr.head.ref}' cannot be classified: ${classification.reason}.`, "error");
    }
    return classification.kind === "canonical" || classification.kind === "inferred";
  }));
}

export function getRejectedNightlyPrs(prs, registry, config = CONFIG) {
  return prs
    .map(pr => ({ pr, classification: pr.nightlyClassification || classifyNightlyPr(pr, registry, config) }))
    .filter(({ classification }) => classification.kind === "blocked")
    .map(({ pr, classification }) => {
      pr.nightlyClassification = classification;
      return pr;
    });
}

async function pollMergeable(prNumber, maxPolls, config = CONFIG) {
  let details = await githubApi(`/repos/${config.owner}/${config.repo}/pulls/${prNumber}`, "GET", null, false, config);
  let polls = 0;
  while (details.mergeable === null && polls < maxPolls) {
    log(`Waiting for mergeability on PR #${prNumber} (${polls + 1}/${maxPolls})...`);
    await sleep(5_000);
    details = await githubApi(`/repos/${config.owner}/${config.repo}/pulls/${prNumber}`, "GET", null, false, config);
    polls++;
  }
  return details;
}

function buildRepoUrl(config = CONFIG) {
  return `https://x-access-token:${config.token}@github.com/${config.owner}/${config.repo}.git`;
}

function syncTargetBranch(config = CONFIG) {
  runCmd(["fetch", "origin", config.targetBranch]);
  runCmd(["checkout", config.targetBranch]);
  runCmd(["reset", "--hard", `origin/${config.targetBranch}`]);
}

function ensureCommitAvailable(commitSha, config = CONFIG) {
  const verify = runCmd(["rev-parse", "--verify", `${commitSha}^{commit}`], { allowFailure: true });
  if (verify.ok) return;

  log(`Commit ${commitSha} is not present locally. Fetching ${config.targetBranch} before tagging...`, "warn");
  syncTargetBranch(config);

  const retry = runCmd(["rev-parse", "--verify", `${commitSha}^{commit}`], { allowFailure: true });
  if (!retry.ok) {
    throw new Error(`Commit ${commitSha} is still unavailable after fetching ${config.targetBranch}.`);
  }
}

function tagCommit(tagName) {
  const res = runCmd(["rev-parse", "--verify", `${tagName}^{commit}`], { allowFailure: true });
  return res.ok ? res.stdout : "";
}

export function classifyTagCreation(existingCommit, expectedCommit) {
  if (!existingCommit) return "create";
  return existingCommit === expectedCommit ? "exists-matching" : "exists-conflicting";
}

/** Reads one path out of one commit, or returns "" when it is not there. */
function defaultSidecarReader(squashSha, filePath) {
  return runCmd(["show", `${squashSha}:${filePath}`], { allowFailure: true }).stdout;
}

/**
 * The description a stage committed for itself, read out of the merged commit.
 *
 * WHY THIS IS PREFERRED OVER THE PULL REQUEST BODY
 * The body reaches GitHub through the agent's final message. When the agent
 * ad-libs it, extractMetadata finds no NIGHTLY_PR_METADATA block and
 * substitutes a placeholder for every field, and those placeholders are then
 * baked into the annotated tag below and read back out by parseTagContent into
 * the permanent history block. 75 of 116 Result fields in the committed history
 * hold a placeholder standing in for words nobody ever saw.
 *
 * Repairing the body afterwards cannot reach any of that, because everything
 * downstream is write-once: a tag that already exists is left unchanged by
 * classifyTagCreation, and insertHistoryBlocks skips any pull request number
 * already in the file. So the fix has to happen here, at the one moment the
 * record is written, and it can: the sidecar is inside `squashSha` by
 * definition, since it was committed by the same finalize that produced the
 * work being merged. Preferring it removes the dependency on an agent copying
 * a file rather than working around it, and nothing needs repairing later
 * because nothing wrong is written in the first place.
 *
 * Returns null rather than throwing for every absence: a stage that failed
 * before finalize, a run predating the sidecar, or a registry without the
 * stage all have to fall back to the body rather than lose their tag.
 */
export function readSidecarMetadata(squashSha, registryStage, mergedPaths, readFile = defaultSidecarReader) {
  if (!registryStage) return null;
  const sidecar = prBodySidecarPath(registryStage);

  // The gate, and the whole reason this takes the merged file list. A stage
  // overwrites its own sidecar every night at a path fixed by the registry, so
  // the file exists in this commit's TREE whether or not this run wrote it: any
  // merge inherits the previous run's copy from the base branch. Reading it
  // unconditionally would attach last night's Why and Result to tonight's
  // record for every run predating the sidecar and every stage that failed
  // before finalize, which is worse than a placeholder. A generic sentence is
  // merely uninformative; a specific one about the wrong run is a confident
  // false claim, and nothing downstream could ever tell.
  //
  // Requiring the merged commit to have MODIFIED the sidecar is a fact about
  // the commit rather than a guess about its contents, so it cannot be fooled.
  if (!mergedPaths.includes(sidecar)) return null;

  const body = readFile(squashSha, sidecar);
  if (!body) return null;
  return { meta: extractMetadata({ body }), path: sidecar };
}

/** The registry entry for a stage number, or null if it cannot be read. */
function registryStageFor(stageNum, config = CONFIG) {
  try {
    return loadStageRegistry(config).stages.find(entry => entry.number === stageNum) || null;
  } catch (error) {
    log(`Could not load the stage registry for stage ${stageNum}: ${error.message}`, "warn");
    return null;
  }
}

/**
 * Which of a description's fields hold something a stage actually said.
 *
 * Files and Domain are excluded deliberately. Both are derived by the pipeline
 * from the diff and the registry rather than authored, so a real value in
 * either says nothing about whether the stage described its own work, and
 * counting them would mask the case this exists to detect.
 */
export function statedFields(meta, stage = null) {
  return ["why", "change", "result"].filter(field => !isPlaceholderField(field, meta?.[field], stage));
}

/**
 * The better of two readings of the same description, field by field.
 *
 * Wholesale preference for the sidecar would be correct today, because the body
 * is a copy of it and can only be equal or worse. This is deliberately
 * narrower: a field is taken from the sidecar unless doing so would replace
 * something a stage said with a placeholder. The record can therefore only ever
 * improve, whatever later happens to either source, which is the one property
 * worth guaranteeing about a write that cannot be revisited.
 *
 * Never throws. This runs inside the merge coordinator, and a tag lost to an
 * assertion about its own metadata would cost more than a generic field.
 */
export function preferStatedMetadata(sidecarMeta, bodyMeta, stage = null) {
  const merged = { ...bodyMeta };
  const upgraded = [];
  for (const field of Object.keys(merged)) {
    const candidate = sidecarMeta?.[field];
    if (candidate === undefined) continue;
    const candidateIsPlaceholder = isPlaceholderField(field, candidate, stage);
    const currentIsPlaceholder = isPlaceholderField(field, merged[field], stage);
    if (candidateIsPlaceholder && !currentIsPlaceholder) continue;
    if (candidate === merged[field]) continue;
    merged[field] = candidate;
    if (currentIsPlaceholder && !candidateIsPlaceholder) upgraded.push(field);
  }
  return { meta: merged, upgraded };
}

function createStageTag(pr, squashSha, config = CONFIG, stageOverride = null) {
  const date = new Date().toISOString().split("T")[0];
  const stage = validateStageBranch(pr.head.ref, stageOverride).stage;
  const bodyMeta = extractMetadata(pr);

  // Fetching the commit comes FIRST. Everything below reads from it, and a
  // `git show` against a commit this clone has not fetched fails in exactly the
  // way an absent sidecar does, which would silently drop every recovery on a
  // shallow runner.
  let fileList = [];
  try {
    ensureCommitAvailable(squashSha, config);
    fileList = gitStdout(["diff-tree", "--no-commit-id", "--name-only", "-r", squashSha]).split("\n").filter(Boolean);
  } catch (error) {
    log(`Failed to prepare commit ${squashSha} for tagging: ${error.message}`, "warn");
    return;
  }

  // The registry entry, not just the number: placeholderWhy interpolates the
  // slug, so recognising the stage runner's own why placeholder needs both.
  const registryStage = registryStageFor(stage, config);
  const sidecar = readSidecarMetadata(squashSha, registryStage, fileList);
  const { meta, upgraded } = preferStatedMetadata(sidecar?.meta, bodyMeta, registryStage);

  // The diff is ground truth for Files and outranks both descriptions, so it is
  // applied last and dropped from the recovery report: a field about to be
  // overwritten was not recovered from anything.
  if (fileList.length > 0) meta.files = summarizeFiles(fileList);
  const recovered = fileList.length > 0 ? upgraded.filter(field => field !== "files") : upgraded;

  // Three outcomes, and they are three different facts about the pipeline, so
  // none of them is allowed to be silent. The version of this that logged only
  // recoveries left the most serious case saying nothing at all.
  if (!sidecar) {
    // Not a defect. Every run predating the sidecar, and any stage that fails
    // before finalize, arrives here and correctly keeps its published wording.
    log(`No body sidecar written by ${squashSha} for stage ${stage}; using the published description.`, "info");
  } else if (recovered.length > 0) {
    // A published description damaged in transit, caught before it became
    // permanent. This is the case the sidecar exists for.
    log(`Recovered ${recovered.join(", ")} for PR #${pr.number} from ${sidecar.path}; the published description had lost them.`, "success");
  } else if (statedFields(sidecar.meta, registryStage).length === 0) {
    // The serious one, and the reason this branch is separate. finalize DID run
    // and DID commit a description, and it still contains nothing a stage said.
    // That is not a transport failure the sidecar can fix, it is a stage
    // finalizing without passing its own --why and --result, which is a prompt
    // problem and needs a person. Distinguishing it from the case above matters:
    // both leave the record generic, and only one of them is fixable here.
    log(`Stage ${stage} committed a body sidecar with no stated Why or Result (PR #${pr.number}); the record stays generic because finalize was given nothing to record.`, "warn");
  }

  const tagName = `nightly/${date}/stage-${stage}/pr-${pr.number}`;
  const diagnostics = [
    ["Run-ID", process.env.GITHUB_RUN_ID],
    ["Run-Number", process.env.GITHUB_RUN_NUMBER],
    ["Run-Attempt", process.env.GITHUB_RUN_ATTEMPT],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${sanitizeTagValue(value)}`);
  const tagMsg = [
    `PR: #${pr.number}`,
    `Domain: ${sanitizeTagValue(meta.domain)}`,
    `Files: ${sanitizeTagValue(meta.files)}`,
    `Why: ${sanitizeTagValue(meta.why)}`,
    `Change: ${sanitizeTagValue(meta.change)}`,
    `Result: ${sanitizeTagValue(meta.result)}`,
    // Conditional, so a tag written for a run that never measured this carries
    // no line at all rather than a fabricated zero.
    ...(/^\d+$/.test(String(meta.nudges ?? "")) ? [`Nudges: ${sanitizeTagValue(meta.nudges)}`] : []),
    ...(meta.execution ? [`Execution: ${sanitizeTagValue(meta.execution)}`] : []),
    ...diagnostics,
  ].join("\n");

  const existingCommit = tagCommit(tagName);
  const expectedCommit = tagCommit(squashSha);
  const tagAction = classifyTagCreation(existingCommit, expectedCommit);
  if (tagAction !== "create") {
    if (tagAction === "exists-matching") {
      log(`Tag ${tagName} already points to ${squashSha}.`, "info");
      return;
    }
    log(`Tag ${tagName} already exists but points to ${existingCommit}, not ${squashSha}. Leaving it unchanged.`, "warn");
    return;
  }

  const tagMsgFile = path.join(os.tmpdir(), `nightly-tag-msg-${stage}-${pr.number}-${process.pid}.txt`);
  try {
    fs.writeFileSync(tagMsgFile, tagMsg, "utf8");
    configureGitActor();
    runCmd(["tag", "-a", tagName, "-F", tagMsgFile, squashSha]);
    runCmd(["push", buildRepoUrl(config), `refs/tags/${tagName}`]);
    log(`Created and pushed tag ${tagName} for PR #${pr.number}.`, "success");
  } catch (error) {
    log(`Failed to create tag ${tagName}: ${error.message}`, "warn");
  } finally {
    try {
      fs.unlinkSync(tagMsgFile);
    } catch (_) {}
  }
}

export function collectHistoryBlocksFromTags({ dates, config = CONFIG, git = gitStdout } = {}) {
  const targetDates = dates || getRecentDateStrings(config.historyLookbackDays);
  const byPr = new Map();

  for (const date of targetDates) {
    const rawTags = git(["tag", "-l", `nightly/${date}/*`])
      .split("\n")
      .filter(Boolean)
      .map(tag => parseStageTag(tag))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.stage !== b.stage) return a.stage - b.stage;
        return prSortNumber(a.prNum) - prSortNumber(b.prNum);
      });

    for (const tagInfo of rawTags) {
      const tagContent = git(["tag", "-l", tagInfo.tag, "--format=%(contents)"]);
      const parsed = parseTagContent(tagContent);
      parsed.prNum = normalizePrNum(parsed.prNum);

      if (parsed.prNum === "PENDING") {
        log(`Skipping history block for ${tagInfo.tag}: missing PR number.`, "warn");
        continue;
      }
      if (tagInfo.prNum && tagInfo.prNum !== parsed.prNum) {
        log(`Skipping history block for ${tagInfo.tag}: tag path PR ${tagInfo.prNum} contradicts payload PR ${parsed.prNum}.`, "warn");
        continue;
      }

      let commitSha = "";
      try {
        commitSha = git(["rev-parse", "--short", `${tagInfo.tag}^{commit}`]);
      } catch (error) {
        log(`Skipping history block for ${tagInfo.tag}: ${error.message}`, "warn");
        continue;
      }

      const prUrl = `https://github.com/${config.owner}/${config.repo}/pull/${parsed.prNum.replace("#", "")}`;
      const entry = {
        date,
        stage: tagInfo.stage,
        prNum: parsed.prNum,
        specificity: tagInfo.specificity,
        block: renderHistoryBlock({
          date,
          stage: tagInfo.stage,
          prNum: parsed.prNum,
          domain: parsed.domain,
          commitSha,
          prUrl,
          files: parsed.files,
          why: parsed.why,
          change: parsed.change,
          result: parsed.result,
          nudges: parsed.nudges,
        }),
      };

      const existing = byPr.get(parsed.prNum);
      if (!existing || entry.specificity > existing.specificity) {
        byPr.set(parsed.prNum, entry);
      }
    }
  }

  return Array.from(byPr.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.stage !== b.stage) return a.stage - b.stage;
    return prSortNumber(a.prNum) - prSortNumber(b.prNum);
  });
}

export function insertHistoryBlocks(content, entries) {
  const t1Header = "## T1 -- Active (last 7 days)\n";
  const insertIdx = content.indexOf(t1Header);
  if (insertIdx === -1) {
    throw new Error("Could not find T1 section in 00-pr-history.md");
  }

  const validBlocks = entries
    .filter(entry => !content.includes(`PR ${entry.prNum} [`))
    .map(entry => entry.block);

  if (validBlocks.length === 0) {
    return { content, inserted: 0 };
  }

  const newBlocks = "\n" + validBlocks.join("\n\n") + "\n\n";
  return {
    content: content.slice(0, insertIdx + t1Header.length) + newBlocks + content.slice(insertIdx + t1Header.length),
    inserted: validBlocks.length,
  };
}

// Nightly evidence is one tag per merged stage per night, so refs/tags gained
// about eleven entries every run and the branch/tag pickers on GitHub and in
// editors filled with them, burying the v* releases those pickers exist to
// offer. Aged evidence therefore moves to a namespace no picker enumerates, and
// stays readable with `git ls-remote origin 'refs/nightly-archive/*'`.
const EVIDENCE_ARCHIVE_NAMESPACE = "refs/nightly-archive";

/**
 * The evidence tags no reader can still ask for.
 *
 * The cut is the floor of the very window collectHistoryBlocksFromTags queries,
 * taken from the same config.historyLookbackDays rather than restated here as a
 * duration, so the archiver cannot drift into evicting evidence a reader is
 * still compiling from. The watchdog reads no further back than its own run date
 * minus one, which sits inside this floor, so covering the history window covers
 * both readers.
 *
 * parseStageTag matches only the nightly evidence shape, which is what keeps v*
 * and every other tag out of the candidate list.
 */
export function agedEvidenceTags(tagNames, { config = CONFIG, now = new Date() } = {}) {
  const window = getRecentDateStrings(config.historyLookbackDays, now);
  const floor = window.reduce((oldest, date) => (date < oldest ? date : oldest), window[0]);
  return tagNames
    .map(tag => parseStageTag(String(tag || "").trim()))
    .filter(parsed => parsed && parsed.date < floor)
    .map(parsed => parsed.tag);
}

/**
 * Moves aged evidence out of refs/tags and into the archive namespace.
 *
 * The archive ref is pushed and confirmed before the tag ref is deleted, and a
 * failure aborts that tag alone rather than the pass: tidying a picker is never
 * a reason to drop the only structured record of what a stage did. Both halves
 * report, because an archive that pushed and failed to delete leaves a stale
 * picker entry, and one that failed to push leaves evidence exactly where it
 * was; those are different facts and neither is allowed to be silent.
 */
export function archiveAgedEvidenceTags({ config = CONFIG, git = gitStdout, run = runCmd, now = new Date() } = {}) {
  const candidates = agedEvidenceTags(git(["tag", "-l", "nightly/*"]).split("\n"), { config, now });
  if (candidates.length === 0) return { archived: 0, failed: 0 };

  let archived = 0;
  let failed = 0;
  for (const tag of candidates) {
    const archiveRef = `${EVIDENCE_ARCHIVE_NAMESPACE}/${tag.replace(/^nightly\//, "")}`;
    const pushed = run(["push", buildRepoUrl(config), `refs/tags/${tag}:${archiveRef}`], { allowFailure: true });
    if (!pushed.ok) {
      log(`Kept ${tag} in refs/tags: archiving it to ${archiveRef} failed.`, "warn");
      failed += 1;
      continue;
    }
    const dropped = run(["push", buildRepoUrl(config), `:refs/tags/${tag}`], { allowFailure: true });
    if (!dropped.ok) {
      log(`Archived ${tag} to ${archiveRef} but could not delete the tag, so the picker keeps one stale entry.`, "warn");
      failed += 1;
      continue;
    }
    run(["tag", "-d", tag], { allowFailure: true });
    archived += 1;
  }

  log(
    `Archived ${archived} aged evidence tag(s) to ${EVIDENCE_ARCHIVE_NAMESPACE}/.`
      + (failed > 0 ? ` ${failed} kept in refs/tags after a failure.` : ""),
    archived > 0 ? "success" : "info",
  );
  return { archived, failed };
}

function compileHistoryFromTags(config = CONFIG) {
  log(`Compiling 00-pr-history.md from the last ${config.historyLookbackDays} day(s) of native Git tags...`);
  try {
    runCmd(["fetch", "--tags", "origin"], { allowFailure: true });
  } catch (error) {
    log(`Failed to fetch tags: ${error.message}`, "warn");
  }

  // Runs here rather than on a schedule because this is the actual event that
  // retires a tag: the tag view has just been refreshed and the lookback window
  // is about to be compiled. Anything older than that window is outside every
  // reader's reach, so archiving it cannot change what gets compiled below.
  try {
    archiveAgedEvidenceTags({ config });
  } catch (error) {
    log(`Evidence archiving pass failed: ${error.message}`, "warn");
  }

  if (!fs.existsSync(config.changelogPath)) {
    log(`${config.changelogPath} does not exist. Skipping history compilation.`, "warn");
    return;
  }

  const entries = collectHistoryBlocksFromTags({ config });
  if (entries.length === 0) {
    log("No recent nightly tags found. Skipping changelog compilation.");
    return;
  }

  const currentContent = fs.readFileSync(config.changelogPath, "utf8");
  const result = insertHistoryBlocks(currentContent, entries);
  if (result.inserted === 0) {
    log("All recent tag logs are already present in 00-pr-history.md.");
    return;
  }

  fs.writeFileSync(config.changelogPath, result.content, "utf8");
  log(`Successfully compiled ${result.inserted} stage log(s) into 00-pr-history.md.`, "success");
}

function readFileFromRef(ref, file) {
  return gitStdout(["show", `${ref}:${file}`]);
}

async function resolveConflictsAndRebase(pr, config = CONFIG, stageOverride = null) {
  const branch = pr.head.ref;
  validateStageBranch(branch, stageOverride);
  log(`Rebasing and resolving conflicts for branch ${branch}`);

  configureGitActor();
  runCmd(["fetch", "origin", `${branch}:${branch}`]);

  const mergeBase = gitStdout(["merge-base", branch, config.targetBranch]);
  const changedFiles = gitStdout(["diff", "--name-only", mergeBase, branch]).split("\n").filter(Boolean);
  log(`Changed files in PR: ${changedFiles.join(", ")}`);

  const sourcePatchPath = path.join(os.tmpdir(), `nightly-source-${process.pid}.patch`);
  try {
    const sourceDiff = gitStdout(["diff", "--binary", mergeBase, branch, "--", ".", ":!.github/nightly-logs/*"], { allowFailure: true });
    if (sourceDiff) fs.writeFileSync(sourcePatchPath, sourceDiff, "utf8");
  } catch (error) {
    log(`Failed to create source diff patch: ${error.message}`, "warn");
  }

  const coverageLogs = {};
  for (const file of changedFiles) {
    if (!file.startsWith(".github/nightly-logs/") || !file.endsWith("-coverage.log")) continue;
    const prLines = readFileFromRef(branch, file).split("\n").filter(Boolean);
    const nightlyLogContent = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const nightlyLines = new Set(nightlyLogContent.split("\n").filter(Boolean));
    const newLines = prLines.filter(line => !nightlyLines.has(line));
    if (newLines.length > 0) {
      coverageLogs[file] = newLines;
      log(`Extracted ${newLines.length} new line(s) for ${file}.`);
    }
  }

  const otherLogs = {};
  for (const file of changedFiles) {
    if (
      file.startsWith(".github/nightly-logs/") &&
      !file.endsWith("-coverage.log") &&
      file !== config.changelogPath
    ) {
      otherLogs[file] = readFileFromRef(branch, file);
      log(`Stored content for other log file: ${file}`);
    }
  }

  runCmd(["checkout", branch]);
  runCmd(["reset", "--hard", config.targetBranch]);

  if (fs.existsSync(sourcePatchPath) && fs.readFileSync(sourcePatchPath, "utf8").trim()) {
    log("Applying source code patch...");
    runCmd(["apply", sourcePatchPath]);
  }

  for (const [file, lines] of Object.entries(coverageLogs)) {
    let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (!content.endsWith("\n") && content.length > 0) content += "\n";
    content += lines.join("\n") + "\n";
    fs.writeFileSync(file, content, "utf8");
  }

  for (const [file, content] of Object.entries(otherLogs)) {
    fs.writeFileSync(file, content, "utf8");
  }

  runCmd(["add", "."]);
  const status = gitStdout(["status", "--porcelain"]);
  if (status) {
    runCmd(["commit", "-m", pr.title]);
    runCmd(["push", buildRepoUrl(config), `HEAD:${branch}`, "--force"]);
    log(`Successfully force-pushed resolved branch ${branch} to origin.`, "success");
  } else {
    log("No changes detected after rebase. Branch is identical to Nightly.");
  }

  runCmd(["checkout", config.targetBranch]);
  try {
    fs.unlinkSync(sourcePatchPath);
  } catch (_) {}
}

// The check that must not be red. Named rather than inferred so a renamed
// workflow fails loudly at review time instead of silently disarming the gate.
export const REGRESSION_GATE_CHECK = "Suite must not regress";

// The gate's workflow `name:`. merge-nightly-prs.yml resumes on
// `workflow_run: workflows: [<this name>]`, and GitHub matches that list by the
// workflow's name, not its file name. A rename of the gate would therefore
// silently stop the merge from resuming, which is the one failure this change
// must not have; nightly-coherence.test.mjs pins all three spellings together.
export const REGRESSION_GATE_WORKFLOW = "Nightly PR Regression Gate";

// What the coordinator does with a stage pull request once the gate has been
// read. Three answers rather than a boolean, because the boolean it replaces
// could not say "not yet", and "not yet" was being read as "yes".
export const GATE_VERDICT = Object.freeze({
  BLOCK: "block",
  DEFER: "defer",
  PROCEED: "proceed",
});

// A gate run in one of these states has not judged the change yet, and it will
// reach `completed` without anybody doing anything: GitHub moves a requested,
// queued or pending run on by itself, and every run ends. Completion is the
// event merge-nightly-prs.yml listens for, so a pull request deferred on one of
// these states always has something that resumes it.
//
// `waiting` is deliberately absent. It means a deployment protection rule is
// holding the job for a person, and the unattended night has none, so a defer
// on it would be a PR waiting with nothing to resume it. It falls through to
// the unknown-status branch below and proceeds with a warning.
const GATE_UNFINISHED_STATUSES = new Set(["requested", "queued", "pending", "in_progress"]);

// The only two conclusions that are a verdict against the change. The gate
// exits 1 only when the suite passes at the merge base and fails at the head,
// and a timeout means the suite never showed it was safe.
const GATE_REFUSING_CONCLUSIONS = new Set(["failure", "timed_out"]);

// Conclusions that say the gate did NOT judge the change and never will on its
// own. Each proceeds, with a warning that names it, because each would
// otherwise leave the pull request waiting for an event that is not coming:
//
// - cancelled: the gate's own concurrency (cancel-in-progress per PR) cancels
//   a run when a newer push supersedes it, and that newer push's run is read
//   instead because the head sha is read fresh. A run that is cancelled and
//   still newest for the head was cancelled by hand or by a lost runner, and
//   nothing re-runs it.
// - stale: GitHub's own label for a check that sat incomplete too long. It
//   will never complete.
// - skipped: the job's condition was false. No test ran and none will.
// - neutral: the gate never emits it (it exits 0 or 1); if it appears, it
//   asserts no failure, so it cannot be a refusal.
// - action_required: a person must act before the run can continue. Jules
//   branches live in this repository, so approval gating should never apply;
//   if it does, it is a configuration problem, not a verdict, and there is
//   nobody awake to approve it.
// - startup_failure (workflow level only): the gate could not start, which
//   says nothing about the change.
//
// Proceeding here is the same trade the missing-gate case makes below, and it
// is NOT silent: the warning says the change merged without a verdict, which
// is a different line from a pass. A block would instead strand every code
// stage behind one broken gate, which is its own outage.
const GATE_UNJUDGED_CONCLUSIONS = new Set([
  "cancelled", "stale", "skipped", "neutral", "action_required", "startup_failure",
]);

/**
 * The newest gate run among `runs`, or null when none carries the name.
 *
 * A head sha can hold more than one run of the gate: a "Re-run jobs" on a red
 * gate adds a second check run to the same commit, and the earlier red one is
 * still listed. The re-run is the one that counts, in both directions, so the
 * newest wins. Check run and workflow run ids both grow with creation, so the
 * id orders them without reading any clock; started_at breaks a tie only when
 * an id is missing.
 */
export function selectNewestGateRun(runs, name = REGRESSION_GATE_CHECK) {
  const matching = (Array.isArray(runs) ? runs : []).filter(run => run?.name === name);
  if (matching.length === 0) return null;
  return matching.reduce((newest, run) => {
    const a = Number(newest.id);
    const b = Number(run.id);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return b > a ? run : newest;
    return String(run.started_at || "") > String(newest.started_at || "") ? run : newest;
  });
}

/**
 * Turns one gate run into a verdict. Pure, so every status and conclusion is
 * pinned by a test rather than by the night it first happens.
 *
 * Returns { verdict, reason, warn }. `warn` is true when the change is allowed
 * through WITHOUT the gate having judged it, so the log line can never read
 * like a pass.
 */
export function judgeGateRun(run) {
  if (!run) {
    return { verdict: GATE_VERDICT.PROCEED, reason: "no gate run exists for this change", warn: false };
  }
  const status = String(run.status || "").toLowerCase();
  const conclusion = run.conclusion == null ? "" : String(run.conclusion).toLowerCase();

  if (status !== "completed") {
    if (GATE_UNFINISHED_STATUSES.has(status)) {
      return { verdict: GATE_VERDICT.DEFER, reason: `the gate is ${status}`, warn: false };
    }
    return {
      verdict: GATE_VERDICT.PROCEED,
      reason: `the gate is in state '${status || "unknown"}', which nothing resumes unattended, so it merges without a verdict`,
      warn: true,
    };
  }
  if (GATE_REFUSING_CONCLUSIONS.has(conclusion)) {
    return { verdict: GATE_VERDICT.BLOCK, reason: `the gate concluded ${conclusion}`, warn: false };
  }
  if (conclusion === "success") {
    return { verdict: GATE_VERDICT.PROCEED, reason: "the gate passed", warn: false };
  }
  if (GATE_UNJUDGED_CONCLUSIONS.has(conclusion)) {
    return {
      verdict: GATE_VERDICT.PROCEED,
      reason: `the gate concluded ${conclusion} without judging the change, and nothing will re-run it, so it merges without a verdict`,
      warn: true,
    };
  }
  // A conclusion GitHub adds later, or a completed run with none at all. It is
  // not a refusal, and waiting on it would never end, so it gets the unjudged
  // treatment with its own name in the log.
  return {
    verdict: GATE_VERDICT.PROCEED,
    reason: `the gate completed with an unrecognised conclusion '${conclusion || "none"}', so it merges without a verdict`,
    warn: true,
  };
}

/**
 * Reads the gate for one head sha: the newest check run first, and when there
 * is no check run yet, the newest gate workflow run.
 *
 * WHY THE WORKFLOW RUN TOO. The stage PR's `opened` event starts this merge
 * pass and the gate in the same instant: on 2026-09-07 the Sync Nightly PRs
 * run for #1721 was created at 00:23:29Z and the gate's workflow run one
 * second later, at 00:23:30Z. The check run only appears once the gate's job
 * is queued. A merge pass that reads check runs in that gap sees "no gate"
 * and, by the asymmetry below, merges: the same hole as before, one step
 * earlier. The workflow run exists from the event onward, so a gate that has
 * been started but has no check yet is read as unfinished, and its completion
 * is still the event that resumes the merge.
 *
 * Returns { found, run } or throws when GitHub cannot be asked; the caller
 * decides what an unreadable gate means.
 */
async function readGateRun(sha, config = CONFIG) {
  // filter=all: the default (`latest`) collapses runs by completion time, and
  // an unfinished re-run has none, so the default could hide exactly the run
  // that says "not yet". Selecting the newest ourselves removes the question.
  const checks = await githubApi(
    `/repos/${config.owner}/${config.repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(REGRESSION_GATE_CHECK)}&filter=all&per_page=100`,
    "GET", null, false, config,
  );
  const checkRun = selectNewestGateRun(checks?.check_runs, REGRESSION_GATE_CHECK);
  if (checkRun) return { found: "check", run: checkRun };

  const workflows = await githubApi(
    `/repos/${config.owner}/${config.repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100`,
    "GET", null, false, config,
  );
  const workflowRun = selectNewestGateRun(workflows?.workflow_runs, REGRESSION_GATE_WORKFLOW);
  if (workflowRun) return { found: "workflow", run: workflowRun };
  return { found: null, run: null };
}

/**
 * Decides whether a stage pull request may merge now: "block", "defer" or
 * "proceed".
 *
 * Until f657410d0 the coordinator gated on `details.mergeable` alone, which
 * means conflict-free, not correct. That commit made a red gate refuse, but it
 * returned a boolean and read a gate that had not finished as "not blocking".
 * Measured over 2026-09-03..09-22: 57 of the 63 stage PRs the gate ran on
 * merged BEFORE the gate finished, so the refusal almost never had anything to
 * refuse. PR #1721 (Stage 2, 2026-09-07) merged at 00:23:47Z, 14s after its
 * gate started at 00:23:33Z; the gate reported 16 failing tests at 00:26:57Z,
 * after the fact, and Nightly stayed red until #1727 at 07:26Z. Nightly has no
 * branch protection, so nothing else stood in the way.
 *
 * DEFER IS THE FIX. An unfinished gate is not a verdict, so the pull request
 * is left open for this pass and logged as waiting. It is not a failure: it
 * writes no MERGE FAILED block and no BLOCKED ledger row. merge-nightly-prs.yml
 * runs again on `workflow_run` when the gate completes, and that pass reads
 * the conclusion. There is no clock and no timeout here: the gate finishing is
 * the event, and every non-terminal state kept as a defer is one GitHub moves
 * on by itself (see GATE_UNFINISHED_STATUSES).
 *
 * ABSENT IS NOT FAILURE, and that asymmetry is still the design. The gate
 * ignores the pipeline's own bookkeeping (.github/nightly-logs/**), so a
 * log-only stage legitimately has no gate to pass, and a push made with this
 * workflow's own GITHUB_TOKEN starts no workflow at all; treating a missing
 * gate as a refusal would block most of the pipeline every night. An API
 * failure is not evidence of a failing gate either, and refusing every merge
 * because GitHub's API hiccuped would be its own outage. Both proceed.
 */
export async function regressionGateVerdict(pr, config = CONFIG, sha = pr?.head?.sha) {
  let read;
  try {
    read = await readGateRun(sha, config);
  } catch (error) {
    return {
      verdict: GATE_VERDICT.PROCEED,
      reason: `could not read ${REGRESSION_GATE_CHECK} for PR #${pr.number} (${error.message}), so it merges without a verdict`,
      warn: true,
    };
  }
  const judged = judgeGateRun(read.run);
  if (read.found === "workflow" && judged.verdict === GATE_VERDICT.DEFER) {
    return { ...judged, reason: `${judged.reason}; its check has not appeared yet` };
  }
  return judged;
}

async function mergePullRequest(pr, details, config = CONFIG) {
  const expectedSha = details.head.sha;
  const mergeBody = {
    merge_method: "squash",
    commit_title: `${pr.title} (#${pr.number})`,
    commit_message: `Automated merge of PR #${pr.number} (author: ${pr.user.login})`,
    sha: expectedSha,
  };

  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt++) {
    try {
      log(`Merge attempt ${attempt}/${MERGE_ATTEMPTS} for PR #${pr.number}...`);
      return await githubApi(
        `/repos/${config.owner}/${config.repo}/pulls/${pr.number}/merge`,
        "PUT",
        mergeBody,
        false,
        config,
      );
    } catch (error) {
      if (isShaMismatch(error)) {
        const latest = await githubApi(`/repos/${config.owner}/${config.repo}/pulls/${pr.number}`, "GET", null, false, config);
        if (latest.head.sha !== expectedSha) {
          throw new Error(`PR #${pr.number} head changed from ${expectedSha} to ${latest.head.sha}; refusing stale merge.`);
        }
      }

      if (attempt < MERGE_ATTEMPTS && isRetryableMergeError(error)) {
        const wait = Math.pow(2, attempt) * 1000;
        log(`Merge blocked (${error.status || "unknown"}) -- retrying in ${wait / 1000}s...`, "warn");
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`PR #${pr.number} did not merge after ${MERGE_ATTEMPTS} attempt(s).`);
}

async function deleteHeadBranch(pr, config = CONFIG, prefix = "") {
  try {
    await githubApi(`/repos/${config.owner}/${config.repo}/git/refs/heads/${pr.head.ref}`, "DELETE", null, false, config);
    log(`${prefix}Deleted branch ${pr.head.ref}.`, "success");
  } catch (error) {
    if (error.message.includes("404")) {
      log(`${prefix}Branch ${pr.head.ref} already deleted.`);
    } else {
      log(`${prefix}Failed to delete branch ${pr.head.ref}: ${error.message}`, "warn");
    }
  }
}

// The outcomes processPullRequest can end in without throwing. A throw is still
// the only failure: it is what writes the MERGE FAILED block and the BLOCKED
// ledger row, and a deferral must write neither.
export const PR_OUTCOME = Object.freeze({ MERGED: "merged", DEFERRED: "deferred" });

export async function processPullRequest(pr, options, config = CONFIG) {
  const prefix = options.label ? `[${options.label}] ` : "";
  const classification = pr.nightlyClassification || { stage: null };
  validateStageBranch(pr.head.ref, classification.stage);
  log(`${prefix}PR #${pr.number}: ${pr.title}`);
  if (classification.kind === "inferred") {
    log(`${prefix}PR #${pr.number} uses malformed head '${pr.head.ref}' but ${classification.reason}.`, "warn");
  }

  let details = await pollMergeable(pr.number, options.mergeablePolls, config);

  if (details.draft) {
    log(`${prefix}PR #${pr.number} is a draft -- marking ready for review...`);
    try {
      await markReadyForReview(pr.node_id, config);
      details = await pollMergeable(pr.number, options.mergeablePolls, config);
    } catch (error) {
      log(`${prefix}Draft conversion failed for PR #${pr.number}: ${error.message}`, "warn");
    }
  }

  // The gate is read BEFORE any conflict resolution, on the head sha GitHub
  // reports now. Two reasons. resolveConflictsAndRebase force-pushes with this
  // workflow's GITHUB_TOKEN, and GitHub starts no workflow for such a push, so
  // the rebased head never gets a gate of its own: judged afterwards, the
  // stage's real verdict (on the commit Jules pushed) would be replaced by
  // "no gate" and the change would proceed unjudged. And a pull request that
  // is going to wait or be refused should not be rewritten first.
  const gate = await regressionGateVerdict(pr, config, details?.head?.sha || pr.head.sha);
  if (gate.verdict === GATE_VERDICT.BLOCK) {
    throw new Error(`PR #${pr.number} failed ${REGRESSION_GATE_CHECK} (${gate.reason}); a stage may not merge a change that breaks the suite.`);
  }
  if (gate.verdict === GATE_VERDICT.DEFER) {
    log(
      `${prefix}Waiting for "${REGRESSION_GATE_CHECK}" on PR #${pr.number}: ${gate.reason}. ` +
      "Not merged in this pass; the gate finishing starts the next one.",
    );
    return PR_OUTCOME.DEFERRED;
  }
  if (gate.warn) {
    log(`${prefix}PR #${pr.number}: ${gate.reason}.`, "warn");
  }

  if (details.mergeable === false) {
    log(`${prefix}PR #${pr.number} has merge conflicts. Attempting automatic resolution...`);
    await resolveConflictsAndRebase(pr, config, classification.stage);
    details = await pollMergeable(pr.number, options.mergeablePolls, config);
  }

  const mergeRes = await mergePullRequest(pr, details, config);
  log(`${prefix}Merged PR #${pr.number}.`, "success");
  createStageTag(pr, mergeRes?.sha || details.merge_commit_sha || pr.head.sha, config, classification.stage);
  syncTargetBranch(config);
  await deleteHeadBranch(pr, config, prefix);
  return PR_OUTCOME.MERGED;
}

export function renderFailureBlock({ date, pr, status, errorMessage }) {
  return `\n## [${date}] MERGE FAILED: PR #${pr.number}: ${pr.title}\n` +
    `> [!CAUTION]\n` +
    `> **Status**: ${status}\n` +
    `> **Error**: \`${errorMessage}\`\n` +
    `> **PR Link**: [Link](${pr.html_url})\n`;
}

function writeFailureBlocks(failures, config = CONFIG) {
  if (failures.length === 0 || !fs.existsSync(config.changelogPath)) return;
  const t1Marker = "## T1 -- Active (last 7 days)\n";
  let content = fs.readFileSync(config.changelogPath, "utf8");
  const insertIdx = content.indexOf(t1Marker);

  if (insertIdx === -1) {
    log("Failed to find T1 marker to insert merge failures.", "warn");
    return;
  }

  const newBlocks = [];
  for (const failure of failures) {
    const failMarker = `MERGE FAILED: PR #${failure.pr.number}:`;
    if (!content.includes(failMarker)) {
      newBlocks.push(renderFailureBlock(failure));
    }
  }

  if (newBlocks.length === 0) return;
  content = content.slice(0, insertIdx + t1Marker.length) + newBlocks.join("") + content.slice(insertIdx + t1Marker.length);
  fs.writeFileSync(config.changelogPath, content, "utf8");
  log(`Changelog updated with ${newBlocks.length} failed merge record(s).`, "success");
}

/**
 * Works through one pass's targets in stage order and returns
 * { processed, deferred }.
 *
 * ORDERING WHILE AN EARLIER STAGE IS DEFERRED: later stages are NOT held
 * behind it. Deliberate, for three reasons.
 * 1. A refusal has never held the queue: a throw here is caught, recorded and
 *    the loop moves on to the next stage. A deferral is weaker evidence than a
 *    refusal (no verdict yet, rather than a verdict against), so letting it
 *    hold what a refusal does not would invert the two.
 * 2. Each gate judged its own pull request against the Nightly it was opened
 *    on, independently of its siblings. Merging Stage 5 before a deferred
 *    Stage 2 does not invalidate Stage 5's verdict, and holding it would not
 *    make Stage 2's any truer: whichever merges second lands on a base neither
 *    gate saw, in either order.
 * 3. Holding would chain every later stage to the slowest gate in the night,
 *    and to the one pending slot the shared nightly-control-plane concurrency
 *    group keeps, where a queued run can be replaced before it starts.
 * Stage order still decides the order of attempts, so when nothing waits the
 * behaviour is exactly what it was. The shared-log conflicts an out-of-order
 * merge can cause are the ones resolveConflictsAndRebase already handles on
 * every night that two stages overlap.
 */
export async function processTargets(targets, options, failures, config = CONFIG, processOne = processPullRequest) {
  const deferred = [];
  if (targets.length === 0) {
    log(`${options.label ? `${options.label}: ` : ""}No matching Nightly PRs found.`, "success");
    return { processed: 0, deferred };
  }

  log(`${options.label ? `${options.label}: ` : ""}Processing ${targets.length} PR(s) in stage order...`);
  let processed = 0;
  for (const pr of targets) {
    try {
      const outcome = await processOne(pr, options, config);
      if (outcome === PR_OUTCOME.DEFERRED) {
        deferred.push(pr);
      } else {
        processed++;
      }
    } catch (error) {
      log(`${options.label ? `[${options.label}] ` : ""}FAILED PR #${pr.number}: ${error.message}`, "error");
      failures.push({
        date: new Date().toISOString().split("T")[0],
        pr,
        status: options.label ? "Auto-merge aborted (second pass)." : "Auto-merge aborted.",
        errorMessage: error.message,
      });
    }
  }
  return { processed, deferred };
}

export async function run(config = CONFIG) {
  if (!config.token) throw new Error("GITHUB_TOKEN is missing.");
  const registry = loadStageRegistry(config);

  const failures = [];
  let rejected = [];
  // The pull requests still waiting on their gate when this run ends, from the
  // last pass that looked at them. Reported, never recorded as failures.
  let waiting = [];
  try {
    log(`Fetching open PRs targeting ${config.targetBranch}...`);
    const prs = await fetchAllPullRequests(config);
    await attachChangedFiles(prs, config);
    log(`Found ${prs.length} total open PR(s).`);

    await retargetNightlyPrs(prs, config);
    for (const pr of prs) {
      pr.nightlyClassification = classifyNightlyPr(pr, registry, config);
    }
    rejected = getRejectedNightlyPrs(prs, registry, config);
    for (const pr of rejected) {
      failures.push({
        date: new Date().toISOString().split("T")[0],
        pr,
        status: "Blocked by Nightly PR classifier.",
        errorMessage: `${pr.nightlyClassification.reason}; head=${pr.head.ref}; files=${(pr.files || []).join(", ") || "unknown"}`,
      });
    }

    const firstPassTargets = getMergeTargets(prs, registry, config);
    const firstPass = await processTargets(firstPassTargets, { mergeablePolls: FIRST_PASS_MERGEABLE_POLLS }, failures, config);
    waiting = firstPass.deferred;

    if (firstPassTargets.length === 0) {
      log("Skipping second-pass wait because no first-pass Nightly PRs matched.");
    } else {
      log(`Settling for ${SECOND_PASS_SETTLE_MS / 1000}s before second-pass check...`);
      await sleep(SECOND_PASS_SETTLE_MS);

      const retryPrs = await fetchAllPullRequests(config);
      await attachChangedFiles(retryPrs, config);
      for (const pr of retryPrs) {
        pr.nightlyClassification = classifyNightlyPr(pr, registry, config);
      }
      const retryRejected = getRejectedNightlyPrs(retryPrs, registry, config);
      for (const pr of retryRejected) {
        failures.push({
          date: new Date().toISOString().split("T")[0],
          pr,
          status: "Blocked by Nightly PR classifier during second pass.",
          errorMessage: `${pr.nightlyClassification.reason}; head=${pr.head.ref}; files=${(pr.files || []).join(", ") || "unknown"}`,
        });
      }
      rejected = [...rejected, ...retryRejected];
      const retryTargets = getMergeTargets(retryPrs, registry, config);
      if (retryTargets.length === 0) {
        waiting = [];
        log("Second-pass check: no remaining open Nightly PRs. Pipeline fully merged.", "success");
      } else {
        const secondPass = await processTargets(
          retryTargets,
          { label: "Second pass", mergeablePolls: SECOND_PASS_MERGEABLE_POLLS },
          failures,
          config,
        );
        waiting = secondPass.deferred;
      }
    }
    for (const pr of waiting) {
      log(
        `PR #${pr.number} (stage ${pr.nightlyClassification?.stage ?? "?"}) is waiting for "${REGRESSION_GATE_CHECK}" to finish. ` +
        "It merges on the pass that starts when that check finishes.",
      );
    }
  } finally {
    writeFailureBlocks(failures, config);
    compileHistoryFromTags(config);
    if (failures.length > 0) {
      try {
        const ledger = loadLedger(config.ledgerPath);
        const date = new Date().toISOString().split("T")[0];
        for (const failure of failures) {
          const stage = failure.pr.nightlyClassification?.stage;
          if (!stage) continue;
          // Never let a coordinator failure contradict a merge that already
          // happened. `date` here is today, not the pipeline date the PR
          // belongs to, and target selection has no age bound, so a stale open
          // PR re-selected on a later night would otherwise stamp BLOCKED onto
          // a row holding that stage's own merge tag. upsertStageEntry refuses
          // the demotion as well; this skip keeps it out of the log too.
          const existing = ledger.runs?.[date]?.[String(stage)];
          if (existing?.state === "MERGED" && existing?.evidence?.tag) {
            log(
              `Stage ${stage} already merged on ${date} (${existing.evidence.tag}); recording PR #${failure.pr.number} failure as evidence only.`,
              "warn",
            );
          }
          upsertStageEntry(ledger, registry, date, stage, {
            state: "BLOCKED",
            failureClass: FAILURE_CLASSES.MERGE_COORDINATOR,
            evidence: {
              prNumber: failure.pr.number,
              prUrl: failure.pr.html_url,
              headRef: failure.pr.head?.ref,
              reason: failure.errorMessage,
            },
          }, { source: NIGHTLY_EVENT_SOURCES.MERGE_COORDINATOR });
        }
        saveLedger(ledger, config.ledgerPath);
      } catch (error) {
        log(`Failed to update nightly ledger: ${error.message}`, "warn");
      }
    }
  }

  if (rejected.length > 0) {
    throw new Error(`${rejected.length} allowed-author Nightly PR(s) could not be classified.`);
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} Nightly PR merge failure(s) were recorded.`);
  }
}
