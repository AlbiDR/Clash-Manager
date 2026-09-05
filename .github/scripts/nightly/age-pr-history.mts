// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Tiered aging for 00-pr-history.md, the pipeline's own memory of what it has
// already done.
//
// WHY THIS IS TYPESCRIPT AND NOT PYTHON
// This was the only Python file among 25 JavaScript modules in the nightly
// control plane, and being the odd one out cost more than tidiness. The format
// it owns is written here and parsed by nightly-recap.mjs, and a JavaScript
// test cannot import a Python function, so that contract was the one shared
// format in the pipeline that could not be guarded the way every other one is.
// Two of its neighbours had already drifted apart unnoticed for days by exactly
// that mechanism.
//
// The port is deliberately literal rather than idiomatic. Every quirk of the
// original is reproduced on purpose, including the ones that look like bugs,
// because 00-pr-history.md is live data with months of history in it and the
// only safe port is one that produces byte-identical output. Where a quirk is
// load-bearing or merely surprising it is called out at the site. Improving any
// of them is a separate change with its own evidence.
//
// TIERS
//   T1 active     full blocks, last 7 days
//   T2 recent     one line each, 8 to 30 days
//   T3 historical grouped by ISO week and domain, 31 to 90 days
//   T4 archive    untouched, older than 90 days

import fs from "node:fs";

const HISTORY_PATH = ".github/nightly-logs/00-pr-history.md";

const T1_MARKER = "## T1 -- Active (last 7 days)";
const T2_MARKER = "## T2 -- Recent (8-30 days)";
const T3_MARKER = "## T3 -- Historical (31-90 days)";
const T4_MARKER = "## T4 -- Archive (90+ days)";

const DAY_MS = 86_400_000;

export interface AddEntryFields {
  today: string;
  stageName: string;
  domain: string;
  prNumber: string;
  files: string;
  why: string;
  change: string;
  result: string;
}

/** Python's str.strip(): whitespace at both ends, newlines included. */
function pyStrip(value: string): string {
  return value.replace(/^\s+/, "").replace(/\s+$/, "");
}

/** Python's datetime.strptime(value, "%Y-%m-%d"), as a UTC midnight. */
export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whole days between two UTC midnights, matching Python's timedelta.days.
 *
 * Exact rather than rounded because both operands are always midnight UTC, so
 * the difference is a whole number of days and no daylight saving applies.
 */
export function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}

/** date.isocalendar() reduced to the week key Python formatted as %G-W%V. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIndex = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayIndex + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * The Monday of an ISO week key, which is what strptime(wk + "-1", "%G-W%V-%u")
 * produced. Returns null for a key that does not parse, mirroring the original's
 * bare `except Exception`, whose handler treated the week as zero days old and
 * therefore kept it.
 */
export function isoWeekStart(weekKey: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

/**
 * Moves entries written above the TIER_CONFIG comment back into T1.
 *
 * A guard against an agent that writes the file by hand instead of calling this
 * script. It heals rather than refuses, because a lost entry is worse than a
 * misplaced one.
 */
export function sweepOrphanEntries(content: string): { content: string; swept: number } {
  if (!content.includes("TIER_CONFIG:")) return { content, swept: 0 };

  const parts = content.split("<!--");
  const orphanZone = pyStrip(parts[0]);
  if (!orphanZone.includes("### [")) return { content, swept: 0 };

  const correctZone = `<!--${parts.slice(1).join("<!--")}`;
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of orphanZone.split("\n")) {
    if (line.trim().startsWith("### ")) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));

  const t1Parts = correctZone.split(T1_MARKER);
  if (t1Parts.length < 2) return { content, swept: 0 };

  const entries = `\n${pyStrip(blocks.join("\n\n"))}\n`;
  return { content: t1Parts[0] + T1_MARKER + entries + t1Parts[1], swept: blocks.length };
}

/** Splits the document into its header and four tier bodies. */
function splitTiers(content: string) {
  const t1Parts = content.split(T1_MARKER);
  if (t1Parts.length < 2) throw new Error("Could not find T1 section");
  const t2Parts = t1Parts[1].split(T2_MARKER);
  if (t2Parts.length < 2) throw new Error("Could not find T2 section");
  const t3Parts = t2Parts[1].split(T3_MARKER);
  if (t3Parts.length < 2) throw new Error("Could not find T3 section");
  const t4Parts = t3Parts[1].split(T4_MARKER);
  if (t4Parts.length < 2) throw new Error("Could not find T4 section");

  return {
    header: t1Parts[0] + T1_MARKER,
    t1: t2Parts[0],
    t2: t3Parts[0],
    t3: t4Parts[0],
    t4: t4Parts[1],
  };
}

