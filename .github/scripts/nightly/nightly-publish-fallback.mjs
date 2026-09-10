// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Last-resort publisher for a stage whose finished work Jules never shipped.
//
// THE FAILURE CLASS THIS DELETES
// JULES_SESSION_STUCK has been the pipeline's dominant failure since it was
// first measured: Jules completes a stage, writes its coverage log, finalizes,
// and then its own native publisher never opens the pull request. The work
// exists and is correct; nobody can see it. The watchdog's nudge (f9a050f2)
// recovers most of these by asking the session to publish again, and that is
// what took the pipeline from 4 of 13 to 13 of 13. But a nudge is a request to
// someone else's publisher, so when it does not work there is nothing left.
//
// The Jules API returns the finished change set directly, as
// `outputs[].changeSet.gitPatch.unidiffPatch`. So the work never actually
// depended on Jules' publisher; only its delivery did. This module applies that
// patch and opens the pull request itself, which turns the failure from
// "usually recovered, sometimes lost for a day" into "structurally cannot be
// lost".
//
// DELIBERATELY A FALLBACK, NOT A REPLACEMENT
// The happy path is untouched. This runs only after the nudge path has been
// exhausted for a stage on a given date, so on every night the pipeline behaves
// as it does today. It changes only the outcome of runs that are currently
// total losses for that stage.
//
// WHY THIS CANNOT WRITE WHEREVER IT LIKES
// Every patch is validated with `validateChangedPaths` from nightly-stage.mjs,
// the exact function the normal path uses. A stage may only touch its own
// coverage log and the paths its own rules permit: Stage 2 only *.spec.ts,
// Stage 5 only README.md, Stage 13 only its protocol document, nobody may touch
// pipeline instructions or another stage's log. An autonomous publisher that
// invented its own boundary would be a second authority that could disagree
// with the first; reusing the same function means it cannot.

import { spawnSync } from "node:child_process";
import { RESULT_LABEL, WHY_LABEL, changeLabel } from "./nightly-prose.mjs";
import { validateChangedPaths } from "./nightly-stage.mjs";

import { parseCoverageLine } from "./coverage-log-line.mjs";

// The coverage-log line format lives in coverage-log-line.mjs. It used to be a
// private regex here, and the 2026-09-03 run-window field stopped it matching
// every line written from that day on, which made buildFallbackPlan refuse
// EVERY stage with "patch has no coverage-log line". Nothing caught it for two
// days because this module only runs once the nudge path is exhausted, which
// had not happened in 25 nights. That is the argument for
// rehearseFallbackPublisher in the watchdog: an emergency mechanism nobody
// exercises rots quietly and reports nothing.
//
// The same field blinded the calibration copy at the same moment, and that one
// went unnoticed for seven nights because nothing compared the two. Hence one
// parser, imported everywhere.

const DIFF_HEADER = /^diff --git a\/(\S+) b\/(\S+)$/gm;

/** The finished unified diff a completed session is holding, or null. */
export function extractSessionPatch(session) {
  for (const output of session?.outputs || []) {
    const patch = output?.changeSet?.gitPatch?.unidiffPatch;
    if (typeof patch === "string" && patch.trim()) return patch;
  }
  return null;
}

/** Repository paths a unified diff touches. */
export function patchTouchedPaths(patch) {
  const paths = new Set();
  for (const match of String(patch || "").matchAll(DIFF_HEADER)) {
    // b/ is the post-image; a rename or delete still reports both sides and we
    // want every path the patch is capable of writing.
    paths.add(match[1]);
    paths.add(match[2]);
  }
  paths.delete("/dev/null");
  return [...paths];
}

/**
 * Recovers the stage's own declared outcome from the coverage-log line inside
 * its patch. Returning null rather than assuming a default matters: without a
 * status there is nothing to validate the diff against, and publishing an
 * unvalidated patch is exactly what this module must never do.
 */
