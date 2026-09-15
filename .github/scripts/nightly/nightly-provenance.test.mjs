// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import { getExecutionProvenance, validateExecutionProvenance } from "./nightly-provenance.mjs";

test("execution provenance prefers the SHA of the actual Nightly checkout", () => {
  const provenance = getExecutionProvenance({
    NIGHTLY_WORKFLOW_PATH: ".github/workflows/nightly-watchdog.yml",
    NIGHTLY_EXECUTION_BRANCH: "Nightly",
    NIGHTLY_EXECUTION_SHA: "nightly-sha",
    GITHUB_SHA: "default-branch-sha",
    GITHUB_WORKFLOW: "Nightly Watchdog",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    RUNNER_OS: "Linux",
    ImageOS: "ubuntu24",
  });

  assert.equal(provenance.executionId, ".github/workflows/nightly-watchdog.yml:123:2");
  assert.equal(provenance.checkout.branch, "Nightly");
  assert.equal(provenance.checkout.sha, "nightly-sha");
  assert.equal(provenance.workflow.attempt, 2);
  assert.equal(provenance.runtime.runnerOs, "Linux");
  assert.match(provenance.controlPlane.registryDigest, /^[a-f0-9]{64}$/);
  assert.match(provenance.controlPlane.workflowDigest, /^[a-f0-9]{64}$/);
  assert.equal(validateExecutionProvenance(provenance), provenance);
});

test("local provenance remains explicit rather than pretending to be a GitHub run", () => {
  const provenance = getExecutionProvenance({});

  assert.match(provenance.executionId, /^local-nightly-control-plane:local:\d+$/);
  assert.equal(provenance.checkout.branch, "Nightly");
  assert.equal(provenance.checkout.sha, null);
  assert.equal(provenance.workflow.runId, null);
});

test("provenance validation rejects a malformed execution identity", () => {
  assert.throws(
    () => validateExecutionProvenance({
      schemaVersion: 1,
      executionId: "",
      workflow: { attempt: 1 },
      checkout: { branch: "Nightly" },
      runtime: { node: process.version },
      controlPlane: {},
    }),
    /executionId/,
  );
});
