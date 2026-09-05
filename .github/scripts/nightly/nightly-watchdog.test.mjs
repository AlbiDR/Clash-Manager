// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BLOCKER_EVIDENCE_KEYS,
  createEmptyLedger,
  ensureRunEntries,
  prNumberFromTag,
  stageEntry,
  upsertStageEntry, } from "./nightly-ledger.mjs";
import { CONFIG } from "./merge-nightly-core.mjs";
import { redactDeep } from "./nightly-redact.mjs";
import {
  configureRedaction,
  resolveExitCode,
  renderPromotionSummary,
  evaluateNightlyRun,
  evaluatePromotionStaleness,
  evaluateStaleStagePrs,
  expectedEvidenceDate,
  fetchJulesSessions,
  hasDanglingSentinel,
  julesSessionPath,
  matchJulesSession,
  nudgeJulesSession,
  publishStrandedWork,
  recoverStuckStages,
  selectFallbackCandidates,
  renderRecoveryReadiness,
  renderStaleStagePrReport,
  renderRehearsalReport,
  renderSummary,
  recordObserverFailure,
  rehearseFallbackPublisher,
  buildBodyRepair,
  repairPublishedBodies,
  runFrontier,
  selectRecoveryCandidates,
  sessionTelemetry,
  parseRunWindow,
  classifyPrBody,
} from "./nightly-watchdog.mjs";
import { isObserved, stageInterventionHistory } from "./nightly-health.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));

function mergedObserved(date) {
  return {
    prs: [],
    tags: new Set(registry.stages.map(stage => `nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`)),
    coverageStages: new Set(),
  };
}

test("watchdog succeeds when all thirteen stages have durable tag evidence", () => {
  const date = "2026-08-11";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: mergedObserved(date),
    previousLedger: createEmptyLedger(),
  });

  assert.equal(entries.length, 13);
  assert.equal(entries.every(entry => entry.state === "MERGED"), true);
  assert.match(renderSummary(date, entries), /Merged: 13/);
});

test("watchdog accepts Stage 1 evidence from the previous UTC date", () => {
  assert.equal(expectedEvidenceDate(1, "2026-08-11"), "2026-08-10");
  assert.equal(expectedEvidenceDate(2, "2026-08-11"), "2026-08-11");

  const observed = {
    prs: [],
    tags: new Set(["nightly/2026-08-10/stage-1/pr-1416"]),
    coverageStages: new Set(registry.stages.filter(stage => stage.number !== 1).map(stage => stage.number)),
  };
  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: createEmptyLedger(),
  });

  assert.equal(entries.find(entry => entry.stage === 1).state, "MERGED");
  assert.equal(entries.every(entry => entry.state === "MERGED"), true);
});

test("watchdog reports malformed open PRs as recoverable", () => {
  const observed = mergedObserved("2026-08-11");
  observed.tags.delete("nightly/2026-08-11/stage-3/pr-1403");
  observed.prs.push({
    number: 1418,
    state: "OPEN",
    created_at: "2026-08-11T01:13:17Z",
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "Nightly-1085819592077280237" },
    html_url: "https://github.com/AlbiDR/Clash-Manager/pull/1418",
    files: [".github/nightly-logs/03-baseline-consolidation-coverage.log"],
  });

  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage3 = entries.find(entry => entry.stage === 3);
  assert.equal(stage3.state, "RECOVERABLE");
  assert.equal(stage3.failureClass, "MALFORMED_BRANCH");
  assert.equal(stage3.evidence.prNumber, 1418);
});

test("watchdog marks missing output and escalates repeated missing output", () => {
  const observed = mergedObserved("2026-08-11");
  observed.tags.delete("nightly/2026-08-11/stage-6/pr-1406");
  observed.tags.delete("nightly/2026-08-11/stage-12/pr-1412");
  observed.tags.delete("nightly/2026-08-11/stage-13/pr-1413");

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-11");
  upsertStageEntry(ledger, registry, "2026-08-11", 12, {
    state: "NO_OUTPUT",
    failureClass: "NO_PUBLISHED_OUTPUT",
  });

  // Terminal pass. Stages 12 and 13 are the tail, so nothing published after
  // them can prove they were reached; only the declared end of the run window
  // can judge them. See runFrontier and the --final flag.
  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: ledger,
    final: true,
  });

  assert.equal(entries.find(entry => entry.stage === 6).state, "NO_OUTPUT");
  assert.equal(entries.find(entry => entry.stage === 12).state, "ESCALATED");
  assert.equal(entries.find(entry => entry.stage === 13).state, "NO_OUTPUT");
  // ESCALATED is a repeat failure and must be reported as failing, not passed
  // over. Treating it as a pass hid chronically broken stages behind a green run.
  assert.match(
    renderSummary("2026-08-11", entries),
    /Failing states: Stage 6 NO_OUTPUT, Stage 12 ESCALATED, Stage 13 NO_OUTPUT/,
  );
});

test("watchdog marks an in-flight Jules session as RUNNING instead of NO_OUTPUT", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-6/pr-1406`);
  observed.julesSessions = [
    {
      id: "session-6-running",
      state: "IN_PROGRESS",
      createTime: `${date}T02:00:00Z`,
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
  ];

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage6 = entries.find(entry => entry.stage === 6);
  assert.equal(stage6.state, "RUNNING");
  assert.equal(stage6.failureClass, null);
  assert.equal(stage6.evidence.julesSession.id, "session-6-running");
});

test("watchdog classifies a completed-but-unmerged Jules session as stuck", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-13/pr-1413`);
  observed.julesSessions = [
    {
      id: "session-13-completed",
      state: "COMPLETED",
      createTime: `${date}T05:00:00Z`,
      prompt: "# [Stage 13] Self-Healing Protocol",
    },
  ];

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage13 = entries.find(entry => entry.stage === 13);
  assert.equal(stage13.state, "NO_OUTPUT");
  assert.equal(stage13.failureClass, "JULES_SESSION_STUCK");
  assert.equal(stage13.evidence.julesSession.state, "COMPLETED");
});

test("hasDanglingSentinel detects an un-finalized sentinel for the given stage and date", () => {
  const content = [
    "* [2026-08-13] [Stage 8] CHANGED: Backend/package.json -- Removed redundant p-limit dependency.",
    "* [2026-08-14] Target: Codebase - p-limit | RESTORED | 7.3.1 | | PASS |",
    "* [2026-08-14] [Stage 8] IN-PROGRESS: session started",
  ].join("\n");

  assert.equal(hasDanglingSentinel(content, 8, "2026-08-14"), true);
  assert.equal(hasDanglingSentinel(content, 8, "2026-08-13"), false);
  assert.equal(hasDanglingSentinel(content, 9, "2026-08-14"), false);
});

test("hasDanglingSentinel is false once finalize has replaced the sentinel with a terminal line", () => {
  const content = "* [2026-08-14] [Stage 8] CHANGED: Backend/package.json -- Restored p-limit dependency.";
  assert.equal(hasDanglingSentinel(content, 8, "2026-08-14"), false);
});

test("watchdog downgrades a merged stage with a surviving IN-PROGRESS sentinel to DEGRADED", () => {
  const date = "2026-08-14";
  const observed = mergedObserved(date);
  observed.danglingSentinelStages = new Set([8]);

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  const stage8 = entries.find(entry => entry.stage === 8);
  assert.equal(stage8.state, "DEGRADED");
  assert.equal(stage8.failureClass, "UNFINALIZED_SENTINEL");
  assert.match(renderSummary(date, entries), /Degraded: 1/);
  assert.match(renderSummary(date, entries), /Failing states:.*Stage 8 DEGRADED/);

  assert.equal(entries.filter(entry => entry.stage !== 8).every(entry => entry.state === "MERGED"), true);
});

test("a DEGRADED entry persists through upsertStageEntry instead of throwing", () => {
  // Regression guard: evaluateNightlyRun can emit DEGRADED (above), and runCli
  // persists every entry through upsertStageEntry immediately afterward, outside
  // any try/catch. If DEGRADED were ever missing from LEDGER_STATES again, this
  // would throw here exactly as it did in production: the ledger save and the
  // recovery pass for every other stage in the run never execute.
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-14");
  assert.doesNotThrow(() => {
    upsertStageEntry(ledger, registry, "2026-08-14", 8, {
      state: "DEGRADED",
      failureClass: "UNFINALIZED_SENTINEL",
    });
  });
  assert.equal(ledger.runs["2026-08-14"]["8"].state, "DEGRADED");
});

test("matchJulesSession disambiguates same-header sessions by date", () => {
  const stage = registry.stages.find(entry => entry.number === 6);
  const sessions = [
    {
      id: "yesterday",
      state: "COMPLETED",
      createTime: "2026-08-10T23:00:00Z",
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
    {
      id: "today",
      state: "IN_PROGRESS",
      createTime: "2026-08-11T02:00:00Z",
      prompt: "# [Stage 6] Documentation TSDoc - Interface Contract Architect",
    },
  ];

  const match = matchJulesSession(sessions, stage, "2026-08-11");
  assert.equal(match.id, "today");
});

test("matchJulesSession accepts compact SNN prompt headers", () => {
  const stage = registry.stages.find(entry => entry.number === 6);
  const sessions = [
    {
      id: "compact",
      state: "IN_PROGRESS",
      createTime: "2026-08-11T02:00:00Z",
      prompt: "# S06: Documentation TSDoc - Interface Contract Architect",
    },
  ];

  const match = matchJulesSession(sessions, stage, "2026-08-11");
  assert.equal(match.id, "compact");
});

// --------------------------------------------------------------------------
// Recovery pass: a COMPLETED Jules session with no published PR is holding a
// finished change set. The watchdog must nudge it rather than only log it.
// --------------------------------------------------------------------------

function stuckObserved(date, stageNumber) {
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${expectedEvidenceDate(stageNumber, date)}/stage-${stageNumber}/pr-${1400 + stageNumber}`);
  observed.julesAvailable = true;
  observed.julesSessions = [
    {
      id: `session-${stageNumber}`,
      name: `sessions/session-${stageNumber}`,
      state: "COMPLETED",
      createTime: `${expectedEvidenceDate(stageNumber, date)}T02:00:00Z`,
      prompt: `# [Stage ${stageNumber}] stuck session`,
    },
  ];
  return observed;
}

