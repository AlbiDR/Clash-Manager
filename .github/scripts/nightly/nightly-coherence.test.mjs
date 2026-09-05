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

test("the version stage's mandate is not narrower than the checker it runs", () => {
  // On 2026-09-03 Stage 7's Target B named three locations (the package.json
  // files) while validate-project.ts enforced ten. The other seven were
  // verified by a tool the stage was never told it could reconcile, so a
  // drifted README badge or apktool.yml was detectable but not actionable.
  //
  // The fix is deliberately NOT a list copied into the prompt, because a copied
  // list is what diverged. The prompt must defer to the checker.
  const prompt = readFileSync(new URL("../../nightly-prompts/07-version-integrity.md", DIR), "utf8");
  assert.match(prompt, /validate-project\.ts/, "S07 must name the checker as the authoritative list");
  assert.match(prompt, /Derived Declaration Scan/, "S07's scan step must cover derived locations");
  assert.match(prompt, /assertVersionCodeNotRegressed/, "S07 must know versionCode is never auto-fixed");
  // The scan must run the checker, not only verify with it afterwards.
  const scanSection = prompt.slice(prompt.indexOf("Priority List"), prompt.indexOf("Step 2"));
  assert.match(scanSection, /pnpm audit:version/, "audit:version must appear in the SCAN step, not just verification");
});

test("the version checker still owns more locations than any prompt enumerates", () => {
  // If validate-project.ts ever shrank to only the manifests, the deferral
  // above would be pointless and the prompt's wording would be misleading.
  const checker = readFileSync(new URL("../project/validate-project.ts", DIR), "utf8");
  for (const marker of ["apktool.yml", "twa-manifest", "protocol", "readme", "useProgressiveList"]) {
    assert.ok(checker.includes(marker), `validate-project.ts no longer checks ${marker}`);
  }
});

// Two parsers read the stage coverage-log line, and they must agree.
//
// nightly-recap.mjs reads it from the committed file; nightly-publish-fallback
// reads it out of a unified diff, so they cannot literally share one regex. But
// they are two definitions of one format, which is exactly the duplication this
// file exists to police, and on 2026-09-03 they drifted: finalize started
// writing the run window `[HH:MMZ-HH:MMZ NNm]`, the recap was taught about it
// and the fallback publisher was not. From that day the fallback publisher
// could not parse a single line the pipeline produced, and could therefore not
// publish anything. Nothing noticed for two days.
//
// So this asserts agreement on behaviour rather than absence of duplication:
// give both parsers the same line and require the same status and summary.
test("both coverage-log parsers read the same line the same way", async () => {
  const { parseCoverageLine } = await import("./nightly-recap.mjs");
  const { parseCoverageOutcome } = await import("./nightly-publish-fallback.mjs");
  const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", DIR), "utf8"));
  const stage = registry.stages.find(s => s.number === 11);
  const date = "2026-09-05";

  const cases = [
    // Every shape finalize has ever written, oldest last. A parser that only
    // handles the current one silently abandons older stranded work.
    `* [${date}] [Stage 11] [09:03Z-09:05Z 2m] CLEAN: Codebase -- Audited native WebView settings`,
    `* [${date}] [Stage 11] CHANGED: Frontend-PWA/src/x.ts -- Did the thing`,
    `* [${date}] [Stage 11] [09:03Z-09:05Z 2m] PARTIAL-RUN: Codebase -- Stopped early`,
  ];

  for (const line of cases) {
    const fromLog = parseCoverageLine(line, stage.number, date);
    const fromPatch = parseCoverageOutcome(`+${line}`, stage, date);
    assert.ok(fromLog, `recap parser rejected: ${line}`);
    assert.ok(fromPatch, `fallback parser rejected: ${line}`);
    assert.equal(fromPatch.status, fromLog.status, `status disagreement on: ${line}`);
    assert.equal(fromPatch.summary, fromLog.summary, `summary disagreement on: ${line}`);
  }
});
