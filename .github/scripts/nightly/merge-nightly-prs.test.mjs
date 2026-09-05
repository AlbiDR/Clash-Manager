// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  METADATA_PLACEHOLDERS,
  TAG_PLACEHOLDERS,
  isPlaceholderField,
  placeholderWhy,
} from "./nightly-prose.mjs";

import {
  classifyTagCreation,
  classifyNightlyPr,
  collectHistoryBlocksFromTags,
  extractMetadata,
  getMergeTargets,
  getRecentDateStrings,
  getRejectedNightlyPrs,
  inferStageFromChangedFiles,
  insertHistoryBlocks,
  isAllowedAuthor,
  isNightlyStagePr,
  isRetryableMergeError,
  isShaMismatch,
  parseStageBranch,
  parseStageTag,
  parseTagContent,
  preferStatedMetadata,
  readSidecarMetadata,
  renderFailureBlock,
  renderHistoryBlock,
  sortStagePrs,
  stageNumber,
  summarizeFiles,
  regressionGateBlocks,
  REGRESSION_GATE_CHECK,
} from "./merge-nightly-core.mjs";
import {
  createEmptyLedger,
  ensureRunEntries,
  loadLedger,
  saveLedger,
  stageEntry,
  upsertStageEntry,
  validateLedger,
} from "./nightly-ledger.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));
const mergeConfig = { targetBranch: "Nightly", allowedAuthors: ["google-labs-jules", "AlbiDR"] };

test("parses slash and hyphen nightly stage branch names", () => {
  assert.deepEqual(parseStageBranch("nightly/stage-12-apk-ux-a1b2c3d4"), {
    stage: 12,
    ref: "nightly/stage-12-apk-ux-a1b2c3d4",
  });
  assert.deepEqual(parseStageBranch("nightly-stage-2-verification-a1b2c3d4"), {
    stage: 2,
    ref: "nightly-stage-2-verification-a1b2c3d4",
  });
  assert.equal(parseStageBranch("feature/stage-2-verification"), null);
});

test("parses canonical and legacy nightly history stage tags", () => {
  assert.deepEqual(parseStageTag("nightly/2026-08-08/stage-12/pr-1388"), {
    date: "2026-08-08",
    stage: 12,
    prNum: "#1388",
    specificity: 1,
    tag: "nightly/2026-08-08/stage-12/pr-1388",
  });
  assert.deepEqual(parseStageTag("nightly/2026-08-08/stage-12"), {
    date: "2026-08-08",
    stage: 12,
    prNum: null,
    specificity: 0,
    tag: "nightly/2026-08-08/stage-12",
  });
  assert.equal(parseStageTag("nightly/2026-08-08/stage-12-extra"), null);
  assert.equal(parseStageTag("nightly/2026-08-08/stage-12/pr-x"), null);
  assert.equal(parseStageTag("nightly/stage-12-apk-ux-x"), null);
});

test("sorts stage PRs by stage number and then PR number", () => {
  const sorted = sortStagePrs([
    { number: 30, head: { ref: "nightly/stage-11-apk-optimization-x" } },
    { number: 10, head: { ref: "nightly/stage-2-verification-x" } },
    { number: 8, head: { ref: "nightly/stage-2-verification-y" } },
  ]);

  assert.deepEqual(sorted.map(pr => pr.number), [8, 10, 30]);
  assert.equal(stageNumber("nightly/stage-13-self-healing-x"), 13);
});

test("filters allowed nightly stage PRs", () => {
  assert.equal(isAllowedAuthor("google-labs-jules[bot]", mergeConfig.allowedAuthors), true);
  assert.equal(isAllowedAuthor("dependabot[bot]", mergeConfig.allowedAuthors), false);

  assert.equal(isNightlyStagePr({
    user: { login: "AlbiDR" },
    base: { ref: "Nightly" },
    head: { ref: "nightly-stage-7-version-integrity-x" },
  }, mergeConfig), true);

  assert.equal(isNightlyStagePr({
    user: { login: "AlbiDR" },
    base: { ref: "Stable" },
    head: { ref: "nightly-stage-7-version-integrity-x" },
  }, mergeConfig), false);
});

