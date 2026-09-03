// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PLAIN_PREFIX, countOf, displayArea, joinList, stageTag } from "./nightly-prose.mjs";
import { renderPlainSummary } from "./nightly-stage.mjs";

const registry = JSON.parse(readFileSync(new URL("../../nightly-config/stages.json", import.meta.url), "utf8"));

test("every stage slug renders the same way on both surfaces", () => {
  // The point of the module. Both the PR body and the recap call this one
  // function, so a stage cannot be "APK integrity" in one place and
  // "apk-integrity" in the other.
  for (const stage of registry.stages) {
    const rendered = displayArea(stage.slug);
    assert.doesNotMatch(rendered, /-/, `${stage.slug} still reads like a slug`);
    assert.ok(rendered.length > 0);
  }
  assert.equal(displayArea("apk-integrity"), "APK integrity");
  assert.equal(displayArea("documentation-tsdoc"), "documentation TSDoc");
  assert.equal(displayArea("apk-ux"), "APK UX");
  assert.equal(displayArea("hardening"), "hardening");
});

test("no two stages render to the same area name", () => {
  // Stages 10 and 11 share the registry domain "apk". Building prose from the
  // domain made their summaries byte-identical, which is why this takes slugs.
  const rendered = registry.stages.map(s => displayArea(s.slug));
  assert.equal(new Set(rendered).size, rendered.length, `collision: ${rendered.join(", ")}`);
});

test("the plain-language opener is one constant, used by every surface", () => {
  assert.equal(PLAIN_PREFIX, "In plain terms: ");
  const stage = registry.stages.find(s => s.number === 4);
  assert.ok(renderPlainSummary(stage, "CLEAN", [stage.coverageLog]).startsWith(PLAIN_PREFIX));
});

test("no surface hardcodes the vocabulary instead of importing it", () => {
  // A regression here is silent: the copy keeps working while drifting. This is
  // the check that makes the shared module load-bearing rather than advisory.
  for (const file of ["nightly-stage.mjs", "nightly-recap.mjs"]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    // Any quote style. An earlier version of this guard matched only double
    // quotes and silently passed a template-literal hardcoding, which is the
    // exact form this codebase writes.
    assert.doesNotMatch(source, /["'`]In plain terms/, `${file} hardcodes the opener`);
    assert.doesNotMatch(source, /function displayArea\b/, `${file} has its own displayArea`);
    assert.doesNotMatch(source, /function joinList\b/, `${file} has its own joinList`);
    assert.doesNotMatch(source, /function countOf\b/, `${file} has its own countOf`);
    assert.match(source, /from "\.\/nightly-prose\.mjs"/, `${file} does not import the shared vocabulary`);
  }
});

test("counting and listing read as English at every size", () => {
  assert.equal(countOf([], "test file"), "0 test files");
  assert.equal(countOf(["a"], "test file"), "1 test file");
  assert.equal(countOf(["a", "b"], "code file"), "2 code files");
  assert.equal(joinList([]), "");
  assert.equal(joinList(["a"]), "a");
  assert.equal(joinList(["a", "b"]), "a and b");
  assert.equal(joinList(["a", "b", "c"]), "a, b and c");
  assert.equal(joinList(["a", null, "c"]), "a and c");
});

test("stage tags are zero-padded identically everywhere", () => {
  assert.equal(stageTag(1), "S01");
  assert.equal(stageTag(13), "S13");
});

test("the shared module stays pure, so importing it cannot break a stage run", () => {
  // nightly-stage.mjs is the file Jules executes on every run. This module is
  // safe to import there only while it does no I/O and pulls in nothing else.
  const source = readFileSync(new URL("./nightly-prose.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import /m, "nightly-prose.mjs must have no imports");
  assert.doesNotMatch(source, /readFileSync|spawnSync|process\.|writeFile/, "nightly-prose.mjs must do no I/O");
});
