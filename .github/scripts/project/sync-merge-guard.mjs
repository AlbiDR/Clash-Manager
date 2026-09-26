#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: SYNC MERGE GUARD
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Before sync-branches.yml merges one branch into another with
 * `-X theirs`, works out exactly what that merge would silently throw away,
 * and refuses the merge when it would discard real work.
 *
 * WHY THIS EXISTS (RCA, 2026-09-24):
 * Every sync merge that uses `-X theirs` resolves each conflicting hunk by
 * taking the incoming side. Where BOTH branches changed the same lines, the
 * destination branch's own change is dropped without a word. On 2026-09-24
 * the Beta -> Stable merge (2a53d2b38) did exactly that: Stable carried
 * 397e9114c, which trimmed and sealed two 2026-09-23 migrations, Beta held
 * the older copies of the same lines, and the merge restored the untrimmed
 * files onto Stable. It also took Beta's "version": "14.50.112" over Stable's
 * 14.50.113. `pnpm audit:migrations` then failed on Stable until the files
 * were restored by hand on 2026-09-27.
 *
 * It was not a one-off. Replaying all 77 sync merges from 2026-08-01 with a
 * plain merge: 8 had conflicts that `-X theirs` settled silently, and the
 * discarded side included real code (usePwaManager.ts on 08-10,
 * nightly-prose.mjs and a watchdog test on 09-06, the migrations on 09-24).
 *
 * WHAT IT ALLOWS, AND WHY
 * `git merge-tree` computes the merge without touching any branch and names
 * every conflicted path. Each is then classified:
 * - Version stamps. Every push bumps the version in the same files on
 *   whichever branch it lands on, so two branches bumped separately collide
 *   on exactly those lines on almost every diverged sync. A hunk is
 *   version-only when the two sides differ ONLY by each branch's own version
 *   (x.y.z) and its Android versionCode, read from each branch's
 *   package.json. Taking the incoming side is correct then, but only when the
 *   incoming version is not older: the 09-24 merge would otherwise have been
 *   waved through while walking Stable's version back.
 * - Paths another step already owns, and only in the jobs where it really
 *   does: the pipeline's own logs (.github/nightly-logs/, written on Nightly
 *   only); the APK release slot (APK/release/) where the job normalises it
 *   before merging (--apk-slot-normalised; the Nightly jobs do, the Stable
 *   ones do not, and there a conflicting slot is a rename/rename git cannot
 *   merge at all); and pnpm-lock.yaml where the job regenerates and
 *   re-verifies the lockfile after merging (--lockfile-verified).
 * Anything else is a discard: the job stops before pushing and names the
 * files and the destination-only commits that touched them. A conflicted
 * file with no text markers (a binary) cannot be proven harmless, so it is a
 * discard too, and so is anything git could not answer.
 *
 * Exit codes: 0 no conflict, or only harmless ones; 1 the merge would discard
 * work; 2 git could not answer, which must stop the sync just the same.
 * ============================================================================
 */

import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { androidVersionCode } from '../android/android-version-code.mjs';

export const VERDICT = Object.freeze({
  CLEAN: 'CLEAN',
  SAFE: 'SAFE',
  DISCARDS: 'DISCARDS',
  UNKNOWN: 'UNKNOWN',
});

export const KIND = Object.freeze({
  VERSION: 'version',
  VERSION_BACK: 'version-back',
  APK_SLOT: 'apk-slot',
  BOOKKEEPING: 'bookkeeping',
  LOCKFILE: 'lockfile',
  CONTENT: 'content',
});

const HARMLESS = new Set([KIND.VERSION, KIND.APK_SLOT, KIND.BOOKKEEPING, KIND.LOCKFILE]);

/**
 * The conflict blocks in a file written by `git merge-tree`, in the default
 * merge style. Null when the file carries no markers at all, which is what a
 * binary conflict looks like: nothing can then be proven about it.
 */
export function conflictBlocks(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let block = null;
  let side = null;
  for (const line of lines) {
    if (line.startsWith('<<<<<<< ') || line === '<<<<<<<') {
      block = { ours: [], theirs: [] };
      side = 'ours';
    } else if (block && line === '=======') {
      side = 'theirs';
    } else if (block && (line.startsWith('>>>>>>> ') || line === '>>>>>>>')) {
      blocks.push(block);
      block = null;
      side = null;
    } else if (block) {
      block[side].push(line);
    }
  }
  return blocks.length > 0 ? blocks : null;
}

