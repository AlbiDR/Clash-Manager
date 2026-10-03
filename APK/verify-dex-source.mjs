#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * verify-dex-source.mjs - fails unless the committed APK/android/classes.dex
 * contains exactly the app classes that APK/src compiles to.
 *
 * WHY: CI packages the committed classes.dex; it never compiled APK/src. A
 * commit that edited the Java and forgot to rebuild, or a Java file that no
 * longer compiled at all, passed every check and shipped the old native code.
 * Nothing compared source with binary except a manual script that needed one
 * particular Mac. build-apk.sh --check compiles the source with the pinned
 * toolchain, decodes both dex files to smali with the same apktool, and hands
 * the two trees to this script.
 *
 * It compares every class the source compile produces, in whatever package d8
 * put it: the app package, and d8's own helpers such as com/android/tools/r8/
 * RecordTag, which desugared records extend. Checking the app package alone
 * once passed a dex that lacked RecordTag, and that build crashed on the phone
 * at the first call touching a record. Orphans are looked for where the
 * compile owns classes (the app package, d8's helper package, and any package
 * the compile emits). The other ~7,000 classes in the dex are prebuilt
 * libraries with no source here, and comparing smali per class rather than dex
 * bytes keeps the check independent of how those happen to be laid out in the
 * reassembled file. The generated R classes have no Java source and are never
 * orphans.
 *
 *   node verify-dex-source.mjs <fresh-smali-root> <committed-smali-root>
 *
 * Exit 0 = the committed dex was built from this source, 1 = drift, 2 = usage/IO error.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_PACKAGE_DIR = "com/albidr/clashmanager";
/** Where d8 puts the helper classes it synthesises outside the app's own package. */
export const D8_SYNTHETIC_DIR = "com/android/tools/r8";

const dirOf = (key) => key.slice(0, key.lastIndexOf("/"));

/** Generated resource classes: present in the dex, never produced by APK/src. */
export function isGeneratedResourceClass(key) {
  const name = key.slice(key.lastIndexOf("/") + 1);
  return name === "R" || name.startsWith("R$");
}

/**
 * Reads every smali class under an apktool output root (smali/, smali_classes2/, ...)
 * into a map keyed by its package path, e.g. "com/albidr/clashmanager/MainActivity".
 */
export function readClasses(root) {
  const classes = new Map();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^smali(_classes\d+)?$/.test(entry.name)) continue;
    const base = path.join(root, entry.name);
    const walk = (dir) => {
      for (const child of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, child.name);
        if (child.isDirectory()) walk(full);
        else if (child.name.endsWith(".smali")) {
          const key = path.relative(base, full).split(path.sep).join("/").slice(0, -".smali".length);
          classes.set(key, readFileSync(full, "utf8"));
        }
      }
    };
    walk(base);
  }
  return classes;
}

/**
 * @param {Map<string,string>} fresh     class key -> smali, compiled from APK/src
 * @param {Map<string,string>} committed class key -> smali, decoded from the committed dex
 * @returns {{ missing: string[], orphaned: string[], differing: string[] }}
 */
export function compareCompiledClasses(fresh, committed) {
  const missing = [];
  const differing = [];
  for (const [key, smali] of fresh) {
    if (!committed.has(key)) missing.push(key);
    else if (committed.get(key) !== smali) differing.push(key);
  }
  const owned = new Set([APP_PACKAGE_DIR, D8_SYNTHETIC_DIR, ...[...fresh.keys()].map(dirOf)]);
  const orphaned = [...committed.keys()].filter(
    (key) => owned.has(dirOf(key)) && !fresh.has(key) && !isGeneratedResourceClass(key),
  );
  return { missing: missing.sort(), orphaned: orphaned.sort(), differing: differing.sort() };
}

function main() {
  const [, , freshRoot, committedRoot] = process.argv;
  if (!freshRoot || !committedRoot) {
    console.error("usage: verify-dex-source.mjs <fresh-smali-root> <committed-smali-root>");
    process.exit(2);
  }
  for (const dir of [freshRoot, committedRoot]) {
    if (!existsSync(dir)) {
      console.error(`not found: ${dir}`);
      process.exit(2);
    }
  }

  const fresh = readClasses(freshRoot);
  const committed = readClasses(committedRoot);
  if (fresh.size === 0) {
    // A compile that produced nothing must not read as "nothing differs".
    console.error("✗ no app classes found in the freshly compiled tree - the compile step produced nothing");
    process.exit(2);
  }

  const { missing, orphaned, differing } = compareCompiledClasses(fresh, committed);
  if (missing.length + orphaned.length + differing.length === 0) {
    console.log(`\x1b[32m✓ classes.dex matches APK/src (${fresh.size} compiled classes compared)\x1b[0m`);
    process.exit(0);
  }

  console.error("\x1b[31m✗ APK/android/classes.dex was not built from the current APK/src:\x1b[0m");
  for (const name of missing) console.error(`  + ${name} (compiled from source, absent from the committed dex)`);
  for (const name of differing) console.error(`  ~ ${name} (differs from the committed dex)`);
  for (const name of orphaned) console.error(`  - ${name} (in the committed dex, no longer produced by source)`);
  console.error("\nRebuild and commit the dex:  ./APK/build-apk.sh --no-sign  then  git add APK/android/classes.dex");
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
