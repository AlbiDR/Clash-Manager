// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { auditDeadComponents } from "./audit-dead-components.mjs";

const SCRIPT = fileURLToPath(new URL("./audit-dead-components.mjs", import.meta.url));
const COMPONENT = "<template><div /></template>\n";

// A tsconfig with comments, as the real one has, so alias resolution goes
// through TypeScript's own reader rather than JSON.parse.
const TSCONFIG = `{
  // aliases mirror the shape of Frontend-PWA/tsconfig.app.json
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@ui": ["src/ui"], "@ui/*": ["src/ui/*"] },
  },
}
`;

function fixture(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dead-components-audit-"));
  for (const [relative, content] of Object.entries({ "tsconfig.json": TSCONFIG, ...files })) {
    const target = path.join(dir, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return { root: path.join(dir, "src"), tsconfig: path.join(dir, "tsconfig.json") };
}

test("passes components used by barrel name, path, alias, member access and template tag", () => {
  const options = fixture({
    "src/ui/index.ts": [
      'export { default as Alpha } from "./Alpha.vue";',
      "export { default as Beta } from './Beta.vue';",
      'export { default as GammaRay } from "./GammaRay.vue";',
      'export { default as DeltaView } from "./DeltaView.vue";',
      'export { default as Epsilon } from "./Epsilon.vue";',
    ].join("\n"),
    "src/ui/Alpha.vue": COMPONENT,
    "src/ui/Beta.vue": COMPONENT,
    "src/ui/GammaRay.vue": COMPONENT,
    "src/ui/DeltaView.vue": COMPONENT,
    "src/ui/Epsilon.vue": COMPONENT,
    "src/app/Main.vue": '<script setup lang="ts">\nimport { Alpha } from "@ui";\n</script>\n<template><Alpha /></template>\n',
    "src/app/use-beta.ts": 'import Renamed from "../ui/Beta.vue";\nexport const beta = Renamed;\n',
    "src/app/Shell.vue": "<template><gamma-ray /></template>\n",
    "src/app/router.ts": 'export const route = () => import("@ui").then(m => m.DeltaView);\n',
    "src/app/use-epsilon.ts": 'import E from "@ui/Epsilon.vue";\nexport const epsilon = E;\n',
  });

  const report = auditDeadComponents(options);
  assert.equal(report.status, "PASS", report.error);
  assert.equal(report.componentsExamined, 5);
  assert.deepEqual(report.violations, []);
});

test("fails a component that only tests, comments, strings, type imports and re-exports mention", () => {
  const options = fixture({
    "src/ui/index.ts": 'export { default as Alpha } from "./Alpha.vue";\nexport { default as Ghost } from "./Ghost.vue";\n',
    "src/ui/Alpha.vue": COMPONENT,
    "src/ui/Ghost.vue": '<script setup lang="ts">\ndefineOptions({ name: "Ghost" });\n</script>\n<template><div /></template>\n',
    "src/ui/ui-tests/Ghost.spec.ts": 'import Ghost from "../Ghost.vue";\nimport { Ghost as G } from "@ui";\nexport { Ghost, G };\n',
    "src/ui/ui-tests/helpers.ts": 'import Ghost from "../Ghost.vue";\nexport const stub = Ghost;\n',
    "src/app/Main.vue": '<script setup lang="ts">\nimport { Alpha } from "@ui";\n</script>\n<template><Alpha /><!-- <Ghost /> --><p>Ghost</p></template>\n',
    "src/app/notes.ts": '// Ghost used to render here.\nimport type { Ghost } from "./types";\nexport const label: Ghost | string = "Ghost";\n',
    "src/outer/index.ts": 'export { Ghost } from "@ui";\n',
  });

  const report = auditDeadComponents(options);
  assert.equal(report.status, "FAIL", report.error);
  assert.deepEqual(report.violations.map(item => [item.name, item.line]), [["Ghost", 2]]);
});

test("a same-named export of an npm package does not keep a component alive", () => {
  const options = fixture({
    "src/ui/index.ts": 'export { default as Ghost } from "./Ghost.vue";\n',
    "src/ui/Ghost.vue": COMPONENT,
    "src/app/use-kit.ts": 'import { Ghost } from "some-ui-kit";\nexport const kit = Ghost;\n',
  });

  const report = auditDeadComponents(options);
  assert.equal(report.status, "FAIL", report.error);
  assert.deepEqual(report.violations.map(item => item.name), ["Ghost"]);
});

test("returns DEGRADED rather than PASS when no barrel components are found", () => {
  const options = fixture({
    "src/ui/index.ts": 'export { helper } from "./helper";\n',
    "src/ui/helper.ts": "export const helper = 1;\n",
  });

  const report = auditDeadComponents(options);
  assert.equal(report.status, "DEGRADED");
  assert.match(report.error, /cannot answer/);
});

test("returns DEGRADED for a barrel form or component path it cannot interpret", () => {
  const starExport = auditDeadComponents(
    fixture({
      "src/ui/index.ts": 'export { default as Alpha } from "./Alpha.vue";\nexport * from "./Beta.vue";\n',
      "src/ui/Alpha.vue": COMPONENT,
      "src/ui/Beta.vue": COMPONENT,
      "src/app/a.ts": 'import { Alpha } from "@ui";\nexport const a = Alpha;\n',
    }),
  );
  assert.equal(starExport.status, "DEGRADED");
  assert.deepEqual(starExport.unsupported.map(item => item.line), [2]);

  const unknownAlias = auditDeadComponents(
    fixture({
      "src/ui/index.ts": 'export { default as Alpha } from "./Alpha.vue";\n',
      "src/ui/Alpha.vue": COMPONENT,
      "src/app/a.ts": 'import { Alpha } from "@ui";\nimport Lost from "~nowhere/Lost.vue";\nexport const a = [Alpha, Lost];\n',
    }),
  );
  assert.equal(unknownAlias.status, "DEGRADED");
  assert.match(unknownAlias.unsupported[0].detail, /~nowhere\/Lost\.vue/);
});

test("the CLI exits 1 on a dead component and 0 on a clean tree", () => {
  const dead = fixture({
    "src/ui/index.ts": 'export { default as Ghost } from "./Ghost.vue";\n',
    "src/ui/Ghost.vue": COMPONENT,
  });
  const failed = spawnSync(process.execPath, [SCRIPT, "--root", dead.root, "--tsconfig", dead.tsconfig], { encoding: "utf8" });
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stdout, /Ghost .* has no consumer outside tests/);

  const clean = fixture({
    "src/ui/index.ts": 'export { default as Alpha } from "./Alpha.vue";\n',
    "src/ui/Alpha.vue": COMPONENT,
    "src/app/a.ts": 'import { Alpha } from "@ui";\nexport const a = Alpha;\n',
  });
  const passed = spawnSync(process.execPath, [SCRIPT, "--root", clean.root, "--tsconfig", clean.tsconfig], { encoding: "utf8" });
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
});
