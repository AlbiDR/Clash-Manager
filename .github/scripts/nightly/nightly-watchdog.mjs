// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { classifyNightlyPr, CONFIG } from "./merge-nightly-core.mjs";
import { ensureRunEntries, loadLedger, saveLedger, stageEntry, upsertStageEntry } from "./nightly-ledger.mjs";
import { createRedactor, redactDeep } from "./nightly-redact.mjs";
import { buildFallbackPlan, publishFallback } from "./nightly-publish-fallback.mjs";
import { HEALTH, evaluatePipelineHealth, renderHealthReport } from "./nightly-health.mjs";

// This workflow deliberately holds JULES_API_KEY so it can resume stranded
// sessions, and the repository is public. Every console line, summary block and
// ledger write goes through the redactor rather than straight to output.
let redact = createRedactor([]);

export function configureRedaction(config = CONFIG) {
  redact = createRedactor([config.julesApiKey, config.token]);
  return redact;
}

function logLine(message) {
  console.log(redact(message));
}

function errorLine(message) {
  console.error(redact(message));
}

// ESCALATED is deliberately NOT a pass state. A stage that has failed on
// consecutive days is the single most important thing the watchdog can report,
// so it must both appear in the escalation issue and fail the workflow run.
const PASS_STATES = new Set(["MERGED", "RECOVERABLE"]);
const JULES_API_BASE = "https://jules.googleapis.com/v1alpha";
const IN_FLIGHT_JULES_STATES = new Set([
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "IN_PROGRESS",
  "PAUSED",
]);

// Branch that Nightly is expected to reach. Nightly landing its stages is only
// half the contract; if the work never promotes, the pipeline is still stalled.
const PROMOTION_BRANCH = "Beta";
const STALENESS_ALARM_HOURS = 24;

// A stage pull request normally merges within about an hour of being opened, so
// one still open a full day later is not slow, it is abandoned. PR #1546 sat
// open from 2026-08-24 with a non-fast-forward head ref, and for three
// consecutive runs it was the sole cause of stage 1 being classified BLOCKED
// with failureClass MERGE_COORDINATOR. Nothing reported it and nothing reaped
// it; it stopped mattering only when it was closed by hand on 2026-08-27.
// Reporting is deliberately all this does. Closing someone else's pull request
// automatically is not a decision a nightly observer should be making, and the
// exit code stays untouched so this can never turn a healthy run red.
const STALE_STAGE_PR_HOURS = 24;
const STAGE_BRANCH_PREFIX = "nightly/stage-";

// A COMPLETED Jules session with no published PR is holding a finished change
// set that its native publisher never shipped. Nudging asks it to hand that
// work over; it never asks the session to redo or re-decide anything.
const RECOVERABLE_FAILURE_CLASSES = new Set(["JULES_SESSION_STUCK"]);
const MAX_RECOVERY_ATTEMPTS = 2;

// Mirrors the finalization handoff wording the stage prompts already use, so a
// nudged session resumes into its own publication step rather than restarting
// work or opening a review loop it was explicitly told not to run.
export const RECOVERY_PROMPT = [
  "Your finalized change set was never published as a Pull Request and the session went inactive.",
  "A published Pull Request is the only valid outcome of this session; simply restating your result again does not complete it.",
  "If any distinct action, tool, or control is available to you to submit, complete, or hand off the session, separate from simply writing a message, invoke it now.",
  "Return the existing final result as your absolute last message, with nothing after it: no summary, no offer to do more, no question.",
  "Do not redo the audit, re-run tests, or start new work.",
  "Do not run code review, memory, reflection, git commit, or git push.",
].join(" ");

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

