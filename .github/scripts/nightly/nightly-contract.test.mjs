// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getContractFingerprint,
  renderCapabilityMatrix,
  renderStageContract,
  validateStageContract,
} from "./nightly-contract.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));

test("every registered stage exposes a complete capability contract", () => {
  for (const stage of registry.stages) assert.equal(validateStageContract(stage), stage.contract);
});

test("contract fingerprints identify stage semantics rather than prose rendering", () => {
  const stage = registry.stages[0];
  const fingerprint = getContractFingerprint(stage);
  const changed = structuredClone(stage);
  changed.contract.purpose = `${changed.contract.purpose} changed`;

  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(getContractFingerprint(changed), fingerprint);
  assert.equal(getContractFingerprint(structuredClone(stage)), fingerprint);
});

test("stage inspection answers ownership, exclusion, verification, and evidence questions", () => {
  const output = renderStageContract(registry.stages[0]);

  assert.match(output, /^S01 Hardening/m);
  assert.match(output, /^Detects:/m);
  assert.match(output, /^Does not detect:/m);
  assert.match(output, /^May change:/m);
  assert.match(output, /^Must not change:/m);
  assert.match(output, /^Verification:/m);
  assert.match(output, /^Required evidence:/m);
});

test("the capability map includes every stage and makes non-ownership explicit", () => {
  const output = renderCapabilityMatrix(registry);

  assert.equal((output.match(/^S\d{2} /gm) || []).length, registry.stages.length);
  assert.match(output, /^S01 hardening$/m);
  assert.match(output, /^S13 self-healing-protocol$/m);
  assert.equal((output.match(/^  Does not own:/gm) || []).length, registry.stages.length);
  assert.equal((output.match(/^  Does not detect:/gm) || []).length, registry.stages.length);
});

test("contract validation rejects an empty decision boundary", () => {
  const stage = structuredClone(registry.stages[0]);
  stage.contract.mustNotChange = [];

  assert.throws(() => validateStageContract(stage), /mustNotChange must be a non-empty array/);
});
