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

test("a '>' inside a quoted attribute does not end the tag", () => {
  // Every scan read a tag as <name[^>]*>, which ends at the first ">" anywhere.
  // GhostBenchmarkHost.vue's stepper had a "<=" button that was reported and a
  // ">=" twin directly below it that no rule saw. These two buttons differ only
  // by that comparison; both must be reported by both rules.
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Stepper.vue"),
    `<template>
  <div>
    <button type="button" :disabled="position <= 1" @click="go(-1)"><Icon name="chevron_left" /></button>
    <button type="button" :disabled="position >= total" @click="go(1)"><Icon name="chevron_right" /></button>
  </div>
</template>
`,
  );

  const report = auditApkUx({ root });
  const lines = code => report[code === "click-without-local-haptic-evidence" ? "observations" : "violations"]
    .filter(item => item.code === code)
    .map(item => item.line);
  assert.deepEqual(lines("icon-only-control-without-accessible-name"), [3, 4]);
  assert.deepEqual(lines("click-without-local-haptic-evidence"), [3, 4]);
});

test("attributes after a quoted '>' still count", () => {
  // The other half of the same hole: the label and the haptics sit after the
  // comparison, where the old scan stopped reading. The second button has a
  // label but no haptics, so its observation proves the tag was read at all;
  // without it, "nothing reported" would also be what a blind scan prints.
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Labelled.vue"),
    `<template>
  <div>
    <button type="button" :disabled="position >= total" aria-label="Show later entry" v-tactile @click="go(1)"><Icon name="chevron_right" /></button>
    <button type="button" :disabled="position >= total" aria-label="Show last entry" @click="go(total)"><Icon name="last_page" /></button>
  </div>
</template>
`,
  );

  const report = auditApkUx({ root });
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.observations.map(item => item.line), [4]);
});

test("haptic evidence belongs to the element, not to the file", () => {
  // A file that mentions useHaptics used to exempt every click in it. Each
  // exempt control here is wired to haptics itself; the last one is not, and
  // sits in the same file.
  const root = fixtureRoot();
  const source = `<script setup lang="ts">
import { useHaptics } from "../composables/useHaptics";
const haptics = useHaptics();
const { tap: buzz } = useHaptics();
function selectOption(value: string) {
  haptics.tap();
  emit("select", value);
}
const open = () => {
  buzz();
};
function onPress() {
  haptics.tap();
}
// close() says "haptics.tap()" in this comment, which is not a call.
function close() {
  emit("close");
}
</script>

<template>
  <div>
    <button v-tactile @click="save">Save</button>
    <button @click="haptics.tap(); go()">Inline</button>
    <button @click.stop="selectOption('a')">Select</button>
    <button @click="open">Open</button>
    <button @click="go" @pointerdown="onPress">Press</button>
    <button @click="close">Close</button>
  </div>
</template>
`;
  writeFileSync(path.join(root, "components", "Mixed.vue"), source);

  const report = auditApkUx({ root });
  const flagged = report.observations.filter(item => item.code === "click-without-local-haptic-evidence").map(item => item.line);
  const closeLine = source.split("\n").findIndex(line => line.includes(">Close<")) + 1;
  assert.deepEqual(flagged, [closeLine], "only the Close button has no haptics of its own");
});

test("a handler from a composable is not evidence", () => {
  // A destructured function is not declared in this script, so there is no
  // body to read; the control is reported rather than assumed to vibrate.
  const root = fixtureRoot();
  writeFileSync(
    path.join(root, "components", "Composed.vue"),
    `<script setup lang="ts">
const haptics = useHaptics();
const { hide } = usePanel();
</script>

<template>
  <button @click="hide">Close</button>
</template>
`,
  );

  const report = auditApkUx({ root });
  assert.equal(report.observations.length, 1);
});
