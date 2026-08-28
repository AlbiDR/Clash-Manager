// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { LINKS, planLink, relativeTarget } from "./link-agent-dirs.mjs";

test("targets are relative so a clone works from any location", () => {
  // An absolute target would bake this machine's path into every checkout.
  for (const { link, target } of LINKS) {
    const rel = relativeTarget(link, target);
    assert.ok(!rel.startsWith("/"), `${link} target must be relative, got ${rel}`);
    assert.match(rel, /^\.\.\/\.github\/agents\//);
  }
});

test("every link points at something that actually exists", () => {
  for (const { target } of LINKS) {
    assert.ok(existsSync(target), `${target} must exist for the link to be meaningful`);
  }
});

test("a missing path is created and a correct one is left alone", () => {
  const opts = { exists: false, isSymlink: false, readLink: null };
  assert.equal(planLink(".claude/skills", ".github/agents/skills", opts).action, "create");

  const want = relativeTarget(".claude/skills", ".github/agents/skills");
  assert.equal(
    planLink(".claude/skills", ".github/agents/skills", { exists: true, isSymlink: true, readLink: want }).action,
    "ok",
    "an already-correct link must not be recreated on every install",
  );
});

test("a symlink pointing somewhere else is repointed", () => {
  const plan = planLink(".claude/skills", ".github/agents/skills", {
    exists: true, isSymlink: true, readLink: "../somewhere/else",
  });
  assert.equal(plan.action, "relink");
});

test("a real directory is never silently deleted", () => {
  // Someone's existing local setup. Removing a directory a person put there by
  // hand is not a trade an install script gets to make on their behalf.
  const plan = planLink(".claude/skills", ".github/agents/skills", {
    exists: true, isSymlink: false, readLink: null,
  });
  assert.equal(plan.action, "skip");
  assert.match(plan.reason, /real directory/);
});

test("both Claude and Antigravity share one skills library", () => {
  // The consolidation this whole change is for: one definition, every tool.
  const skillLinks = LINKS.filter(l => l.target === ".github/agents/skills");
  assert.deepEqual(skillLinks.map(l => l.link).sort(), [".agent/skills", ".claude/skills"]);
});
