// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { classifyNightlyPr, CONFIG } from "./merge-nightly-core.mjs";
import { ensureRunEntries, loadLedger, saveLedger, stageEntry, upsertStageEntry } from "./nightly-ledger.mjs";

const PASS_STATES = new Set(["MERGED", "RECOVERABLE", "ESCALATED"]);
const JULES_API_BASE = "https://jules.googleapis.com/v1alpha";
const IN_FLIGHT_JULES_STATES = new Set([
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "IN_PROGRESS",
  "PAUSED",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function utcDate(offsetDays = 0, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return date.toISOString().slice(0, 10);
}

export function expectedEvidenceDate(stageNumber, date) {
  if (stageNumber === 1) return utcDate(-1, new Date(`${date}T00:00:00.000Z`));
  return date;
}

function runGit(args) {
  const res = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(res.stderr || res.stdout || "").trim()}`);
  return String(res.stdout || "").trim();
}

async function githubApi(endpoint, config = CONFIG, method = "GET", body = null) {
  invariant(config.token, "GITHUB_TOKEN is missing.");
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "User-Agent": "Clash-Manager-Nightly-Watchdog",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function fetchRecentPullRequests(config = CONFIG) {
  const prs = [];
  let page = 1;
  while (true) {
    const pagePrs = await githubApi(
      `/repos/${config.owner}/${config.repo}/pulls?state=all&base=${config.targetBranch}&per_page=100&page=${page}`,
      config,
    );
    if (pagePrs.length === 0) break;
    prs.push(...pagePrs);
    if (pagePrs.length < 100) break;
    page++;
  }
  return prs.slice(0, 150);
}

async function fetchPullRequestFiles(prNumber, config = CONFIG) {
  const files = [];
  let page = 1;
  while (true) {
    const pageFiles = await githubApi(
      `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      config,
    );
    if (pageFiles.length === 0) break;
    files.push(...pageFiles.map(file => file.filename).filter(Boolean));
    if (pageFiles.length < 100) break;
    page++;
  }
  return files;
}

async function fetchJulesSessions(config = CONFIG) {
  if (!config.julesApiKey) return [];
  try {
    const res = await fetch(`${JULES_API_BASE}/sessions`, {
      headers: { "X-Goog-Api-Key": config.julesApiKey },
    });
    if (!res.ok) {
      console.error(`Jules API ${res.status} ${res.statusText}; continuing without session evidence.`);
      return [];
    }
    const body = await res.json();
    return Array.isArray(body.sessions) ? body.sessions : [];
  } catch (error) {
    console.error(`Jules API request failed: ${error.message}; continuing without session evidence.`);
    return [];
  }
}

export function hasDanglingSentinel(content, stageNumber, date) {
  const sentinel = `* [${date}] [Stage ${stageNumber}] IN-PROGRESS: session started`;
  return String(content || "").includes(sentinel);
}

export function matchJulesSession(sessions, stage, date) {
  const evidenceDate = expectedEvidenceDate(stage.number, date);
  const header = `[Stage ${stage.number}]`;
  const matches = (sessions || [])
    .filter(session => typeof session?.prompt === "string" && session.prompt.includes(header))
    .filter(session => String(session.createTime || "").slice(0, 10) === evidenceDate)
    .sort((a, b) => String(b.createTime || "").localeCompare(String(a.createTime || "")));
  return matches[0] || null;
}

async function collectObservedState(registry, date, config = CONFIG) {
  runGit(["fetch", "--tags", "origin", config.targetBranch]);
  const prs = await fetchRecentPullRequests(config);
  const candidateDates = new Set(registry.stages.map(stage => expectedEvidenceDate(stage.number, date)));
  for (const pr of prs.filter(pr => candidateDates.has(String(pr.created_at || "").slice(0, 10)))) {
    pr.files = await fetchPullRequestFiles(pr.number, config);
  }

  const tags = new Set();
  for (const stage of registry.stages) {
    const evidenceDate = expectedEvidenceDate(stage.number, date);
    runGit(["tag", "-l", `nightly/${evidenceDate}/stage-${stage.number}/pr-*`])
      .split("\n")
      .filter(Boolean)
      .forEach(tag => tags.add(tag));
  }

  const coverageStages = new Set();
  const danglingSentinelStages = new Set();
  for (const stage of registry.stages) {
    try {
      const content = runGit(["show", `origin/${config.targetBranch}:${stage.coverageLog}`]);
      const evidenceDate = expectedEvidenceDate(stage.number, date);
      if (content.includes(`* [${evidenceDate}] [Stage ${stage.number}] `)) {
        coverageStages.add(stage.number);
      }
      if (hasDanglingSentinel(content, stage.number, evidenceDate)) {
        danglingSentinelStages.add(stage.number);
      }
    } catch (_) {}
  }

  const julesSessions = await fetchJulesSessions(config);

  return { prs, tags, coverageStages, danglingSentinelStages, julesSessions };
}