test("stuck session evidence carries the resource name the recovery pass needs", () => {
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });

  const stage3 = entries.find(entry => entry.stage === 3);
  assert.equal(stage3.failureClass, "JULES_SESSION_STUCK");
  assert.equal(stage3.evidence.julesSession.name, "sessions/session-3");
});

test("watchdog reports JULES_API_UNAVAILABLE instead of guessing NO_PUBLISHED_OUTPUT", () => {
  const date = "2026-08-15";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-4/pr-1404`);
  observed.julesAvailable = false;
  observed.julesError = "Jules API 401 Unauthorized";

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() });
  const stage4 = entries.find(entry => entry.stage === 4);
  assert.equal(stage4.failureClass, "JULES_API_UNAVAILABLE");
  assert.equal(stage4.evidence.julesApiError, "Jules API 401 Unauthorized");
});

test("selectRecoveryCandidates only picks stuck sessions under the attempt cap", () => {
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  assert.deepEqual(selectRecoveryCandidates(entries, ledger, date).map(e => e.stage), [3]);

  upsertStageEntry(ledger, registry, date, 3, { state: "NO_OUTPUT", attempts: 2 });
  assert.deepEqual(selectRecoveryCandidates(entries, ledger, date).map(e => e.stage), []);
});

test("nudgeJulesSession posts to the documented sendMessage endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, statusText: "OK", json: async () => ({}), text: async () => "" };
  };

  const result = await nudgeJulesSession(
    { id: "abc", name: "sessions/abc" },
    { julesApiKey: "test-key" },
    fetchImpl,
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://jules.googleapis.com/v1alpha/sessions/abc:sendMessage");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["X-Goog-Api-Key"], "test-key");
  assert.match(JSON.parse(calls[0].init.body).prompt, /Return the existing final result/);
});

test("julesSessionPath normalizes bare ids and full resource names", () => {
  assert.equal(julesSessionPath({ id: "123" }), "sessions/123");
  assert.equal(julesSessionPath({ name: "sessions/123" }), "sessions/123");
  assert.equal(julesSessionPath({}), null);
});

test("recoverStuckStages nudges, records the attempt, and marks recovery on a new PR", async () => {
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);

  const nudges = [];
  const fetchImpl = async url => {
    nudges.push(url);
    return { ok: true, status: 200, statusText: "OK", json: async () => ({}), text: async () => "" };
  };

  // Recovery poll: the nudged session has now published its PR.
  const listPullRequests = async () => [
    {
      number: 1480,
      state: "open",
      created_at: `${date}T09:00:00Z`,
      user: { login: "google-labs-jules[bot]" },
      base: { ref: "Nightly" },
      head: { ref: "nightly/stage-3-baseline-consolidation-f7ad6a87", sha: "deadbeef" },
      html_url: "https://github.com/AlbiDR/Clash-Manager/pull/1480",
    },
  ];

  const result = await recoverStuckStages({
    entries,
    ledger,
    registry,
    date,
    config: { ...CONFIG, owner: "AlbiDR", repo: "Clash-Manager", token: "t", julesApiKey: "k" },
    fetchImpl,
    listPullRequests,
    sleep: async () => {},
    pollAttempts: 1,
    pollIntervalMs: 0,
  });

  assert.equal(nudges.length, 1);
  assert.deepEqual(result.recovered, [{ stage: 3, prNumber: 1480 }]);

  const row = ledger.runs[date]["3"];
  assert.equal(row.attempts, 1);
  assert.equal(row.state, "RECOVERABLE");
  assert.equal(row.failureClass, "RECOVERED_AFTER_NUDGE");
  assert.equal(row.evidence.recovery.ok, true);
});

test("recoverStuckStages does not spend the attempt budget on a failed nudge delivery", async () => {
  // Regression guard: a nudge that never reached Jules (dead credential,
  // network error) must not count against MAX_RECOVERY_ATTEMPTS. Before this
  // fix, two delivery failures alone permanently disabled recovery for the
  // date even though no attempt was ever made against the stuck session.
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);

  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => "invalid key",
  });

  const result = await recoverStuckStages({
    entries,
    ledger,
    registry,
    date,
    config: { ...CONFIG, owner: "AlbiDR", repo: "Clash-Manager", token: "t", julesApiKey: "k" },
    fetchImpl,
    listPullRequests: async () => [],
    sleep: async () => {},
    pollAttempts: 0,
    pollIntervalMs: 0,
  });

  assert.equal(result.failed.length, 1);
  const row = ledger.runs[date]["3"];
  assert.equal(row.attempts, 0);
  assert.equal(row.evidence.recovery.ok, false);

  // A second failed delivery must still leave the budget untouched, so a
  // later run (fresh credential) can still nudge this session.
  await recoverStuckStages({
    entries,
    ledger,
    registry,
    date,
    config: { ...CONFIG, owner: "AlbiDR", repo: "Clash-Manager", token: "t", julesApiKey: "k" },
    fetchImpl,
    listPullRequests: async () => [],
    sleep: async () => {},
    pollAttempts: 0,
    pollIntervalMs: 0,
  });
  assert.equal(ledger.runs[date]["3"].attempts, 0);
  assert.deepEqual(selectRecoveryCandidates(entries, ledger, date).map(entry => entry.stage), [3]);
});

test("fetchJulesSessions follows nextPageToken instead of returning only the first page", async () => {
  // Regression guard: every GitHub call in this file pages properly; a single
  // unpaginated GET here left any session past the first page invisible to
  // matchJulesSession, silently downgrading a recoverable stuck session to
  // NO_PUBLISHED_OUTPUT.
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const parsed = new URL(url);
    if (!parsed.searchParams.get("pageToken")) {
      return {
        ok: true,
        json: async () => ({ sessions: [{ id: "page-1-session" }], nextPageToken: "token-2" }),
      };
    }
    return {
      ok: true,
      json: async () => ({ sessions: [{ id: "page-2-session" }] }),
    };
  };

  const result = await fetchJulesSessions({ julesApiKey: "k" }, fetchImpl);

  assert.equal(calls.length, 2);
  assert.equal(result.available, true);
  assert.deepEqual(result.sessions.map(session => session.id), ["page-1-session", "page-2-session"]);
});

// --------------------------------------------------------------------------
// Promotion staleness: every stage can land on Nightly and the pipeline can
// still be stalled if that work never reaches Beta.
// --------------------------------------------------------------------------

test("evaluatePromotionStaleness stays quiet when Nightly is fully promoted", () => {
  const result = evaluatePromotionStaleness([], new Date("2026-08-16T12:00:00Z"));
  assert.equal(result.commitCount, 0);
  assert.equal(result.stale, false);
});

test("evaluatePromotionStaleness stays quiet for work that landed within the window", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  const result = evaluatePromotionStaleness(["2026-08-16T10:00:00Z", "2026-08-16T04:00:00Z"], now);
  assert.equal(result.commitCount, 2);
  assert.equal(result.stale, false);
});

test("evaluatePromotionStaleness alarms once the oldest commit passes the window", () => {
  const now = new Date("2026-08-16T12:00:00Z");
  // Mirrors the real backlog: 33 commits with the oldest stranded two days.
  const commits = Array.from({ length: 33 }, (_, index) =>
    new Date(now.getTime() - (index + 1) * 3_600_000).toISOString());
  const result = evaluatePromotionStaleness(commits, now);

  assert.equal(result.commitCount, 33);
  assert.equal(result.stale, true);
  assert.equal(Math.round(result.ageHours), 33);
});

test("watchdog escalates a stage that also failed on the previous run date", () => {
  const date = "2026-08-16";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-11/pr-1411`);

  // Stage 11 already failed yesterday. Before this fix the lookup only ever read
  // today's freshly seeded EXPECTED row, so ESCALATED could never fire.
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-15");
  upsertStageEntry(ledger, registry, "2026-08-15", 11, {
    state: "NO_OUTPUT",
    failureClass: "JULES_SESSION_STUCK",
  });
  ensureRunEntries(ledger, registry, date);

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: ledger });
  assert.equal(entries.find(entry => entry.stage === 11).state, "ESCALATED");
  assert.match(renderSummary(date, entries), /Failing states:.*Stage 11 ESCALATED/);
});