function replaceAll(text, needle, replacement) {
  return needle ? String(text).split(needle).join(replacement) : String(text);
}

/** A version and its Android versionCode, the two ways every stamp spells it. */
function spellings(version) {
  let code = null;
  try {
    code = String(androidVersionCode(version));
  } catch {
    code = null;
  }
  return [version, code].filter(Boolean);
}

/**
 * Whether one conflict block differs only by each branch's own version: the
 * destination side spells the destination's version where the incoming side
 * spells the incoming one, and every other character matches. Directional on
 * purpose: a dependency pinned "7.3.2" against "7.3.3" is not a version stamp
 * and must not pass because it looks like one.
 */
export function isVersionOnly(block, { target, source } = {}) {
  if (!target || !source || target === source) return false;
  if (block.ours.length !== block.theirs.length || block.ours.length === 0) return false;
  const TOKEN = '\u0000VERSION\u0000';
  const normalise = (line, version) => spellings(version).reduce((text, spelling) => replaceAll(text, spelling, TOKEN), line);
  let differs = false;
  for (let i = 0; i < block.ours.length; i += 1) {
    if (block.ours[i] !== block.theirs[i]) differs = true;
    if (normalise(block.ours[i], target) !== normalise(block.theirs[i], source)) return false;
  }
  return differs;
}

/** -1, 0 or 1 for two x.y.z versions; null when either cannot be read. */
export function compareVersions(a, b) {
  const parse = value => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? '').trim());
    return match ? match.slice(1).map(Number) : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Classifies every conflicted path. Pure: `readMerged(path)` returns the
 * merged file with markers (or null), `versions` is { target, source }.
 */
export function judgeConflicts({ conflicts = [], readMerged, versions = {}, lockfileVerified = false, apkSlotNormalised = false }) {
  const files = conflicts.map(file => {
    if (file.startsWith('.github/nightly-logs/')) {
      return { path: file, kind: KIND.BOOKKEEPING, reason: 'pipeline log, written on Nightly only' };
    }
    if (file.startsWith('APK/release/')) {
      return apkSlotNormalised
        ? { path: file, kind: KIND.APK_SLOT, reason: 'APK release slot, normalised before the merge and repaired after it by apk-slot.mjs' }
        : { path: file, kind: KIND.CONTENT, reason: 'APK release slot, which this job does not normalise, so the merge would drop one signed build or fail outright' };
    }
    if (file === 'pnpm-lock.yaml' && lockfileVerified) {
      return { path: file, kind: KIND.LOCKFILE, reason: 'regenerated and re-verified after the merge' };
    }
    const blocks = conflictBlocks(readMerged(file));
    if (!blocks) {
      return { path: file, kind: KIND.CONTENT, reason: 'conflicted with no text markers (binary), so nothing proves the loss is harmless' };
    }
    if (!blocks.every(block => isVersionOnly(block, versions))) {
      return { path: file, kind: KIND.CONTENT, reason: 'both branches changed the same lines' };
    }
    if (compareVersions(versions.source, versions.target) === -1) {
      return { path: file, kind: KIND.VERSION_BACK, reason: `would take ${versions.source} over ${versions.target}, walking the version back` };
    }
    return { path: file, kind: KIND.VERSION, reason: `version stamp only, taking the newer ${versions.source}` };
  });
  const verdict = files.length === 0
    ? VERDICT.CLEAN
    : files.every(file => HARMLESS.has(file.kind)) ? VERDICT.SAFE : VERDICT.DISCARDS;
  return { verdict, files };
}

function runGit(args) {
  const res = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function versionAt(git, ref) {
  const res = git(['show', `${ref}:package.json`]);
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout).version || null;
  } catch {
    return null;
  }
}

/**
 * Computes the merge of `source` into `target` without touching either, and
 * judges what `-X theirs` would discard. `git` is injectable for tests.
 */