async function createOrUpdateEscalationIssue(date, entries, summary, config = CONFIG) {
  const unresolved = entries.filter(entry => !PASS_STATES.has(entry.state));
  if (unresolved.length === 0) return;

  const title = `[Nightly Watchdog] ${date} unresolved pipeline stages`;
  const query = encodeURIComponent(`repo:${config.owner}/${config.repo} is:issue in:title "${title}"`);
  const search = await githubApi(`/search/issues?q=${query}`, config);
  const body = [
    "The Nightly watchdog detected unresolved stage states after the post-window cutoff.",
    "",
    summary,
    "Recovery policy:",
    "- Merge recoverable PRs through Sync Nightly PRs.",
    "- Rerun or inspect Jules tasks for NO_OUTPUT stages.",
    "- Preserve blocked branches until their evidence has been reviewed.",
  ].join("\n");

  const existing = search.items?.find(issue => issue.title === title);
  if (existing) {
    await githubApi(`/repos/${config.owner}/${config.repo}/issues/${existing.number}`, config, "PATCH", {
      body,
      state: "open",
    });
    return;
  }

  await githubApi(`/repos/${config.owner}/${config.repo}/issues`, config, "POST", {
    title,
    body,
  });
}

function prDateMatchesStage(pr, stageNumber, date) {
  const expectedDate = expectedEvidenceDate(stageNumber, date);
  return String(pr.created_at || pr.createdAt || "").startsWith(expectedDate);
}

function normalizePr(pr) {
  return {
    ...pr,
    user: pr.user || pr.author,
    base: pr.base || { ref: pr.baseRefName },
    head: pr.head || { ref: pr.headRefName, sha: pr.headRefOid },
    html_url: pr.html_url || pr.url,
  };
}

