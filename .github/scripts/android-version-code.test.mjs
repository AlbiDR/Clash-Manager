// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_MAX_VERSION_CODE,
  MAX_COMPONENT,
  androidVersionCode,
  assertVersionCodeNotRegressed,
  parseSemver,
} from "./android-version-code.mjs";

// The old formula, kept here only so the regression it caused can be asserted
// against directly. Do not use it for anything.
const legacyVersionCode = version => {
  const [major, minor, patch] = version.split(".").map(Number);
  return major * 1000 + minor * 100 + patch * 10;
};

test("the exact transition that exposed the bug now increases", () => {
  // 14.46.22 -> 14.47.0 is the real case found on 2026-08-27 while preparing a
  // minor bump. Under the old formula this went DOWN by 120, which would have
  // stopped every installed user from ever receiving the update.
  assert.equal(legacyVersionCode("14.46.22"), 18820);
  assert.equal(legacyVersionCode("14.47.0"), 18700);
  assert.ok(legacyVersionCode("14.47.0") < legacyVersionCode("14.46.22"), "precondition: the old formula regressed here");

  assert.ok(
    androidVersionCode("14.47.0") > androidVersionCode("14.46.22"),
    "the replacement must increase across a minor bump from a high patch",
  );
});

test("a major bump from a high minor also increases", () => {
  // The same class of failure, one slot up: the old formula regressed here too.
  assert.ok(legacyVersionCode("15.0.0") < legacyVersionCode("14.46.22"));
  assert.ok(androidVersionCode("15.0.0") > androidVersionCode("14.46.22"));
});

test("strictly increasing across a representative release sequence", () => {
  const sequence = [
    "0.0.1", "0.0.9", "0.0.10", "0.1.0", "0.9.999", "1.0.0",
    "14.46.9", "14.46.10", "14.46.22", "14.46.23", "14.46.999",
    "14.47.0", "14.47.1", "14.99.0", "15.0.0", "99.999.999",
  ];
  const codes = sequence.map(androidVersionCode);
  for (let index = 1; index < codes.length; index += 1) {
    assert.ok(
      codes[index] > codes[index - 1],
      `${sequence[index]} (${codes[index]}) must exceed ${sequence[index - 1]} (${codes[index - 1]})`,
    );
  }
});

test("never regresses for any ordered pair, exhaustively over a bounded space", () => {
  // Property check rather than a handful of examples: every version in this
  // space must outrank every version that precedes it in semver order.
  const versions = [];
  for (const major of [0, 1, 14, 15]) {
    for (const minor of [0, 1, 9, 10, 46, 47, 999]) {
      for (const patch of [0, 1, 9, 10, 22, 23, 999]) {
        versions.push({ major, minor, patch, code: androidVersionCode(`${major}.${minor}.${patch}`) });
      }
    }
  }
  const order = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  for (const a of versions) {
    for (const b of versions) {
      const expected = order(a, b);
      if (expected < 0) assert.ok(a.code < b.code, `${a.major}.${a.minor}.${a.patch} should rank below ${b.major}.${b.minor}.${b.patch}`);
      if (expected === 0) assert.equal(a.code, b.code);
    }
  }
});

test("the live value is preserved as an increase, not a regression", () => {
  // 14.46.23 is what is installed on devices at the time of this change, with
  // legacy code 18830. The replacement must be above it or the very release
  // carrying this fix would be the one that strands everyone.
  assert.equal(legacyVersionCode("14.46.23"), 18830);
  assert.ok(androidVersionCode("14.46.23") > 18830);
  assert.ok(androidVersionCode("14.46.24") > androidVersionCode("14.46.23"));
});

test("an overflowing component throws instead of silently corrupting the value", () => {
  // This is the property the old formula lacked. Returning a wrong number
  // quietly is precisely how the previous bug shipped.
  assert.throws(() => androidVersionCode(`1.${MAX_COMPONENT + 1}.0`), /above the maximum/);
  assert.throws(() => androidVersionCode(`1.0.${MAX_COMPONENT + 1}`), /above the maximum/);
  assert.doesNotThrow(() => androidVersionCode(`1.${MAX_COMPONENT}.${MAX_COMPONENT}`));
});

test("every accepted input stays inside Android's ceiling", () => {
  assert.ok(androidVersionCode(`999.${MAX_COMPONENT}.${MAX_COMPONENT}`) < ANDROID_MAX_VERSION_CODE);
});

test("malformed versions are rejected rather than coerced", () => {
  for (const bad of ["", "14.46", "14.46.23.1", "v14.46.23", "14.46.x", null, undefined, {}]) {
    assert.throws(() => androidVersionCode(bad), /Not a valid semver string/, `should reject ${JSON.stringify(bad)}`);
  }
});

test("parseSemver tolerates surrounding whitespace but nothing else", () => {
  assert.deepEqual(parseSemver(" 14.46.23 "), { major: 14, minor: 46, patch: 23 });
  assert.throws(() => parseSemver("14 .46.23"));
});

test("assertVersionCodeNotRegressed blocks an equal or lower code", () => {
  assert.throws(() => assertVersionCodeNotRegressed(18830, 18700), /would regress/);
  assert.throws(() => assertVersionCodeNotRegressed(18830, 18830), /would regress/);
  assert.equal(assertVersionCodeNotRegressed(18830, 18831), 18831);
});

test("assertVersionCodeNotRegressed is inert when there is no previous value", () => {
  // A first build, or a file that does not record a code yet, must not be
  // treated as a regression from zero.
  assert.equal(assertVersionCodeNotRegressed(undefined, 5), 5);
  assert.equal(assertVersionCodeNotRegressed(null, 5), 5);
  assert.equal(assertVersionCodeNotRegressed(NaN, 5), 5);
});
