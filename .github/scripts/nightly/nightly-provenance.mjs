// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const NIGHTLY_EXECUTION_PROVENANCE_VERSION = 1;

function assertProvenance(condition, message) {
  if (!condition) throw new Error(message);
}

function optionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getFileDigest(filePath) {
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Produces the non-secret execution identity for one GitHub Actions invocation.
 *
 * `GITHUB_SHA` is not reliable for a workflow that checks out another branch,
 * so workflows pass the checkout action's output through NIGHTLY_EXECUTION_SHA.
 * The fallback remains useful for local diagnostics and older workflow runs.
 */
export function getExecutionProvenance(environment = process.env) {
  const workflowPath = optionalString(environment.NIGHTLY_WORKFLOW_PATH);
  const workflowName = optionalString(environment.GITHUB_WORKFLOW);
  const runId = optionalString(environment.GITHUB_RUN_ID);
  const runAttempt = optionalString(environment.GITHUB_RUN_ATTEMPT) || "1";
  const checkedOutSha = optionalString(environment.NIGHTLY_EXECUTION_SHA) || optionalString(environment.GITHUB_SHA);
  const checkedOutBranch = optionalString(environment.NIGHTLY_EXECUTION_BRANCH)
    || optionalString(environment.GITHUB_REF_NAME)
    || "Nightly";
  const identityScope = workflowPath || workflowName || "local-nightly-control-plane";
  const executionId = runId
    ? `${identityScope}:${runId}:${runAttempt}`
    : `${identityScope}:local:${process.pid}`;

  const provenance = {
    schemaVersion: NIGHTLY_EXECUTION_PROVENANCE_VERSION,
    executionId,
    workflow: {
      name: workflowName,
      path: workflowPath,
      runId,
      attempt: Number(runAttempt),
    },
    checkout: {
      branch: checkedOutBranch,
      sha: checkedOutSha,
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      runnerOs: optionalString(environment.RUNNER_OS),
      runnerImage: optionalString(environment.ImageOS),
    },
    controlPlane: {
      registryDigest: getFileDigest(".github/nightly-config/stages.json"),
      workflowDigest: workflowPath ? getFileDigest(workflowPath) : null,
    },
  };
  validateExecutionProvenance(provenance);
  return provenance;
}

export function validateExecutionProvenance(provenance) {
  assertProvenance(provenance && typeof provenance === "object", "Execution provenance must be an object.");
  assertProvenance(
    provenance.schemaVersion === NIGHTLY_EXECUTION_PROVENANCE_VERSION,
    `Execution provenance schemaVersion must be ${NIGHTLY_EXECUTION_PROVENANCE_VERSION}.`,
  );
  assertProvenance(typeof provenance.executionId === "string" && provenance.executionId.length > 0, "Execution provenance needs an executionId.");
  assertProvenance(provenance.workflow && typeof provenance.workflow === "object", "Execution provenance needs workflow details.");
  assertProvenance(Number.isInteger(provenance.workflow.attempt) && provenance.workflow.attempt >= 1, "Execution provenance has an invalid workflow attempt.");
  assertProvenance(provenance.checkout && typeof provenance.checkout === "object", "Execution provenance needs checkout details.");
  assertProvenance(typeof provenance.checkout.branch === "string" && provenance.checkout.branch.length > 0, "Execution provenance needs a checkout branch.");
  assertProvenance(provenance.runtime && typeof provenance.runtime === "object", "Execution provenance needs runtime details.");
  assertProvenance(typeof provenance.runtime.node === "string" && provenance.runtime.node.length > 0, "Execution provenance needs a Node version.");
  assertProvenance(provenance.controlPlane && typeof provenance.controlPlane === "object", "Execution provenance needs control-plane details.");
  return provenance;
}