export function evaluateNightlyRun({ registry, date, observed, previousLedger }) {
  const entries = [];

  for (const stage of registry.stages) {
    const evidenceDate = expectedEvidenceDate(stage.number, date);
    const matchingTags = [...observed.tags].filter(tag => tag.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`));
    if (matchingTags.length > 0 || observed.coverageStages.has(stage.number)) {
      const danglingSentinel = observed.danglingSentinelStages?.has(stage.number) ?? false;
      entries.push({
        stage: stage.number,
        state: danglingSentinel ? "DEGRADED" : "MERGED",
        failureClass: danglingSentinel ? "UNFINALIZED_SENTINEL" : null,
        evidence: { tag: matchingTags[0] || null, coverageLog: stage.coverageLog },
      });
      continue;
    }

    const candidates = observed.prs
      .map(normalizePr)
      .filter(pr => prDateMatchesStage(pr, stage.number, date))
      .map(pr => ({ pr, classification: classifyNightlyPr(pr, registry, CONFIG) }))
      .filter(({ classification }) => classification.stage === stage.number);

    const openCandidate = candidates.find(({ pr }) => String(pr.state).toUpperCase() === "OPEN");
    if (openCandidate) {
      entries.push({
        stage: stage.number,
        state: "RECOVERABLE",
        failureClass: openCandidate.classification.kind === "inferred" ? "MALFORMED_BRANCH" : "OPEN_PR",
        evidence: {
          prNumber: openCandidate.pr.number,
          prUrl: openCandidate.pr.html_url,
          headRef: openCandidate.pr.head.ref,
          reason: openCandidate.classification.reason,
        },
      });
      continue;
    }

    const blockedCandidate = observed.prs
      .map(normalizePr)
      .filter(pr => prDateMatchesStage(pr, stage.number, date))
      .map(pr => ({ pr, classification: classifyNightlyPr(pr, registry, CONFIG) }))
      .find(({ classification }) => classification.kind === "blocked");
    if (blockedCandidate) {
      entries.push({
        stage: stage.number,
        state: "BLOCKED",
        failureClass: "UNCLASSIFIED_PR",
        evidence: {
          prNumber: blockedCandidate.pr.number,
          prUrl: blockedCandidate.pr.html_url,
          headRef: blockedCandidate.pr.head.ref,
          reason: blockedCandidate.classification.reason,
        },
      });
      continue;
    }

    const julesMatch = matchJulesSession(observed.julesSessions, stage, date);
    if (julesMatch && IN_FLIGHT_JULES_STATES.has(julesMatch.state)) {
      entries.push({
        stage: stage.number,
        state: "RUNNING",
        failureClass: null,
        evidence: { julesSession: { id: julesMatch.id, state: julesMatch.state } },
      });
      continue;
    }

    const previous = stageEntry(previousLedger, expectedEvidenceDate(stage.number, date), stage.number);
    const recurring = previous?.state === "NO_OUTPUT" || previous?.state === "ESCALATED";
    const failureClass = julesMatch?.state === "COMPLETED"
      ? "JULES_SESSION_STUCK"
      : julesMatch?.state === "FAILED"
        ? "JULES_SESSION_FAILED"
        : "NO_PUBLISHED_OUTPUT";
    entries.push({
      stage: stage.number,
      state: recurring ? "ESCALATED" : "NO_OUTPUT",
      failureClass,
      evidence: julesMatch
        ? { coverageLog: stage.coverageLog, julesSession: { id: julesMatch.id, state: julesMatch.state } }
        : { coverageLog: stage.coverageLog },
    });
  }

  return entries;
}

export function renderSummary(date, entries) {
  const failing = entries.filter(entry => !PASS_STATES.has(entry.state));
  const lines = [
    `# Nightly Watchdog ${date}`,
    "",
    `Merged: ${entries.filter(entry => entry.state === "MERGED").length}`,
    `Recoverable: ${entries.filter(entry => entry.state === "RECOVERABLE").length}`,
    `Blocked: ${entries.filter(entry => entry.state === "BLOCKED").length}`,
    `Degraded: ${entries.filter(entry => entry.state === "DEGRADED").length}`,
    `No output: ${entries.filter(entry => entry.state === "NO_OUTPUT").length}`,
    `Escalated: ${entries.filter(entry => entry.state === "ESCALATED").length}`,
    "",
  ];

  for (const entry of entries) {
    const suffix = entry.evidence?.prNumber ? ` PR #${entry.evidence.prNumber}` : "";
    lines.push(`- Stage ${entry.stage}: ${entry.state}${suffix}`);
  }

  if (failing.length > 0) {
    lines.push("", `Failing states: ${failing.map(entry => `Stage ${entry.stage} ${entry.state}`).join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "dry-run") {
      options.set(key, true);
      continue;
    }
    invariant(index + 1 < argv.length, `${token} requires a value.`);
    options.set(key, argv[index + 1]);
    index++;
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2), config = CONFIG) {
  const options = parseArgs(argv);
  const date = options.get("date") || utcDate();
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid --date value: ${date}`);

  const registry = JSON.parse(fs.readFileSync(config.registryPath, "utf8"));
  const ledger = loadLedger(config.ledgerPath);
  ensureRunEntries(ledger, registry, date);

  let entries;
  try {
    const observed = await collectObservedState(registry, date, config);
    entries = evaluateNightlyRun({ registry, date, observed, previousLedger: ledger });
  } catch (error) {
    for (const stage of registry.stages) {
      upsertStageEntry(ledger, registry, date, stage.number, {
        state: "BLOCKED",
        failureClass: "WATCHDOG_OBSERVER_FAILURE",
        evidence: { reason: error.message },
      });
    }
    entries = Object.values(ledger.runs[date]);
  }

  for (const entry of entries) {
    upsertStageEntry(ledger, registry, date, entry.stage, {
      state: entry.state,
      failureClass: entry.failureClass,
      evidence: entry.evidence,
    });
  }

  const summary = renderSummary(date, entries);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  if (!options.get("dry-run")) {
    saveLedger(ledger, config.ledgerPath);
    if (entries.some(entry => !PASS_STATES.has(entry.state))) {
      try {
        await createOrUpdateEscalationIssue(date, entries, summary, config);
      } catch (error) {
        console.error(`Nightly watchdog escalation issue update failed: ${error.message}`);
      }
    }
  }

  if (entries.some(entry => !PASS_STATES.has(entry.state))) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("nightly-watchdog.mjs");
if (isMain) {
  runCli().catch(error => {
    console.error(`Nightly watchdog error: ${error.message}`);
    process.exitCode = 1;
  });
}