test("classifies canonical and malformed Nightly PRs using registry evidence", () => {
  const canonical = {
    number: 7,
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "nightly/stage-7-version-integrity-a1b2c3d4" },
    files: [".github/nightly-logs/07-version-integrity-coverage.log"],
  };
  assert.deepEqual(classifyNightlyPr(canonical, registry, mergeConfig), {
    kind: "canonical",
    stage: 7,
    reason: "canonical nightly stage branch",
  });

  const malformed = {
    number: 1418,
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "Nightly-1085819592077280237" },
    files: [".github/nightly-logs/03-baseline-consolidation-coverage.log"],
  };
  assert.equal(inferStageFromChangedFiles(malformed, registry).stage, 3);
  assert.deepEqual(classifyNightlyPr(malformed, registry, mergeConfig), {
    kind: "inferred",
    stage: 3,
    reason: "inferred Stage 3 from coverage-log",
    files: [".github/nightly-logs/03-baseline-consolidation-coverage.log"],
  });
});

test("blocks ambiguous or evidence-free allowed-author Nightly PRs", () => {
  const ambiguous = {
    number: 99,
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "Nightly-ambiguous" },
    files: [
      ".github/nightly-logs/03-baseline-consolidation-coverage.log",
      ".github/nightly-logs/06-documentation-tsdoc-coverage.log",
    ],
  };
  assert.match(classifyNightlyPr(ambiguous, registry, mergeConfig).reason, /multiple stage coverage logs/);

  const evidenceFree = {
    number: 100,
    user: { login: "google-labs-jules[bot]" },
    base: { ref: "Nightly" },
    head: { ref: "Nightly-no-evidence" },
    files: ["README.md"],
  };
  assert.deepEqual(getRejectedNightlyPrs([ambiguous, evidenceFree], registry, mergeConfig).map(pr => pr.number), [99, 100]);
});

test("orders inferred stages between canonical stage PRs", () => {
  const sorted = getMergeTargets([
    {
      number: 4,
      user: { login: "google-labs-jules[bot]" },
      base: { ref: "Nightly" },
      head: { ref: "nightly/stage-4-optimization-x" },
      files: [".github/nightly-logs/04-optimization-coverage.log"],
    },
    {
      number: 3,
      user: { login: "google-labs-jules[bot]" },
      base: { ref: "Nightly" },
      head: { ref: "Nightly-1085819592077280237" },
      files: [".github/nightly-logs/03-baseline-consolidation-coverage.log"],
    },
    {
      number: 2,
      user: { login: "google-labs-jules[bot]" },
      base: { ref: "Nightly" },
      head: { ref: "nightly/stage-2-verification-x" },
      files: [".github/nightly-logs/02-verification-coverage.log"],
    },
  ], registry, mergeConfig);

  assert.deepEqual(sorted.map(pr => pr.number), [2, 3, 4]);
});

test("extracts NIGHTLY_PR_METADATA fields", () => {
  const metadata = extractMetadata({
    title: "fallback title",
    body: `### Summary

<!--
NIGHTLY_PR_METADATA:
  Domain: APK UX
  Files: Frontend-PWA/src/shared/ui/SettingRow.vue
  Why: Touch targets needed normalization.
  Change: Modernized setting rows.
  Result: Mobile touch compliance restored.
-->`,
  });

  assert.deepEqual(metadata, {
    domain: "APK UX",
    files: "Frontend-PWA/src/shared/ui/SettingRow.vue",
    why: "Touch targets needed normalization.",
    change: "Modernized setting rows.",
    result: "Mobile touch compliance restored.",
  });
});

