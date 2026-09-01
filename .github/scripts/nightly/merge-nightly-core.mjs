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
 * - merge allowed stage PRs in stage order
 * - recover known shared-log conflicts where possible
 * - tag successful stage merges as durable history facts
 * - compile recent tag facts into 00-pr-history.md
 * ============================================================================
 */

import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { loadLedger, saveLedger, upsertStageEntry } from "./nightly-ledger.mjs";

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

  const meta = {
    domain: "pipeline",
    why: "Automated nightly audit pass.",
    change: pr?.title || "Automated stage execution.",
    result: "Nominal validation with zero regressions.",
    files: "codebase",
  };

  if (metaMatch) {
    for (const line of metaMatch[1].split("\n")) {
      const match = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (!match) continue;
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (key in meta) meta[key] = value;
    }
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
    domain: "pipeline",
    files: "codebase",
    why: "Daily audit pass.",
    change: "Automated stage execution.",
    result: "Nominal validation.",
  };

  for (const line of String(tagContent || "").split("\n")) {
    if (line.startsWith("PR:")) parsed.prNum = line.replace("PR:", "").trim();
    if (line.startsWith("Domain:")) parsed.domain = line.replace("Domain:", "").trim();
    if (line.startsWith("Files:")) parsed.files = line.replace("Files:", "").trim();
    if (line.startsWith("Why:")) parsed.why = line.replace("Why:", "").trim();
    if (line.startsWith("Change:")) parsed.change = line.replace("Change:", "").trim();
    if (line.startsWith("Result:")) parsed.result = line.replace("Result:", "").trim();
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

export function renderHistoryBlock({ date, stage, prNum, domain, commitSha, prUrl, files, why, change, result }) {
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
    `**Result:** ${result}`;
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

function createStageTag(pr, squashSha, config = CONFIG, stageOverride = null) {
  const date = new Date().toISOString().split("T")[0];
  const stage = validateStageBranch(pr.head.ref, stageOverride).stage;
  const meta = extractMetadata(pr);

  try {
    ensureCommitAvailable(squashSha, config);
    const fileList = gitStdout(["diff-tree", "--no-commit-id", "--name-only", "-r", squashSha]).split("\n").filter(Boolean);
    if (fileList.length > 0) meta.files = summarizeFiles(fileList);
  } catch (error) {
    log(`Failed to prepare commit ${squashSha} for tagging: ${error.message}`, "warn");
    return;
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

function compileHistoryFromTags(config = CONFIG) {
  log(`Compiling 00-pr-history.md from the last ${config.historyLookbackDays} day(s) of native Git tags...`);
  try {
    runCmd(["fetch", "--tags", "origin"], { allowFailure: true });
  } catch (error) {
    log(`Failed to fetch tags: ${error.message}`, "warn");
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

async function processPullRequest(pr, options, config = CONFIG) {
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

async function processTargets(targets, options, failures, config = CONFIG) {
  if (targets.length === 0) {
    log(`${options.label ? `${options.label}: ` : ""}No matching Nightly PRs found.`, "success");
    return 0;
  }

  log(`${options.label ? `${options.label}: ` : ""}Processing ${targets.length} PR(s) in stage order...`);
  let processed = 0;
  for (const pr of targets) {
    try {
      await processPullRequest(pr, options, config);
      processed++;
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
  return processed;
}

export async function run(config = CONFIG) {
  if (!config.token) throw new Error("GITHUB_TOKEN is missing.");
  const registry = loadStageRegistry(config);

  const failures = [];
  let rejected = [];
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
    await processTargets(firstPassTargets, { mergeablePolls: FIRST_PASS_MERGEABLE_POLLS }, failures, config);

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
        log("Second-pass check: no remaining open Nightly PRs. Pipeline fully merged.", "success");
      } else {
        await processTargets(
          retryTargets,
          { label: "Second pass", mergeablePolls: SECOND_PASS_MERGEABLE_POLLS },
          failures,
          config,
        );
      }
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
            failureClass: "MERGE_COORDINATOR",
            evidence: {
              prNumber: failure.pr.number,
              prUrl: failure.pr.html_url,
              headRef: failure.pr.head?.ref,
              reason: failure.errorMessage,
            },
          });
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
