// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  METADATA_PLACEHOLDERS,
  PLACEHOLDER_RESULTS,
  PLAIN_PREFIX,
  RESULT_LABEL,
  TAG_PLACEHOLDERS,
  WHY_LABEL,
  changeLabel,
  countOf,
  displayArea,
  isPlaceholderField,
  joinList,
  placeholderResult,
  placeholderWhy,
  stageTag,
} from "./nightly-prose.mjs";
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

test("a stage's summary field is labelled by what the stage actually did", () => {
  // "What changed" on a CLEAN run contradicts the field's own contents, which
  // is why the stage runner stopped saying it. The fallback publisher went on
  // saying it for every recovered CLEAN run, because it had its own copy of the
  // literal - the drift this function exists to make impossible.
  assert.equal(changeLabel("CHANGED"), "What changed");
  assert.equal(changeLabel("CLEAN"), "What was checked");
  assert.equal(changeLabel("SKIPPED"), "What was checked");
  assert.equal(changeLabel("PARTIAL-RUN"), "What was checked");
  // A stage that published nothing checked nothing either, as far as anyone can
  // prove from the evidence.
  assert.equal(changeLabel("STUCK"), "What happened");
  assert.equal(WHY_LABEL, "Why");
  assert.equal(RESULT_LABEL, "Result");
});

test("no surface hardcodes the vocabulary instead of importing it", () => {
  // A regression here is silent: the copy keeps working while drifting. This is
  // the check that makes the shared module load-bearing rather than advisory.
  for (const file of ["nightly-stage.mjs", "nightly-recap.mjs", "nightly-publish-fallback.mjs"]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    // Any quote style. An earlier version of this guard matched only double
    // quotes and silently passed a template-literal hardcoding, which is the
    // exact form this codebase writes.
    assert.doesNotMatch(source, /["'`]In plain terms/, `${file} hardcodes the opener`);
    assert.doesNotMatch(source, /function displayArea\b/, `${file} has its own displayArea`);
    assert.doesNotMatch(source, /function joinList\b/, `${file} has its own joinList`);
    assert.doesNotMatch(source, /function countOf\b/, `${file} has its own countOf`);
    // The field labels, for the same reason as the opener: two surfaces
    // labelled the same field differently for weeks without anything failing.
    assert.doesNotMatch(source, /["'`]What (changed|was checked|happened)/, `${file} hardcodes a summary-field label`);
    assert.doesNotMatch(source, /["'`]\*\*(Why|Result):/, `${file} hardcodes a detail-field label`);
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

test("all three families of placeholder are recognised as placeholders", () => {
  // Three writers substitute a stand-in when a stage said nothing: the merge
  // coordinator's extractMetadata, the stage runner's finalize, and the tag
  // parser's own defaults. A reader that knows only some of them prints the
  // rest as though a stage had written them, which is the whole defect.
  assert.ok(isPlaceholderField("why", METADATA_PLACEHOLDERS.why));
  assert.ok(isPlaceholderField("result", METADATA_PLACEHOLDERS.result));
  assert.ok(isPlaceholderField("why", TAG_PLACEHOLDERS.why));
  assert.ok(isPlaceholderField("result", TAG_PLACEHOLDERS.result));
  for (const status of ["CHANGED", "CLEAN", "DEGRADED"]) {
    assert.ok(isPlaceholderField("result", placeholderResult(status)), status);
  }
  const stage = { number: 4, slug: "optimization" };
  assert.ok(isPlaceholderField("why", placeholderWhy(stage), stage));

  // An empty field says exactly as much as a generic one.
  assert.ok(isPlaceholderField("result", ""));
  assert.ok(isPlaceholderField("why", null));
});

test("a stage's own words are never taken for a placeholder", () => {
  // The direction that would be a real loss. Anything looser than exact
  // matching eats real reporting, and one of these is a superstring of the
  // coordinator's placeholder.
  assert.ok(!isPlaceholderField("result", "Nominal validation with zero regressions across 1786 unit tests."));
  assert.ok(!isPlaceholderField("result", "7/7 tests passed."));
  assert.ok(!isPlaceholderField("why", "StorageService nuclear reset had no coverage."));
  assert.ok(!isPlaceholderField("domain", "verification"));
  assert.ok(!isPlaceholderField("files", "a.spec.ts"));
  // A stage's why placeholder belongs to THAT stage. Another stage's is a
  // statement as far as this one is concerned, and matching it loosely would
  // suppress a real field.
  const stage = { number: 4, slug: "optimization" };
  assert.ok(!isPlaceholderField("why", placeholderWhy({ number: 9, slug: "refactor" }), stage));
});

test("the result placeholder set is derived from its writers, not restated", () => {
  // A reworded placeholder must not be able to survive here as a stale literal.
  assert.ok(PLACEHOLDER_RESULTS.has(placeholderResult("CLEAN")));
  assert.ok(PLACEHOLDER_RESULTS.has(METADATA_PLACEHOLDERS.result));
  assert.ok(PLACEHOLDER_RESULTS.has(TAG_PLACEHOLDERS.result));
  assert.equal(PLACEHOLDER_RESULTS.size, 5);
});
