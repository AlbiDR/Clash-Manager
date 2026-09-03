// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Structural coherence of the control plane.
//
// The ADR's Poka-yoke rule says duplicated logic is a defect in its own right:
// a fix applied to one copy silently survives in the others and returns later
// looking like a new bug. Nothing enforced that across .github/scripts/nightly,
// so it decayed quietly. A scan on 2026-09-03 found prNumberFromTag defined
// three times byte-equivalently, a second stage-label formatter, and worst,
// utcDate defined twice with DIFFERENT signatures and different semantics.
//
// These tests read the sources rather than the behaviour on purpose. A
// duplicate is not a behavioural failure on the day it is written; it is a
// latent one, and behavioural tests cannot see it.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const DIR = new URL("./", import.meta.url);
const modules = readdirSync(DIR).filter(f => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));

function definitionsIn(file) {
  const source = readFileSync(new URL(file, DIR), "utf8");
  return [...source.matchAll(/^(?:export )?(?:async )?function (\w+)\s*\(/gm)].map(m => m[1]);
}

// Names that legitimately recur, each with the reason it is not duplication.
// Anything NOT listed here that appears twice fails, so the list is the record
// of what was decided rather than a silent exemption.
const ALLOWED_REPEATS = new Map([
  // Per-module CLI entry points. Same name by convention, different bodies:
  // each parses its own arguments and dispatches its own commands.
  ["runCli", "each module's own CLI entry point"],
  ["run", "each module's own top-level command"],
  // Thin process/network shells. Consolidating these means one module owning
  // another's network and git access, which is a wider change than it looks and
  // touches the merge coordinator. Recorded as known, deliberately deferred.
  ["git", "thin spawnSync shell, consolidation deferred"],
  ["githubApi", "thin fetch shell, consolidation deferred"],
  ["fetchPullRequestFiles", "paired with githubApi, consolidation deferred"],
  ["invariant", "two-line assert; an import on the critical path costs more than it saves"],
  ["parseArgs", "each module's own argument shape"],
  ["loadRegistry", "genuinely different: one takes a repoRoot and checks existence, one does not"],
  ["isCalibrationClean", "consolidation deferred"],
]);

test("no function name is defined in two control-plane modules unless recorded", () => {
  const seen = new Map();
  for (const file of modules) {
    for (const name of definitionsIn(file)) {
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push(file);
    }
  }
  const unrecorded = [...seen.entries()]
    .filter(([name, files]) => files.length > 1 && !ALLOWED_REPEATS.has(name))
    .map(([name, files]) => `${name} in ${files.join(" and ")}`);

  assert.deepEqual(
    unrecorded,
    [],
    `Duplicated across control-plane modules. Extract to a shared module, or add to `
    + `ALLOWED_REPEATS with the reason:\n  ${unrecorded.join("\n  ")}`,
  );
});

test("nothing recorded as an allowed repeat has quietly stopped being one", () => {
  // Keeps the list honest in the other direction: an entry left behind after a
  // consolidation reads as an outstanding debt that no longer exists, and would
  // silently re-permit the duplicate later.
  const counts = new Map();
  for (const file of modules) {
    for (const name of definitionsIn(file)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const stale = [...ALLOWED_REPEATS.keys()].filter(name => (counts.get(name) || 0) < 2);
  assert.deepEqual(stale, [], `no longer duplicated, remove from ALLOWED_REPEATS: ${stale.join(", ")}`);
});

test("the three consolidations done on 2026-09-03 stay done", () => {
  const owners = {
    prNumberFromTag: "nightly-ledger.mjs",
    stageTag: "nightly-prose.mjs",
    displayArea: "nightly-prose.mjs",
    joinList: "nightly-prose.mjs",
    countOf: "nightly-prose.mjs",
  };
  for (const [name, owner] of Object.entries(owners)) {
    const definers = modules.filter(f => definitionsIn(f).includes(name));
    assert.deepEqual(definers, [owner], `${name} must be defined only in ${owner}`);
  }
});

test("utcDate is not two different functions wearing one name", () => {
  // nightly-stage's utcDate(now) honours NIGHTLY_TODAY and validates.
  // The watchdog's takes a day offset and does neither. Sharing the name meant
  // code moved between them would keep compiling and change meaning.
  const definers = modules.filter(f => definitionsIn(f).includes("utcDate"));
  assert.equal(definers.length, 1, `utcDate defined in ${definers.join(", ")}`);
  const watchdog = readFileSync(new URL("./nightly-watchdog.mjs", DIR), "utf8");
  assert.match(watchdog, /function utcDayOffset\(offsetDays/);
});

test("every control-plane module is watched for cross-branch drift", () => {
  // A module absent from the deploy-check manifest can be fixed on one branch
  // and silently missing on another, which is the failure the manifest exists
  // to catch. A new module must not be able to skip it by omission.
  const manifest = readFileSync(new URL("./nightly-deploy-check.mjs", DIR), "utf8");
  const unwatched = modules.filter(f => !manifest.includes(`nightly/${f}`));
  assert.deepEqual(unwatched, [], `not in the control-plane manifest: ${unwatched.join(", ")}`);
});
