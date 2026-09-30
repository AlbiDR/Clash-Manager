// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { APP_PACKAGE_DIR, compareAppClasses, isGeneratedResourceClass, readAppClasses } from "./verify-dex-source.mjs";

const classes = (entries) => new Map(Object.entries(entries));

test("identical app classes report no drift", () => {
  const fresh = classes({ MainActivity: "a", "MainActivity$1": "b" });
  assert.deepEqual(compareAppClasses(fresh, new Map(fresh)), { missing: [], orphaned: [], differing: [] });
});

test("a source class absent from the dex, a changed class and a leftover class are each reported", () => {
  const fresh = classes({ MainActivity: "new", BlitzService: "same", "BlitzService$9": "added" });
  const committed = classes({ MainActivity: "old", BlitzService: "same", "BlitzService$13": "stale" });
  assert.deepEqual(compareAppClasses(fresh, committed), {
    missing: ["BlitzService$9"],
    orphaned: ["BlitzService$13"],
    differing: ["MainActivity"],
  });
});

test("generated R classes in the dex are not orphans", () => {
  assert.equal(isGeneratedResourceClass("R"), true);
  assert.equal(isGeneratedResourceClass("R$string"), true);
  assert.equal(isGeneratedResourceClass("Receiver"), false);
  const committed = classes({ MainActivity: "a", R: "r", R$string: "s" });
  assert.deepEqual(compareAppClasses(classes({ MainActivity: "a" }), committed).orphaned, []);
});

test("readAppClasses collects app classes from every smali directory and nothing else", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dex-source-"));
  try {
    const write = (dir, pkg, name, body) => {
      mkdirSync(path.join(root, dir, pkg), { recursive: true });
      writeFileSync(path.join(root, dir, pkg, `${name}.smali`), body);
    };
    write("smali", APP_PACKAGE_DIR, "MainActivity", "main");
    write("smali_classes2", APP_PACKAGE_DIR, "BlitzService", "blitz");
    write("smali", path.join("androidx", "core"), "Library", "lib");
    write("original", APP_PACKAGE_DIR, "NotSmali", "ignored");
    assert.deepEqual(readAppClasses(root), classes({ MainActivity: "main", BlitzService: "blitz" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
