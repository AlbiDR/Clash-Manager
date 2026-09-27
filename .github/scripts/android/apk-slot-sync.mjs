#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: APK RELEASE SLOT ALIGNMENT FOR BRANCH SYNC
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Lets sync-branches.yml merge two branches whose APK release
 * slots moved independently, without losing the newer signed build.
 *
 *   align --source <ref> --backup <dir> [--source-name N]
 *       Snapshot this branch's slot into <dir>, then make the slot identical
 *       to <ref>'s and commit that, so the merge has nothing to conflict on.
 *   restore-newer --backup <dir>
 *       After the merge, put the snapshot back if it was the newer build.
 *
 * WHY THIS EXISTS (RCA, 2026-09-27):
 * apk-release.yml commits a freshly signed APK to Beta and to Stable
 * separately, each time renaming the one file in APK/release/. When both
 * branches rename the same base file to different names, the merge is a
 * rename/rename conflict, which git cannot resolve even with -X theirs. The
 * Nightly jobs of sync-branches.yml already sidestep it by aligning the slot
 * before merging; the Beta -> Stable and Stable -> Beta jobs never did. On
 * 2026-09-27 Stable had renamed clashmanager-v14.50.113+410.apk to +411
 * (v14.50.112) while Beta had renamed it to +415 (v14.50.117), so every Sync
 * Branches run would have stopped at the Beta -> Stable merge and Stable
 * could never be promoted again.
 *
 * Aligning by branch alone is not enough: that is the 2026-09-10 incident,
 * where aligning to the stale side walked Beta's updater thirteen versions
 * back (see apk-slot.mjs). So the snapshot is compared afterwards with
 * apk-slot.mjs's own ordering, and the newer build always wins. A slot that
 * cannot be ordered is left as the merge produced it, with a warning, never
 * guessed at, because silently discarding a signed build is the failure this
 * exists to prevent.
 *
 * Git is injectable for tests; the CLI runs in the checked-out repository.
 * ============================================================================
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compareSlots, slotOrdinal } from './apk-slot.mjs';

export const SLOT_DIR = 'APK/release';
const SLOT_JSON = `${SLOT_DIR}/latest.json`;
const LEGACY_ALIAS = `${SLOT_DIR}/clashmanager-latest.apk`;
const APK = /^clashmanager-v.+\.apk$/;

function realGit(cwd) {
  return (args, { binary = false } = {}) => {
    const res = spawnSync('git', args, { cwd, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024 });
    return { status: res.status, stdout: res.stdout, stderr: String(res.stderr || '') };
  };
}

function must(res, what) {
  if (res.status !== 0) throw new Error(`${what} failed: ${res.stderr.trim()}`);
  return res;
}

/** The versioned APK filenames the working tree holds in the slot. */
function workingApks(cwd) {
  const dir = path.join(cwd, SLOT_DIR);
  return existsSync(dir) ? readdirSync(dir).filter(name => APK.test(name)) : [];
}

/**
 * Snapshot this branch's slot, then make it identical to `source`'s and commit.
 * Returns what it did. A source with no versioned APK is left alone: there is
 * nothing to align to, and inventing an empty slot would delete this one.
 */