export function parseCoverageOutcome(patch, stage, date) {
  // The line format is owned by coverage-log-line.mjs. This module used to
  // carry a fourth private regex for it, allowing exactly one optional
  // bracket field, so a second one would have blinded it the way the
  // calibration copy went blind on 2026-09-03.
  for (const rawLine of String(patch || "").split("\n")) {
    if (!rawLine.startsWith("+")) continue;
    const record = parseCoverageLine(rawLine.slice(1));
    if (!record) continue;
    if (record.stage !== stage.number) continue;
    if (date && record.date !== date) continue;
    // Coverage lines read "TARGET -- summary"; the summary is the half a human
    // reads, and it becomes the commit subject. With no separator the shared
    // parser repeats the payload into both, which preserves the old fallback.
    return { status: record.status, summary: record.summary || record.target, date: record.date };
  }
  return null;
}

/**
 * Branch name for the recovered work. Must satisfy parseStageBranch in
 * merge-nightly-core.mjs (`nightly/stage-<n>-...`) or the merge coordinator
 * would classify the pull request as unrecognised and never fold it in, which
 * would make the whole recovery pointless.
 */
export function fallbackBranchName(stage, session) {
  const id = String(session?.id || session?.name || "unknown").split("/").pop();
  return `${stage.branchPrefix}fallback-${id}`;
}

/**
 * Pure decision half: given a stage and its stranded session, either a complete
 * publication plan or an explicit refusal with a reason.
 *
 * Every refusal is a deliberate stop rather than a silent skip, because a
 * publisher that quietly declines is indistinguishable from one that is broken.
 */
export function buildFallbackPlan({ stage, session, date }) {
  if (!stage) return { ok: false, reason: "no stage supplied" };
  if (!session) return { ok: false, reason: `Stage ${stage.number}: no Jules session to recover` };

  const patch = extractSessionPatch(session);
  if (!patch) return { ok: false, reason: `Stage ${stage.number}: session holds no change set to publish` };

  const outcome = parseCoverageOutcome(patch, stage, date);
  if (!outcome) {
    return {
      ok: false,
      reason: `Stage ${stage.number}: patch has no coverage-log line for ${date}, so its outcome cannot be validated`,
    };
  }

  const paths = patchTouchedPaths(patch);
  try {
    // The same boundary the normal path enforces. Throws on any violation.
    validateChangedPaths(stage, outcome.status, paths);
  } catch (error) {
    return { ok: false, reason: `Stage ${stage.number}: patch violates its write boundary. ${error.message}` };
  }

  return {
    ok: true,
    stage: stage.number,
    branch: fallbackBranchName(stage, session),
    patch,
    paths,
    status: outcome.status,
    summary: outcome.summary,
    sessionName: session.name || session.id,
    commitMessage: `chore(${stage.commitScope}): ${outcome.summary}`,
    prTitle: `chore(${stage.commitScope}): ${outcome.summary}`,
  };
}

export function renderFallbackPrBody(plan) {
  const files = plan.paths.join(", ") || "codebase";
  const why = "The Jules session finalized successfully, but its native publisher never opened a pull request and watchdog nudges did not recover publication.";
  const result = "The recovered patch was applied unmodified and validated against the stage write-boundary rules used by normal finalization.";
  const overview = [
    `This recovered Stage ${plan.stage} run publishes the finalized nightly work: ${plan.summary}.`,
    `${why} The fallback publisher opened this PR so the completed run is not lost.`,
    result,
  ].join(" ");

  return [
    `### Recovered Nightly Stage ${plan.stage}`,
    "",
    `**Status:** ${plan.status}`,
    "",
    overview,
    "",
    `**${changeLabel(plan.status)}:** ${plan.summary}`,
    "",
    `**${WHY_LABEL}:** ${why}`,
    "",
    `**${RESULT_LABEL}:** ${result}`,
    "",
    `**Files changed:** ${files}`,
    "",
    `**Jules session:** ${plan.sessionName}`,
    "",
    "<!--",
    "NIGHTLY_PR_METADATA:",
    "  Domain: fallback-publish",
    `  Why: ${why}`,
    `  Change: ${plan.summary}`,
    `  Result: ${result}`,
    `  Files: ${files}`,
    "-->",
  ].join("\n");
}

function git(args, options = {}) {
  const res = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (res.status !== 0) {
    throw new Error(`git ${args.slice(0, 3).join(" ")} failed: ${(res.stderr || res.stdout || "").trim().slice(0, 400)}`);
  }
  return String(res.stdout || "").trim();
}

