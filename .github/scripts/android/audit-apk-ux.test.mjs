// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { auditApkUx } from "./audit-apk-ux.mjs";

function fixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "apk-ux-audit-"));
  mkdirSync(path.join(root, "components"), { recursive: true });
  return root;
}

test("passes custom selectors and isolated external links", () => {
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Settings.vue"),
    `
<template>
  <BaseSelect :options="options" />
  <a href="https://example.com" target="_blank" rel="noopener noreferrer">Docs</a>
  <button v-tactile @click="save">Save</button>
</template>
<script setup>
const prose = "<select> inside script text is not a template control";
</script>
`,
  );

  const report = auditApkUx({ root });
  assert.equal(report.status, "PASS");
  assert.equal(report.violations.length, 0);
});

test("fails raw select controls and unsafe external anchors", () => {
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Unsafe.vue"),
    `
<template>
  <!-- <select> in an HTML comment is historical prose. -->
  <select>
    <option>Native sheet</option>
  </select>
  <a href="https://example.com">Docs</a>
</template>
`,
  );

  const report = auditApkUx({ root });
  assert.equal(report.status, "FAIL");
  assert.deepEqual(report.violations.map(item => item.code), ["raw-select", "external-link-isolation"]);
  assert.deepEqual(report.candidateFiles, [path.join(root, "components", "Unsafe.vue").replaceAll("\\", "/")]);
});

test("reports click observations without blocking clean runs", () => {
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Candidate.vue"),
    `
<template>
  <button @click="refresh">Refresh</button>
</template>
`,
  );

  const report = auditApkUx({ root });
  assert.equal(report.status, "PASS");
  assert.equal(report.violations.length, 0);
  assert.equal(report.observations[0].code, "click-without-local-haptic-evidence");
});

test("missing source root is degraded instead of clean", () => {
  const report = auditApkUx({ root: path.join(os.tmpdir(), "does-not-exist-apk-ux") });
  assert.equal(report.status, "DEGRADED");
  assert.match(report.error, /unavailable/);
});
