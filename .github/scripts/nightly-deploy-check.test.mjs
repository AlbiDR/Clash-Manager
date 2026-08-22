// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import { CONTROL_PLANE_BRANCHES, evaluateControlPlaneDrift, renderDriftReport } from "./nightly-deploy-check.mjs";

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
