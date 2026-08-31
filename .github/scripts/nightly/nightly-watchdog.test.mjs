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
  upsertStageEntry,
} from "./nightly-ledger.mjs";
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
  renderRecoveryReadiness,
  renderStaleStagePrReport,
  renderSummary,
  selectRecoveryCandidates,
  sessionTelemetry,
} from "./nightly-watchdog.mjs";

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

  const entries = evaluateNightlyRun({
    registry,
    date: "2026-08-11",
    observed,
    previousLedger: ledger,
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
    2,
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
  // which is exit 2.
  const entries = [{ stage: 1, state: "MERGED" }];
  assert.equal(resolveExitCode({ observerHealthy: true, promotion: null, entries, julesAvailable: false }), 2);
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
  assert.equal(resolveExitCode({ ...healthy, chronicStages: [{ stage: 5 }] }), 2);
  // Omitted entirely must not change any existing caller's result.
  assert.equal(resolveExitCode(healthy), 0);
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
