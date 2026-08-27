// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { spawnSync } from "node:child_process";
import fs from "node:fs";

// These are the files a scheduled nightly workflow actually executes. Some of
// them are read from different branches at runtime: nightly-watchdog.yml's
// own YAML is read from the repository default branch (Stable), while every
// script it invokes comes from its `ref: Nightly` checkout. "Deployed" only
// means something once all three branches agree, because a change that lands
// on Beta alone sits there silently inert for as long as nobody notices, and
// nothing in the runs themselves error to say so. That is exactly what
// happened to the 2026-08-16 recovery-pass fix: it sat on Beta for a full day
// while three more stages went unrecovered.
export const CONTROL_PLANE_FILES = [
  ".github/workflows/nightly-watchdog.yml",
  ".github/workflows/merge-nightly-prs.yml",
  ".github/workflows/sync-branches.yml",
  ".github/scripts/nightly-watchdog.mjs",
  ".github/scripts/nightly-ledger.mjs",
  ".github/scripts/nightly-redact.mjs",
  ".github/scripts/merge-nightly-prs.mjs",
  ".github/scripts/merge-nightly-core.mjs",
  ".github/scripts/nightly-stage.mjs",
  ".github/scripts/nightly-publish-fallback.mjs",
  ".github/scripts/nightly-health.mjs",
  ".github/nightly-config/stages.json",
  // The guard and the checker it runs are themselves control-plane files. A
  // drift detector that does not watch its own deployment can be silently
  // downgraded on one branch and still report everything as fine from another,
  // which is the same class of blind spot it exists to close.
  ".github/workflows/control-plane-guard.yml",
  ".github/scripts/nightly-deploy-check.mjs",
  // The dispatch path is inert today (workflow_dispatch only, no cron) but it
  // is the intended replacement for the Jules UI scheduled tasks. Watching it
  // now means the stage-by-stage migration starts with drift detection already
  // covering it, rather than having to remember to add it at the point where a
  // mistake would silently stop a stage from being triggered at all.
  ".github/workflows/nightly-dispatch.yml",
  ".github/scripts/nightly-dispatch.mjs",
  // Not under .github/, but load-bearing for the sync since be32a747: the
  // `pnpm-lock.yaml merge=binary` attribute is what stops a 3-way merge from
  // splicing the lockfile into a valid-YAML-but-uninstallable state, which is
  // what broke Beta on 2026-08-26. Git reads .gitattributes from the branch
  // performing the merge, and all four sync jobs merge that file, so the
  // attribute present on Beta and Stable but missing on Nightly would let the
  // Beta -> Nightly job splice again with nothing reporting it.
  ".gitattributes",
];

export const CONTROL_PLANE_BRANCHES = ["Nightly", "Beta", "Stable"];

// Pure half: given each file's blob hash on each branch, report which files
// disagree. A missing file (null) is its own distinct value, so a file that
// exists on two branches but not the third also counts as drift; that is the
// shape the nightly-redact.mjs incident actually took.
export function evaluateControlPlaneDrift(fileBlobs, branches = CONTROL_PLANE_BRANCHES) {
  const drifted = [];
  for (const file of Object.keys(fileBlobs)) {
    const hashes = branches.map(branch => fileBlobs[file]?.[branch] ?? null);
    if (new Set(hashes).size > 1) {
      drifted.push({
        file,
        hashes: Object.fromEntries(branches.map((branch, index) => [branch, hashes[index]])),
      });
    }
  }
  return drifted;
}