export function guardMerge({ target, source, lockfileVerified = false, apkSlotNormalised = false, git = runGit }) {
  const merge = git(['-c', 'merge.conflictStyle=merge', 'merge-tree', '--write-tree', '--name-only', '--no-messages', target, source]);
  if (merge.status === 0) return { verdict: VERDICT.CLEAN, files: [], target, source };
  if (merge.status !== 1) {
    return { verdict: VERDICT.UNKNOWN, files: [], target, source, error: merge.stderr.trim() || `git merge-tree exited ${merge.status}` };
  }
  const [tree, ...conflicts] = merge.stdout.split('\n').map(line => line.trim()).filter(Boolean);
  // merge-tree also exits 1 for a ref it cannot resolve ("not something we
  // can merge"), with nothing on stdout. Read as "conflicts" that would give
  // an empty conflict list, and an empty list is CLEAN: the guard failing
  // would print a pass. Exit 1 means conflicts only when git wrote a merged
  // tree AND named at least one conflicted path.
  if (!/^[0-9a-f]{40,64}$/.test(tree || '') || conflicts.length === 0) {
    return { verdict: VERDICT.UNKNOWN, files: [], target, source, error: merge.stderr.trim() || 'git merge-tree reported conflicts but named none' };
  }
  const versions = { target: versionAt(git, target), source: versionAt(git, source) };
  const readMerged = file => {
    const res = git(['show', `${tree}:${file}`]);
    return res.status === 0 ? res.stdout : null;
  };
  const judged = judgeConflicts({ conflicts: [...new Set(conflicts)], readMerged, versions, lockfileVerified, apkSlotNormalised });
  // Only real content conflicts name the commits behind them. For a version
  // stamp the list would be every commit that bumped the version, which says
  // nothing the versions in the reason do not.
  for (const file of judged.files) {
    if (file.kind !== KIND.CONTENT) continue;
    const log = git(['log', '--no-merges', '--format=%h %s', `${source}..${target}`, '--', file.path]);
    file.commits = log.status === 0 ? log.stdout.split('\n').map(line => line.trim()).filter(Boolean) : [];
  }
  return { ...judged, target, source, versions };
}

export function renderGuardReport(result, { targetName = result.target, sourceName = result.source } = {}) {
  const lines = [`### Merge guard: ${sourceName} into ${targetName}`];
  if (result.verdict === VERDICT.UNKNOWN) {
    lines.push(`Could not compute the merge, so nothing can be said about what it would discard. Not merging. (${result.error})`);
    return lines.join('\n');
  }
  if (result.verdict === VERDICT.CLEAN) {
    lines.push('No conflicts: nothing on either side is discarded.');
    return lines.join('\n');
  }
  const harmful = result.files.filter(file => !HARMLESS.has(file.kind));
  const harmless = result.files.filter(file => HARMLESS.has(file.kind));
  if (harmful.length > 0) {
    lines.push(`Not merging: \`-X theirs\` would silently discard ${targetName}'s own changes in ${harmful.length} file${harmful.length === 1 ? '' : 's'}.`);
    for (const file of harmful) {
      lines.push(`- ${file.path}: ${file.reason}.`);
      for (const commit of file.commits || []) lines.push(`  - only on ${targetName}: ${commit}`);
    }
    lines.push(`Bring those changes to ${sourceName} first (the same commit on both branches), or resolve the conflict by hand, then run Sync Branches again.`);
  } else {
    lines.push(`Conflicts only where taking ${sourceName}'s side loses nothing:`);
  }
  for (const file of harmless) lines.push(`- ${file.path}: ${file.reason}.`);
  return lines.join('\n');
}

export function exitCodeFor(result) {
  if (result.verdict === VERDICT.UNKNOWN) return 2;
  return result.verdict === VERDICT.DISCARDS ? 1 : 0;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function runCli(argv = process.argv.slice(2)) {
  const target = argValue(argv, '--target');
  const source = argValue(argv, '--source');
  if (!target || !source) {
    console.error('Usage: sync-merge-guard.mjs --target <ref> --source <ref> [--target-name N] [--source-name N] [--lockfile-verified] [--apk-slot-normalised]');
    return 2;
  }
  const result = guardMerge({
    target,
    source,
    lockfileVerified: argv.includes('--lockfile-verified'),
    apkSlotNormalised: argv.includes('--apk-slot-normalised'),
  });
  const report = renderGuardReport(result, {
    targetName: argValue(argv, '--target-name') || target,
    sourceName: argValue(argv, '--source-name') || source,
  });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n\n`);
  const code = exitCodeFor(result);
  if (code !== 0) console.log(`::error::Sync merge guard refused the merge (exit ${code}). See the step summary.`);
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runCli();
}