/** T1 holds `### [date] PR ...` blocks and `## [date] MERGE FAILED` blocks. */
function parseT1Blocks(t1: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const block = pyStrip(current.join("\n"));
    if (block) blocks.push(block);
  };
  for (const line of t1.split("\n")) {
    if (line.startsWith("### ") || line.startsWith("## [")) {
      flush();
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

function firstGroup(pattern: RegExp, text: string, fallback: string): string {
  const match = pattern.exec(text);
  return match ? match[1].trim() : fallback;
}

/**
 * The whole aging pass, as a pure string transformation so it can be tested and
 * diffed against the Python it replaces without touching the filesystem.
 */
export function ageHistory(rawContent: string, todayStr: string): string {
  const today = parseDate(todayStr);
  if (!today) throw new Error(`Invalid date format: ${todayStr}. Must be YYYY-MM-DD`);

  const { content } = sweepOrphanEntries(rawContent);
  const { header, t1, t2, t3, t4 } = splitTiers(content);

  const keptT1: string[] = [];
  const agedToT2: string[] = [];

  for (const block of parseT1Blocks(t1)) {
    const dateMatch = /(?:### |## )\[(\d{4}-\d{2}-\d{2})\]/.exec(block);
    if (!dateMatch) {
      keptT1.push(block);
      continue;
    }
    const age = daysBetween(today, parseDate(dateMatch[1]) as Date);
    if (age <= 7) {
      keptT1.push(block);
      continue;
    }
    // MERGE FAILED blocks are dropped once they age out: they record an
    // incident that either recurred, in which case there is a fresher one, or
    // did not, in which case it is noise.
    if (block.replace(/^\s+/, "").startsWith("## [")) continue;

    const prMatch = /### \[\d{4}-\d{2}-\d{2}\] PR #([^\s\]]+) \[([^\]]+)\]: (.*)/.exec(block);
    const prNumber = prMatch ? prMatch[1] : "PENDING";
    const stage = prMatch ? prMatch[2] : "Stage Unknown";
    const title = prMatch ? prMatch[3] : "No Title";
    const domain = firstGroup(/\*\*Domain:\*\* ([^|]+)/, block, stage);
    const commit = firstGroup(/\*\*Commit:\*\* ([^|]+)/, block, "PENDING");
    const viewUrl = firstGroup(/\[View PR\]\(([^)]+)\)/, block, "PENDING");
    agedToT2.push(`* [${dateMatch[1]}] PR #${prNumber} [${domain}]: ${title} (\`\`${commit}\`\`) [View](${viewUrl})`);
  }

  const existingT2 = t2.split("\n").map(line => line.trim()).filter(line => line.startsWith("* "));
  const keptT2: string[] = [];
  const agedToT3: { date: Date; domain: string; pr: string }[] = [];

  for (const line of [...agedToT2, ...existingT2]) {
    const dateMatch = /\* \[(\d{4}-\d{2}-\d{2})\] PR #([^\s]+)/.exec(line);
    if (!dateMatch) {
      keptT2.push(line);
      continue;
    }
    const entryDate = parseDate(dateMatch[1]) as Date;
    if (daysBetween(today, entryDate) <= 30) {
      keptT2.push(line);
      continue;
    }
    agedToT3.push({
      date: entryDate,
      domain: firstGroup(/PR #[^\s]+ \[([^\]]+)\]/, line, "Unknown"),
      pr: dateMatch[2],
    });
  }

  const incoming = new Map<string, Map<string, Set<string>>>();
  for (const item of agedToT3) {
    const weekKey = isoWeekKey(item.date);
    if (!incoming.has(weekKey)) incoming.set(weekKey, new Map());
    const byDomain = incoming.get(weekKey) as Map<string, Set<string>>;
    if (!byDomain.has(item.domain)) byDomain.set(item.domain, new Set());
    (byDomain.get(item.domain) as Set<string>).add(item.pr);
  }

  const existingT3 = new Map<string, string[]>();
  let currentWeek: string | null = null;
  for (const line of t3.split("\n")) {
    if (line.startsWith("#### ")) {
      currentWeek = line.replace("#### ", "").trim();
      existingT3.set(currentWeek, []);
    } else if (currentWeek && line.trim().startsWith("* ")) {
      (existingT3.get(currentWeek) as string[]).push(line.trim());
    }
  }

  let t3Body = "\n> Grouped by week and domain. Use for pattern recognition.\n\n";
  const allWeeks = [...new Set([...incoming.keys(), ...existingT3.keys()])].sort().reverse();

  for (const week of allWeeks) {
    const start = isoWeekStart(week);
    // An unparseable key is treated as zero days old and therefore kept, which
    // is the original's behaviour and the safe direction: it preserves data
    // rather than silently dropping a week nobody can date.
    if (start && daysBetween(today, start) > 90) continue;

    t3Body += `#### ${week}\n`;
    const groups = new Map<string, Set<string>>();
    for (const line of existingT3.get(week) || []) {
      const groupMatch = /\* \d+ PRs \[([^\]]+)\]: (.*)/.exec(line);
      if (!groupMatch) continue;
      groups.set(groupMatch[1].trim(), new Set([...groupMatch[2].matchAll(/#(\d+)/g)].map(m => m[1])));
    }
    for (const [domain, prs] of incoming.get(week) || []) {
      if (!groups.has(domain)) groups.set(domain, new Set());
      for (const pr of prs) (groups.get(domain) as Set<string>).add(pr);
    }

    for (const domain of [...groups.keys()].sort()) {
      const all = groups.get(domain) as Set<string>;
      // Sorted as STRINGS, not numerically, so #1000 precedes #999. Faithful to
      // the original, and the count deliberately includes entries the join
      // below filters out, so a group of non-numeric ids can report a count
      // larger than the list it prints.
      const printable = [...all].sort().filter(pr => /^\d+$/.test(pr));
      if (printable.length === 0) continue;
      t3Body += `* ${all.size} PRs [${domain}]: ${printable.map(pr => `#${pr}`).join(", ")}\n`;
    }
    t3Body += "\n";
  }

  const t2Body = `\n> Lean reference. Sufficient for deduplication and scope awareness.\n\n${keptT2.join("\n")}\n\n`;
  const t1Body = `\n${pyStrip(keptT1.join("\n\n"))}\n\n`;
  // Three spaces after the colon, matching the column the header aligns on.
  const updatedHeader = header.replace(/LAST_AGED:\s+\d{4}-\d{2}-\d{2}/, `LAST_AGED:   ${todayStr}`);

  return updatedHeader + t1Body + T2_MARKER + t2Body + T3_MARKER + t3Body + T4_MARKER + t4;
}

/** Prepends one full block to T1. */
export function addEntry(rawContent: string, fields: AddEntryFields): string {
  const { content } = sweepOrphanEntries(rawContent);
  const parts = content.split(T1_MARKER);
  if (parts.length < 2) throw new Error("Could not find T1 section");

  const entry = [
    `### [${fields.today}] PR #${fields.prNumber} [${fields.stageName}]: ${fields.change}`,
    `**Domain:** ${fields.domain} | **Commit:** PENDING | [View PR](PENDING)`,
    `**Files:** ${fields.files}`,
    `**Why:** ${fields.why}`,
    `**Change:** ${fields.change}`,
    `**Result:** ${fields.result}`,
  ].join("\n");

  return `${parts[0]}${T1_MARKER}\n\n${entry}\n\n${parts[1].replace(/^\n+/, "")}`;
}

function readHistory(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${filePath} not found`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, "utf8");
}

export function runCli(argv: string[] = process.argv.slice(2), filePath: string = HISTORY_PATH): void {
  // Backwards compatibility: the original accepted a bare date before it grew
  // subcommands, and Stage 1's prompt has used both forms.
  if (argv.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(argv[0])) {
    fs.writeFileSync(filePath, ageHistory(readHistory(filePath), argv[0]), "utf8");
    console.log("PR History successfully aged to date:", argv[0]);
    return;
  }

  if (argv.length < 2) {
    console.log("Usage:");
    console.log("  age-pr-history.mts age <TODAY_YYYY-MM-DD>");
    console.log("  age-pr-history.mts add <TODAY_YYYY-MM-DD> <STAGE_NAME> <DOMAIN> <PR_NUM> <FILES> <WHY> <CHANGE> <RESULT>");
    process.exit(1);
  }

  const [action, ...rest] = argv;
  if (action === "age") {
    fs.writeFileSync(filePath, ageHistory(readHistory(filePath), rest[0]), "utf8");
    console.log("PR History successfully aged to date:", rest[0]);
    return;
  }
  if (action === "add") {
    if (rest.length < 8) {
      console.log("Missing arguments for 'add' command.");
      process.exit(1);
    }
    const [today, stageName, domain, prNumber, files, why, change, result] = rest;
    fs.writeFileSync(
      filePath,
      addEntry(readHistory(filePath), { today, stageName, domain, prNumber, files, why, change, result }),
      "utf8",
    );
    console.log(`Successfully added ${stageName} PR entry to T1 section.`);
    return;
  }

  console.log(`Unknown action: ${action}`);
  process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("age-pr-history.mts")) {
  try {
    runCli();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
