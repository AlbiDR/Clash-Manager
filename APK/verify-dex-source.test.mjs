// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { APP_PACKAGE_DIR, D8_SYNTHETIC_DIR, compareCompiledClasses, isGeneratedResourceClass, readClasses } from "./verify-dex-source.mjs";

const app = (name) => `${APP_PACKAGE_DIR}/${name}`;
const classes = (entries) => new Map(Object.entries(entries));

test("identical compiled classes report no drift", () => {
  const fresh = classes({ [app("MainActivity")]: "a", [app("MainActivity$1")]: "b" });
  assert.deepEqual(compareCompiledClasses(fresh, new Map(fresh)), { missing: [], orphaned: [], differing: [] });
});

test("a source class absent from the dex, a changed class and a leftover class are each reported", () => {
  const fresh = classes({ [app("MainActivity")]: "new", [app("BlitzService")]: "same", [app("BlitzService$9")]: "added" });
  const committed = classes({ [app("MainActivity")]: "old", [app("BlitzService")]: "same", [app("BlitzService$13")]: "stale" });
  assert.deepEqual(compareCompiledClasses(fresh, committed), {
    missing: [app("BlitzService$9")],
    orphaned: [app("BlitzService$13")],
    differing: [app("MainActivity")],
  });
});

test("a d8 helper outside the app package that the dex lacks is reported as missing", () => {
  // The 2026-10-01 regression: records desugar to extend RecordTag, which d8
  // emits in its own package. A merge that copied only the app package shipped
  // without it and crashed on the phone; an app-package-only check passed it.
  const fresh = classes({ [app("Calibration")]: "record", [`${D8_SYNTHETIC_DIR}/RecordTag`]: "tag" });
  const committed = classes({ [app("Calibration")]: "record" });
  assert.deepEqual(compareCompiledClasses(fresh, committed).missing, [`${D8_SYNTHETIC_DIR}/RecordTag`]);
});

test("a d8 helper the source no longer needs is an orphan, but library classes and R never are", () => {
  const fresh = classes({ [app("MainActivity")]: "a" });
  const committed = classes({
    [app("MainActivity")]: "a",
    [app("R")]: "r",
    [app("R$string")]: "s",
    [`${D8_SYNTHETIC_DIR}/RecordTag`]: "tag",
    "androidx/core/app/NotificationCompat": "library",
  });
  assert.deepEqual(compareCompiledClasses(fresh, committed).orphaned, [`${D8_SYNTHETIC_DIR}/RecordTag`]);
});

test("isGeneratedResourceClass matches R and its nested classes only", () => {
  assert.equal(isGeneratedResourceClass(app("R")), true);
  assert.equal(isGeneratedResourceClass(app("R$string")), true);
  assert.equal(isGeneratedResourceClass(app("Receiver")), false);
});

test("readClasses reads every smali directory recursively, keyed by package path", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dex-source-"));
  try {
    const write = (dir, key, body) => {
      const file = path.join(root, dir, `${key}.smali`);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    };
    write("smali", app("MainActivity"), "main");
    write("smali_classes2", app("BlitzService"), "blitz");
    write("smali", `${D8_SYNTHETIC_DIR}/RecordTag`, "tag");
    write("original", app("NotSmali"), "ignored");
    assert.deepEqual(readClasses(root), classes({
      [app("MainActivity")]: "main",
      [app("BlitzService")]: "blitz",
      [`${D8_SYNTHETIC_DIR}/RecordTag`]: "tag",
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
