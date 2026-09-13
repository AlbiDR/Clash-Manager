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

test("a violation after a named slot is not hidden by template truncation", () => {
  // The template block used to be matched with a non-greedy regex, so it ended
  // at the FIRST </template>. Any component using a named slot had everything
  // below that slot silently unexamined, and 18 of 77 .vue files in this
  // repository contain a nested <template>. These two files carry the same
  // violation and differ only by a slot above it; the second used to pass.
  const root = fixtureRoot();
  const before = `
<template>
  <div><select v-model="x"><option>a</option></select></div>
</template>
`;
  const after = `
<template>
  <div>
    <SomeCard>
      <template #label><span>hi</span></template>
    </SomeCard>
    <select v-model="x"><option>a</option></select>
  </div>
</template>
`;
  writeFileSync(path.join(root, "components", "Before.vue"), before);
  writeFileSync(path.join(root, "components", "After.vue"), after);

  const report = auditApkUx({ root });
  const flagged = report.violations.filter(v => v.code === "raw-select").map(v => path.basename(v.path));
  assert.deepEqual(flagged.sort(), ["After.vue", "Before.vue"], "both must be reported, not just the one without a slot");
});

test("an icon-only control with no accessible name is a violation", () => {
  // TalkBack is the screen reader on the Android device this app ships to, and
  // it announces an unlabelled control as nothing useful. The stage reported
  // PASS on 77 files every night while such buttons sat in the tree, because
  // none of its three rules asked whether a control could be named aloud.
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "IconOnly.vue"),
    `
<template>
  <button @click="go"><Icon name="chevron_down" size="20" /></button>
</template>
`,
  );

  const report = auditApkUx({ root });
  const found = report.violations.find(v => v.code === "icon-only-control-without-accessible-name");
  assert.ok(found, "must be reported");
  assert.match(found.message, /TalkBack/);
});

test("a named or labelled control is not reported", () => {
  // Precision over recall, deliberately. A rule that flags correctly labelled
  // buttons teaches its reader to skip the section. Each of these is a way a
  // control legitimately has a name.
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Named.vue"),
    `
<template>
  <div>
    <button aria-label="Expand"><Icon name="chevron_down" /></button>
    <button :aria-label="dynamicLabel"><Icon name="close" /></button>
    <button title="Refresh"><Icon name="refresh" /></button>
    <button><Icon name="save" /> Save</button>
    <button>Plain text</button>
  </div>
</template>
`,
  );

  const report = auditApkUx({ root });
  assert.deepEqual(report.violations.filter(v => v.code === "icon-only-control-without-accessible-name"), []);
});
