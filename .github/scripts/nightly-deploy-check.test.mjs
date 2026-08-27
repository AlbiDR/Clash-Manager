// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROL_PLANE_BRANCHES,
  CONTROL_PLANE_FILES,
  EXECUTION_BRANCH,
  evaluateControlPlaneDrift,
  collectStrandedWork,
  evaluateStrandedWork,
  renderDriftReport,
  renderStrandedReport,
} from "./nightly-deploy-check.mjs";

// ---------------------------------------------------------------------------
// Directional check. Nightly ahead of the others is the intended state between
// manual syncs; only work stranded downstream of Nightly is a fault.
// ---------------------------------------------------------------------------

test("stranded work on Beta is reported because Nightly executes the scripts", () => {
  // The 2026-08-16 shape: the recovery-pass fix reachable from Beta only.
  const stranded = evaluateStrandedWork({
    Beta: ["f9a050f2 feat(nightly): recover stranded Jules sessions"],
    Stable: [],
  });
  assert.equal(stranded.length, 1);
  assert.equal(stranded[0].branch, "Beta");
  assert.equal(stranded[0].commits.length, 1);
});

test("Nightly running ahead of Beta and Stable is not a finding", () => {
  // sync-branches.yml is dispatch-only by design, so this is the steady state
  // for as long as the operator chooses. Reporting it would be reporting the
  // architecture working correctly.
  assert.deepEqual(evaluateStrandedWork({ Beta: [], Stable: [] }), []);
  assert.deepEqual(evaluateStrandedWork({}), []);
  assert.deepEqual(evaluateStrandedWork(null), []);
});

test("stranded work is reported per branch", () => {
  const stranded = evaluateStrandedWork({
    Beta: ["aaaaaaa fix one"],
    Stable: ["bbbbbbb fix two", "ccccccc fix three"],
  });
  assert.deepEqual(stranded.map(entry => entry.branch), ["Beta", "Stable"]);
  assert.equal(stranded[1].commits.length, 2);
});

test("renderStrandedReport names the branch and every stranded commit", () => {
  const report = renderStrandedReport([
    { branch: "Beta", commits: ["f9a050f2 feat(nightly): recover stranded Jules sessions"] },
  ]);
  assert.match(report, /is MISSING control-plane work/);
  assert.match(report, /on Beta, absent from Nightly/);
  assert.match(report, /f9a050f2/);
  assert.match(report, /Sync Branches/);
});

test("renderStrandedReport is explicit that an all-clear means containment", () => {
  const report = renderStrandedReport([]);
  assert.match(report, /contains every control-plane commit/);
  assert.doesNotMatch(report, /MISSING/);
});

test("the execution branch is the one workflows check their scripts out from", () => {
  assert.equal(EXECUTION_BRANCH, "Nightly");
  assert.ok(CONTROL_PLANE_BRANCHES.includes(EXECUTION_BRANCH));
});

test("a git failure raises rather than reporting an all-clear", () => {
  // Fail-closed. An earlier revision of this returned [] when git exited
  // non-zero, so a failed fetch or a renamed branch produced a confident green
  // from a check that had learned nothing. A guard that passes when it is
  // broken is worse than no guard: the pass is indistinguishable from a real one.
  assert.throws(
    () => collectStrandedWork(CONTROL_PLANE_FILES, ["Beta"], "no-such-branch-xyz"),
    /Could not compare/,
  );
});

test("the watch list covers the guard and the checker themselves", () => {
  // A drift detector that is not itself watched can be downgraded on one branch
  // and still report everything as fine when invoked from another.
  assert.ok(CONTROL_PLANE_FILES.includes(".github/scripts/nightly-deploy-check.mjs"));
  assert.ok(CONTROL_PLANE_FILES.includes(".github/workflows/control-plane-guard.yml"));
});

test("the watch list covers the dispatch path the migration will depend on", () => {
  assert.ok(CONTROL_PLANE_FILES.includes(".github/workflows/nightly-dispatch.yml"));
  assert.ok(CONTROL_PLANE_FILES.includes(".github/scripts/nightly-dispatch.mjs"));
});

test("the watch list covers the merge attributes the sync depends on", () => {
  // `pnpm-lock.yaml merge=binary` lives here. Git reads .gitattributes from the
  // branch performing the merge, and all four sync jobs merge the lockfile, so
  // this file being present on some branches only would silently reintroduce
  // the 2026-08-26 lockfile splice on whichever branch is missing it.
  assert.ok(CONTROL_PLANE_FILES.includes(".gitattributes"));
});

test("every watched path is repository-relative and unique", () => {
  assert.equal(new Set(CONTROL_PLANE_FILES).size, CONTROL_PLANE_FILES.length);
  for (const file of CONTROL_PLANE_FILES) {
    assert.ok(!file.startsWith("/"), `${file} should not be absolute`);
    assert.ok(!file.includes(".."), `${file} should not escape the repository root`);
  }
});

test("evaluateControlPlaneDrift stays quiet when every branch agrees", () => {
  const fileBlobs = {
    "a.mjs": { Nightly: "abc", Beta: "abc", Stable: "abc" },
    "b.yml": { Nightly: "def", Beta: "def", Stable: "def" },
  };
  assert.deepEqual(evaluateControlPlaneDrift(fileBlobs), []);
});

test("evaluateControlPlaneDrift flags a file that differs on one branch", () => {
  const fileBlobs = {
    "nightly-watchdog.mjs": { Nightly: "old", Beta: "new", Stable: "old" },
  };
  const drifted = evaluateControlPlaneDrift(fileBlobs);
  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].file, "nightly-watchdog.mjs");
  assert.deepEqual(drifted[0].hashes, { Nightly: "old", Beta: "new", Stable: "old" });
});

test("evaluateControlPlaneDrift treats a file missing from one branch as drift", () => {
  // Mirrors the real 2026-08-16 incident: nightly-redact.mjs existed on Beta
  // only, and the watchdog script that imports it was promoted before it was.
  const fileBlobs = {
    "nightly-redact.mjs": { Nightly: null, Beta: "hash", Stable: null },
  };
  const drifted = evaluateControlPlaneDrift(fileBlobs);
  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].hashes.Nightly, null);
  assert.equal(drifted[0].hashes.Beta, "hash");
});

test("evaluateControlPlaneDrift ignores a file identically absent everywhere", () => {
  const fileBlobs = {
    "not-yet-created.mjs": { Nightly: null, Beta: null, Stable: null },
  };
  assert.deepEqual(evaluateControlPlaneDrift(fileBlobs), []);
});

test("renderDriftReport stays quiet when nothing drifted", () => {
  const report = renderDriftReport([], CONTROL_PLANE_BRANCHES);
  assert.match(report, /all files identical across Nightly, Beta, Stable/);
});

test("renderDriftReport names every drifted file and its per-branch hash", () => {
  const report = renderDriftReport(
    [{ file: "x.mjs", hashes: { Nightly: "a", Beta: "b", Stable: "a" } }],
    CONTROL_PLANE_BRANCHES,
  );
  assert.match(report, /x\.mjs/);
  assert.match(report, /Beta: b/);
  assert.match(report, /1 file\(s\) DRIFTED/);
});

test("renderDriftReport prints 'absent' rather than null for a missing file", () => {
  const report = renderDriftReport(
    [{ file: "y.mjs", hashes: { Nightly: null, Beta: "b", Stable: null } }],
    CONTROL_PLANE_BRANCHES,
  );
  assert.match(report, /Nightly: absent/);
  assert.match(report, /Stable: absent/);
});