test("summarizes files without exploding long histories", () => {
  assert.equal(summarizeFiles([]), "codebase");
  assert.equal(summarizeFiles(["a.ts", "b.ts"]), "a.ts, b.ts");
  assert.match(summarizeFiles([
    "Frontend-PWA/src/a.ts",
    "Frontend-PWA/src/b.ts",
    "Backend/supabase/a.ts",
    "Backend/supabase/b.ts",
    ".github/scripts/a.mjs",
    ".github/scripts/b.mjs",
  ]), /Frontend-PWA\/src\/\*, Backend\/supabase\/\*, \.github\/scripts\/\* \(6 files\)/);
});

test("parses tag content and renders finalized T1 history without PENDING fields", () => {
  const parsed = parseTagContent(`PR: #1388
Domain: APK UX
Files: Frontend-PWA/src/shared/ui/SettingRow.vue
Why: Buttons were too small.
Change: Modernized settings rows.
Result: Verified by tests.`);

  const block = renderHistoryBlock({
    date: "2026-08-08",
    stage: 12,
    prNum: parsed.prNum,
    domain: parsed.domain,
    commitSha: "88a4d29d",
    prUrl: "https://github.com/AlbiDR/Clash-Manager/pull/1388",
    files: parsed.files,
    why: parsed.why,
    change: parsed.change,
    result: parsed.result,
  });

  assert.match(block, /^### \[2026-08-08\] PR #1388 \[Stage 12\]: Modernized settings rows\./);
  assert.doesNotMatch(block, /PENDING/);
});

test("refuses to render finalized history with pending identity fields", () => {
  assert.throws(() => renderHistoryBlock({
    date: "2026-08-08",
    stage: 1,
    prNum: "PENDING",
    domain: "pipeline",
    commitSha: "88a4d29d",
    prUrl: "https://github.com/AlbiDR/Clash-Manager/pull/PENDING",
    files: "codebase",
    why: "why",
    change: "change",
    result: "result",
  }), /without a PR number/);
});

test("collects recent tag history across multiple dates and tag formats", () => {
  const tagContents = new Map([
    ["tag -l nightly/2026-08-08/*", "nightly/2026-08-08/stage-2/pr-101\nnightly/2026-08-08/not-a-stage\nnightly/2026-08-08/stage-1"],
    ["tag -l nightly/2026-08-07/*", "nightly/2026-08-07/stage-13/pr-99"],
    ["tag -l nightly/2026-08-08/stage-1 --format=%(contents)", "PR: #100\nDomain: Hardening\nChange: no threat found"],
    ["tag -l nightly/2026-08-08/stage-2/pr-101 --format=%(contents)", "PR: #101\nDomain: Verification\nChange: add tests"],
    ["tag -l nightly/2026-08-07/stage-13/pr-99 --format=%(contents)", "PR: #99\nDomain: pipeline\nChange: audit pipeline"],
    ["rev-parse --short nightly/2026-08-08/stage-1^{commit}", "aaa1111"],
    ["rev-parse --short nightly/2026-08-08/stage-2/pr-101^{commit}", "bbb2222"],
    ["rev-parse --short nightly/2026-08-07/stage-13/pr-99^{commit}", "ccc3333"],
  ]);

  const entries = collectHistoryBlocksFromTags({
    dates: ["2026-08-08", "2026-08-07"],
    config: { owner: "AlbiDR", repo: "Clash-Manager", historyLookbackDays: 7 },
    git: args => tagContents.get(args.join(" ")) || "",
  });

  assert.deepEqual(entries.map(entry => entry.prNum), ["#100", "#101", "#99"]);
  assert.equal(entries[0].stage, 1);
  assert.match(entries[2].block, /PR #99 \[Stage 13\]/);
});

test("suppresses duplicate legacy history when PR-scoped tag exists", () => {
  const tagContents = new Map([
    ["tag -l nightly/2026-08-08/*", "nightly/2026-08-08/stage-2\nnightly/2026-08-08/stage-2/pr-101"],
    ["tag -l nightly/2026-08-08/stage-2 --format=%(contents)", "PR: #101\nDomain: legacy\nChange: legacy change"],
    ["tag -l nightly/2026-08-08/stage-2/pr-101 --format=%(contents)", "PR: #101\nDomain: scoped\nChange: scoped change"],
    ["rev-parse --short nightly/2026-08-08/stage-2^{commit}", "legacy1"],
    ["rev-parse --short nightly/2026-08-08/stage-2/pr-101^{commit}", "scoped1"],
  ]);

  const entries = collectHistoryBlocksFromTags({
    dates: ["2026-08-08"],
    config: { owner: "AlbiDR", repo: "Clash-Manager", historyLookbackDays: 7 },
    git: args => tagContents.get(args.join(" ")) || "",
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].prNum, "#101");
  assert.match(entries[0].block, /scoped change/);
  assert.doesNotMatch(entries[0].block, /legacy change/);
});

test("ignores contradictory PR-scoped tag payloads", () => {
  const tagContents = new Map([
    ["tag -l nightly/2026-08-08/*", "nightly/2026-08-08/stage-2/pr-101"],
    ["tag -l nightly/2026-08-08/stage-2/pr-101 --format=%(contents)", "PR: #202\nDomain: Verification\nChange: wrong payload"],
    ["rev-parse --short nightly/2026-08-08/stage-2/pr-101^{commit}", "bbb2222"],
  ]);

  const entries = collectHistoryBlocksFromTags({
    dates: ["2026-08-08"],
    config: { owner: "AlbiDR", repo: "Clash-Manager", historyLookbackDays: 7 },
    git: args => tagContents.get(args.join(" ")) || "",
  });

  assert.deepEqual(entries, []);
});

test("orders same-stage same-date PR-scoped tags by PR number", () => {
  const tagContents = new Map([
    ["tag -l nightly/2026-08-08/*", "nightly/2026-08-08/stage-7/pr-103\nnightly/2026-08-08/stage-7/pr-101\nnightly/2026-08-08/stage-7/pr-102"],
    ["tag -l nightly/2026-08-08/stage-7/pr-101 --format=%(contents)", "PR: #101\nChange: first"],
    ["tag -l nightly/2026-08-08/stage-7/pr-102 --format=%(contents)", "PR: #102\nChange: second"],
    ["tag -l nightly/2026-08-08/stage-7/pr-103 --format=%(contents)", "PR: #103\nChange: third"],
    ["rev-parse --short nightly/2026-08-08/stage-7/pr-101^{commit}", "aaa1111"],
    ["rev-parse --short nightly/2026-08-08/stage-7/pr-102^{commit}", "bbb2222"],
    ["rev-parse --short nightly/2026-08-08/stage-7/pr-103^{commit}", "ccc3333"],
  ]);

  const entries = collectHistoryBlocksFromTags({
    dates: ["2026-08-08"],
    config: { owner: "AlbiDR", repo: "Clash-Manager", historyLookbackDays: 7 },
    git: args => tagContents.get(args.join(" ")) || "",
  });

  assert.deepEqual(entries.map(entry => entry.prNum), ["#101", "#102", "#103"]);
});

test("classifies existing tag creation idempotence", () => {
  assert.equal(classifyTagCreation("", "abc123"), "create");
  assert.equal(classifyTagCreation("abc123", "abc123"), "exists-matching");
  assert.equal(classifyTagCreation("abc123", "def456"), "exists-conflicting");
});

test("inserts only missing history blocks", () => {
  const content = `# History

## T1 -- Active (last 7 days)
### [2026-08-08] PR #100 [Stage 1]: existing

## T2 -- Recent (8-30 days)
`;
  const result = insertHistoryBlocks(content, [
    { prNum: "#100", block: "duplicate" },
    { prNum: "#101", block: "### [2026-08-08] PR #101 [Stage 2]: new" },
  ]);

  assert.equal(result.inserted, 1);
  assert.match(result.content, /PR #101/);
  assert.doesNotMatch(result.content, /duplicate/);
});

test("classifies retryable and terminal merge API errors", () => {
  assert.equal(isRetryableMergeError({ status: 405 }), true);
  assert.equal(isRetryableMergeError({ status: 409 }), true);
  assert.equal(isRetryableMergeError({ status: 422, responseText: "You have exceeded a secondary rate limit. Try again later." }), true);
  assert.equal(isRetryableMergeError({ status: 422, responseText: "Validation failed: branch protection rejected this merge." }), false);
  assert.equal(isRetryableMergeError({ status: 403 }), false);
});

test("detects stale-head SHA mismatch responses", () => {
  assert.equal(isShaMismatch({
    status: 409,
    responseText: "Conflict: head SHA does not match expected sha.",
  }), true);
  assert.equal(isShaMismatch({
    status: 409,
    responseText: "Conflict: branch is temporarily locked.",
  }), false);
  assert.equal(isShaMismatch({ status: 405, responseText: "Method Not Allowed" }), false);
});

test("renders deduplicatable failure blocks", () => {
  const block = renderFailureBlock({
    date: "2026-08-08",
    pr: { number: 1388, title: "fix(apk-ux): modernize rows", html_url: "https://example.test/pr/1388" },
    status: "Auto-merge aborted.",
    errorMessage: "Method Not Allowed",
  });

  assert.match(block, /MERGE FAILED: PR #1388/);
  assert.match(block, /Method Not Allowed/);
});

test("builds seven UTC date strings for safety-net backfill", () => {
  assert.deepEqual(getRecentDateStrings(3, new Date("2026-08-08T23:30:00Z")), [
    "2026-08-08",
    "2026-08-07",
    "2026-08-06",
  ]);
});

test("nightly ledger creates and updates one idempotent entry per date and stage", t => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "nightly-ledger-test-"));
  const ledgerPath = path.join(tempDir, "nightly-run-ledger.json");
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, "2026-08-11", {
    now: "2026-08-11T13:00:00.000Z",
    deadlineUtc: { 3: "2026-08-11T02:00:00.000Z" },
  });
  assert.equal(Object.keys(ledger.runs["2026-08-11"]).length, 13);
  assert.equal(stageEntry(ledger, "2026-08-11", 3).state, "EXPECTED");
  assert.equal(stageEntry(ledger, "2026-08-11", 3).deadlineUtc, "2026-08-11T02:00:00.000Z");

  upsertStageEntry(ledger, registry, "2026-08-11", 3, {
    state: "RECOVERABLE",
    evidence: { prNumber: 1418 },
    failureClass: "MALFORMED_BRANCH",
    lastObservedAt: "2026-08-11T13:01:00.000Z",
  });
  upsertStageEntry(ledger, registry, "2026-08-11", 3, {
    state: "MERGED",
    evidence: { commitSha: "8ca87809" },
    failureClass: null,
    lastObservedAt: "2026-08-11T13:02:00.000Z",
  });

  assert.equal(Object.keys(ledger.runs["2026-08-11"]).length, 13);
  assert.deepEqual(stageEntry(ledger, "2026-08-11", 3).evidence, {
    prNumber: 1418,
    commitSha: "8ca87809",
  });
  assert.equal(stageEntry(ledger, "2026-08-11", 3).state, "MERGED");

  saveLedger(ledger, ledgerPath);
  assert.deepEqual(loadLedger(ledgerPath), validateLedger(ledger));
});