export function align({ source, backup, sourceName = source, cwd = process.cwd(), git = realGit(cwd) }) {
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(backup, { recursive: true });
  if (existsSync(path.join(cwd, SLOT_JSON))) copyFileSync(path.join(cwd, SLOT_JSON), path.join(backup, 'latest.json'));
  for (const name of workingApks(cwd)) copyFileSync(path.join(cwd, SLOT_DIR, name), path.join(backup, name));

  // A ref git cannot resolve is an error; a real ref with no slot directory is
  // simply a branch with nothing to align to. Keeping the two apart stops a
  // typo in the workflow from reading as "no APK there".
  must(git(['rev-parse', '--verify', '--quiet', `${source}^{commit}`]), `resolving ${source}`);
  const listing = git(['ls-tree', '--name-only', `${source}:${SLOT_DIR}`]);
  const sourceApk = listing.status === 0 ? listing.stdout.split('\n').map(line => line.trim()).find(name => APK.test(name)) : null;
  if (!sourceApk) return { aligned: false, reason: `${sourceName} has no versioned APK to align to` };

  // Every versioned APK goes, the incoming one included: it is written back
  // from the source below, so what remains is exactly the source's slot.
  for (const name of workingApks(cwd)) {
    git(['rm', '--cached', '--force', '--quiet', `${SLOT_DIR}/${name}`]);
    rmSync(path.join(cwd, SLOT_DIR, name), { force: true });
  }
  if (existsSync(path.join(cwd, LEGACY_ALIAS))) {
    git(['rm', '--force', '--quiet', LEGACY_ALIAS]);
    rmSync(path.join(cwd, LEGACY_ALIAS), { force: true });
  }
  mkdirSync(path.join(cwd, SLOT_DIR), { recursive: true });
  const binary = must(git(['show', `${source}:${SLOT_DIR}/${sourceApk}`], { binary: true }), `reading ${sourceApk} from ${source}`);
  writeFileSync(path.join(cwd, SLOT_DIR, sourceApk), binary.stdout);
  const slot = must(git(['show', `${source}:${SLOT_JSON}`]), `reading ${source}'s latest.json`);
  writeFileSync(path.join(cwd, SLOT_JSON), slot.stdout);
  must(git(['add', '--', `${SLOT_DIR}/${sourceApk}`, SLOT_JSON]), 'staging the aligned slot');

  if (git(['diff', '--cached', '--quiet']).status === 0) return { aligned: false, reason: `already identical to ${sourceName}'s slot` };
  must(git(['commit', '--quiet', '-m', `chore(sync): pre-align APK release slot to ${sourceName} before merge [skip ci]`]), 'committing the aligned slot');
  return { aligned: true, reason: `aligned to ${sourceName}'s ${sourceApk}` };
}

/**
 * After the merge, restore the snapshot when it is the newer build. Returns
 * { restored, reason, warning }. Never throws on an unorderable slot: it says
 * so and leaves the merged slot untouched.
 */
export function restoreNewer({ backup, cwd = process.cwd(), git = realGit(cwd) }) {
  const savedJson = path.join(backup, 'latest.json');
  const mergedJson = path.join(cwd, SLOT_JSON);
  if (!existsSync(savedJson) || !existsSync(mergedJson)) return { restored: false, reason: 'no slot on one side, nothing to compare' };

  let order;
  try {
    order = compareSlots(slotOrdinal(readFileSync(savedJson, 'utf8'), 'pre-merge slot'), slotOrdinal(readFileSync(mergedJson, 'utf8'), 'merged slot'));
  } catch (error) {
    return { restored: false, reason: 'left the merged slot untouched', warning: `Could not order the APK release slots: ${error.message}` };
  }
  if (order <= 0) return { restored: false, reason: order === 0 ? 'the same build on both sides' : 'the merged slot is the newer build' };

  const savedApk = readdirSync(backup).find(name => APK.test(name));
  if (!savedApk) {
    return { restored: false, reason: 'left the merged slot untouched', warning: 'The pre-merge slot was newer but its binary was not captured.' };
  }
  for (const name of workingApks(cwd)) {
    git(['rm', '--cached', '--force', '--quiet', `${SLOT_DIR}/${name}`]);
    rmSync(path.join(cwd, SLOT_DIR, name), { force: true });
  }
  copyFileSync(path.join(backup, savedApk), path.join(cwd, SLOT_DIR, savedApk));
  copyFileSync(savedJson, mergedJson);
  must(git(['add', '--', `${SLOT_DIR}/${savedApk}`, SLOT_JSON]), 'staging the restored slot');
  if (git(['diff', '--cached', '--quiet']).status === 0) return { restored: false, reason: 'already the newer slot' };
  must(git(['commit', '--quiet', '-m', 'chore(sync): restore newer APK release slot after merge [skip ci]']), 'committing the restored slot');
  return { restored: true, reason: `restored ${savedApk}, the newer build` };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

export function runCli(argv = process.argv.slice(2)) {
  const [command] = argv;
  const backup = argValue(argv, '--backup');
  try {
    if (command === 'align' && backup && argValue(argv, '--source')) {
      const result = align({ source: argValue(argv, '--source'), backup, sourceName: argValue(argv, '--source-name') || argValue(argv, '--source') });
      console.log(`APK slot: ${result.reason}.`);
      return 0;
    }
    if (command === 'restore-newer' && backup) {
      const result = restoreNewer({ backup });
      if (result.warning) console.log(`::warning::${result.warning} ${result.reason}.`);
      console.log(`APK slot: ${result.reason}.`);
      return 0;
    }
  } catch (error) {
    console.error(`::error::APK slot ${command} failed: ${error.message}`);
    return 1;
  }
  console.error('Usage: apk-slot-sync.mjs align --source <ref> --backup <dir> [--source-name N] | restore-newer --backup <dir>');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli();
}
