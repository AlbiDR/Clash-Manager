// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Detects agent definitions that duplicate this repository's own.
//
// WHY DETECTION AND NOT PREVENTION
// Agent tools materialise their skill sets from cloud accounts at session
// start. On 2026-08-28 this machine held six such materialisations, each a
// snapshot from a different date, and one of them still carried a copy of the
// nightly-recap skill frozen on 25 July: it scoped a run by branch diff and
// would classify a healthy, already-synced stage as STUCK. Four more (the ADR,
// release, semver, commit-push-semver) had drifted by 180 tokens, 29 lines,
// 61 lines, and into a 145-byte stub respectively.
//
// Deleting those copies locally does not hold, because the next session
// re-materialises them from the account. Only the tool's own UI can remove them
// for good. What CAN be guaranteed is that their return is never silent: a
// duplicate that is seen is an annoyance, a duplicate that is trusted is a
// regression. This reports them.
//
// Everything in .github/agents/ is the single source of truth. Any definition
// of the same name living anywhere else is, by construction, a second copy that
// can drift, and is reported regardless of whether it currently differs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOTS = [
  ".github/agents/skills",
  ".github/agents/workflows",
  ".github/agents/rules",
];

// Machine-local places other agent tools keep their own copies. Absent paths are
// normal, not an error: not every tool is installed on every machine.
export function externalSearchRoots(home = os.homedir()) {
  return [
    path.join(home, "Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin"),
    path.join(home, ".claude/plugins"),
    path.join(home, ".gemini/antigravity-ide/global_workflows"),
    path.join(home, ".gemini/antigravity-backup/global_workflows"),
  ];
}

/** "Commit Push SemVer.md" and "commit-push-semver" must compare equal. */
export function slugify(name) {
  // Trim BEFORE stripping the extension: a trailing space defeats the $ anchor
  // and "  SemVer.md " would slug to "semver-md", quietly failing to match the
  // very definition it names.
  return String(name || "")
    .trim()
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Duplicates that are known and deliberately kept, so the audit reports zero
// findings when the machine is in its intended state. An audit that always
// prints something is an audit nobody reads, which is how the stale copies
// survived in the first place.
export const ACCEPTED_DUPLICATES = new Map([
  ["question", "kept as a global utility skill; it is generic and not repository-specific"],
]);

export function evaluateDuplicates(repoNames, externalDefs) {
  const owned = new Set(repoNames.map(slugify));
  const all = (externalDefs || [])
    .filter(def => owned.has(slugify(def.name)))
    .map(def => ({ name: slugify(def.name), path: def.path }));
  return {
    findings: all.filter(d => !ACCEPTED_DUPLICATES.has(d.name)),
    accepted: all.filter(d => ACCEPTED_DUPLICATES.has(d.name)),
  };
}

export function renderAuditReport({ findings, accepted }) {
  const tail = accepted.length
    ? `\nKnown and accepted (${accepted.length}): ${[...new Set(accepted.map(a => a.name))].join(", ")}.\n`
    : "";
  if (findings.length === 0) {
    return `Agent audit: no unexpected definition outside .github/agents/ duplicates one inside it.\n${tail}`;
  }
  const lines = [
    `Agent audit: ${findings.length} definition(s) outside .github/agents/ duplicate one inside it.`,
    "",
    "These are second copies of definitions this repository owns. They were made once",
    "and do not track the originals, which is how the nightly-recap skill ended up",
    "months stale while still answering to the same name.",
    "",
  ];
  for (const dup of findings) {
    lines.push(`- ${dup.name}`);
    lines.push(`    ${dup.path}`);
  }
  lines.push("", "Remove them in the owning tool's own UI. Deleting the files does not hold:");
  lines.push("they are re-materialised from the account at the start of every session,");
  lines.push("observed directly on 2026-08-28 when a deleted copy returned within minutes.");
  lines.push(tail);
  return lines.join("\n");
}

function walkForDefinitions(root, depth = 0, out = []) {
  if (depth > 6) return out;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkForDefinitions(full, depth + 1, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) {
      // A skill is named by its directory (SKILL.md) or by its own filename.
      const name = entry.name.toUpperCase() === "SKILL.MD" ? path.basename(path.dirname(full)) : entry.name;
      out.push({ name, path: full });
    }
  }
  return out;
}

export function collectRepoNames(roots = REPO_ROOTS) {
  const names = [];
  for (const root of roots) {
    for (const def of walkForDefinitions(root)) names.push(def.name);
  }
  return names;
}

export function collectExternalDefinitions(roots = externalSearchRoots()) {
  return roots.flatMap(root => walkForDefinitions(root));
}

export function runCli() {
  const duplicates = evaluateDuplicates(collectRepoNames(), collectExternalDefinitions());
  const report = renderAuditReport(duplicates);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  // Advisory: a duplicate on someone's laptop must not fail a build. It fails
  // only the audit command, which is run deliberately.
  process.exitCode = duplicates.findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("agents-audit.mjs")) runCli();