test("a promotion tag protects a merged row from a later coordinator failure", () => {
  // Real corruption, 2026-08-25 and 2026-08-26: the coordinator's failure path
  // writes BLOCKED/MERGE_COORDINATOR keyed on `new Date()` with no check for an
  // existing merge, and target selection has no age bound, so stale open PR
  // #1546 was re-selected on three consecutive nights. The stage-1 rows ended
  // up holding state BLOCKED while also carrying the tags proving they merged
  // (nightly/2026-08-24/stage-1/pr-1547 and .../2026-08-25/stage-1/pr-1563).
  // That self-contradiction made an eight-night clean streak read as six.
  const ledger = createEmptyLedger();
  upsertStageEntry(ledger, registry, "2026-08-25", 1, {
    state: "MERGED",
    failureClass: null,
    evidence: { tag: "nightly/2026-08-25/stage-1/pr-1563", commitSha: "abc1234" },
  });

  upsertStageEntry(ledger, registry, "2026-08-25", 1, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    evidence: { prNumber: 1546, reason: "non-fast-forward" },
  });

  const entry = stageEntry(ledger, "2026-08-25", 1);
  assert.equal(entry.state, "MERGED", "a tagged merge must survive a later coordinator failure");
  assert.equal(entry.failureClass, null, "a tagged merge must not acquire a failure class");
  // The failure is still recorded, just not as a state change.
  assert.equal(entry.evidence.tag, "nightly/2026-08-25/stage-1/pr-1563");
  assert.equal(entry.evidence.reason, "non-fast-forward");

  // The guard is scoped to tagged merges only: an untagged row must still be
  // demotable, otherwise genuine coordinator failures would go unrecorded.
  upsertStageEntry(ledger, registry, "2026-08-25", 2, { state: "MERGED", failureClass: null, evidence: {} });
  upsertStageEntry(ledger, registry, "2026-08-25", 2, {
    state: "BLOCKED",
    failureClass: "MERGE_COORDINATOR",
    evidence: { prNumber: 1599, reason: "non-fast-forward" },
  });
  assert.equal(stageEntry(ledger, "2026-08-25", 2).state, "BLOCKED");
  assert.equal(stageEntry(ledger, "2026-08-25", 2).failureClass, "MERGE_COORDINATOR");
});

