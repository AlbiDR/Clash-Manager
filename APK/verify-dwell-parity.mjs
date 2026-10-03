#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * verify-dwell-parity.mjs - fails when the Blitz dwell domain in BlitzService
 * and in the PWA's config disagree.
 *
 * WHY: the PWA's Blitz Speed slider and the native overlay's dwell slider must
 * offer the same range and the same stops, or the two controls disagree about
 * what a setting means. Frontend-PWA/src/core/config/index.ts is the source of
 * truth and the PWA sends its chosen dwell through the "delayMs" intent extra;
 * BlitzService mirrors the constants because neither side can import the
 * other. BlitzService's own comment promised a script that "fails the build if
 * they ever drift apart". It was never written. This is it.
 *
 *   node APK/verify-dwell-parity.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const JAVA_SOURCE = "APK/src/com/albidr/clashmanager/BlitzService.java";
export const PWA_CONFIG = "Frontend-PWA/src/core/config/index.ts";

/** Java constant -> the PWA constant it mirrors. */
export const MIRRORS = [
  ["DWELL_MIN_MS", "BLITZ_DWELL_MIN"],
  ["DWELL_MAX_MS", "BLITZ_DWELL_MAX"],
  ["DWELL_STEP_MS", "BLITZ_DWELL_STEP"],
  ["DWELL_DETENTS_MS", "BLITZ_DWELL_DETENTS"],
  ["DEFAULT_PROFILE_LOAD_DELAY_MS", "BLITZ_DWELL_DEFAULT"],
  ["DWELL_ESTIMATE_OVERHEAD_MS", "BLITZ_BATCH_SHIFT_DELAY"],
];

const parseNumber = (literal) => Number(literal.replace(/[lL_]/g, ""));

/**
 * Resolves `name` to a number or number[] from a table of raw right-hand sides,
 * following references to other constants (BLITZ_DWELL_DEFAULT = BLITZ_DWELL_MIN).
 */
function resolve(raw, name, seen = new Set()) {
  if (!raw.has(name)) return undefined;
  if (seen.has(name)) throw new Error(`circular constant ${name}`);
  seen.add(name);
  const value = raw.get(name).trim();
  const list = value.match(/^[[{]([\s\S]*)[\]}]$/);
  if (list) return list[1].split(",").map((item) => item.trim()).filter(Boolean).map(parseNumber);
  if (/^-?[\d_]+(\.\d+)?[lL]?$/.test(value)) return parseNumber(value);
  if (/^\w+$/.test(value)) return resolve(raw, value, seen);
  throw new Error(`cannot evaluate ${name} = ${value}`);
}

/** Reads `static final <type> NAME = <value>;` declarations from Java source. */
export function javaConstants(source) {
  const raw = new Map();
  for (const m of source.matchAll(/static\s+final\s+[\w\[\]]+\s+(\w+)\s*=\s*([^;]+);/g)) raw.set(m[1], m[2]);
  return (name) => resolve(raw, name);
}

/** Reads `export const NAME(: type)? = <value>;` declarations from TypeScript source. */
export function tsConstants(source) {
  const raw = new Map();
  for (const m of source.matchAll(/export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*([^;]+);/g)) raw.set(m[1], m[2]);
  return (name) => resolve(raw, name);
}

/** @returns {string[]} one message per mirrored constant that is missing or differs */
export function checkParity(java, ts, mirrors = MIRRORS) {
  const problems = [];
  for (const [javaName, tsName] of mirrors) {
    const javaValue = java(javaName);
    const tsValue = ts(tsName);
    if (javaValue === undefined) problems.push(`${javaName} not found in ${JAVA_SOURCE}`);
    if (tsValue === undefined) problems.push(`${tsName} not found in ${PWA_CONFIG}`);
    if (javaValue === undefined || tsValue === undefined) continue;
    if (JSON.stringify(javaValue) !== JSON.stringify(tsValue)) {
      problems.push(`${javaName} = ${JSON.stringify(javaValue)} in Java, but ${tsName} = ${JSON.stringify(tsValue)} in the PWA`);
    }
  }
  return problems;
}

function main() {
  const read = (file) => readFileSync(path.join(REPO_ROOT, file), "utf8");
  const problems = checkParity(javaConstants(read(JAVA_SOURCE)), tsConstants(read(PWA_CONFIG)));
  if (problems.length === 0) {
    console.log(`\x1b[32m✓ Blitz dwell domain matches between BlitzService and the PWA config (${MIRRORS.length} constants)\x1b[0m`);
    process.exit(0);
  }
  console.error("\x1b[31m✗ Blitz dwell domain drift (the PWA config is the source of truth):\x1b[0m");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