// Returns availability alongside the sessions. Silently degrading to an empty
// list would misreport a dead API key as "the stage produced no output", which
// hides the real fault and makes recovery impossible to even attempt.
//
// Pages through nextPageToken like every GitHub call in this file already
// does. A single unpaginated GET here would leave any session past the first
// page invisible to matchJulesSession, silently downgrading a recoverable
// stuck session to the unrecoverable NO_PUBLISHED_OUTPUT class.
export async function fetchJulesSessions(config = CONFIG, fetchImpl = fetch) {
  if (!config.julesApiKey) {
    errorLine("JULES_API_KEY is not configured; session evidence is unavailable for this run.");
    return { sessions: [], available: false, error: "JULES_API_KEY is not configured." };
  }
  try {
    const sessions = [];
    let pageToken = "";
    do {
      const url = new URL(`${JULES_API_BASE}/sessions`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetchImpl(url.toString(), {
        headers: { "X-Goog-Api-Key": config.julesApiKey },
      });
      if (!res.ok) {
        const error = `Jules API ${res.status} ${res.statusText}`;
        errorLine(`${error}; session evidence is unavailable for this run.`);
        return { sessions: [], available: false, error };
      }
      const body = await res.json();
      if (Array.isArray(body.sessions)) sessions.push(...body.sessions);
      pageToken = body.nextPageToken || "";
    } while (pageToken);
    return { sessions, available: true, error: null };
  } catch (error) {
    errorLine(`Jules API request failed: ${error.message}; session evidence is unavailable for this run.`);
    return { sessions: [], available: false, error: error.message };
  }
}

export function julesSessionPath(session) {
  const raw = String(session?.name || session?.id || "").trim();
  if (!raw) return null;
  return raw.startsWith("sessions/") ? raw : `sessions/${raw}`;
}

// POST /v1alpha/sessions/{session}:sendMessage
// https://developers.google.com/jules/api/reference/rest/v1alpha/sessions
export async function nudgeJulesSession(session, config = CONFIG, fetchImpl = fetch) {
  const sessionPath = julesSessionPath(session);
  if (!sessionPath) return { ok: false, error: "Session has no resolvable resource name." };
  if (!config.julesApiKey) return { ok: false, error: "JULES_API_KEY is not configured." };

  try {
    const res = await fetchImpl(`${JULES_API_BASE}/${sessionPath}:sendMessage`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": config.julesApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: RECOVERY_PROMPT }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Jules sendMessage ${res.status} ${res.statusText}: ${text}`.trim() };
    }
    return { ok: true, error: null, sessionPath };
  } catch (error) {
    return { ok: false, error: `Jules sendMessage request failed: ${error.message}` };
  }
}

export function hasDanglingSentinel(content, stageNumber, date) {
  const sentinel = `* [${date}] [Stage ${stageNumber}] IN-PROGRESS: session started`;
  return String(content || "").includes(sentinel);
}

export function matchJulesSession(sessions, stage, date) {
  const evidenceDate = expectedEvidenceDate(stage.number, date);
  const compactHeader = `S${String(stage.number).padStart(2, "0")}:`;
  const legacyHeader = `[Stage ${stage.number}]`;
  const legacyPaddedHeader = `[Stage ${String(stage.number).padStart(2, "0")}]`;
  const matches = (sessions || [])
    .filter(session => {
      if (typeof session?.prompt !== "string") return false;
      return session.prompt.includes(compactHeader) ||
        session.prompt.includes(legacyHeader) ||
        session.prompt.includes(legacyPaddedHeader);
    })
    .filter(session => String(session.createTime || "").slice(0, 10) === evidenceDate)
    .sort((a, b) => String(b.createTime || "").localeCompare(String(a.createTime || "")));
  return matches[0] || null;
}

// Pure half, so the alarm threshold is testable without a git checkout.
// `commitIsoList` is newest-first, matching `git log` output order.
export function evaluatePromotionStaleness(commitIsoList, now = new Date()) {
  const commits = (commitIsoList || []).filter(Boolean);
  if (commits.length === 0) {
    return { available: true, error: null, commitCount: 0, stale: false, oldestCommitIso: null, ageHours: 0 };
  }

  const oldestCommitIso = commits[commits.length - 1];
  const ageHours = (now.getTime() - new Date(oldestCommitIso).getTime()) / 3_600_000;
  return {
    available: true,
    error: null,
    commitCount: commits.length,
    oldestCommitIso,
    ageHours,
    stale: ageHours >= STALENESS_ALARM_HOURS,
  };
}

export function measurePromotionStaleness(targetBranch = "Nightly", promotionBranch = PROMOTION_BRANCH, now = new Date()) {
  try {
    const commits = runGit(["log", `origin/${promotionBranch}..origin/${targetBranch}`, "--format=%cI"])
      .split("\n")
      .filter(Boolean);
    return evaluatePromotionStaleness(commits, now);
  } catch (error) {
    return { available: false, error: error.message, commitCount: 0, stale: false };
  }
}

async function collectObservedState(registry, date, config = CONFIG) {
  runGit(["fetch", "--tags", "origin", config.targetBranch]);
  try {
    runGit(["fetch", "origin", PROMOTION_BRANCH]);
  } catch (error) {
    errorLine(`Could not fetch origin/${PROMOTION_BRANCH}: ${error.message}`);
  }
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

  const jules = await fetchJulesSessions(config);
  const promotion = measurePromotionStaleness(config.targetBranch);

  return {
    prs,
    tags,
    coverageStages,
    danglingSentinelStages,
    julesSessions: jules.sessions,
    julesAvailable: jules.available,
    julesError: jules.error,
    promotion,
  };
}

async function createOrUpdateEscalationIssue(date, entries, summary, config = CONFIG) {
  const unresolved = entries.filter(entry => !PASS_STATES.has(entry.state));
  if (unresolved.length === 0) return;

  const title = `[Nightly Watchdog] ${date} unresolved pipeline stages`;
  const body = [
    "The Nightly watchdog detected unresolved stage states after the post-window cutoff.",
    "",
    summary,
    "Automated recovery already attempted a nudge for any JULES_SESSION_STUCK stage.",
    "The stages below survived that pass and need attention:",
    "",
    ...unresolved.map(entry => `- Stage ${entry.stage}: ${entry.state} (${entry.failureClass || "unclassified"})`),
    "",
    "Recovery policy:",
    "- Merge recoverable PRs through Sync Nightly PRs.",
    "- Rerun or inspect Jules tasks for NO_OUTPUT stages.",
    "- JULES_API_UNAVAILABLE means the watchdog had no session evidence; check the JULES_API_KEY secret.",
    "- Preserve blocked branches until their evidence has been reviewed.",
  ].join("\n");

  const existing = await findIssueByTitle(title, config);
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

async function findIssueByTitle(title, config = CONFIG) {
  const query = encodeURIComponent(`repo:${config.owner}/${config.repo} is:issue in:title "${title}"`);
  const search = await githubApi(`/search/issues?q=${query}`, config);
  return search.items?.find(issue => issue.title === title) || null;
}

// Landing every stage on Nightly is only half the contract. If Nightly never
// promotes, the pipeline is stalled even though every stage reported MERGED.
// Reported through the step summary rather than an issue, because Issues are
// disabled on this repository and an issue-based alarm can never fire.
export function renderPromotionSummary(promotion, promotionBranch = PROMOTION_BRANCH) {
  if (!promotion?.available) {
    return `\nPromotion to ${promotionBranch}: not measured (observer could not read the branches).\n`;
  }
  if (promotion.commitCount === 0) {
    return `\nPromotion to ${promotionBranch}: current, nothing pending.\n`;
  }
  if (!promotion.stale) {
    return `\nPromotion to ${promotionBranch}: ${promotion.commitCount} commit(s) pending, within the ${STALENESS_ALARM_HOURS}h window.\n`;
  }
  return [
    "",
    `Promotion to ${promotionBranch}: STALLED.`,
    `${promotion.commitCount} commit(s) have been waiting ${Math.floor(promotion.ageHours)}h (oldest ${promotion.oldestCommitIso}).`,
    "Nightly stages are landing but the work is not promoting. Dispatch the Sync Branches workflow.",
    "",
  ].join("\n");
}

// Pure half of the abandoned-stage-PR report. Takes the pull request list the
// observer has already fetched, so this costs no additional API calls.
export function evaluateStaleStagePrs(prs, now = new Date(), maxAgeHours = STALE_STAGE_PR_HOURS) {
  const nowMs = now.getTime();
  return (prs || [])
    .map(pr => normalizePr(pr))
    .filter(pr => (pr.state || "").toLowerCase() === "open")
    .filter(pr => String(pr.head?.ref || "").startsWith(STAGE_BRANCH_PREFIX))
    .map(pr => {
      const createdIso = String(pr.created_at || pr.createdAt || "");
      const createdMs = Date.parse(createdIso);
      return {
        number: pr.number,
        headRef: pr.head?.ref || null,
        url: pr.html_url || null,
        createdIso,
        ageHours: Number.isNaN(createdMs) ? null : (nowMs - createdMs) / 3_600_000,
      };
    })
    // An unparseable timestamp is reported rather than dropped: a stage PR the
    // observer cannot date is itself worth a human look.
    .filter(pr => pr.ageHours === null || pr.ageHours >= maxAgeHours)
    .sort((a, b) => (b.ageHours ?? Infinity) - (a.ageHours ?? Infinity));
}

// Reported on every run, not only when it breaks. The recovery path is silent
// infrastructure: it does nothing visible until the night it is needed, so the
// only way to know it is still armed is to say so while it is.
export function renderRecoveryReadiness(julesAvailable, julesError) {
  if (julesAvailable === false) {
    return [
      "",
      "Recovery: DISARMED. The Jules API is unreachable, so no stranded session can be nudged.",
      julesError ? `Reason: ${julesError}` : "No reason reported.",
      "Every stage may still have merged tonight; that is not evidence this is working.",
      "JULES_SESSION_STUCK is the pipeline's dominant historical failure and it is",
      "unrecoverable until this is fixed. Check the JULES_API_KEY repository secret.",
      "",
    ].join("\n");
  }
  if (julesAvailable === true) {
    return "\nRecovery: armed (Jules API reachable, stranded sessions can be nudged).\n";
  }
  return "\nRecovery: not measured (the observer did not reach the Jules API check).\n";
}

export function renderStaleStagePrReport(stale, maxAgeHours = STALE_STAGE_PR_HOURS) {
  // Distinguished from an empty list on purpose. If the observer threw before it
  // could read the pull requests, saying "none" would be a false all-clear.
  if (stale === null || stale === undefined) {
    return "\nAbandoned stage PRs: not measured (observer could not read the pull requests).\n";
  }
  if (stale.length === 0) {
    return `\nAbandoned stage PRs: none open longer than ${maxAgeHours}h.\n`;
  }
  const lines = [
    "",
    `Abandoned stage PRs: ${stale.length} open longer than ${maxAgeHours}h.`,
    "An open stage PR that never merged can be misclassified as a live blocker on",
    "every later run, so review and close or merge these by hand.",
  ];
  for (const pr of stale) {
    const age = pr.ageHours === null ? "age unknown" : `${Math.floor(pr.ageHours)}h old`;
    lines.push(`- PR #${pr.number} (${age}) ${pr.headRef || "unknown ref"} ${pr.url || ""}`.trimEnd());
  }
  lines.push("");
  return lines.join("\n");
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

// Per-stage timing recorded for EVERY stage, including the ones that merged
// cleanly. Only recording it for failures would make the data useless for its
// actual purpose: you cannot see a stage drifting towards failure if you only
// start measuring once it has already failed.
//
// createTime is the load-bearing field. It is the only evidence in the whole
// system that separates "this stage was never triggered" (its Jules UI schedule
// is disabled, deleted or misconfigured, and nothing in this repository can see
// that) from "it was triggered and then stranded". Those two look identical
// from the outside and need completely different fixes.
//
// lifetimeMinutes is create-to-update and is explicitly NOT work duration: a
// session that finishes early but is touched later reads long (stage 13 showed
// 592 minutes on 2026-08-27 for minutes of actual work). It is recorded as a
// coarse signal, and named so nobody mistakes it for something it is not.
export function sessionTelemetry(session) {
  if (!session) return null;
  const createTime = session.createTime || null;
  const updateTime = session.updateTime || null;
  const span = createTime && updateTime ? (Date.parse(updateTime) - Date.parse(createTime)) / 60000 : null;
  return {
    id: session.id,
    name: julesSessionPath(session),
    state: session.state,
    createTime,
    updateTime,
    lifetimeMinutes: Number.isFinite(span) ? Math.round(span * 10) / 10 : null,
  };
}

export function evaluateNightlyRun({ registry, date, observed, previousLedger }) {
  const entries = [];
  const julesAvailable = observed.julesAvailable ?? true;

  for (const stage of registry.stages) {
    const evidenceDate = expectedEvidenceDate(stage.number, date);
    const matchingTags = [...observed.tags].filter(tag => tag.startsWith(`nightly/${evidenceDate}/stage-${stage.number}/pr-`));
    if (matchingTags.length > 0 || observed.coverageStages.has(stage.number)) {
      const danglingSentinel = observed.danglingSentinelStages?.has(stage.number) ?? false;
      entries.push({
        stage: stage.number,
        state: danglingSentinel ? "DEGRADED" : "MERGED",
        failureClass: danglingSentinel ? "UNFINALIZED_SENTINEL" : null,
        evidence: {
          tag: matchingTags[0] || null,
          coverageLog: stage.coverageLog,
          // Recorded on success too; see sessionTelemetry for why.
          session: sessionTelemetry(matchJulesSession(observed.julesSessions, stage, date)),
        },
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
        evidence: {
          julesSession: { id: julesMatch.id, state: julesMatch.state },
          session: sessionTelemetry(julesMatch),
        },
      });
      continue;
    }

    // Escalation must consider the PRIOR RUN, not just this date's row.
    // Ledger rows are keyed by run date and ensureRunEntries has already seeded
    // today's row as EXPECTED, so consulting only `date` meant a stage that
    // failed yesterday never escalated. Check both: the same date catches a
    // second watchdog pass on the same day, the prior day catches chronic failure.
    const priorDate = utcDate(-1, new Date(`${date}T00:00:00.000Z`));
    const hasFailed = candidate => candidate?.state === "NO_OUTPUT" || candidate?.state === "ESCALATED";
    const recurring = hasFailed(stageEntry(previousLedger, date, stage.number))
      || hasFailed(stageEntry(previousLedger, priorDate, stage.number));
    // Without session evidence we cannot tell a stuck session from a stage that
    // never ran, so say so explicitly instead of guessing NO_PUBLISHED_OUTPUT.
    const failureClass = julesAvailable === false
      ? "JULES_API_UNAVAILABLE"
      : julesMatch?.state === "COMPLETED"
        ? "JULES_SESSION_STUCK"
        : julesMatch?.state === "FAILED"
          ? "JULES_SESSION_FAILED"
          : "NO_PUBLISHED_OUTPUT";
    entries.push({
      stage: stage.number,
      state: recurring ? "ESCALATED" : "NO_OUTPUT",
      failureClass,
      evidence: julesMatch
        ? {
          coverageLog: stage.coverageLog,
          julesSession: {
            id: julesMatch.id,
            name: julesSessionPath(julesMatch),
            state: julesMatch.state,
          },
          session: sessionTelemetry(julesMatch),
        }
        : { coverageLog: stage.coverageLog, julesApiError: observed.julesError || null },
    });
  }

  return entries;
}

// Ledger rows are keyed by run date; expectedEvidenceDate only governs which
// tag, log line, or PR date counts as evidence for a stage.
export function selectRecoveryCandidates(entries, ledger, date) {
  return entries.filter(entry => {
    if (!RECOVERABLE_FAILURE_CLASSES.has(entry.failureClass)) return false;
    if (!entry.evidence?.julesSession) return false;
    const recorded = stageEntry(ledger, date, entry.stage);
    return (recorded?.attempts ?? 0) < MAX_RECOVERY_ATTEMPTS;
  });
}

// Asks each stuck session to hand over the change set it already finalized,
// then waits for the publisher to open the PR so the same run can merge it.
export async function recoverStuckStages({
  entries,
  ledger,
  registry,
  date,
  config = CONFIG,
  fetchImpl = fetch,
  listPullRequests = fetchRecentPullRequests,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollAttempts = 8,
  pollIntervalMs = 60_000,
} = {}) {
  const candidates = selectRecoveryCandidates(entries, ledger, date);
  if (candidates.length === 0) return { attempted: [], recovered: [], failed: [] };

  const attempted = [];
  const failed = [];
  for (const entry of candidates) {
    const session = entry.evidence.julesSession;
    const result = await nudgeJulesSession(session, config, fetchImpl);
    const recorded = stageEntry(ledger, date, entry.stage);
    // Only a nudge Jules actually received should cost a retry. A failed HTTP
    // call (dead credential, transient network error) never reached the
    // session, so it must not burn the MAX_RECOVERY_ATTEMPTS budget; otherwise
    // two delivery failures permanently disable recovery for the date even
    // though no attempt was ever made against the stuck session itself.
    upsertStageEntry(ledger, registry, date, entry.stage, {
      attempts: (recorded?.attempts ?? 0) + (result.ok ? 1 : 0),
      evidence: {
        recovery: {
          nudgedAt: new Date().toISOString(),
          sessionName: session.name || session.id,
          ok: result.ok,
          error: result.error,
        },
      },
    });

    if (result.ok) {
      logLine(`Stage ${entry.stage}: nudged stuck Jules session ${session.name || session.id}.`);
      attempted.push(entry);
    } else {
      errorLine(`Stage ${entry.stage}: nudge failed. ${result.error}`);
      failed.push({ entry, error: result.error });
    }
  }

  if (attempted.length === 0) return { attempted, recovered: [], failed };

  const pending = new Set(attempted.map(entry => entry.stage));
  const recovered = [];
  for (let attempt = 0; attempt < pollAttempts && pending.size > 0; attempt += 1) {
    await sleep(pollIntervalMs);
    let prs;
    try {
      prs = await listPullRequests(config);
    } catch (error) {
      errorLine(`Recovery poll could not list pull requests: ${error.message}`);
      continue;
    }
    for (const stageNumber of [...pending]) {
      const match = prs
        .map(normalizePr)
        .filter(pr => prDateMatchesStage(pr, stageNumber, date))
        .map(pr => ({ pr, classification: classifyNightlyPr(pr, registry, config) }))
        .find(({ pr, classification }) => classification.stage === stageNumber && String(pr.state).toUpperCase() === "OPEN");
      if (!match) continue;
      logLine(`Stage ${stageNumber}: recovered as PR #${match.pr.number}.`);
      upsertStageEntry(ledger, registry, date, stageNumber, {
        state: "RECOVERABLE",
        failureClass: "RECOVERED_AFTER_NUDGE",
        evidence: { prNumber: match.pr.number, prUrl: match.pr.html_url },
      });
      recovered.push({ stage: stageNumber, prNumber: match.pr.number });
      pending.delete(stageNumber);
    }
  }

  for (const stageNumber of pending) {
    errorLine(`Stage ${stageNumber}: nudge sent but no pull request appeared before the poll window closed.`);
  }

  // Everything the nudge could not rescue. Reported so the caller can escalate
  // to the fallback publisher rather than writing the stage off for the night.
  const recoveredStages = new Set(recovered.map(item => item.stage));
  const unrecovered = [
    ...attempted.filter(entry => !recoveredStages.has(entry.stage)),
    ...failed.map(item => item.entry),
  ];

  return { attempted, recovered, failed, unrecovered };
}

// Last resort once nudging has failed: publish the stage's finished work
// ourselves. See nightly-publish-fallback.mjs for why this is safe to do
// autonomously (the patch is validated against the same per-stage write
// boundary the normal path uses, and refuses rather than guesses).
//
// Runs only over stages the nudge could not rescue, so the happy path and the
// nudge path both behave exactly as they did before.
export async function publishStrandedWork({
  unrecovered = [],
  julesSessions = [],
  ledger,
  registry,
  date,
  config = CONFIG,
  dryRun = false,
  publish = publishFallback,
} = {}) {
  const published = [];
  const refused = [];
  if (unrecovered.length === 0) return { published, refused };

  for (const entry of unrecovered) {
    const stage = registry.stages.find(item => item.number === entry.stage);
    // Re-matched from the full session list: the ledger only records a session's
    // id, name and state, never the change set, so evidence alone cannot publish.
    const session = matchJulesSession(julesSessions, stage, date);
    const plan = buildFallbackPlan({ stage, session, date: expectedEvidenceDate(entry.stage, date) });

    if (!plan.ok) {
      errorLine(`Fallback publish declined. ${plan.reason}`);
      refused.push({ stage: entry.stage, reason: plan.reason });
      continue;
    }

    try {
      const result = await publish(plan, { config, githubApi, dryRun, log: logLine });
      if (result.published) {
        upsertStageEntry(ledger, registry, date, entry.stage, {
          state: "RECOVERABLE",
          failureClass: "RECOVERED_BY_FALLBACK_PUBLISH",
          evidence: {
            prNumber: result.prNumber,
            prUrl: result.prUrl,
            headRef: result.branch,
            fallbackPublish: { at: new Date().toISOString(), sessionName: plan.sessionName, status: plan.status },
          },
        });
        published.push({ stage: entry.stage, prNumber: result.prNumber });
      }
    } catch (error) {
      errorLine(`Stage ${entry.stage}: fallback publish failed. ${error.message}`);
      refused.push({ stage: entry.stage, reason: error.message });
    }
  }

  return { published, refused };
}

export async function dispatchMergeWorkflow(config = CONFIG) {
  try {
    await githubApi(
      `/repos/${config.owner}/${config.repo}/actions/workflows/merge-nightly-prs.yml/dispatches`,
      config,
      "POST",
      { ref: config.targetBranch },
    );
    logLine("Dispatched Sync Nightly PRs to merge the recovered pull requests.");
    return true;
  } catch (error) {
    errorLine(`Could not dispatch Sync Nightly PRs: ${error.message}`);
    return false;
  }
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
    `Recovered by nudge: ${entries.filter(entry => entry.failureClass === "RECOVERED_AFTER_NUDGE").length}`,
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

// Exit codes are distinct so the workflow conclusion carries information.
// Collapsing these into a single `exit 1` is what made the watchdog red on 100
// percent of its runs since deployment, and therefore useless as a signal.
//   0 = every stage accountable, recovery armed, promotion healthy
//   2 = stages unresolved, recovery disarmed, or promotion stalled
//   1 = the observer or its environment is broken
export function resolveExitCode({ observerHealthy, promotion, entries, julesAvailable, chronicStages }) {
  if (!observerHealthy) return 1;

  // A dead Jules credential must fail the run even when every stage merged.
  //
  // The nudge path is what took this pipeline from 4 of 13 to 13 of 13, and it
  // is exercised ONLY when a stage strands. So if JULES_API_KEY expires, is
  // rotated without updating the secret, or is simply absent, the failure is
  // invisible: JULES_API_UNAVAILABLE is attached as a failure class only to
  // stages that produced no output, so on a night where all 13 stages publish
  // on their own, every entry is MERGED, every entry passes, and this returned
  // 0. A confident green from a watchdog that has lost the ability to recover
  // anything.
  //
  // The credential would then be found broken on the first night a stage
  // stranded, which is precisely the night it is needed. A mechanism used only
  // in emergencies needs a heartbeat, not an emergency, so its absence is
  // reported on the quiet nights when there is time to fix it.
  if (julesAvailable === false) return 2;

  // A stage that needed rescuing on every one of its recent runs passes every
  // individual night, because each night it was rescued. Left at exit 0 that is
  // a pipeline degrading behind a green light, which is precisely the state
  // this whole consolidation exists to make impossible.
  if ((chronicStages || []).length > 0) return 2;

  if (promotion?.stale) return 2;
  if ((entries || []).some(entry => !PASS_STATES.has(entry.state))) return 2;
  return 0;
}

function parseArgs(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    invariant(token.startsWith("--"), `Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "dry-run" || key === "no-recover" || key === "create-issues" || key === "no-fallback-publish") {
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
  configureRedaction(config);
  const options = parseArgs(argv);
  const date = options.get("date") || utcDate();
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(date), `Invalid --date value: ${date}`);

  const registry = JSON.parse(fs.readFileSync(config.registryPath, "utf8"));
  const ledger = loadLedger(config.ledgerPath);
  ensureRunEntries(ledger, registry, date);

  let entries;
  let promotion = null;
  let staleStagePrs = null;
  let julesAvailable = null;
  let julesError = null;
  let julesSessions = [];
  let observerHealthy = true;
  try {
    const observed = await collectObservedState(registry, date, config);
    promotion = observed.promotion;
    // Captured for the readiness report and the exit code. A run where every
    // stage merged but the credential is dead is NOT a healthy run.
    julesAvailable = observed.julesAvailable ?? null;
    julesError = observed.julesError ?? null;
    // The full sessions, not the trimmed evidence: only these carry the change
    // set the fallback publisher needs.
    julesSessions = observed.julesSessions || [];
    // Report only, derived from the pull requests already fetched above. It
    // deliberately does not feed resolveExitCode: an abandoned PR from a
    // previous run must never turn tonight's healthy run red.
    staleStagePrs = evaluateStaleStagePrs(observed.prs);
    entries = evaluateNightlyRun({ registry, date, observed, previousLedger: ledger });
  } catch (error) {
    observerHealthy = false;
    for (const stage of registry.stages) {
      upsertStageEntry(ledger, registry, date, stage.number, {
        state: "BLOCKED",
        failureClass: "WATCHDOG_OBSERVER_FAILURE",
        evidence: redactDeep({ reason: error.message }, redact),
      });
    }
    entries = Object.values(ledger.runs[date]);
  }

  for (const entry of entries) {
    upsertStageEntry(ledger, registry, date, entry.stage, {
      state: entry.state,
      failureClass: entry.failureClass,
      // The ledger is committed to a public branch, so evidence is scrubbed
      // before it is ever written, not before it is printed.
      evidence: redactDeep(entry.evidence, redact),
    });
  }

  if (!options.get("dry-run") && !options.get("no-recover")) {
    try {
      const recovery = await recoverStuckStages({ entries, ledger, registry, date, config });
      let publishedByFallback = 0;
      // Escalation, not a parallel path: only stages the nudge failed to rescue
      // reach this, so a normal night never touches it.
      if (!options.get("no-fallback-publish") && recovery.unrecovered?.length) {
        const fallback = await publishStrandedWork({
          unrecovered: recovery.unrecovered,
          julesSessions,
          ledger,
          registry,
          date,
          config,
        });
        publishedByFallback = fallback.published.length;
      }
      if (recovery.recovered.length > 0 || publishedByFallback > 0) {
        await dispatchMergeWorkflow(config);
      }
      // Re-derive from the ledger so the summary reflects recovery outcomes.
      entries = Object.values(ledger.runs[date]);
    } catch (error) {
      errorLine(`Nightly watchdog recovery pass failed: ${error.message}`);
    }
  }

  // Evaluated after the recovery pass so tonight's rescues are already recorded
  // and counted. A stage rescued moments ago still needed rescuing.
  const health = evaluatePipelineHealth(ledger, registry);
  for (const stage of health.stages) {
    upsertStageEntry(ledger, registry, date, stage.stage, {
      evidence: { health: { verdict: stage.verdict, currentStreak: stage.currentStreak ?? 0, reason: stage.reason } },
    });
  }

  const promotionReport = renderPromotionSummary(promotion);
  const staleReport = renderStaleStagePrReport(staleStagePrs);
  const recoveryReport = renderRecoveryReadiness(julesAvailable, julesError);
  const healthReport = renderHealthReport(health);
  const summary = redact(
    `${renderSummary(date, entries)}${recoveryReport}${healthReport}${promotionReport}${staleReport}`,
  );
  logLine(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  if (!options.get("dry-run")) {
    saveLedger(ledger, config.ledgerPath);
    // GitHub Issues are disabled on this repository (has_issues is false), so
    // issue creation is opt-in rather than the default alarm channel. The step
    // summary and the exit code carry the signal instead.
    if (options.get("create-issues") && entries.some(entry => !PASS_STATES.has(entry.state))) {
      try {
        await createOrUpdateEscalationIssue(date, entries, summary, config);
      } catch (error) {
        errorLine(`Nightly watchdog escalation issue update failed: ${error.message}`);
      }
    }
  }

  process.exitCode = resolveExitCode({
    observerHealthy,
    promotion,
    entries,
    julesAvailable,
    chronicStages: health.chronic,
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("nightly-watchdog.mjs");
if (isMain) {
  runCli().catch(error => {
    errorLine(`Nightly watchdog error: ${error.message}`);
    process.exitCode = 1;
  });
}