test("watchdog does not escalate a stage whose previous run date was clean", () => {
  const date = "2026-08-16";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${date}/stage-11/pr-1411`);

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-15");
  upsertStageEntry(ledger, registry, "2026-08-15", 11, { state: "MERGED" });
  ensureRunEntries(ledger, registry, date);

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: ledger });
  assert.equal(entries.find(entry => entry.stage === 11).state, "NO_OUTPUT");
});

// --------------------------------------------------------------------------
// Redaction and reporting surfaces. The watchdog holds JULES_API_KEY on a
// public repository, so nothing it emits or commits may carry the secret.
// --------------------------------------------------------------------------

test("configureRedaction scrubs the Jules key and the GitHub token from output", () => {
  const key = "AIzaSyD-NightlyWatchdogTestKey0000000000";
  const token = "ghp_nightlyWatchdogTestToken0123456789";
  const redact = configureRedaction({ julesApiKey: key, token });

  assert.equal(redact(`Jules API 401 for ${key}`).includes(key), false);
  assert.equal(redact(`Bearer ${token}`).includes(token), false);
});

test("ledger evidence is scrubbed before it is written to the public branch", () => {
  const key = "AIzaSyD-NightlyWatchdogTestKey0000000000";
  const redact = configureRedaction({ julesApiKey: key, token: "" });
  const evidence = redactDeep(
    { julesApiError: `Jules API 401 Unauthorized: key ${key} rejected`, coverageLog: "log.log" },
    redact,
  );

  assert.equal(JSON.stringify(evidence).includes(key), false);
  assert.equal(evidence.coverageLog, "log.log");
});

test("renderPromotionSummary reports a stalled promotion in the step summary", () => {
  const summary = renderPromotionSummary({
    available: true,
    commitCount: 45,
    ageHours: 39.8,
    oldestCommitIso: "2026-08-14T21:06:17Z",
    stale: true,
  });

  assert.match(summary, /STALLED/);
  assert.match(summary, /45 commit\(s\) have been waiting 39h/);
  assert.match(summary, /Dispatch the Sync Branches workflow/);
});

test("renderPromotionSummary stays quiet when promotion is current", () => {
  const summary = renderPromotionSummary({ available: true, commitCount: 0, stale: false });
  assert.match(summary, /current, nothing pending/);
  assert.doesNotMatch(summary, /STALLED/);
});

test("renderPromotionSummary distinguishes unmeasured from healthy", () => {
  const summary = renderPromotionSummary({ available: false });
  assert.match(summary, /not measured/);
  assert.doesNotMatch(summary, /STALLED/);
});

test("resolveExitCode reserves 1 for observer failure and 2 for unresolved stages", () => {
  const merged = [{ stage: 1, state: "MERGED" }, { stage: 2, state: "RECOVERABLE" }];
  const missing = [{ stage: 1, state: "MERGED" }, { stage: 2, state: "NO_OUTPUT" }];
  const healthyPromotion = { available: true, stale: false, commitCount: 0 };
  const stalledPromotion = { available: true, stale: true, commitCount: 45, ageHours: 39.8 };

  // Healthy: every stage accountable, promotion current.
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries: merged }), 0);
  // Unresolved stages must not be indistinguishable from a broken observer.
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries: missing }), 2);
  // A stalled promotion is a pipeline problem, not an observer problem.
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: stalledPromotion, entries: merged }), 2);
  // Observer failure outranks everything else.
  assert.equal(resolveExitCode({ observerHealthy: false, promotion: stalledPromotion, entries: missing }), 1);
  assert.equal(resolveExitCode({ observerHealthy: false, promotion: healthyPromotion, entries: merged }), 1);
});

test("resolveExitCode treats an escalated stage as unresolved", () => {
  const entries = [{ stage: 11, state: "ESCALATED" }];
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: { available: true, stale: false }, entries }), 2);
});

// ---------------------------------------------------------------------------
// Resolved-blocker evidence must not survive into a healthy entry.
// ---------------------------------------------------------------------------

test("a resolved blocker's evidence is dropped once the stage reaches MERGED", () => {
  // Reproduces the real 2026-08-27 stage 1 entry: PR #1546 blocked the stage on
  // 2026-08-24 with a non-fast-forward head ref, the stage later merged under a
  // different PR, and the stale blocker keys rode along for three more runs.
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  ensureRunEntries(ledger, registry, date);

  upsertStageEntry(ledger, registry, date, 1, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    evidence: {
      prNumber: 1546,
      prUrl: "https://github.com/AlbiDR/Clash-Manager/pull/1546",
      headRef: "nightly/stage-1-hardening-c33a9fdc-15239668688411919870",
      reason: "non-fast-forward",
      coverageLog: ".github/nightly-logs/01-hardening-coverage.log",
    },
  });

  const merged = upsertStageEntry(ledger, registry, date, 1, {
    state: "MERGED",
    failureClass: null,
    evidence: { tag: "nightly/2026-08-26/stage-1/pr-1576" },
  });

  for (const key of BLOCKER_EVIDENCE_KEYS) {
    assert.equal(merged.evidence[key], undefined, `${key} should not survive into a MERGED entry`);
  }
  // The audit trail itself is preserved: only the resolved blocker is dropped.
  assert.equal(merged.evidence.tag, "nightly/2026-08-26/stage-1/pr-1576");
  assert.equal(merged.evidence.coverageLog, ".github/nightly-logs/01-hardening-coverage.log");
});

test("a MERGED stage keeps the PR evidence its own pass supplied", () => {
  // The normal case: a stage that merged via its own canonical branch. Its PR
  // number is real evidence, not a leftover, so it must be retained.
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  const entry = upsertStageEntry(ledger, registry, date, 2, {
    state: "MERGED",
    failureClass: null,
    evidence: {
      prNumber: 1577,
      headRef: "nightly/stage-2-verification-1c46cdbe-3460248856176268467",
      reason: "canonical nightly stage branch",
      tag: "nightly/2026-08-27/stage-2/pr-1577",
    },
  });
  assert.equal(entry.evidence.prNumber, 1577);
  assert.equal(entry.evidence.reason, "canonical nightly stage branch");
  assert.equal(entry.evidence.tag, "nightly/2026-08-27/stage-2/pr-1577");
});

test("blocker evidence is retained while the stage is still failing", () => {
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  upsertStageEntry(ledger, registry, date, 4, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    evidence: { prNumber: 99, reason: "non-fast-forward" },
  });
  // A later pass that does not resolve the stage must not erase the diagnosis.
  const still = upsertStageEntry(ledger, registry, date, 4, { state: "NO_OUTPUT" });
  assert.equal(still.evidence.prNumber, 99);
  assert.equal(still.evidence.reason, "non-fast-forward");
});

test("a MERGED stage that still carries a failure class keeps its evidence", () => {
  // Defensive: MERGED plus a non-null failureClass is a contradictory state, so
  // the safe behaviour is to preserve every clue rather than tidy it away.
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  upsertStageEntry(ledger, registry, date, 7, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    evidence: { reason: "non-fast-forward" },
  });
  const odd = upsertStageEntry(ledger, registry, date, 7, {
    state: "MERGED",
    failureClass: "MERGE_COORDINATOR",
  });
  assert.equal(odd.evidence.reason, "non-fast-forward");
});

test("a successful nudge survives the stage merging afterwards", () => {
  // recoverStuckStages writes `recovery` and the stage then merges. That record
  // is how a nudged run is told apart from a clean one, so it must persist.
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  upsertStageEntry(ledger, registry, date, 5, {
    state: "NO_OUTPUT",
    failureClass: "JULES_SESSION_STUCK",
    evidence: {
      julesSession: { id: "13560637745920727717", state: "COMPLETED" },
      recovery: { nudgedAt: "2026-08-27T04:39:17.599Z", ok: true, error: null },
      reason: "no published output",
    },
  });
  const merged = upsertStageEntry(ledger, registry, date, 5, {
    state: "MERGED",
    failureClass: null,
    evidence: { tag: "nightly/2026-08-27/stage-5/pr-1581" },
  });
  assert.equal(merged.evidence.recovery.ok, true);
  assert.equal(merged.evidence.julesSession.id, "13560637745920727717");
  assert.equal(merged.evidence.reason, undefined);
});

// ---------------------------------------------------------------------------
// Abandoned stage pull requests.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-27T12:00:00.000Z");

test("evaluateStaleStagePrs flags an open stage PR older than the window", () => {
  const stale = evaluateStaleStagePrs(
    [
      {
        number: 1546,
        state: "open",
        created_at: "2026-08-24T13:45:48Z",
        head: { ref: "nightly/stage-1-hardening-c33a9fdc-15239668688411919870" },
        html_url: "https://github.com/AlbiDR/Clash-Manager/pull/1546",
      },
    ],
    NOW,
  );
  assert.equal(stale.length, 1);
  assert.equal(stale[0].number, 1546);
  assert.ok(stale[0].ageHours > 24);
});

test("evaluateStaleStagePrs ignores a merged or closed stage PR", () => {
  const prs = [
    { number: 1, state: "closed", created_at: "2026-08-20T00:00:00Z", head: { ref: "nightly/stage-3-x" } },
    { number: 2, state: "merged", created_at: "2026-08-20T00:00:00Z", head: { ref: "nightly/stage-4-x" } },
  ];
  assert.deepEqual(evaluateStaleStagePrs(prs, NOW), []);
});

test("evaluateStaleStagePrs ignores tonight's freshly opened stage PR", () => {
  const prs = [
    { number: 1588, state: "open", created_at: "2026-08-27T11:30:00Z", head: { ref: "nightly/stage-13-x" } },
  ];
  assert.deepEqual(evaluateStaleStagePrs(prs, NOW), []);
});

test("evaluateStaleStagePrs ignores an open PR that is not a stage branch", () => {
  // PR #1527 ("Verify git remote configuration") is exactly this shape: long
  // open, but not a nightly stage branch, so it is not this report's business.
  const prs = [
    { number: 1527, state: "open", created_at: "2026-08-22T21:40:50Z", head: { ref: "inspect-remote-11703119615054146703" } },
  ];
  assert.deepEqual(evaluateStaleStagePrs(prs, NOW), []);
});

test("evaluateStaleStagePrs accepts the GraphQL pull request shape", () => {
  const prs = [
    {
      number: 1546,
      state: "open",
      createdAt: "2026-08-24T13:45:48Z",
      headRefName: "nightly/stage-1-hardening-c33a9fdc",
      url: "https://github.com/AlbiDR/Clash-Manager/pull/1546",
    },
  ];
  const stale = evaluateStaleStagePrs(prs, NOW);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].headRef, "nightly/stage-1-hardening-c33a9fdc");
});

test("evaluateStaleStagePrs reports an undateable stage PR rather than dropping it", () => {
  const prs = [
    { number: 7, state: "open", created_at: "not-a-date", head: { ref: "nightly/stage-6-x" } },
  ];
  const stale = evaluateStaleStagePrs(prs, NOW);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].ageHours, null);
});

test("evaluateStaleStagePrs sorts oldest first and tolerates an empty input", () => {
  const prs = [
    { number: 2, state: "open", created_at: "2026-08-25T00:00:00Z", head: { ref: "nightly/stage-2-x" } },
    { number: 1, state: "open", created_at: "2026-08-23T00:00:00Z", head: { ref: "nightly/stage-1-x" } },
  ];
  assert.deepEqual(evaluateStaleStagePrs(prs, NOW).map(pr => pr.number), [1, 2]);
  assert.deepEqual(evaluateStaleStagePrs([], NOW), []);
  assert.deepEqual(evaluateStaleStagePrs(undefined, NOW), []);
});

test("renderStaleStagePrReport separates 'none' from 'not measured'", () => {
  assert.match(renderStaleStagePrReport([]), /none open longer than 24h/);
  // A failed observer must never read as an all-clear.
  assert.match(renderStaleStagePrReport(null), /not measured/);
  assert.match(renderStaleStagePrReport(undefined), /not measured/);
});

test("renderStaleStagePrReport names every abandoned PR and its age", () => {
  const report = renderStaleStagePrReport([
    { number: 1546, headRef: "nightly/stage-1-hardening-c33a9fdc", url: "https://example.test/1546", ageHours: 70.4 },
    { number: 9, headRef: null, url: null, ageHours: null },
  ]);
  assert.match(report, /2 open longer than 24h/);
  assert.match(report, /PR #1546 \(70h old\) nightly\/stage-1-hardening-c33a9fdc/);
  assert.match(report, /PR #9 \(age unknown\) unknown ref/);
});

test("a stage that merged under its own recovered PR keeps that PR number", () => {
  // The case that rejected the first, blunter version of this rule. Stage 3's
  // PR was MALFORMED_BRANCH, the coordinator recovered it, and it merged under
  // that same PR. The merge pass records only `commitSha`, so `prNumber` is the
  // stage's real provenance and dropping it would destroy the stage-to-PR link
  // for precisely the recoveries that succeeded.
  const ledger = createEmptyLedger();
  const date = "2026-08-11";
  upsertStageEntry(ledger, registry, date, 3, {
    state: "RECOVERABLE",
    failureClass: "MALFORMED_BRANCH",
    evidence: { prNumber: 1418 },
  });
  const merged = upsertStageEntry(ledger, registry, date, 3, {
    state: "MERGED",
    failureClass: null,
    evidence: { commitSha: "8ca87809" },
  });
  assert.equal(merged.evidence.prNumber, 1418);
  assert.equal(merged.evidence.commitSha, "8ca87809");
});

test("a merge tag agreeing with the carried PR number preserves it", () => {
  const ledger = createEmptyLedger();
  const date = "2026-08-27";
  upsertStageEntry(ledger, registry, date, 9, {
    state: "PR_OPEN",
    failureClass: null,
    evidence: { prNumber: 1584, headRef: "nightly/stage-9-refactor-a37250b7" },
  });
  const merged = upsertStageEntry(ledger, registry, date, 9, {
    state: "MERGED",
    failureClass: null,
    evidence: { tag: "nightly/2026-08-27/stage-9/pr-1584" },
  });
  assert.equal(merged.evidence.prNumber, 1584);
  assert.equal(merged.evidence.headRef, "nightly/stage-9-refactor-a37250b7");
});

test("prNumberFromTag reads the PR number only from a well-formed merge tag", () => {
  assert.equal(prNumberFromTag("nightly/2026-08-27/stage-1/pr-1576"), 1576);
  assert.equal(prNumberFromTag("nightly/2026-08-27/stage-1/pr-"), null);
  assert.equal(prNumberFromTag("v14.46.21"), null);
  assert.equal(prNumberFromTag(null), null);
  assert.equal(prNumberFromTag(undefined), null);
});

// ---------------------------------------------------------------------------
// A dead recovery credential must never read as a healthy run.
// ---------------------------------------------------------------------------

test("a perfect night with an unreachable Jules API still fails the run", () => {
  // The exact hole this closes. The nudge path is what took this pipeline from
  // 4 of 13 to 13 of 13, and it runs ONLY when a stage strands. So if
  // JULES_API_KEY expires or is rotated without updating the secret, nothing
  // notices: JULES_API_UNAVAILABLE is attached only to stages that produced no
  // output, so on a night where all 13 publish on their own every entry is
  // MERGED and the run used to exit 0. The credential would then be found
  // broken on the first night a stage stranded, which is the one night it is
  // needed.
  const allMerged = Array.from({ length: 13 }, (_, index) => ({ stage: index + 1, state: "MERGED" }));
  const healthyPromotion = { available: true, stale: false, commitCount: 0 };

  assert.equal(
    resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries: allMerged, julesAvailable: false }),
    3,
    "recovery being disarmed must fail the run even when every stage merged",
  );

  // The same run with the credential working is the genuine all-clear.
  assert.equal(
    resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries: allMerged, julesAvailable: true }),
    0,
  );
});

test("an unreachable Jules API does not masquerade as a broken observer", () => {
  // Exit 1 means "the observer or its environment is broken" and would send you
  // debugging the watchdog. A dead credential is a pipeline capability problem,
  // which is exit 3.
  const entries = [{ stage: 1, state: "MERGED" }];
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: null, entries, julesAvailable: false }), 3);
  assert.equal(resolveExitCode({ observerHealthy: false, promotion: null, entries, julesAvailable: false }), 1);
});

test("omitting julesAvailable leaves the exit code unchanged", () => {
  // Backward compatibility for every existing caller and test: only an explicit
  // false is treated as disarmed, never an absent or unmeasured value.
  const entries = [{ stage: 1, state: "MERGED" }];
  const healthyPromotion = { available: true, stale: false, commitCount: 0 };
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries }), 0);
  assert.equal(
    resolveExitCode({ observerHealthy: true, promotion: healthyPromotion, entries, julesAvailable: null }),
    0,
  );
});

test("renderRecoveryReadiness states the capability on every run, not only on failure", () => {
  // Silent infrastructure has to announce itself while it is working, otherwise
  // the only evidence it ever existed is the night it is missed.
  assert.match(renderRecoveryReadiness(true), /Recovery: armed/);

  const disarmed = renderRecoveryReadiness(false, "Jules API 401 Unauthorized");
  assert.match(disarmed, /Recovery: DISARMED/);
  assert.match(disarmed, /401 Unauthorized/);
  assert.match(disarmed, /JULES_API_KEY/);
  // Must actively contradict the reassuring reading of a green stage list.
  assert.match(disarmed, /not evidence this is working/);

  assert.match(renderRecoveryReadiness(null), /not measured/);
});

// ---------------------------------------------------------------------------
// Fallback publishing: the escalation after a nudge could not rescue a stage.
// ---------------------------------------------------------------------------

const fallbackPatch = (stage, status, date) => {
  const log = stage.coverageLog;
  return `diff --git a/${log} b/${log}\n--- a/${log}\n+++ b/${log}\n@@ -1 +1,2 @@\n context\n+* [${date}] [Stage ${stage.number}] ${status}: Codebase -- recovered work\n`;
};

const strandedSession = (stage, status, date) => ({
  id: `sess-${stage.number}`,
  name: `sessions/sess-${stage.number}`,
  state: "COMPLETED",
  createTime: `${date}T02:00:00Z`,
  prompt: `# [Stage ${stage.number}] something`,
  outputs: [{ changeSet: { gitPatch: { unidiffPatch: fallbackPatch(stage, status, date) } } }],
});

