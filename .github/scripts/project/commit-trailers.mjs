// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Keeps unwanted co-authors out of this repository's public Contributors list.
//
// THE PROBLEM THIS SOLVES
// GitHub parses `Co-Authored-By:` trailers and credits each one in the
// repository's Contributors section. That is public-facing: it is not just a
// line in `git log`. On 2026-09-02 an AI coding assistant appended its own
// `Co-Authored-By` trailer to four commits because its tooling told it to, and
// "Claude" appeared as a contributor to this repository. Removing it afterwards
// meant rewriting history and force-pushing three branches during a live
// nightly run, which is a far worse operation than preventing it.
//
// WHY AN ALLOWLIST RATHER THAN A DENYLIST
// A denylist of known AI assistants would need editing every time a new one
// appears, and the failure mode of a stale denylist is silent: the unwanted
// name is simply credited. An allowlist fails the other way. Anyone not
// explicitly named is stripped, so a new tool cannot credit itself by being
// unknown. Jules is on the list deliberately: it is this pipeline's own agent
// and its authorship is wanted.
//
// The list itself lives in .github/commit-trailer-policy.json, not in here, so
// adding a collaborator is a config edit rather than a code change.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolved from this module's own location, never from the working directory.
// `git filter-branch` runs its --msg-filter from a scratch directory inside
// .git-rewrite, so a path relative to the repo root resolves to nothing there:
// the filter throws, filter-branch aborts, and the rewrite silently leaves the
// trailer in place. Caught by running the real repair before shipping it.
const POLICY_FILE = fileURLToPath(new URL("../../commit-trailer-policy.json", import.meta.url));
const POLICY_PATH = ".github/commit-trailer-policy.json";

// Every one of these constants exists because a red-team pass got a trailer
// past an earlier version of it. The rule that emerged: this file is a second
// implementation of git's trailer syntax, and ANY gap between the two is a free
// contributor credit, because git is what GitHub actually parses. So each
// pattern is deliberately at least as permissive as git, and anything this
// parser cannot resolve cleanly is treated as disallowed rather than guessed at.

// Line terminators git and GitHub both honour. Splitting on \n alone left bare
// CR able to splice a second trailer into what looked like one allowed line,
// and U+2028/U+2029 able to hide one entirely.
const LINE_TOKENS = /([^\r\n\u2028\u2029]*)(\r\n|\r|\n|\u2028|\u2029|$)/g;

// Horizontal whitespace is allowed around the separator: git accepts
// `Co-authored-by : Claude <x>` and canonicalises it into a real trailer, while
// a `key:`-only pattern rejected it and let it through untouched. [^\S\r\n]
// rather than \s so the separator can never swallow a line terminator.
const CO_AUTHOR_KEY = /^[ \t]*co-authored-by[^\S\r\n]*:[^\S\r\n]*(.*)$/i;

// A trailer value continued on an indented line. git folds these into the
// value; a line-by-line scanner never sees the identity at all.
const CONTINUATION = /^[ \t]+\S/;

// Front-anchored, matching git's split_ident_line. The old end-anchored form
// captured the LAST address, so `Claude <noreply@anthropic.com>
// <aalbi97@gmail.com>` resolved to the owner and was allowed, while git
// resolved it to Claude and credited Claude.
const IDENTITY = /^([^<]*)<([^<>]*)>[^\S\r\n]*(.*)$/;

export function loadPolicy(path = POLICY_FILE) {
  const policy = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(policy.allowedCoAuthors)) {
    throw new Error(`${path} must define an allowedCoAuthors array.`);
  }
  return policy;
}

/** Physical lines with their own terminators, so a rejoin is byte-exact. */
function tokenizeLines(text) {
  const parts = [];
  LINE_TOKENS.lastIndex = 0;
  let match;
  while ((match = LINE_TOKENS.exec(text)) !== null) {
    parts.push({ text: match[1], eol: match[2] });
    if (match[2] === "") break;
    if (LINE_TOKENS.lastIndex >= text.length) {
      parts.push({ text: "", eol: "" });
      break;
    }
  }
  return parts;
}

/**
 * Logical trailers, with the physical line span each one occupies.
 *
 * Folding matters twice over: an identity hidden on a continuation line was
 * invisible to classification, and removing only the key line left the AI's
 * address orphaned in the commit body forever.
 */
function foldTrailers(parts) {
  const trailers = [];
  let open = null;
  parts.forEach((part, index) => {
    const keyed = CO_AUTHOR_KEY.exec(part.text);
    if (keyed) {
      open = { value: keyed[1].trim(), start: index, end: index };
      trailers.push(open);
      return;
    }
    if (open && CONTINUATION.test(part.text)) {
      // git joins a folded value with a single space.
      open.value = `${open.value} ${part.text.trim()}`.trim();
      open.end = index;
      return;
    }
    open = null;
  });
  return trailers;
}

