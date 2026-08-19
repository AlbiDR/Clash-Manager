// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Redaction for the nightly control plane.
//
// The watchdog holds JULES_API_KEY because it deliberately calls the Jules API
// to resume stranded sessions. Every surface that can carry a secret outward
// (console lines, the step summary, and the committed ledger) must be routed
// through a redactor first. The repository is public, so a single unredacted
// error string is a real disclosure, not a hypothetical one.

// Google API keys are the concrete shape this pipeline handles. Kept as a
// backstop so a key that arrives from somewhere other than the configured
// secret is still caught.
const GOOGLE_API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{10,}/g;

// Below this length a "secret" is almost certainly a placeholder from a test or
// an empty env var. Replacing every occurrence of a 3-character string would
// corrupt unrelated output far more than it would protect anything.
const MIN_SECRET_LENGTH = 8;

export const REDACTED = "[REDACTED]";

export function createRedactor(secrets = []) {
  const values = [...new Set(
    (Array.isArray(secrets) ? secrets : [secrets])
      .filter(secret => typeof secret === "string")
      .map(secret => secret.trim())
      .filter(secret => secret.length >= MIN_SECRET_LENGTH),
  )].sort((a, b) => b.length - a.length);

  return function redact(input) {
    if (input === null || input === undefined) return input;
    let text = typeof input === "string" ? input : String(input);
    for (const value of values) {
      text = text.split(value).join(REDACTED);
    }
    return text.replace(GOOGLE_API_KEY_PATTERN, REDACTED);
  };
}

// Ledger evidence is committed to a public branch, so redaction has to reach
// nested values rather than only top-level strings.
export function redactDeep(value, redact) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(item => redactDeep(item, redact));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item, redact)]));
  }
  return value;
}