test("a stage the nudge could not rescue is published from the session's own patch", () => {
  const date = "2026-08-20";
  const stage = registry.stages.find(s => s.number === 4);
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  const calls = [];

  return publishStrandedWork({
    unrecovered: [{ stage: 4 }],
    julesSessions: [strandedSession(stage, "CLEAN", date)],
    ledger,
    registry,
    date,
    config: { ...CONFIG, targetBranch: "Nightly" },
    publish: async plan => {
      calls.push(plan);
      return { published: true, branch: plan.branch, prNumber: 4242, prUrl: "https://example.test/4242" };
    },
  }).then(result => {
    assert.equal(result.published.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "CLEAN");

    // The ledger must record HOW it was rescued. A stage recovered by the
    // fallback is a stage whose Jules publisher failed twice over, which is a
    // materially different fact from one the nudge fixed.
    const entry = stageEntry(ledger, date, 4);
    assert.equal(entry.state, "RECOVERABLE");
    assert.equal(entry.failureClass, "RECOVERED_BY_FALLBACK_PUBLISH");
    assert.equal(entry.evidence.prNumber, 4242);
    assert.equal(entry.evidence.fallbackPublish.status, "CLEAN");
  });
});

test("a patch that escapes the stage's write boundary is refused, not published", () => {
  const date = "2026-08-20";
  const stage = registry.stages.find(s => s.number === 2);
  // Stage 2 may only touch *.spec.ts. This patch also rewrites a service.
  const log = stage.coverageLog;
  const patch =
    `diff --git a/${log} b/${log}\n@@ -1 +1,2 @@\n+* [${date}] [Stage 2] CHANGED: x -- bad\n`
    + "diff --git a/Frontend-PWA/src/core/services/useApkManager.ts b/Frontend-PWA/src/core/services/useApkManager.ts\n@@ -1 +1 @@\n+evil\n";
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  let published = false;

  return publishStrandedWork({
    unrecovered: [{ stage: 2 }],
    julesSessions: [{ id: "s2", name: "sessions/s2", state: "COMPLETED", createTime: `${date}T02:00:00Z`,
      prompt: "# [Stage 2] verification", outputs: [{ changeSet: { gitPatch: { unidiffPatch: patch } } }] }],
    ledger,
    registry,
    date,
    config: CONFIG,
    publish: async () => { published = true; return { published: true }; },
  }).then(result => {
    assert.equal(published, false, "the publisher must never be reached for an out-of-boundary patch");
    assert.equal(result.published.length, 0);
    assert.equal(result.refused.length, 1);
    assert.match(result.refused[0].reason, /write boundary/);
    // The stage stays unrescued rather than being marked recovered.
    assert.notEqual(stageEntry(ledger, date, 2).failureClass, "RECOVERED_BY_FALLBACK_PUBLISH");
  });
});