/** `Name <email>` -> identity. Anything ambiguous fails closed. */
export function parseIdentity(value) {
  const raw = String(value).trim();
  const match = IDENTITY.exec(raw);
  // No angle brackets at all, leftover content after the address, or more than
  // one address: all malformed. Returning an empty email means no `email`
  // condition can match, and since every bot entry pairs a namePattern with an
  // emailPattern, a crafted display name cannot rescue it either.
  if (!match) return { name: raw, email: "" };
  if (match[3].trim() !== "") return { name: raw, email: "" };
  if ((raw.match(/</g) || []).length > 1) return { name: raw, email: "" };
  return { name: match[1].trim(), email: match[2].trim() };
}

/** `Co-Authored-By: Name <email>` -> { name, email }, or null if not one. */
export function parseCoAuthor(line) {
  const keyed = CO_AUTHOR_KEY.exec(String(line).replace(/[\r\u2028\u2029]+$/, ""));
  if (!keyed) return null;
  return parseIdentity(keyed[1]);
}

/**
 * An identity matches an allowlist entry only when EVERY condition that entry
 * states is satisfied. Conditions are ANDed, not ORed.
 *
 * This started as an OR and was a real hole, found by running the impostors
 * rather than by reading the code: with `namePattern: "^google-labs-jules"`
 * alone, `Co-authored-by: google-labs-jules-impostor <evil@attacker.example>`
 * and `Co-authored-by: Jules Verne <jules.verne@attacker.example>` were both
 * kept and would have been credited. A display name is attacker-controlled and
 * free to choose, so it can never be sufficient on its own: the entries that
 * name a bot now pin its email domain too.
 */
function matchesAny(identity, allowList) {
  const name = (identity.name || "").toLowerCase();
  const email = (identity.email || "").toLowerCase();
  return (allowList || []).some(allowed => {
    const conditions = [];
    if (allowed.email) conditions.push(allowed.email.toLowerCase() === email);
    if (allowed.emailPattern) conditions.push(new RegExp(allowed.emailPattern, "i").test(email));
    if (allowed.namePattern) conditions.push(new RegExp(allowed.namePattern, "i").test(name));
    // An entry with no conditions would match everyone. Treat it as a config
    // error rather than a wildcard.
    if (conditions.length === 0) return false;
    return conditions.every(Boolean);
  });
}

export function isAllowedCoAuthor(coAuthor, policy) {
  if (!coAuthor) return true;
  return matchesAny(coAuthor, policy.allowedCoAuthors);
}

/**
 * The other route into the Contributors list, and the one a trailer policy
 * alone misses entirely: GitHub credits the commit AUTHOR as a contributor, so
 * a tool that commits as itself never needs a trailer to be listed.
 *
 * The allowlist has to include github-actions[bot] and GitHub's web-flow
 * identity. They author this pipeline's ledger, merge and sync commits, and
 * rewriting those would break the nightly run rather than improve attribution.
 */
export function isAllowedAuthor(author, policy) {
  if (!author) return true;
  return matchesAny(author, policy.allowedAuthors || []);
}

/**
 * Removes every disallowed co-author trailer from a commit message.
 *
 * Only those lines are touched. Other trailers, the subject and the body are
 * returned byte for byte, because a hook that reformats a message is a hook
 * people disable.
 */
export function stripDisallowedCoAuthors(message, policy) {
  const text = String(message);
  const parts = tokenizeLines(text);
  const trailers = foldTrailers(parts);

  const removed = [];
  const drop = new Set();
  for (const trailer of trailers) {
    const identity = parseIdentity(trailer.value);
    if (isAllowedCoAuthor(identity, policy)) continue;
    removed.push(`Co-authored-by: ${trailer.value}`);
    // Every physical line the folded trailer spans, so nothing is orphaned.
    for (let i = trailer.start; i <= trailer.end; i += 1) drop.add(i);
  }
  if (removed.length === 0) return { message: text, removed };

  const kept = parts.filter((_, index) => !drop.has(index));
  // Trailing blank lines left behind by the removal. Each surviving line keeps
  // its own terminator, so a message that mixed endings is not rewritten.
  while (kept.length > 0 && kept[kept.length - 1].text.trim() === "") kept.pop();

  // Refusing to empty the message: git aborts a commit with an empty message,
  // and the hook would have exited 0 while the commit silently failed.
  if (kept.length === 0) return { message: text, removed: [] };

  const rebuilt = kept.map(part => part.text + (part.eol || "")).join("");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { message: rebuilt.endsWith(eol) ? rebuilt : `${rebuilt}${eol}`, removed };
}

