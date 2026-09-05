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

/**
 * The phrases the pipeline substitutes when a stage published nothing of its
 * own for a field.
 *
 * Two surfaces write these and a third reads them back. The merge coordinator
 * fills them in when a pull request body carries no recoverable
 * NIGHTLY_PR_METADATA block; the stage runner fills them in when a stage
 * finalizes without passing its own; Stage 1's aging pass then commits whichever
 * won into 00-pr-history.md, and the recap reads that file.
 *
 * So the recap has to be able to tell a placeholder from a statement. 98 of the
 * Result fields in the committed history hold the merge coordinator's
 * placeholder, and printing that under a "Result" label tells the reader a
 * stage said something it never said.
 *
 * All three surfaces share one copy because a placeholder reworded on the
 * writing side and not on the reading side goes quietly back to being printed
 * as though a stage had written it.
 */
export const METADATA_PLACEHOLDERS = {
  why: "Automated nightly audit pass.",
  result: "Nominal validation with zero regressions.",
  // Unlike the other two this is a last resort: the coordinator prefers the
  // pull request title and reaches this only when there is not even one.
  change: "Automated stage execution.",
};

/** The stage runner's placeholder, for a stage that finalizes without its own reason. */
export function placeholderWhy(stage) {
  return `Execute the scheduled Stage ${stage.number} ${stage.slug} audit.`;
}

/** The stage runner's placeholder, for a stage that finalizes without its own result. */
export function placeholderResult(status) {
  if (status === "CHANGED") return "Required stage validation completed.";
  if (status === "CLEAN") return "Audit completed with no source change required.";
  return "The run degraded safely to a log-only result.";
}

/**
 * Every result-shaped placeholder, as one set to test a field against.
 *
 * Derived from the two writers above rather than listed again, so a reworded
 * placeholder cannot survive here as a stale literal.
 */
export const PLACEHOLDER_RESULTS = new Set([
  METADATA_PLACEHOLDERS.result,
  ...["CHANGED", "CLEAN", "DEGRADED"].map(placeholderResult),
]);

/**
 * What actually happened to a stage, one phrase per failure class.
 *
 * Phrased from the failure CLASS and never from the ledger state. A state
 * (NO_OUTPUT, BLOCKED, ESCALATED) says only how bad the outcome was and holds
 * no sentence at all, which is why the recap used to print the raw token; the
 * class corresponds to exactly one knowable condition.
 *
 * The counts are occurrences in the committed ledger, verified against it
 * rather than taken on trust, and they are here so nobody reads a phrase for a
 * class that has never fired as a description of something that happens. The
 * two RECOVERED_ classes carry phrases for completeness but the recap does not
 * reach them through this map: a recovered stage merged, so it is narrated by
 * its rescue note instead.
 */
export const FAILURE_PHRASES = {
  // Observed in the committed ledger, with counts as of 2026-09-05.
  JULES_SESSION_STUCK: "Jules finished the work and ended the session, but never opened the pull request.", // 30
  RECOVERED_AFTER_NUDGE: "It published only after the watchdog asked the session again.", // 8
  NO_PUBLISHED_OUTPUT: "The run went past this stage and it published nothing.", // 6
  MERGE_COORDINATOR: "Its pull request was opened, but the merge coordinator did not fold it in.", // 6
  UNFINALIZED_SENTINEL: "It merged but left its in-progress marker behind, so it never ran its finalize step.", // 1
  JULES_SESSION_FAILED: "The Jules session failed outright, so there is no finished work to recover.", // 1
  // Never fired, but their triggering conditions are pinned by tests.
  OPEN_PR: "Its pull request is open and unmerged, so the work exists and is one merge away.",
  UNCLASSIFIED_PR: "A pull request on Nightly matched no stage branch, and no stage could be inferred from its diff.",
  WATCHDOG_OBSERVER_FAILURE: "The watchdog itself failed before reaching a verdict, so nothing is known about this stage.",
  // Never fired and derived from the code alone. Treat the wording as a reading
  // of what the branch would do, not as a report of observed behaviour.
  JULES_API_UNAVAILABLE: "Nothing published, and the Jules API could not be reached to find out why.",
  MALFORMED_BRANCH: "Its pull request is open on a branch that does not name its stage, so it was matched by the files it changed.",
  RECOVERED_BY_FALLBACK_PUBLISH: "Jules never published it, so the repository opened the pull request itself from the session's finished work.",
};

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
