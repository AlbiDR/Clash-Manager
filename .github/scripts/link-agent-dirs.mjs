// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Links each AI tool's expected config path to the shared definitions in
// .github/agents/.
//
// WHY THIS EXISTS
// Every agent tool insists on its own hard-coded directory: Claude reads
// .claude/skills/, Antigravity reads .agent/workflows/ and .agent/skills/,
// rules live in .agents/rules/. Committing all of those puts three
// tool-branded directories in the repository root, which is both untidy and
// advertises the toolchain to anyone opening the project. Leaving them
// untracked instead means the definitions are unversioned, unreviewable, and
// gone on a fresh clone, which is how the same workflow ended up hand-recreated
// once per tool and drifting apart.
//
// So the definitions live once, tracked, inside .github/ where the rest of this
// repository's meta configuration already lives, and each tool's path becomes a
// symlink into it. The root stays clean, the content stays versioned, and there
// is still exactly one copy of every workflow, skill and rule.
//
// Runs from `prepare`, so a fresh clone is wired up by `pnpm install` with no
// manual step. It is deliberately incapable of failing an install: a missing
// symlink degrades one editor's convenience, never a build.

import fs from "node:fs";
import path from "node:path";

export const LINKS = [
  { link: ".claude/skills", target: ".github/agents/skills" },
  { link: ".agent/workflows", target: ".github/agents/workflows" },
  { link: ".agent/skills", target: ".github/agents/skills" },
  { link: ".agents/rules", target: ".github/agents/rules" },
];

/** Relative target, so the link keeps working wherever the repository is cloned. */
export function relativeTarget(link, target) {
  return path.relative(path.dirname(link), target);
}

export function planLink(link, target, { exists, isSymlink, readLink }) {
  const want = relativeTarget(link, target);
  if (!exists) return { action: "create", want };
  if (isSymlink) return readLink === want ? { action: "ok", want } : { action: "relink", want };
  // A real directory here is someone's existing local setup. Refuse rather than
  // delete it: silently removing a directory a person put there by hand is not
  // a trade this script gets to make.
  return { action: "skip", want, reason: "a real directory already exists at this path" };
}

function apply(entry, log) {
  const { link, target } = entry;
  let stat = null;
  try { stat = fs.lstatSync(link); } catch { /* absent */ }
  const plan = planLink(link, target, {
    exists: Boolean(stat),
    isSymlink: Boolean(stat?.isSymbolicLink()),
    readLink: stat?.isSymbolicLink() ? fs.readlinkSync(link) : null,
  });

  if (plan.action === "ok") return;
  if (plan.action === "skip") {
    log(`agents: left ${link} alone (${plan.reason}).`);
    return;
  }
  fs.mkdirSync(path.dirname(link), { recursive: true });
  if (plan.action === "relink") fs.unlinkSync(link);
  fs.symlinkSync(plan.want, link, "dir");
  log(`agents: linked ${link} -> ${plan.want}`);
}

export function runCli(log = console.log) {
  for (const entry of LINKS) {
    try {
      apply(entry, log);
    } catch (error) {
      // Never fail an install over an editor convenience.
      log(`agents: could not link ${entry.link} (${error.message}); skipping.`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("link-agent-dirs.mjs")) runCli();