test("a red regression gate blocks the merge, and an absent one does not", async () => {
  // Before this the coordinator gated on details.mergeable alone, which means
  // conflict-free, not correct. The regression gate could run, go red, and the
  // pull request merged anyway: the test was detection, not prevention.
  //
  // The asymmetry is the design. The gate is path-filtered to Frontend-PWA and
  // Backend, so a log-only stage legitimately has no gate to pass; treating a
  // missing check as failure would block most of the pipeline every night.
  const config = { owner: "AlbiDR", repo: "Clash-Manager", token: "t" };
  const pr = { number: 1700, head: { sha: "abc123" } };

  const withRuns = runs => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ check_runs: runs }),
      text: async () => "",
    });
  };
  const originalFetch = global.fetch;

  try {
    withRuns([{ name: REGRESSION_GATE_CHECK, conclusion: "failure" }]);
    assert.equal(await regressionGateBlocks(pr, config), true, "a failed gate must block");

    withRuns([{ name: REGRESSION_GATE_CHECK, conclusion: "timed_out" }]);
    assert.equal(await regressionGateBlocks(pr, config), true, "a timed-out gate must block");

    withRuns([{ name: REGRESSION_GATE_CHECK, conclusion: "success" }]);
    assert.equal(await regressionGateBlocks(pr, config), false, "a passing gate must not block");

    // Path-filtered away: a log-only stage has no gate and must still merge.
    withRuns([{ name: "Commit Attribution Guard", conclusion: "success" }]);
    assert.equal(await regressionGateBlocks(pr, config), false, "an absent gate is not a failure");

    // Still running: the coordinator retries, so this is not a refusal either.
    withRuns([{ name: REGRESSION_GATE_CHECK, conclusion: null, status: "in_progress" }]);
    assert.equal(await regressionGateBlocks(pr, config), false, "an unfinished gate is not a failure");

    // A broken API is not evidence of a failing gate.
    global.fetch = async () => { throw new Error("network down"); };
    assert.equal(await regressionGateBlocks(pr, config), false, "an unreadable check must not block every merge");
  } finally {
    global.fetch = originalFetch;
  }
});

