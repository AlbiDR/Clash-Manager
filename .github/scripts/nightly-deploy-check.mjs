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
  ".github/nightly-config/stages.json",
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

export function runCli() {
  spawnSync("git", ["fetch", "origin", ...CONTROL_PLANE_BRANCHES], { stdio: "inherit" });
  const drifted = evaluateControlPlaneDrift(collectControlPlaneBlobs());
  const report = renderDriftReport(drifted);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
  process.exitCode = drifted.length > 0 ? 1 : 0;
}

if (isMain()) {
  runCli();
}
