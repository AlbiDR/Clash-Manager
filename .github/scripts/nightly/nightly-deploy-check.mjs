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
  ".github/scripts/nightly/nightly-watchdog.mjs",
  ".github/scripts/nightly/nightly-ledger.mjs",
  ".github/scripts/nightly/nightly-redact.mjs",
  ".github/scripts/nightly/merge-nightly-prs.mjs",
  ".github/scripts/nightly/merge-nightly-core.mjs",
  ".github/scripts/nightly/nightly-stage.mjs",
  ".github/scripts/nightly/nightly-publish-fallback.mjs",
  ".github/scripts/nightly/nightly-health.mjs",
  ".github/scripts/nightly/nightly-recap.mjs",
  // Owns the wording both human-facing surfaces use. Drift here desynchronises
  // the PR body from the recap, which is exactly the inconsistency it exists to
  // prevent, so it is watched like any other control-plane file.
  ".github/scripts/nightly/nightly-prose.mjs",
  ".github/nightly-config/stages.json",
  // The guard and the checker it runs are themselves control-plane files. A
  // drift detector that does not watch its own deployment can be silently
  // downgraded on one branch and still report everything as fine from another,
  // which is the same class of blind spot it exists to close.
  ".github/workflows/control-plane-guard.yml",
  ".github/scripts/nightly/nightly-deploy-check.mjs",
  // The dispatch path is inert today (workflow_dispatch only, no cron) but it
  // is the intended replacement for the Jules UI scheduled tasks. Watching it
  // now means the stage-by-stage migration starts with drift detection already
  // covering it, rather than having to remember to add it at the point where a
  // mistake would silently stop a stage from being triggered at all.
  ".github/workflows/nightly-dispatch.yml",
  ".github/scripts/nightly/nightly-dispatch.mjs",
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

// Where scheduled and dispatched runs read workflow YAML from: the repository
// default branch.
export const ACTIVATION_BRANCH = "Stable";

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

// ---------------------------------------------------------------------------
// The other half of the deployment topology, which runs in the OPPOSITE
// direction to everything above.
//
// A workflow's scripts are invoked from its `ref: Nightly` checkout, so for
// scripts the hazard is Nightly missing work. But a workflow's own YAML, for
// scheduled and manually dispatched runs, is read from the repository's DEFAULT
// branch. So for workflow files the hazard is the default branch missing work:
// a new workflow, a new permission or a new trigger can be merged, present on
// Nightly, and still completely inert.
//
// That is the state this repository was in the moment this was written:
// control-plane-guard.yml and the watchdog's pull-requests: write permission
// existed on Nightly and Beta while the default branch had neither, so the
// pipeline was running new scripts under old YAML and the stranded check above
// reported clean, because it only ever asks the Nightly question.
//
// Deliberately INFORMATIONAL, never a failure. Beta and Stable are held back on
// purpose so that no unreviewed nightly change reaches users unannounced, which
// means workflow YAML pending activation is a normal and intended state for as
// long as the operator wants it. Failing on it would be failing on the
// architecture working correctly. It is reported because "is my change actually
// live yet" is precisely the question that cost a full day on 2026-08-16.
export function isWorkflowFile(file) {
  return String(file || "").startsWith(".github/workflows/") && String(file).endsWith(".yml");
}

export function evaluatePendingActivation(commitsByBranch) {
  return Object.entries(commitsByBranch || {})
    .filter(([, commits]) => Array.isArray(commits) && commits.length > 0)
    .map(([branch, commits]) => ({ branch, commits }));
}