test("nothing is published when there is nothing stranded", () => {
  return publishStrandedWork({ unrecovered: [], registry, date: "2026-08-20", config: CONFIG })
    .then(result => {
      assert.deepEqual(result.published, []);
      assert.deepEqual(result.refused, []);
    });
});

test("a stage with no matching session is refused with a reason", () => {
  const date = "2026-08-20";
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  return publishStrandedWork({
    unrecovered: [{ stage: 6 }],
    julesSessions: [],
    ledger,
    registry,
    date,
    config: CONFIG,
    publish: async () => { throw new Error("must not be called"); },
  }).then(result => {
    assert.equal(result.published.length, 0);
    assert.match(result.refused[0].reason, /no Jules session/);
  });
});

test("a chronically carried stage fails the run even though every night passed", () => {
  // The consolidation this whole health module exists for. Each individual run
  // was a pass, so entries are all in PASS_STATES and every other signal is
  // green. Without this the pipeline reports success while being carried.
  const allPassing = Array.from({ length: 13 }, (_, i) => ({ stage: i + 1, state: "MERGED" }));
  const healthy = { observerHealthy: true, promotion: { available: true, stale: false }, entries: allPassing, julesAvailable: true };

  assert.equal(resolveExitCode({ ...healthy, chronicStages: [] }), 0);
  assert.equal(resolveExitCode({ ...healthy, chronicStages: [{ stage: 5 }] }), 3);
  // Omitted entirely must not change any existing caller's result.
  assert.equal(resolveExitCode(healthy), 0);
});

test("capability loss is exit 3 so the workflow reddens, unresolved stages stay 2", () => {
  // The YAML keys off these numbers: exit 2 only warns, exit 3 fails the job.
  // Before this split both faults returned 2, so a dead JULES_API_KEY on a
  // night where all 13 stages published on their own left the run green - the
  // credential heartbeat resolveExitCode was written to provide could not fire.
  // Verified against real run 33469929219: exit 2 produced conclusion success.
  const allMerged = Array.from({ length: 13 }, (_, i) => ({ stage: i + 1, state: "MERGED" }));
  const unresolved = [{ stage: 1, state: "NO_OUTPUT" }];
  const promotion = { available: true, stale: false, commitCount: 0 };
  const base = { observerHealthy: true, promotion, julesAvailable: true };

  // Blocking: true all night, and stays true until someone acts.
  assert.equal(resolveExitCode({ ...base, entries: allMerged, julesAvailable: false }), 3);
  assert.equal(resolveExitCode({ ...base, entries: allMerged, chronicStages: [{ stage: 12 }] }), 3);

  // Non-blocking: legitimately transient while stages are still in flight.
  assert.equal(resolveExitCode({ ...base, entries: unresolved }), 2);
  assert.equal(resolveExitCode({ ...base, entries: allMerged, promotion: { available: true, stale: true } }), 2);

  // A broken observer still outranks a capability loss: fix the observer first.
  assert.equal(resolveExitCode({ ...base, observerHealthy: false, entries: allMerged, julesAvailable: false }), 1);
});

test("session telemetry is recorded for stages that merged, not only for failures", () => {
  // You cannot see a stage drifting towards failure if measurement only starts
  // once it has already failed.
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.julesSessions = registry.stages.map(stage => ({
    id: `s${stage.number}`,
    name: `sessions/s${stage.number}`,
    state: "COMPLETED",
    createTime: `${expectedEvidenceDate(stage.number, date)}T02:00:00Z`,
    updateTime: `${expectedEvidenceDate(stage.number, date)}T02:30:00Z`,
    prompt: `# [Stage ${stage.number}] x`,
  }));

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() });
  const stage6 = entries.find(e => e.stage === 6);
  assert.equal(stage6.state, "MERGED");
  assert.equal(stage6.evidence.session.createTime, `${date}T02:00:00Z`);
  assert.equal(stage6.evidence.session.lifetimeMinutes, 30);
});

test("sessionTelemetry degrades to nulls rather than inventing numbers", () => {
  assert.equal(sessionTelemetry(null), null);
  const partial = sessionTelemetry({ id: "x", state: "COMPLETED", createTime: "2026-08-11T02:00:00Z" });
  assert.equal(partial.lifetimeMinutes, null, "no updateTime means no span, not zero");
  assert.equal(partial.createTime, "2026-08-11T02:00:00Z");
});

test("the fallback publisher is reachable from every exit of the nudge ladder", async () => {
  // The whole recovery ladder ends in a publisher that had never once run,
  // because two of the three exits returned no `unrecovered` key at all and the
  // caller gates on `recovery.unrecovered?.length`. Each case below is one of
  // those exits, and each is a night on which the ladder silently gave up.
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });
  const config = { ...CONFIG, owner: "AlbiDR", repo: "Clash-Manager", token: "t", julesApiKey: "k" };

  // Exit 1: the retry budget is spent, so no stage is eligible for a nudge.
  const exhausted = createEmptyLedger();
  ensureRunEntries(exhausted, registry, date);
  upsertStageEntry(exhausted, registry, date, 3, { attempts: 2 });
  const spent = await recoverStuckStages({
    entries, ledger: exhausted, registry, date, config,
    fetchImpl: async () => { throw new Error("must not nudge an exhausted stage"); },
    sleep: async () => {}, pollAttempts: 1, pollIntervalMs: 0,
  });
  assert.equal(spent.attempted.length, 0);
  assert.deepEqual(spent.unrecovered.map(e => e.stage), [3], "an exhausted stage must reach the publisher");

  // Exit 2: every nudge failed to be delivered. The publisher talks to GitHub,
  // not to Jules, so a dead JULES_API_KEY must not stop it.
  const undelivered = createEmptyLedger();
  ensureRunEntries(undelivered, registry, date);
  const dead = await recoverStuckStages({
    entries, ledger: undelivered, registry, date, config,
    fetchImpl: async () => ({ ok: false, status: 401, statusText: "Unauthorized", text: async () => "dead key" }),
    sleep: async () => {}, pollAttempts: 1, pollIntervalMs: 0,
  });
  assert.equal(dead.attempted.length, 0);
  assert.deepEqual(dead.unrecovered.map(e => e.stage), [3], "an undeliverable nudge must reach the publisher");
});

test("a stage already published by the fallback is never published twice", async () => {
  // A duplicate pull request for work that already landed is exactly the litter
  // that misclassified stage 1 for three consecutive nights.
  const date = "2026-08-15";
  const entries = evaluateNightlyRun({
    registry,
    date,
    observed: stuckObserved(date, 3),
    previousLedger: createEmptyLedger(),
  });
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  upsertStageEntry(ledger, registry, date, 3, {
    attempts: 2,
    evidence: { fallbackPublish: { prNumber: 1500, publishedAt: "2026-08-15T04:00:00.000Z" } },
  });

  assert.deepEqual(selectFallbackCandidates(entries, ledger, date), []);

  const result = await recoverStuckStages({
    entries, ledger, registry, date,
    config: { ...CONFIG, owner: "AlbiDR", repo: "Clash-Manager", token: "t", julesApiKey: "k" },
    fetchImpl: async () => { throw new Error("must not nudge"); },
    sleep: async () => {}, pollAttempts: 1, pollIntervalMs: 0,
  });
  assert.deepEqual(result.unrecovered, [], "an already-published stage must not be republished");
});

test("parseRunWindow transcribes the stage's own recorded window", () => {
  const log = [
    "* [2026-09-02] [Stage 4] [23:10Z-23:41Z 31m] CLEAN: Codebase -- earlier night",
    "* [2026-09-03] [Stage 4] [02:08Z-02:53Z 45m] CHANGED: Frontend-PWA/src/x.ts -- did a thing",
  ].join("\n");
  assert.deepEqual(parseRunWindow(log, 4, "2026-09-03"), {
    started: "2026-09-03T02:08:00Z",
    terminated: "2026-09-03T02:53:00Z",
    durationMinutes: 45,
  });
  // The right date, not merely the last line.
  assert.equal(parseRunWindow(log, 4, "2026-09-02").durationMinutes, 31);
});

test("a coverage line without a window yields null rather than a zero", () => {
  // Every line written before the instrumentation looks like this, so null has
  // to be the ordinary case. A zero here would enter the ledger as a run that
  // took no time and drag every median computed from it downward.
  const legacy = "* [2026-09-03] [Stage 4] CLEAN: Codebase -- no window recorded";
  assert.equal(parseRunWindow(legacy, 4, "2026-09-03"), null);
  assert.equal(parseRunWindow(legacy, 9, "2026-09-03"), null);
  assert.equal(parseRunWindow("", 4, "2026-09-03"), null);
  assert.equal(parseRunWindow(null, 4, "2026-09-03"), null);
});

test("a stage number is matched exactly, not by prefix", () => {
  // Stage 1 must never absorb Stage 10's window; both start "[Stage 1".
  const log = "* [2026-09-03] [Stage 10] [01:00Z-01:20Z 20m] CLEAN: Codebase -- ten";
  assert.equal(parseRunWindow(log, 1, "2026-09-03"), null);
  assert.equal(parseRunWindow(log, 10, "2026-09-03").durationMinutes, 20);
});

