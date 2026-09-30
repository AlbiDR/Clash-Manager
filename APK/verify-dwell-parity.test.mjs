// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { JAVA_SOURCE, MIRRORS, PWA_CONFIG, checkParity, javaConstants, tsConstants } from "./verify-dwell-parity.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const JAVA = `
    static final long DWELL_MIN_MS = 850L;
    static final long DWELL_MAX_MS = 6000L;
    static final long[] DWELL_DETENTS_MS = { 850L, 1500L, 6000L };
    static final long DEFAULT_PROFILE_LOAD_DELAY_MS = DWELL_MIN_MS;
    private static final int UNRELATED = 3;
`;

const TS = `
export const BLITZ_DWELL_MIN = 850;
export const BLITZ_DWELL_MAX = 6_000;
export const BLITZ_DWELL_DETENTS: readonly number[] = [
  850, 1500, 6000,
];
export const BLITZ_DWELL_DEFAULT = BLITZ_DWELL_MIN;
`;

const PAIRS = [
  ["DWELL_MIN_MS", "BLITZ_DWELL_MIN"],
  ["DWELL_MAX_MS", "BLITZ_DWELL_MAX"],
  ["DWELL_DETENTS_MS", "BLITZ_DWELL_DETENTS"],
  ["DEFAULT_PROFILE_LOAD_DELAY_MS", "BLITZ_DWELL_DEFAULT"],
];

test("constants resolve through literals, suffixes, arrays and references", () => {
  const java = javaConstants(JAVA);
  const ts = tsConstants(TS);
  assert.equal(java("DWELL_MAX_MS"), 6000);
  assert.deepEqual(java("DWELL_DETENTS_MS"), [850, 1500, 6000]);
  assert.equal(java("DEFAULT_PROFILE_LOAD_DELAY_MS"), 850);
  assert.equal(ts("BLITZ_DWELL_MAX"), 6000);
  assert.equal(ts("BLITZ_DWELL_DEFAULT"), 850);
});

test("matching sides report nothing", () => {
  assert.deepEqual(checkParity(javaConstants(JAVA), tsConstants(TS), PAIRS), []);
});

test("a changed value or a changed detent list is reported", () => {
  const ts = tsConstants(TS.replace("BLITZ_DWELL_MAX = 6_000", "BLITZ_DWELL_MAX = 7000").replace("850, 1500, 6000", "850, 1600, 6000"));
  const problems = checkParity(javaConstants(JAVA), ts, PAIRS);
  assert.equal(problems.length, 2);
  assert.ok(problems[0].includes("DWELL_MAX_MS = 6000 in Java, but BLITZ_DWELL_MAX = 7000"));
});

test("a constant that disappears is reported rather than skipped", () => {
  const problems = checkParity(javaConstants(JAVA.replace("DWELL_MAX_MS", "RENAMED_MS")), tsConstants(TS), PAIRS);
  assert.deepEqual(problems, [`DWELL_MAX_MS not found in ${JAVA_SOURCE}`]);
});

test("the real BlitzService and PWA config agree on every mirrored constant", () => {
  const read = (file) => readFileSync(path.join(REPO_ROOT, file), "utf8");
  assert.deepEqual(checkParity(javaConstants(read(JAVA_SOURCE)), tsConstants(read(PWA_CONFIG)), MIRRORS), []);
});