export function renderActivationReport(pending, activationBranch = ACTIVATION_BRANCH) {
  if (pending.length === 0) {
    return `\nWorkflow activation: every control-plane workflow is live on ${activationBranch}.\n`;
  }
  const lines = [
    "",
    `Workflow activation: workflow changes are NOT yet live on ${activationBranch}.`,
    "",
    `Scheduled and dispatched runs read a workflow's YAML from ${activationBranch}, so a new`,
    "workflow, permission or trigger present elsewhere does nothing until it lands there.",
    `The scripts those workflows invoke come from Nightly and ARE live, so the pipeline is`,
    "currently running newer scripts under older workflow definitions.",
    "",
  ];
  for (const entry of pending) {
    lines.push(`- on ${entry.branch}, not yet on ${activationBranch}:`);
    for (const commit of entry.commits) lines.push(`    ${commit}`);
  }
  lines.push("", `This is expected while ${activationBranch} is deliberately held back. Dispatch Sync`);
  lines.push("Branches when you want these workflow changes to take effect.");
  lines.push("");
  return lines.join("\n");
}

export function collectPendingActivation(
  files = CONTROL_PLANE_FILES.filter(isWorkflowFile),
  branches = CONTROL_PLANE_BRANCHES,
  activationBranch = ACTIVATION_BRANCH,
) {
  const commitsByBranch = {};
  for (const branch of branches) {
    if (branch === activationBranch) continue;
    const res = spawnSync(
      "git",
      ["log", "--oneline", "--no-decorate", `origin/${activationBranch}..origin/${branch}`, "--", ...files],
      { encoding: "utf8" },
    );
    if (res.status !== 0) {
      throw new Error(`Could not compare origin/${activationBranch}..origin/${branch}: ${(res.stderr || "").trim() || "git failed"}`);
    }
    commitsByBranch[branch] = res.stdout.split("\n").map(line => line.trim()).filter(Boolean);
  }
  // Beta is on the path to the activation branch, so a change sitting on both
  // Nightly and Beta is one pending promotion, not two separate findings.
  const seen = new Set();
  for (const branch of Object.keys(commitsByBranch)) {
    commitsByBranch[branch] = commitsByBranch[branch].filter(line => {
      const sha = line.split(" ")[0];
      if (seen.has(sha)) return false;
      seen.add(sha);
      return true;
    });
  }
  return commitsByBranch;
}

/**
 * Files watched for stranding only, never for symmetric drift.
 *
 * A stage prompt is the stage's actual instruction set: if an edit reaches Beta
 * but not Nightly, the stage keeps running the old instructions and the change
 * looks shipped while doing nothing. That is exactly the stranded-work
 * question, so prompts belong in this check.
 *
 * They deliberately stay OUT of the symmetric identical-across-branches list.
 * Stable is routinely behind on prompts by design (it is a checkpoint branch,
 * see the branch topology), so comparing them across all branches would report
 * a difference that is intended, every time, and teach everyone to ignore the
 * check.
 *
 * The prompt paths are enumerated from the registry rather than written out
 * here, so a fourteenth stage cannot be added without coverage following it.
 */
export function strandedOnlyFiles(registryPath = ".github/nightly-config/stages.json") {
  const extra = [
    ".github/nightly-prompts/00-nightly-agent-contract.md",
    // Newer scripts the original watched set predates.
    ".github/scripts/nightly/nightly-clean-calibration.mjs",
    ".github/scripts/nightly/update-nightly-context.sh",
    ".github/scripts/nightly/age-pr-history.mts",
  ];
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const prompts = (registry.stages || []).map(stage => stage.prompt).filter(Boolean);
    return [...prompts, ...extra];
  } catch {
    // A missing or malformed registry must not silently shrink the watched set
    // to nothing. Fall back to the fixed entries rather than reporting all-clear.
    return extra;
  }
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
    const stranded = argv.includes("--stranded");
    const findings = stranded
      ? {
          items: evaluateStrandedWork(
            collectStrandedWork([...CONTROL_PLANE_FILES, ...strandedOnlyFiles()]),
          ),
          render: renderStrandedReport,
        }
      : { items: evaluateControlPlaneDrift(collectControlPlaneBlobs()), render: renderDriftReport };
    report = findings.render(findings.items);
    failed = findings.items.length > 0;

    // Appended, never folded into the verdict: workflow YAML awaiting promotion
    // is an intended state here, so it informs without failing anything.
    if (stranded) {
      report += renderActivationReport(evaluatePendingActivation(collectPendingActivation()));
    }
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