test("a published body is graded against the shapes that actually went wrong", () => {
  // Fixtures are the literal bodies of the 2026-09-03 run, one per observed
  // failure mode. All five merged, all five passed every check the pipeline
  // had, and the run graded 9/10. Nothing could see them.

  // #1674. The handoff's own opening line, published for a run that had really
  // bumped @supabase/supabase-js. The worst case: the title carried more
  // information than the description.
  assert.equal(classifyPrBody("Nightly Stage 8 finalized with status CHANGED."), "HANDOFF_LEAK");
  // The handoff writes "is finalized"; what reached GitHub dropped the "is".
  // Both spellings must be caught or the check misses the real case.
  assert.equal(classifyPrBody("Nightly Stage 8 is finalized with status CHANGED."), "HANDOFF_LEAK");

  // #1668 and #1675. The separator line published as content.
  assert.equal(
    classifyPrBody("--- PULL REQUEST DESCRIPTION BELOW ---\n### Nightly Stage 1\nNIGHTLY_PR_METADATA:"),
    "MARKER_LEAK",
  );

  // #1676 and #1677. Template discarded, one sentence invented.
  assert.equal(classifyPrBody("Stage 11 APK Optimization audit completed cleanly."), "AD_LIBBED");

  assert.equal(classifyPrBody(""), "EMPTY");
  assert.equal(classifyPrBody(null), "EMPTY");

  // The shape renderPrBody actually emits.
  const good = [
    "### Nightly Stage 4: Optimization",
    "",
    "**Status:** CLEAN",
    "",
    "In plain terms: nothing needed fixing.",
    "",
    "**What was checked:** audited 12 views",
    "",
    "<!--",
    "NIGHTLY_PR_METADATA:",
    "  Domain: optimization",
    "-->",
  ].join("\n");
  assert.equal(classifyPrBody(good), "OK");
});

test("body health is recorded but never fails a run", () => {
  // Every one of the five malformed bodies belonged to a stage whose code,
  // tests and coverage log had landed correctly. The description was wrong, the
  // work was not, so this must not redden a run over something already merged.
  const source = readFileSync(new URL("./nightly-watchdog.mjs", import.meta.url), "utf8");
  const classifier = source.slice(source.indexOf("export function classifyPrBody"));
  assert.doesNotMatch(classifier.slice(0, 400), /exitCode|process\.exit/);
  // It is carried as evidence on the merged row, next to session and run.
  assert.match(source, /body: describePublishedBody\(matchingTags\[0\], observed\.prs\)/);
});

test("promotion-tag parsing has exactly one implementation", () => {
  // This started as a third copy of a function nightly-ledger.mjs and
  // nightly-recap.mjs already had, byte-equivalent to both. The watchdog
  // already imported the ledger, so the copy bought nothing at all.
  assert.equal(prNumberFromTag("nightly/2026-09-03/stage-8/pr-1674"), 1674);
  assert.equal(prNumberFromTag("nightly/2026-09-03/stage-8"), null);
  assert.equal(prNumberFromTag(null), null);
  const source = readFileSync(new URL("./nightly-watchdog.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /function prNumberFrom/, "the watchdog must import this, not define it");
});

// The 2026-09-05 regression. The 13 stages fire in order over roughly twelve
// hours, so every pass before the last one sees stages that simply have not had
// their turn. The watchdog used to call those NO_OUTPUT, then ESCALATED on the
// next pass, which put stages 7 through 13 at ESCALATED on the 04:54 pass of a
// night when all thirteen went on to merge cleanly, and fed phantom
// interventions into the cross-run health trend.
test("a stage the run has not reached yet is EXPECTED, not a failure", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  // The run has got as far as stage 5. Nothing after it has published.
  for (const stage of registry.stages) {
    if (stage.number > 5) observed.tags.delete(`nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`);
  }

  const entries = evaluateNightlyRun({
    registry,
    date,
    observed,
    previousLedger: createEmptyLedger(),
  });

  assert.equal(runFrontier({ registry, date, observed }), 5);
  for (const stage of registry.stages) {
    const entry = entries.find(e => e.stage === stage.number);
    assert.equal(entry.state, stage.number <= 5 ? "MERGED" : "EXPECTED", `stage ${stage.number}`);
    if (stage.number > 5) assert.equal(entry.failureClass, null, `stage ${stage.number} carries no failure class`);
  }

  // The summary must not read like an outage while the run is simply in flight.
  const summary = renderSummary(date, entries);
  assert.match(summary, /Not reached yet: 8/);
  assert.match(summary, /Still to run: Stage 6, Stage 7, Stage 8, Stage 9, Stage 10, Stage 11, Stage 12, Stage 13\. The run is in flight, not failing\./);
  assert.doesNotMatch(summary, /Failing states/);
});

// EXPECTED is one of the two states nightly-health treats as unobserved, which
// is what stops an in-flight run scoring interventions against stages that have
// not had the chance to need help. If this ever drifts, the phantom
// "S12 DEGRADING: intervention rate rose from 17% to 36%" comes straight back.
test("a not-reached stage is not scored as an intervention", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  for (const stage of registry.stages) {
    if (stage.number > 11) observed.tags.delete(`nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`);
  }

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() });
  const stage12 = entries.find(entry => entry.stage === 12);
  assert.equal(stage12.state, "EXPECTED");
  assert.equal(isObserved(stage12), false, "an unreached stage is not evidence in either direction");

  // The protection is the isObserved gate in stageInterventionHistory, so
  // assert through that rather than on neededIntervention alone: it is only
  // ever consulted for rows that already passed the gate.
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  upsertStageEntry(ledger, registry, date, 12, { state: stage12.state, failureClass: stage12.failureClass });
  assert.deepEqual(stageInterventionHistory(ledger, 12), [], "an in-flight night is not yet a data point");
});

// A stage the pipeline went PAST without publishing is a real failure and must
// stay one: the frontier excuses what is queued behind it, never what it has
// already overtaken.
test("a stage below the frontier still fails when it published nothing", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  observed.tags.delete(`nightly/${expectedEvidenceDate(4, date)}/stage-4/pr-1404`);

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() });

  assert.equal(entries.find(entry => entry.stage === 4).state, "NO_OUTPUT");
  assert.equal(entries.find(entry => entry.stage === 4).failureClass, "NO_PUBLISHED_OUTPUT");
});

// Only positive evidence advances the frontier. A stage with a live Jules
// session has demonstrably been reached, so the stages before it are judgeable
// even though nothing has published yet.
test("an in-flight Jules session advances the frontier", () => {
  const date = "2026-08-11";
  const observed = mergedObserved(date);
  for (const stage of registry.stages) {
    if (stage.number > 3) observed.tags.delete(`nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`);
  }
  observed.julesSessions = [{
    name: "sessions/999",
    id: "999",
    state: "IN_PROGRESS",
    prompt: "S07: version integrity",
    createTime: `${date}T05:00:00Z`,
  }];

  assert.equal(runFrontier({ registry, date, observed }), 7);

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() });
  assert.equal(entries.find(entry => entry.stage === 7).state, "RUNNING");
  // Overtaken by the session at stage 7, so no longer excused.
  assert.equal(entries.find(entry => entry.stage === 5).state, "NO_OUTPUT");
  // Still queued behind it.
  assert.equal(entries.find(entry => entry.stage === 8).state, "EXPECTED");
});

// The PR body travels from renderPrBody, through a /tmp file inside the Jules
// VM, into the agent's final message, and only then to GitHub. That last hop is
// a language model performing a copy, and it loses the payload roughly a
// quarter of the time: 10 of the 36 bodies recorded up to 2026-09-05 carried no
// NIGHTLY_PR_METADATA. Detecting that was the old behaviour; rebuilding it is
// the corrective half.
const REPAIR_STAGE = registry.stages.find(stage => stage.number === 2);

test("a damaged PR body is rebuilt from the coverage line the stage committed", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CHANGED", target: "Frontend-PWA/src/x.spec.ts", summary: "Expanded StorageService coverage" },
    files: ["Frontend-PWA/src/x.spec.ts", REPAIR_STAGE.coverageLog],
  });

  assert.equal(plan.ok, true);
  // The block is the whole point: merge-nightly-core parses it into
  // 00-pr-history.md, which is where the recap reads Why and Result.
  assert.match(plan.body, /NIGHTLY_PR_METADATA:/);
  assert.match(plan.body, /\*\*Status:\*\* CHANGED/);
  assert.match(plan.body, /Change: Expanded StorageService coverage/);
  assert.match(plan.body, /Domain: verification/);
  assert.match(plan.body, /Files: Frontend-PWA\/src\/x\.spec\.ts/);
  assert.equal(classifyPrBody(plan.body), "OK", "a rebuilt body must itself pass the classifier");
});

test("every damaged verdict is repairable and a good body is never touched", () => {
  const declared = { status: "CLEAN", target: "Codebase", summary: "Audited everything" };
  for (const verdict of ["AD_LIBBED", "EMPTY", "MARKER_LEAK", "HANDOFF_LEAK"]) {
    assert.equal(buildBodyRepair({ stage: REPAIR_STAGE, verdict, declared, files: [] }).ok, true, verdict);
  }
  // OK is absent from REPAIRABLE_BODY_VERDICTS on purpose, and so is anything
  // nobody has classified yet: overwriting an unrecognised body would destroy
  // the only evidence of a new failure mode before it had been seen.
  assert.equal(buildBodyRepair({ stage: REPAIR_STAGE, verdict: "OK", declared, files: [] }).ok, false);
  assert.equal(buildBodyRepair({ stage: REPAIR_STAGE, verdict: "SOMETHING_NEW", declared, files: [] }).ok, false);
});

// Why and Result live only in the /tmp file and in the message that lost them.
// Nothing can recover them after the fact, so the repair must fall back to
// renderPrBody's own defaults rather than inventing a claim nothing witnessed.
test("a repair never invents a Why or a Result it cannot know", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CLEAN", target: "Codebase", summary: "Audited everything" },
    files: [REPAIR_STAGE.coverageLog],
  });

  assert.match(plan.body, /Why: Execute the scheduled Stage 2 verification audit\./);
  assert.match(plan.body, /Result: Audit completed with no source change required\./);
});

