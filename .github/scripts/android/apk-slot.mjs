#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: APK RELEASE SLOT COMPARISON
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Decides which of two APK release slots is the newer build.
 * A "slot" is an APK/release/latest.json: the pointer deploy-pwa.yml copies to
 * the PWA origin, and therefore what the in-app updater offers to users.
 *
 * WHY THIS EXISTS (RCA, 2026-09-10):
 * sync-branches.yml prevents a rename/rename conflict on the signed binary by
 * forcing one branch's slot onto the other before merging. Git cannot
 * auto-resolve that conflict class, not even with -X theirs, so the
 * normalisation itself is sound. What was wrong is that Job 1 picked the
 * winner by BRANCH rather than by recency, and Nightly is structurally always
 * the stale side: apk-release.yml only rebuilds the slot on Beta and Stable
 * pushes that touch APK native sources, so Nightly's slot stays frozen while
 * Beta keeps receiving fresh signed builds. The 2026-09-10 sync therefore
 * walked Beta back from v14.50.46+330 to v14.50.33+312, and the in-app
 * updater pointed thirteen versions back. It recurred on every sync rather
 * than occasionally, which is why hand-restoring the slot never held.
 *
 * Ordering is by derived Android versionCode first, then buildNumber, because
 * versionCode is the only ordering Android itself honours. androidVersionCode
 * is imported rather than reimplemented: a second copy of that arithmetic is
 * exactly the bug its own header documents.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { androidVersionCode } from './android-version-code.mjs';

/**
 * Reads a slot file and reduces it to its comparable ordering key.
 * Throws on anything it cannot order, so a malformed slot is never silently
 * treated as the older side and discarded.
 */
export function slotOrdinal(source, label = 'slot') {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${label} is not an object`);
  }

  const code = androidVersionCode(parsed.version);

  if (!Number.isInteger(parsed.buildNumber) || parsed.buildNumber < 0) {
    throw new Error(`${label} has no usable buildNumber: ${JSON.stringify(parsed.buildNumber)}`);
  }

  return { code, buildNumber: parsed.buildNumber, version: parsed.version, filename: parsed.filename };
}

/**
 * Orders two slots. Returns 1 when `a` is newer, -1 when `b` is newer, 0 when
 * they are the same build.
 */
export function compareSlots(a, b) {
  if (a.code !== b.code) return a.code > b.code ? 1 : -1;
  if (a.buildNumber !== b.buildNumber) return a.buildNumber > b.buildNumber ? 1 : -1;
  return 0;
}

/** Exit code used for "cannot decide", distinct from a clean comparison. */
export const EXIT_UNDECIDABLE = 2;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('Usage: apk-slot.mjs <slot-a.json> <slot-b.json>   prints "a", "b" or "equal"');
    process.exit(EXIT_UNDECIDABLE);
  }
  try {
    const a = slotOrdinal(readFileSync(fileA, 'utf8'), fileA);
    const b = slotOrdinal(readFileSync(fileB, 'utf8'), fileB);
    const order = compareSlots(a, b);
    console.log(order > 0 ? 'a' : order < 0 ? 'b' : 'equal');
  } catch (error) {
    console.error(`Cannot order the two APK release slots: ${error.message}`);
    process.exit(EXIT_UNDECIDABLE);
  }
}