/** Commit messages in a range, oldest first. Empty when the range is empty. */
export function readMessages(range, runner = spawnSync) {
  const result = runner("git", ["log", "--reverse", "--format=%H%x1f%B%x1e", range], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git log ${range} failed: ${result.stderr || "unknown error"}`);
  }
  return String(result.stdout)
    .split("\x1e")
    .map(record => record.replace(/^\n/, ""))
    .filter(record => record.trim() !== "")
    .map(record => {
      const [sha, ...rest] = record.split("\x1f");
      return { sha: sha.trim(), message: rest.join("\x1f") };
    });
}

/** Every disallowed trailer in a range, for the CI guard to report at once. */
export function findViolations(commits, policy) {
  const violations = [];
  for (const commit of commits) {
    const { removed } = stripDisallowedCoAuthors(commit.message, policy);
    for (const line of removed) violations.push({ sha: commit.sha, line });
  }
  return violations;
}

function runHook(messagePath, policy) {
  const original = readFileSync(messagePath, "utf8");
  const { message, removed } = stripDisallowedCoAuthors(original, policy);
  if (removed.length === 0) return 0;
  writeFileSync(messagePath, message, "utf8");
  for (const line of removed) {
    console.log(`[commit-trailers] removed disallowed co-author: ${line}`);
  }
  console.log(`[commit-trailers] see ${POLICY_PATH} to allow an identity deliberately.`);
  return 0;
}

/**
 * Reports disallowed trailers in a commit range.
 *
 * `reportOnly` decides whether this observes or obstructs, and the two callers
 * want opposite things. In CI it observes: 13 Jules pull requests land every
 * night and a guard that can block them buys a cosmetic fix at the cost of the
 * pipeline, which is a bad trade. Locally, at pre-push, it obstructs, because
 * that is the last moment the fix is still a cheap `git commit --amend`
 * instead of a history rewrite across three branches.
 */
function runCheck(range, policy, { reportOnly = false } = {}) {
  const violations = findViolations(readMessages(range), policy);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (violations.length === 0) {
    console.log(`OK: no disallowed Co-Authored-By trailers in ${range}.`);
    if (summaryPath) {
      appendFileSync(summaryPath, `### Commit Trailer Guard\n\nNo disallowed co-author trailers in \`${range}\`.\n`);
    }
    return 0;
  }

  const severity = reportOnly ? "warning" : "error";
  for (const { sha, line } of violations) {
    console.log(`::${severity}::${sha.slice(0, 8)} carries a disallowed co-author trailer: ${line}`);
  }
  console.log(
    `::${severity}::GitHub credits every Co-Authored-By trailer in the Contributors section. ` +
      `Remove these trailers, or add the identity to ${POLICY_PATH} if the credit is intended.`,
  );

  if (summaryPath) {
    const rows = violations.map(v => `| \`${v.sha.slice(0, 8)}\` | ${v.line} |`).join("\n");
    appendFileSync(
      summaryPath,
      `### Commit Trailer Guard\n\n${violations.length} disallowed co-author trailer(s) in \`${range}\`. ` +
        `These would be credited in the repository's Contributors section.\n\n` +
        `| Commit | Trailer |\n|---|---|\n${rows}\n\n` +
        `Allow an identity deliberately in \`${POLICY_PATH}\`.\n`,
    );
  }

  return reportOnly ? 0 : 1;
}

/**
 * Message filter for `git filter-branch --msg-filter`: reads one commit message
 * on stdin, writes it back cleaned.
 *
 * This is what makes the gateway repair rather than refuse. A pull request that
 * arrives carrying a disallowed trailer is rewritten in place and force-pushed
 * back to its own branch, so by the time anything merges the trailer never
 * existed. Refusing instead would leave the author to fix it by hand, and on
 * this repository most authors are automated.
 */
function runStdinFilter(policy) {
  const original = readFileSync(0, "utf8");
  const { message } = stripDisallowedCoAuthors(original, policy);
  process.stdout.write(message);
  return 0;
}

/** The identity a disallowed author is rewritten to, as NAME<TAB>EMAIL. */
function runPrintReattribution(policy) {
  const target = policy.reattributeTo || {};
  if (!target.name || !target.email) {
    console.error("Policy is missing reattributeTo.name / reattributeTo.email.");
    return 2;
  }
  process.stdout.write(`${target.name}\t${target.email}`);
  return 0;
}