test("a stage with no committed coverage line is left alone", () => {
  const plan = buildBodyRepair({ stage: REPAIR_STAGE, verdict: "AD_LIBBED", declared: null, files: [] });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /no coverage-log outcome/);
});

test("the repair pass rewrites only the damaged bodies and records what it did", async () => {
  const date = "2026-08-11";
  const entries = [
    { stage: 1, state: "MERGED", evidence: { body: { pr: 100, verdict: "OK", ok: true } } },
    { stage: 2, state: "MERGED", evidence: { body: { pr: 101, verdict: "AD_LIBBED", ok: false } } },
    { stage: 3, state: "MERGED", evidence: { body: { pr: 102, verdict: "HANDOFF_LEAK", ok: false } } },
    { stage: 4, state: "NO_OUTPUT", evidence: {} },
  ];
  const observed = { declaredOutcomes: new Map([
    [2, { status: "CHANGED", target: "a.ts", summary: "Did a thing" }],
    [3, { status: "CLEAN", target: "Codebase", summary: "Checked a thing" }],
  ]) };

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  const patched = [];
  const apiImpl = async (endpoint, _config, method, body) => {
    if (method === "PATCH") patched.push({ endpoint, body });
    return {};
  };

  const result = await repairPublishedBodies({
    entries, observed, ledger, registry, date,
    config: { ...CONFIG, owner: "o", repo: "r" },
    apiImpl,
    filesImpl: async () => ["a.ts"],
  });

  assert.deepEqual(result.repaired.map(r => r.stage), [2, 3]);
  assert.equal(patched.length, 2, "the OK body and the unpublished stage are untouched");
  assert.deepEqual(patched.map(p => p.endpoint), ["/repos/o/r/pulls/101", "/repos/o/r/pulls/102"]);
  for (const call of patched) assert.equal(classifyPrBody(call.body.body), "OK");

  // The ledger must stop reporting a defect that no longer exists, while still
  // recording that it was repaired rather than never having happened.
  const stage2 = stageEntry(ledger, date, 2);
  assert.equal(stage2.evidence.body.ok, true);
  assert.equal(stage2.evidence.body.repairedFrom, "AD_LIBBED");
});

// A failed PATCH must never abort the pass: one unrepairable stage cannot be
// allowed to strand the others, and the run itself was healthy either way.
test("a failed rewrite is reported and does not stop the other repairs", async () => {
  const date = "2026-08-11";
  const entries = [
    { stage: 2, state: "MERGED", evidence: { body: { pr: 101, verdict: "AD_LIBBED", ok: false } } },
    { stage: 3, state: "MERGED", evidence: { body: { pr: 102, verdict: "AD_LIBBED", ok: false } } },
  ];
  const observed = { declaredOutcomes: new Map([
    [2, { status: "CLEAN", target: "Codebase", summary: "One" }],
    [3, { status: "CLEAN", target: "Codebase", summary: "Two" }],
  ]) };
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);

  const result = await repairPublishedBodies({
    entries, observed, ledger, registry, date,
    config: { ...CONFIG, owner: "o", repo: "r" },
    apiImpl: async (endpoint, _c, method) => {
      if (method === "PATCH" && endpoint.endsWith("/101")) throw new Error("422 unprocessable");
      return {};
    },
    filesImpl: async () => [],
  });

  assert.deepEqual(result.repaired.map(r => r.stage), [3]);
  assert.deepEqual(result.skipped.map(r => r.stage), [2]);
  assert.equal(stageEntry(ledger, date, 2).evidence?.body?.ok ?? null, null, "a failed repair claims nothing");
});

// A mechanism used only in emergencies needs a heartbeat, not an emergency.
// The fallback publisher had neither, and on 2026-09-03 it stopped working for
// two days without a single signal. These rehearse it against the sessions that
// SUCCEEDED tonight, which are free and fully realistic fixtures.
function sessionWithPatch(stageNumber, date, line) {
  const stage = registry.stages.find(s => s.number === stageNumber);
  const patch = [
    `diff --git a/${stage.coverageLog} b/${stage.coverageLog}`,
    `--- a/${stage.coverageLog}`,
    `+++ b/${stage.coverageLog}`,
    "@@ -1 +1,2 @@",
    line,
  ].join("\n");
  return {
    id: `s${stageNumber}`,
    name: `sessions/s${stageNumber}`,
    state: "COMPLETED",
    createTime: `${date}T01:00:00Z`,
    prompt: `S${String(stageNumber).padStart(2, "0")}: work`,
    outputs: [{ changeSet: { gitPatch: { unidiffPatch: patch } } }],
  };
}

test("the fallback publisher is rehearsed against tonight's successful sessions", () => {
  const date = "2026-08-11";
  const observed = {
    julesSessions: [
      sessionWithPatch(11, date, `+* [${date}] [Stage 11] [09:03Z-09:05Z 2m] CLEAN: Codebase -- Audited settings`),
      sessionWithPatch(10, date, `+* [${date}] [Stage 10] CLEAN: Codebase -- Audited wrapper`),
    ],
  };

  const rehearsal = rehearseFallbackPublisher({ registry, date, observed });

  assert.equal(rehearsal.rehearsed, 2);
  assert.equal(rehearsal.ready, 2);
  assert.equal(rehearsal.capable, true);
  assert.match(renderRehearsalReport(rehearsal), /rehearsed against 2 session\(s\), 2 would publish/);
});

// The exact 2026-09-03 shape: every rehearsal refuses because the parser no
// longer understands the line the stages write. This is the signal that did not
// exist, and it must be loud.
test("a fallback publisher that refuses everything is reported as a lost capability", () => {
  const date = "2026-08-11";
  const observed = {
    julesSessions: [
      // A patch with no coverage line at all: nothing to validate against, so
      // buildFallbackPlan refuses, which is what a format break looks like.
      { id: "a", name: "sessions/a", state: "COMPLETED", createTime: `${date}T01:00:00Z`, prompt: "S11: work",
        outputs: [{ changeSet: { gitPatch: { unidiffPatch: "diff --git a/x.ts b/x.ts\n+noise" } } }] },
    ],
  };

  const rehearsal = rehearseFallbackPublisher({ registry, date, observed });

  assert.equal(rehearsal.capable, false);
  assert.equal(rehearsal.ready, 0);
  const report = renderRehearsalReport(rehearsal);
  assert.match(report, /CANNOT PUBLISH/);
  assert.match(report, /last line of defence/);
  // Exit 3 is the capability-loss channel, the same one the dead credential uses.
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [], fallbackCapable: false }), 3);
});

// Nothing to rehearse is an unknown, not a failure. Without this the early
// passes of every night, before any session holds a change set, would redden
// the job on no evidence at all.
test("a pass with nothing to rehearse never reddens the run", () => {
  const rehearsal = rehearseFallbackPublisher({ registry, date: "2026-08-11", observed: { julesSessions: [] } });

  assert.equal(rehearsal.rehearsed, 0);
  assert.equal(rehearsal.capable, null);
  assert.match(renderRehearsalReport(rehearsal), /not rehearsed tonight/);
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [], fallbackCapable: null }), 0);
});

// One stage refusing can be a legitimate write-boundary rejection of that
// stage's own patch. Only a total refusal is a claim about the publisher.
test("one stage refusing is named but does not claim the publisher is broken", () => {
  const date = "2026-08-11";
  const observed = {
    julesSessions: [
      sessionWithPatch(11, date, `+* [${date}] [Stage 11] [09:03Z-09:05Z 2m] CLEAN: Codebase -- Audited settings`),
      { id: "b", name: "sessions/b", state: "COMPLETED", createTime: `${date}T02:00:00Z`, prompt: "S10: work",
        outputs: [{ changeSet: { gitPatch: { unidiffPatch: "diff --git a/x.ts b/x.ts\n+noise" } } }] },
    ],
  };

  const rehearsal = rehearseFallbackPublisher({ registry, date, observed });

  assert.equal(rehearsal.capable, true);
  assert.deepEqual(rehearsal.failed.map(f => f.stage), [10]);
  assert.match(renderRehearsalReport(rehearsal), /Stage 10 would NOT publish/);
});

// Failure classes that have never fired in 25 nights AND had no test. Every
// other class in the ledger has been exercised by a real run at some point;
// these three had been exercised by nothing at all. The fallback publisher had
// tests and still rotted, so "never observed and never tested" is the weakest
// position in the control plane and worth closing on principle.
function stagePr({ number, stage, date, state = "open", branch = null, files = [], login = "google-labs-jules" }) {
  const registryStage = registry.stages.find(s => s.number === stage);
  return {
    number,
    state,
    created_at: `${date}T04:00:00Z`,
    user: { login },
    base: { ref: "Nightly" },
    head: { ref: branch ?? `${registryStage.branchPrefix}abcdef12-99`, sha: "deadbeef" },
    html_url: `https://github.com/o/r/pull/${number}`,
    files,
  };
}

// A stage whose pull request opened but never merged. RECOVERABLE rather than a
// failure: the work exists and is one merge away, which is a different problem
// from a stage that published nothing.
test("a stage pull request left open is RECOVERABLE with failureClass OPEN_PR", () => {
  const date = "2026-08-11";
  const observed = {
    ...mergedObserved(date),
    prs: [stagePr({ number: 900, stage: 5, date })],
  };
  // Stage 5 published nothing, so it must fall through to the PR candidates.
  observed.tags.delete(`nightly/${expectedEvidenceDate(5, date)}/stage-5/pr-1405`);

  const entry = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() })
    .find(e => e.stage === 5);

  assert.equal(entry.state, "RECOVERABLE");
  assert.equal(entry.failureClass, "OPEN_PR");
  assert.equal(entry.evidence.prNumber, 900);
  // RECOVERABLE is a pass state, so an open PR must not redden the run: it is
  // the merge coordinator's job, not an emergency.
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [entry] }), 0);
});

