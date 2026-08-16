// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import { createRedactor, redactDeep, REDACTED } from "./nightly-redact.mjs";

const SECRET = "AIzaSyD-ExampleNightlyWatchdogKey0000000";

test("redactor removes the configured secret from a plain string", () => {
  const redact = createRedactor([SECRET]);
  assert.equal(redact(`X-Goog-Api-Key: ${SECRET}`), `X-Goog-Api-Key: ${REDACTED}`);
});

test("redactor removes every occurrence, not just the first", () => {
  const redact = createRedactor([SECRET]);
  const result = redact(`${SECRET} then ${SECRET}`);
  assert.equal(result, `${REDACTED} then ${REDACTED}`);
  assert.equal(result.includes(SECRET), false);
});

test("redactor catches a Google API key that was never configured as a secret", () => {
  const redact = createRedactor([]);
  const stray = "AIzaSyUnconfiguredKeyLeakedFromElsewhere123";
  assert.equal(redact(`failed with ${stray}`), `failed with ${REDACTED}`);
});

test("redactor ignores empty, short, and non-string secrets", () => {
  const redact = createRedactor(["", "   ", "abc", null, undefined, 42]);
  // A short placeholder must not turn every 'abc' in real output into noise.
  assert.equal(redact("abc appears in this sentence"), "abc appears in this sentence");
});

test("redactor is safe on null and undefined", () => {
  const redact = createRedactor([SECRET]);
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), undefined);
});

test("redactor coerces non-string input before scanning", () => {
  const redact = createRedactor([SECRET]);
  assert.equal(redact(500), "500");
});

test("redactor handles a secret embedded in a realistic Jules API error", () => {
  const redact = createRedactor([SECRET]);
  const message = `Jules sendMessage 403 Forbidden: {"error":{"message":"key ${SECRET} lacks scope"}}`;
  const result = redact(message);
  assert.equal(result.includes(SECRET), false);
  assert.match(result, /Jules sendMessage 403 Forbidden/);
});

test("redactDeep scrubs nested ledger evidence before it is committed", () => {
  const redact = createRedactor([SECRET]);
  const evidence = {
    coverageLog: ".github/nightly-logs/03-baseline-consolidation-coverage.log",
    julesApiError: `Jules API 401 Unauthorized for ${SECRET}`,
    recovery: {
      ok: false,
      error: `request failed with key ${SECRET}`,
      attempts: [{ note: `retry using ${SECRET}` }],
    },
  };

  const scrubbed = redactDeep(evidence, redact);
  assert.equal(JSON.stringify(scrubbed).includes(SECRET), false);
  assert.equal(scrubbed.recovery.ok, false);
  assert.equal(scrubbed.coverageLog, evidence.coverageLog);
  assert.equal(scrubbed.recovery.attempts[0].note, `retry using ${REDACTED}`);
});

test("redactDeep preserves non-string types untouched", () => {
  const redact = createRedactor([SECRET]);
  const scrubbed = redactDeep({ count: 13, ok: true, missing: null, list: [1, 2] }, redact);
  assert.deepEqual(scrubbed, { count: 13, ok: true, missing: null, list: [1, 2] });
});

test("longer secrets are redacted before shorter overlapping ones", () => {
  const redact = createRedactor(["shortkey", "shortkey-with-suffix"]);
  assert.equal(redact("shortkey-with-suffix"), REDACTED);
});