// --- The record stops depending on an agent copying a file ------------------
//
// The pull request body reaches GitHub through the agent's final message. When
// the agent ad-libs it, extractMetadata substitutes a placeholder for every
// field, createStageTag bakes those into the annotated tag, and parseTagContent
// reads them back into the permanent history block. 75 of 116 Result fields in
// the committed history hold a placeholder for words nobody ever saw.
//
// Nothing downstream can fix it: a tag that exists is left unchanged, and
// insertHistoryBlocks skips a pull request number already in the file. So the
// only place a correction can land is at tag creation, and the finalize that
// produced the merged work also committed the description into it.

const AD_LIBBED_BODY = { number: 1695, title: "chore(verify): expanded coverage", body: "I have completed the stage." };
const REAL_SIDECAR = {
  domain: "verification",
  why: "StorageService nuclear reset had no coverage.",
  change: "Expanded unit test coverage for the migration boundary.",
  result: "7/7 tests passed.",
  files: "Frontend-PWA/src/core/services/services-tests/StorageService.spec.ts",
};

test("a description damaged in transit is recovered from the committed sidecar", () => {
  const bodyMeta = extractMetadata(AD_LIBBED_BODY);
  // Precondition: this is the laundering, before the fix.
  assert.equal(bodyMeta.why, METADATA_PLACEHOLDERS.why);
  assert.equal(bodyMeta.result, METADATA_PLACEHOLDERS.result);

  const { meta, upgraded } = preferStatedMetadata(REAL_SIDECAR, bodyMeta, { number: 2, slug: "verification" });
  assert.equal(meta.why, REAL_SIDECAR.why);
  assert.equal(meta.result, REAL_SIDECAR.result);
  assert.equal(meta.change, REAL_SIDECAR.change);
  assert.equal(meta.domain, "verification");

  // `change` is replaced but is NOT reported as recovered, and the distinction
  // is real: extractMetadata falls back to the pull request title, which is
  // text a person wrote rather than a placeholder. That fallback is why the
  // Change field never looked as damaged as Why and Result in the history even
  // on nights when the metadata block was missing entirely. The sidecar's
  // version is more precise, so it wins, but nothing was rescued from
  // genericness.
  assert.equal(bodyMeta.change, AD_LIBBED_BODY.title);
  assert.deepEqual(upgraded.sort(), ["domain", "files", "result", "why"]);
});