// A pull request on the target branch from an allowlisted author that matches
// no stage branch and whose diff infers no stage. Nothing can be done with it
// automatically, so it is reported rather than guessed at.
test("an unclassifiable pull request is BLOCKED with failureClass UNCLASSIFIED_PR", () => {
  const date = "2026-08-11";
  const observed = {
    ...mergedObserved(date),
    prs: [stagePr({ number: 901, stage: 5, date, branch: "some/random-branch", files: ["README.md"] })],
  };
  observed.tags.delete(`nightly/${expectedEvidenceDate(5, date)}/stage-5/pr-1405`);

  const entry = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger() })
    .find(e => e.stage === 5);

  assert.equal(entry.state, "BLOCKED");
  assert.equal(entry.failureClass, "UNCLASSIFIED_PR");
  assert.equal(entry.evidence.prNumber, 901);
  assert.match(entry.evidence.reason, /coverage log/i);
  // BLOCKED is not a pass state, so it surfaces as exit 2. Non-blocking on
  // purpose: a stray pull request must not redden a night whose stages worked.
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [entry] }), 2);
});

// Documents a blast radius that is easy to miss. The blocked lookup cannot
// filter by stage, because an unclassifiable pull request has no stage by
// definition, so ONE stray pull request is attributed to every stage that has
// not published and whose evidence date it matches. Stage 1 is exempt only
// because it looks at the previous calendar day.
//
// Asserted rather than fixed: this is existing behaviour, it is arguably right
// (an unclassifiable PR is a pipeline-level problem, not a stage-level one),
// and changing it is a decision about alarm design rather than a bug fix.
test("one unclassifiable pull request is attributed to every unpublished stage of that date", () => {
  const date = "2026-08-11";
  const observed = {
    ...mergedObserved(date),
    prs: [stagePr({ number: 902, stage: 5, date, branch: "some/random-branch", files: ["README.md"] })],
  };
  for (const stage of registry.stages) {
    observed.tags.delete(`nightly/${expectedEvidenceDate(stage.number, date)}/stage-${stage.number}/pr-${1400 + stage.number}`);
  }

  const entries = evaluateNightlyRun({ registry, date, observed, previousLedger: createEmptyLedger(), final: true });
  const blocked = entries.filter(e => e.failureClass === "UNCLASSIFIED_PR").map(e => e.stage);

  assert.deepEqual(blocked, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(entries.find(e => e.stage === 1).failureClass, "NO_PUBLISHED_OUTPUT",
    "stage 1 reads the previous calendar day, so the same pull request does not reach it");
});

// The third never-fired, never-tested class. Its exit-code contract was already
// covered (observerHealthy false is exit 1); what was not covered is what it
// WRITES, and that is the half that matters. This job holds JULES_API_KEY, the
// repository is public, and the ledger is committed to it.
test("an observer failure marks every stage and never publishes a credential", () => {
  const date = "2026-08-11";
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, date);
  configureRedaction({ julesApiKey: "sk-live-SUPERSECRET", token: "ghp_TOKENVALUE" });

  // Exactly the shape that makes this dangerous: a failed fetch echoing back
  // the URL it was called with, credential included.
  const error = new Error("fetch failed: https://jules.googleapis.com/v1alpha/sessions?key=sk-live-SUPERSECRET");
  const entries = recordObserverFailure({ ledger, registry, date, error });

  assert.equal(entries.length, 13, "the observer reached no verdict on any stage, so all 13 are marked");
  for (const entry of entries) {
    assert.equal(entry.state, "BLOCKED");
    assert.equal(entry.failureClass, "WATCHDOG_OBSERVER_FAILURE");
  }

  const written = JSON.stringify(ledger);
  assert.ok(!written.includes("sk-live-SUPERSECRET"), "the ledger is committed to a public repository");
  assert.match(stageEntry(ledger, date, 7).evidence.reason, /fetch failed/, "the diagnosis survives redaction");

  configureRedaction({ julesApiKey: "", token: "" });
});

// Since 71dea9583 the stage commits the description it composed, so a repair no
// longer has to reconstruct one. That distinction is the whole point: a
// reconstruction recovers Change, Domain and Files but CANNOT recover Why and
// Result, because those only ever existed in the message the agent lost. Swapping
// one placeholder family for another would have been theatre.
const SIDECAR_BODY = [
  "### Nightly Stage 2: Verification",
  "",
  "**Status:** CHANGED",
  "",
  "<!--",
  "NIGHTLY_PR_METADATA:",
  "  Domain: verification",
  "  Why: StorageService had no coverage for the nuclear reset path",
  "  Change: Expanded StorageService coverage",
  "  Result: 7 of 7 specs passed",
  "  Files: a.spec.ts",
  "-->",
].join("\n");

test("a repair prefers the description the stage committed for itself", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CHANGED", target: "a.spec.ts", summary: "Expanded StorageService coverage" },
    files: ["a.spec.ts"],
    sidecar: SIDECAR_BODY,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.source, "sidecar");
  assert.equal(plan.body, SIDECAR_BODY, "published verbatim, not re-rendered");
  // The two fields a reconstruction can never recover.
  assert.match(plan.body, /Why: StorageService had no coverage for the nuclear reset path/);
  assert.match(plan.body, /Result: 7 of 7 specs passed/);
});

// The sidecar is read from the branch tip and a stage overwrites its own every
// night, so it can belong to a different run than the pull request being
// repaired. Publishing last night's words onto tonight's PR would be a
// confident, specific, wrong claim: worse than a generic sentence.
test("a sidecar from a different run is refused rather than published", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CHANGED", target: "b.spec.ts", summary: "Something else entirely" },
    files: ["b.spec.ts"],
    sidecar: SIDECAR_BODY,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.source, "reconstructed", "the mismatched sidecar must not be trusted");
  assert.doesNotMatch(plan.body, /nuclear reset path/);
  assert.match(plan.body, /Change: Something else entirely/);
});

test("with no sidecar the repair still reconstructs what it can", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CHANGED", target: "a.spec.ts", summary: "Did the thing" },
    files: ["a.spec.ts"],
    sidecar: null,
  });

  assert.equal(plan.source, "reconstructed");
  assert.match(plan.body, /Change: Did the thing/);
  assert.equal(classifyPrBody(plan.body), "OK");
});

// Publishing a body and then recording it as OK without checking is how a
// ledger comes to hold a claim nobody verified. The sidecar is composed by
// renderPrBody so it should always carry the metadata block, and "should
// always" is what was said about the three formats that drifted today.
test("a malformed sidecar is not published and then declared repaired", () => {
  const plan = buildBodyRepair({
    stage: REPAIR_STAGE,
    verdict: "AD_LIBBED",
    declared: { status: "CHANGED", target: "a.spec.ts", summary: "Did the thing" },
    files: ["a.spec.ts"],
    // Right Change line, no metadata block: passes the staleness gate and would
    // have been published verbatim, leaving the body just as damaged.
    sidecar: "### Nightly Stage 2\n\nChange: Did the thing\n",
  });

  assert.equal(plan.source, "reconstructed", "a sidecar that fails the classifier is not trusted");
  assert.equal(classifyPrBody(plan.body), "OK", "and what does get published is checked");
});

// The heartbeat's own failure must not look like a quiet night.
//
// The first version of this loop skipped a session with no extractable patch
// using the same `continue` as a stage with no session at all. If Jules ever
// changed its output shape, every stage would take that path, the report would
// say "not rehearsed tonight" every night, the run would exit 0, and the
// fallback publisher would be undetectably dead again: the exact two-day
// outage this rehearsal was built to prevent, reproduced inside the detector.
function finishedSessionWithoutPatch(stageNumber, date) {
  return {
    id: `s${stageNumber}`,
    name: `sessions/s${stageNumber}`,
    state: "COMPLETED",
    createTime: `${date}T01:00:00Z`,
    prompt: `S${String(stageNumber).padStart(2, "0")}: work`,
    outputs: [],
  };
}

test("finished sessions that yield no change set are a broken extraction, not a quiet night", () => {
  const date = "2026-08-11";
  const observed = { julesSessions: [finishedSessionWithoutPatch(11, date), finishedSessionWithoutPatch(10, date)] };

  const rehearsal = rehearseFallbackPublisher({ registry, date, observed });

  assert.equal(rehearsal.rehearsed, 0);
  assert.equal(rehearsal.finishedSessions, 2);
  assert.equal(rehearsal.extractionBroken, true);
  assert.equal(rehearsal.capable, false, "an unusable publisher is not an absence of evidence");
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [], fallbackCapable: rehearsal.capable }), 3);

  const report = renderRehearsalReport(rehearsal);
  assert.match(report, /CANNOT BE REHEARSED/);
  assert.doesNotMatch(report, /not rehearsed tonight/, "must not read as the benign case");
});

// In-flight sessions legitimately hold nothing yet, so the alarm above must be
// unreachable on the early passes of a night.
test("an in-flight session holding nothing yet is still a quiet night", () => {
  const date = "2026-08-11";
  const observed = {
    julesSessions: [{
      id: "x", name: "sessions/x", state: "IN_PROGRESS", createTime: `${date}T01:00:00Z`,
      prompt: "S11: work", outputs: [],
    }],
  };

  const rehearsal = rehearseFallbackPublisher({ registry, date, observed });

  assert.equal(rehearsal.finishedSessions, 0);
  assert.equal(rehearsal.extractionBroken, false);
  assert.equal(rehearsal.capable, null, "nothing to judge is not a failure");
  assert.equal(resolveExitCode({ observerHealthy: true, entries: [], fallbackCapable: rehearsal.capable }), 0);
  assert.match(renderRehearsalReport(rehearsal), /not rehearsed tonight/);
});
