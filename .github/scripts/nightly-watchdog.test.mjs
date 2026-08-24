// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEmptyLedger, ensureRunEntries, upsertStageEntry } from "./nightly-ledger.mjs";
import { CONFIG } from "./merge-nightly-core.mjs";
import { redactDeep } from "./nightly-redact.mjs";
import {
  configureRedaction,
  resolveExitCode,
  renderPromotionSummary,
  evaluateNightlyRun,
  evaluatePromotionStaleness,
  expectedEvidenceDate,
  fetchJulesSessions,
  hasDanglingSentinel,
  julesSessionPath,
  matchJulesSession,
  nudgeJulesSession,
  recoverStuckStages,
  renderSummary,
  selectRecoveryCandidates,
} from "./nightly-watchdog.mjs";

const registry = JSON.parse(readFileSync(new URL("../nightly-config/stages.json", import.meta.url), "utf8"));

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