export function renderDriftReport(drifted, branches = CONTROL_PLANE_BRANCHES) {
  if (drifted.length === 0) {
    return `Control-plane check: all files identical across ${branches.join(", ")}.\n`;
  }
  const lines = [
    `Control-plane check: ${drifted.length} file(s) DRIFTED across ${branches.join(", ")}.`,
    "A control-plane fix that exists on only some of these branches is not deployed;",
    "it silently does nothing on the branches it is missing from.",
    "",
  ];
  for (const entry of drifted) {
    lines.push(`- ${entry.file}`);
    for (const branch of branches) {
      lines.push(`    ${branch}: ${entry.hashes[branch] || "absent"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Directional check: is Nightly missing control-plane work that already exists
// downstream?
//
// The plain drift check above asks "are all three branches identical", which is
// the right question only for a pipeline that syncs automatically. This one
// does not: sync-branches.yml is workflow_dispatch only, and that is deliberate.
// Nightly is fully automated while the live APK, PWA and Backend deploys are
// driven from Beta and Stable, so holding Beta and Stable back is what stops an
// unreviewed nightly change from reaching users unannounced. Nightly running
// ahead of Beta and Stable is therefore the intended steady state, for as long
// as the operator chooses, and alarming on it would be alarming on correctness.
//
// The direction that is never intended is the reverse. A workflow reads its own
// YAML from the default branch but invokes its scripts from `ref: Nightly`, so
// a control-plane fix sitting on Beta or Stable and NOT on Nightly means the
// nightly run executes the old script while the fix looks merged. That is the
// exact shape of the 2026-08-16 incident, where the recovery-pass fix sat on
// Beta alone for a full day while three more stages went unrecovered.
//
// Expressed as reachability rather than as a clock or a threshold: are there
// commits touching control-plane paths that are reachable from Beta or Stable
// but not from Nightly? Nothing here needs updating if the stage times change,
// if stages are added or removed, or if the sync cadence changes.
export const EXECUTION_BRANCH = "Nightly";

export function evaluateStrandedWork(commitsByBranch) {
  return Object.entries(commitsByBranch || {})
    .filter(([, commits]) => Array.isArray(commits) && commits.length > 0)
    .map(([branch, commits]) => ({ branch, commits }));
}

export function renderStrandedReport(stranded, executionBranch = EXECUTION_BRANCH) {
  if (stranded.length === 0) {
    return `Control-plane check: ${executionBranch} contains every control-plane commit present on the other branches.\n`;
  }
  const lines = [
    `Control-plane check: ${executionBranch} is MISSING control-plane work that already exists downstream.`,
    "",
    `Nightly workflows invoke their scripts from \`ref: ${executionBranch}\`, so a fix that`,
    `exists on another branch but not on ${executionBranch} does not run. It looks merged and`,
    "is inert, which is how the 2026-08-16 recovery-pass fix went unnoticed for a day.",
    "",
    `${executionBranch} being AHEAD of the other branches is not reported here: that is the`,
    "intended state between manual syncs and is not a fault.",
    "",
  ];
  for (const entry of stranded) {
    lines.push(`- on ${entry.branch}, absent from ${executionBranch}:`);
    for (const commit of entry.commits) {
      lines.push(`    ${commit}`);
    }
  }
  lines.push("", "Remedy: dispatch the Sync Branches workflow so the work reaches " + `${executionBranch}.`);
  return `${lines.join("\n")}\n`;
}

export function collectStrandedWork(
  files = CONTROL_PLANE_FILES,
  branches = CONTROL_PLANE_BRANCHES,
  executionBranch = EXECUTION_BRANCH,
) {
  const commitsByBranch = {};
  for (const branch of branches) {
    if (branch === executionBranch) continue;
    const res = spawnSync(
      "git",
      ["log", "--oneline", "--no-decorate", `origin/${executionBranch}..origin/${branch}`, "--", ...files],
      { encoding: "utf8" },
    );
    // Must fail loudly, never quietly. Treating a failed git invocation as "no
    // stranded work" would make this check report all-clear precisely when it
    // knows nothing: a failed fetch, a renamed branch, a missing remote. A
    // guard that goes green when it is broken is worse than no guard, because
    // the green is indistinguishable from a real pass.
    if (res.status !== 0) {
      const detail = (res.stderr || "").trim() || `git exited ${res.status}`;
      throw new Error(`Could not compare origin/${executionBranch}..origin/${branch}: ${detail}`);
    }
    commitsByBranch[branch] = res.stdout.split("\n").map(line => line.trim()).filter(Boolean);
  }
  return commitsByBranch;
}

function blobHash(branch, file) {
  const res = spawnSync("git", ["rev-parse", "--verify", `origin/${branch}:${file}`], { encoding: "utf8" });
  if (res.status !== 0) return null;
  return res.stdout.trim() || null;
}

export function collectControlPlaneBlobs(files = CONTROL_PLANE_FILES, branches = CONTROL_PLANE_BRANCHES) {
  const fileBlobs = {};
  for (const file of files) {
    fileBlobs[file] = {};
    for (const branch of branches) {
      fileBlobs[file][branch] = blobHash(branch, file);
    }
  }
  return fileBlobs;
}

function isMain() {
  return process.argv[1] && process.argv[1].endsWith("nightly-deploy-check.mjs");
}

export function runCli(argv = process.argv.slice(2)) {
  spawnSync("git", ["fetch", "origin", ...CONTROL_PLANE_BRANCHES], { stdio: "inherit" });

  // `--stranded` asks the directional question (is the execution branch missing
  // work that exists downstream). The default, argument-free invocation keeps
  // its original identical-across-branches behaviour untouched, because
  // nightly-watchdog.yml already runs it that way as a non-blocking step.
  let report;
  let failed;
  try {
    const findings = argv.includes("--stranded")
      ? { items: evaluateStrandedWork(collectStrandedWork()), render: renderStrandedReport }
      : { items: evaluateControlPlaneDrift(collectControlPlaneBlobs()), render: renderDriftReport };
    report = findings.render(findings.items);
    failed = findings.items.length > 0;
  } catch (error) {
    // Same principle as the throw itself: an observer that cannot observe
    // reports a failure, never an all-clear.
    report = `Control-plane check: COULD NOT BE PERFORMED.\n${error.message}\n`;
    failed = true;
  }

  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
  process.exitCode = failed ? 1 : 0;
}

if (isMain()) {
  runCli();
}
