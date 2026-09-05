// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// The nightly pipeline's plain-language vocabulary, in one place.
//
// WHY THIS FILE EXISTS
// Two surfaces speak to a human about a nightly run: the pull request body a
// stage publishes (nightly-stage.mjs) and the recap a reader asks for
// (nightly-recap.mjs). They are written months apart, run in different
// environments, and are edited by different agents, so left alone they drift:
// on 2026-09-03 both grew an "In plain terms" line independently, with two
// separate implementations of the same idea and two different renderings of the
// same stage name. That is the duplicated-logic Poka-yoke violation the ADR
// names: a wording fixed in one copy silently survives in the other and comes
// back later looking like a new inconsistency.
//
// Everything here is a pure string function with no I/O and no knowledge of the
// ledger, so importing it costs the stage runner nothing at runtime.
//
// The rule for adding to this file: if a phrase is read by a person and appears
// on more than one surface, it belongs here. If it is read by a machine, it
// does not.

/**
 * How every plain-language explanation opens, on every surface.
 *
 * A single constant rather than a repeated literal, so the two surfaces cannot
 * end up saying "In plain terms" and "In plain English" at each other.
 */
export const PLAIN_PREFIX = "In plain terms: ";

// Acronyms the project writes in caps. Reached by the stage slugs in
// stages.json, so a new stage whose slug contains one of these renders
// consistently on both surfaces without anyone remembering to update prose.
const ACRONYMS = new Map([
  ["apk", "APK"],
  ["pwa", "PWA"],
  ["readme", "README"],
  ["tsdoc", "TSDoc"],
  ["ux", "UX"],
]);

/**
 * A stage's area as a person would write it: "apk-integrity" -> "APK integrity".
 *
 * Takes the slug rather than the registry's `domain` field because domains are
 * not unique: stages 10 and 11 both carry the domain "apk", so a summary built
 * from it described two different audits identically.
 *
 * Deliberately does not markdown-escape. Slugs are `^[a-z0-9-]+$` by
 * construction in stages.json, so escaping was provably a no-op, and a helper
 * that quietly escapes is wrong for the non-markdown callers.
 */
export function displayArea(slug) {
  return String(slug || "")
    .split("-")
    .map(part => ACRONYMS.get(part.toLowerCase()) || part)
    .join(" ");
}

/**
 * The label for a stage's summary field, on every surface that prints one.
 *
 * A CLEAN run changed nothing by definition, so labelling its summary "What
 * changed" contradicted the field's own contents on every clean night. A stage
 * that published nothing did not check anything either, so it gets neither
 * word: it gets the only claim the absence of evidence supports.
 *
 * Lives here because three surfaces ask this same question of a stage - the
 * pull request body, the fallback publisher's body, and the recap - and two of
 * them had already answered it differently: the fallback publisher said "What
 * changed" on recovered CLEAN runs, which is the exact wording the stage runner
 * had been fixed to stop using.
 */
export function changeLabel(status) {
  if (status === "CHANGED") return "What changed";
  if (status === "STUCK") return "What happened";
  return "What was checked";
}

/**
 * The other two questions a reader asks of a stage.
 *
 * Constants rather than literals for the same reason as changeLabel: the pull
 * request body and the recap both label these fields, and a rewording that
 * reaches only one surface is invisible until the two are read side by side.
 */
export const WHY_LABEL = "Why";
export const RESULT_LABEL = "Result";

/** "a", "a and b", "a, b and c". */
export function joinList(items) {
  const list = (items || []).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** "1 test file", "3 test files". */
export function countOf(list, noun) {
  const n = (list || []).length;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "S01", "S13". Every surface labels stages the same way. */
export function stageTag(stageNumber) {
  return `S${String(stageNumber).padStart(2, "0")}`;
}
