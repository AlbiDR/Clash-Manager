// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { stageDisplayNumber, stageSessionTitle } from "./nightly-dispatch.mjs";

const registry = JSON.parse(readFileSync(new URL("../nightly-config/stages.json", import.meta.url), "utf8"));

test("Jules session titles use one zero-padded stage nomenclature", () => {
  assert.equal(stageDisplayNumber(1), "S01");
  assert.equal(stageDisplayNumber(13), "S13");
  assert.equal(
    stageSessionTitle(registry.stages[0], "2026-08-31"),
    "S01: Hardening - Runtime Integrity Auditor (2026-08-31)",
  );
  assert.equal(
    stageSessionTitle(registry.stages[12], "2026-08-31"),
    "S13: Self-Healing Protocol - Pipeline Resilience Auditor (2026-08-31)",
  );
});

test("every registry stage name follows the shared domain-role shape", () => {
  for (const stage of registry.stages) {
    assert.match(
      stageSessionTitle(stage, "2026-08-31"),
      /^S\d{2}: [A-Z][A-Za-z0-9 -]+ - [A-Z][A-Za-z0-9 -]+ \(\d{4}-\d{2}-\d{2}\)$/,
      `Stage ${stage.number} has a non-standard title shape`,
    );
  }
});