function runAuthorCheck(range, policy, { reportOnly = false } = {}) {
  const result = spawnSync("git", ["log", "--reverse", "--format=%H%x1f%an%x1f%ae%x1e", range], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git log ${range} failed: ${result.stderr || "unknown error"}`);
  }

  const offenders = String(result.stdout)
    .split("\x1e")
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [sha, name, email] = record.split("\x1f");
      return { sha: (sha || "").trim(), name, email };
    })
    .filter(commit => !isAllowedAuthor(commit, policy));

  if (offenders.length === 0) {
    console.log(`OK: every author in ${range} may be credited.`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Commit Attribution Guard - authors\n\nEvery author in \`${range}\` may be credited.\n`,
      );
    }
    return 0;
  }

  const severity = reportOnly ? "warning" : "error";
  for (const { sha, name, email } of offenders) {
    console.log(`::${severity}::${sha.slice(0, 8)} is authored by ${name} <${email}>, who is not allowed to be credited.`);
  }
  console.log(
    `::${severity}::GitHub lists the commit author in the Contributors section. ` +
      `Reattribute these commits, or add the identity to ${POLICY_PATH} if the credit is intended.`,
  );

  // Without this the trailer check's "no disallowed co-author trailers" banner
  // was the only thing in the job summary, so a push carrying an AI-AUTHORED
  // commit rendered as an unqualified green.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rows = offenders.map(o => `| \`${o.sha.slice(0, 8)}\` | ${o.name} | ${o.email} |`).join("\n");
    appendFileSync(
      summaryPath,
      `### Commit Attribution Guard - authors\n\n${offenders.length} commit(s) in \`${range}\` are authored by an identity ` +
        `that may not be credited.\n\n| Commit | Name | Email |\n|---|---|---|\n${rows}\n`,
    );
  }
  return reportOnly ? 0 : 1;
}

/**
 * Validates the identity git is about to stamp on a new commit, for pre-commit.
 *
 * This is the one place that refuses rather than repairs, and only because
 * repair is impossible here: a hook cannot change the author of a commit that
 * does not exist yet. It is also the cheapest possible moment to find out, it
 * fires only on a genuinely misconfigured clone, and the message says exactly
 * what to run. Everything downstream still repairs silently.
 */
function runAuthorConfigCheck(policy) {
  // `git var GIT_AUTHOR_IDENT`, not `git config --get user.*`. Config is only
  // one input to the identity git actually stamps: `git commit --author=...`
  // and GIT_AUTHOR_NAME/GIT_AUTHOR_EMAIL both override it, and both walked
  // straight past a config-based check while git recorded the AI as author.
  const ident = spawnSync("git", ["var", "GIT_AUTHOR_IDENT"], { encoding: "utf8" });
  const raw = ident.status === 0 ? String(ident.stdout).trim() : "";
  const parsed = /^(.*?)\s*<([^>]*)>/.exec(raw);
  const name = parsed ? parsed[1].trim() : "";
  const email = parsed ? parsed[2].trim() : "";
  if (isAllowedAuthor({ name, email }, policy)) return 0;

  const target = policy.reattributeTo || {};
  console.error(`[commit-trailers] git is configured to author commits as ${name} <${email}>.`);
  console.error(`[commit-trailers] GitHub lists the commit author in this repository's Contributors section, and that identity is not allowed there.`);
  console.error(`[commit-trailers] Fix it for this repository with:`);
  console.error(`    git config user.name  "${target.name || "AlbiDR"}"`);
  console.error(`    git config user.email "${target.email || "aalbi97@gmail.com"}"`);
  console.error(`[commit-trailers] Or add the identity to ${POLICY_PATH} if the credit is intended.`);
  return 1;
}

function main(argv) {
  const policy = loadPolicy();
  // Dispatch on argv[0] only. Scanning the whole argv for mode flags meant an
  // attacker-controlled VALUE was read as a flag: an author whose display name
  // is literally "--filter-stdin" made `--author-allowed "--filter-stdin" <email>`
  // take the filter branch and exit 0, which the CI repair reads as "allowed".
  const mode = argv[0];
  if (mode === "--filter-stdin") return runStdinFilter(policy);
  if (mode === "--check-author-config") return runAuthorConfigCheck(policy);
  if (mode === "--author-allowed") return isAllowedAuthor({ name: argv[1] || "", email: argv[2] || "" }, policy) ? 0 : 1;
  if (mode === "--print-reattribution") return runPrintReattribution(policy);

  if (mode === "--check-authors-range") {
    return runAuthorCheck(argv[1], policy, { reportOnly: argv.includes("--report-only") });
  }
  if (mode === "--check-range") {
    return runCheck(argv[1], policy, { reportOnly: argv.includes("--report-only") });
  }

  const messagePath = argv.find(arg => !arg.startsWith("--"));
  if (!messagePath) {
    console.error("Usage: commit-trailers.mjs <commit-msg-file> | --check-range <base>..<head> [--report-only] | --filter-stdin");
    return 2;
  }
  return runHook(messagePath, policy);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