/**
 * Impure half. Applies the plan on a fresh branch and opens the pull request.
 *
 * `dryRun` stops after proving the patch applies cleanly, which is the only
 * part that can fail for reasons the plan could not predict.
 */
export async function publishFallback(plan, {
  config,
  githubApi,
  dryRun = false,
  log = console.log,
  // Injectable so the failure paths below can be exercised in tests without a
  // real repository. An untested cleanup path is indistinguishable from an
  // absent one, and this one only ever runs when something has already failed.
  runGit = git,
  applyPatch = (patch, check) => spawnSync("git", ["apply", ...(check ? ["--check"] : []), "-"], { input: patch, encoding: "utf8" }),
}) {
  const base = config.targetBranch;
  runGit(["fetch", "origin", base]);
  runGit(["checkout", "-B", plan.branch, `origin/${base}`]);

  // A CI runner has no git identity of its own, so `git commit` below either
  // fails outright or silently invents one from the username and hostname.
  // Discovering that here would be the worst possible timing: this function
  // only ever runs when the pipeline has already failed to publish normally.
  runGit(["config", "user.name", "github-actions[bot]"]);
  runGit(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);

  try {
    // --check first: a patch that does not apply is a stale session whose base
    // has moved, not something to force. Failing here leaves no branch behind.
    const check = applyPatch(plan.patch, true);
    if (check.status !== 0) {
      throw new Error(`Stage ${plan.stage}: patch no longer applies to ${base}. ${(check.stderr || "").trim().slice(0, 300)}`);
    }
    if (dryRun) {
      log(`[dry-run] Stage ${plan.stage}: patch applies cleanly to ${base}; would publish ${plan.branch}.`);
      return { published: false, dryRun: true, branch: plan.branch };
    }

    const apply = applyPatch(plan.patch, false);
    if (apply.status !== 0) throw new Error(`Stage ${plan.stage}: git apply failed after --check passed.`);

    runGit(["add", "--", ...plan.paths]);
    runGit(["commit", "-m", plan.commitMessage]);
    runGit(["push", "--force-with-lease", "origin", plan.branch]);

  // The branch exists on the remote from here on, so a failure to open the pull
  // request must not leave it behind. An orphaned nightly/stage-N branch with no
  // pull request is exactly the kind of litter that misleads later
  // classification: PR #1546 sat open for three days and misclassified stage 1
  // on three consecutive runs. Creating that situation while trying to fix it
  // would be its own kind of absurd.
  //
  // This is not hypothetical. Creating a pull request needs pull-requests:
  // write, and a workflow's permissions come from its YAML on the default
  // branch, so until that half is deployed this call is the one that fails.
    let pr;
    try {
      pr = await githubApi(`/repos/${config.owner}/${config.repo}/pulls`, config, "POST", {
        title: plan.prTitle,
        head: plan.branch,
        base,
        body: renderFallbackPrBody(plan),
      });
    } catch (error) {
      try {
        runGit(["push", "origin", "--delete", plan.branch]);
        log(`Stage ${plan.stage}: pull request could not be opened; removed the orphaned branch ${plan.branch}.`);
      } catch (cleanupError) {
        // Reported rather than swallowed: a branch we could neither use nor
        // remove is something a human needs to know about by name.
        log(`Stage ${plan.stage}: could not remove orphaned branch ${plan.branch}. ${cleanupError.message}`);
      }
      throw error;
    }

    log(`Stage ${plan.stage}: published recovered work as PR #${pr.number}.`);
    return { published: true, branch: plan.branch, prNumber: pr.number, prUrl: pr.html_url };
  } finally {
    // Every exit returns to the base branch, including the failing ones. The
    // watchdog commits the run ledger immediately after this, so being left on
    // a nightly/stage-N branch would land that commit on the wrong branch -
    // a quiet corruption of the pipeline's own evidence while it was trying to
    // repair a stage. --force because a partly-applied patch leaves the tree
    // dirty, and everything in it came from this function.
    try {
      runGit(["checkout", "--force", base]);
    } catch (restoreError) {
      // Reported, never rethrown: masking the real failure with a cleanup error
      // would hide why the publish failed in the first place.
      log(`Stage ${plan.stage}: could not return to ${base} after publishing. ${restoreError.message}`);
    }
  }
}