test("a stage's own words are never replaced by a placeholder", () => {
  // The one property worth guaranteeing about a write that cannot be revisited.
  // Wholesale preference for the sidecar would be correct today, since the body
  // is a copy of it; this holds even when that stops being true.
  const goodBody = extractMetadata({
    number: 1695,
    body: "<!--\nNIGHTLY_PR_METADATA:\n  Domain: verification\n  Why: a real reason\n  Change: real work\n  Result: 7/7 tests passed\n  Files: a.spec.ts\n-->",
  });
  assert.equal(goodBody.why, "a real reason");

  const degradedSidecar = {
    ...REAL_SIDECAR,
    why: METADATA_PLACEHOLDERS.why,
    result: METADATA_PLACEHOLDERS.result,
  };
  const { meta, upgraded } = preferStatedMetadata(degradedSidecar, goodBody, { number: 2, slug: "verification" });
  assert.equal(meta.why, "a real reason", "a placeholder must never overwrite a statement");
  assert.equal(meta.result, "7/7 tests passed");
  assert.deepEqual(upgraded, [], "nothing was recovered, so nothing may be reported as recovered");
});

test("the stage runner's own why placeholder is recognised, which needs the slug", () => {
  // placeholderWhy interpolates the number and the slug, so a merge that knew
  // only the number would take it for a statement and keep it.
  const stage = { number: 4, slug: "optimization" };
  const sidecar = { ...REAL_SIDECAR, why: placeholderWhy(stage) };
  const bodyMeta = { ...REAL_SIDECAR, why: "the real reason the loop was renamed" };

  const { meta } = preferStatedMetadata(sidecar, bodyMeta, stage);
  assert.equal(meta.why, "the real reason the loop was renamed");
});

test("no sidecar leaves the published description exactly as it was", () => {
  // Runs already in flight, runs predating the sidecar, and any stage that
  // failed before finalize all take this path. It must lose nothing and it must
  // not claim a recovery.
  const bodyMeta = extractMetadata(AD_LIBBED_BODY);
  const { meta, upgraded } = preferStatedMetadata(null, bodyMeta, { number: 2, slug: "verification" });
  assert.deepEqual(meta, bodyMeta);
  assert.deepEqual(upgraded, []);
});

test("the tag parser's placeholders are the same vocabulary, not a third opinion", () => {
  // parseTagContent defaults every field before reading the payload. These have
  // never reached the committed history, because createStageTag always writes
  // all six lines, which is exactly why they went unnoticed while the other two
  // families were being hunted.
  const parsed = parseTagContent("PR: #1695");
  assert.equal(parsed.why, TAG_PLACEHOLDERS.why);
  assert.equal(parsed.result, TAG_PLACEHOLDERS.result);
  assert.ok(isPlaceholderField("result", parsed.result), "the recap must not print this as a stage's own result");
  assert.ok(isPlaceholderField("why", parsed.why));
});

test("a sidecar this run did not write is never read", () => {
  // The hazard the gate exists for. A stage overwrites its own sidecar every
  // night at a path fixed by the registry, so the file is present in the merged
  // commit's TREE whether or not this run wrote it: the merge inherits the
  // previous run's copy from the base branch. Every run predating the sidecar,
  // and every stage that fails before finalize, would otherwise have last
  // night's Why and Result attached to tonight's permanent record.
  //
  // A placeholder is merely uninformative. A specific sentence about the wrong
  // run is a confident false claim nothing downstream could detect, so the gate
  // is a fact about the commit (did it modify the file) rather than a guess
  // about the contents.
  const stage = { number: 2, slug: "verification", coverageLog: ".github/nightly-logs/02-verification-coverage.log" };
  const sidecarPath = ".github/nightly-logs/02-verification-pr-body.md";
  const lastNight = [
    "<!--",
    "NIGHTLY_PR_METADATA:",
    "  Domain: verification",
    "  Why: last night's reason",
    "  Change: last night's work",
    "  Result: last night's 4/4 tests passed",
    "  Files: old.spec.ts",
    "-->",
  ].join("\n");

  const reads = [];
  const reader = (sha, filePath) => {
    reads.push(`${sha}:${filePath}`);
    return filePath === sidecarPath ? lastNight : "";
  };

  // Present in the tree, absent from the diff: refused, and not even read.
  assert.equal(readSidecarMetadata("abc123", stage, [stage.coverageLog], reader), null);
  assert.deepEqual(reads, [], "a refused sidecar must not be read at all");

  // Written by this commit: read, and parsed.
  const found = readSidecarMetadata("abc123", stage, [sidecarPath, stage.coverageLog], reader);
  assert.equal(found.path, sidecarPath);
  assert.equal(found.meta.why, "last night's reason");
  assert.deepEqual(reads, [`abc123:${sidecarPath}`]);

  // A stage the registry does not know, and a commit whose sidecar cannot be
  // read, both fall back rather than throwing inside the merge coordinator.
  assert.equal(readSidecarMetadata("abc123", null, [sidecarPath], reader), null);
  assert.equal(readSidecarMetadata("abc123", stage, [sidecarPath], () => ""), null);
});

test("a refused sidecar costs the record nothing", () => {
  // What makes refusing safe: the published description is used unchanged, and
  // no recovery is claimed.
  const bodyMeta = extractMetadata(AD_LIBBED_BODY);
  const { meta, upgraded } = preferStatedMetadata(null, bodyMeta, { number: 2, slug: "verification" });
  assert.deepEqual(meta, bodyMeta);
  assert.deepEqual(upgraded, []);
});
