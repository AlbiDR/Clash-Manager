// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCEPTED_DUPLICATES,
  collectRepoNames,
  evaluateDuplicates,
  externalSearchRoots,
  renderAuditReport,
  slugify,
} from "./agents-audit.mjs";

test("names from different tools normalise to the same identity", () => {
  // Antigravity writes "Commit Push SemVer.md", Claude writes a directory named
  // "commit-push-semver". They are the same definition and must compare equal,
  // or every duplicate would slip through on spelling alone.
  assert.equal(slugify("Commit Push SemVer.md"), "commit-push-semver");
  assert.equal(slugify("Nightly Recap.md"), "nightly-recap");
  assert.equal(slugify("nightly-recap"), "nightly-recap");
  assert.equal(slugify("  SemVer.md "), "semver");
  assert.equal(slugify(null), "");
});

test("an external copy of a repository-owned definition is a finding", () => {
  const result = evaluateDuplicates(
    ["nightly-recap", "release"],
    [{ name: "Nightly Recap.md", path: "/elsewhere/Nightly Recap.md" }],
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].name, "nightly-recap");
});

test("a definition this repository does not own is ignored", () => {
  // ocd-project and goal are the user's own global skills and none of this
  // repository's business.
  const result = evaluateDuplicates(
    ["nightly-recap"],
    [{ name: "ocd-project", path: "/elsewhere/ocd-project/SKILL.md" }],
  );
  assert.deepEqual(result.findings, []);
});

test("knowingly accepted duplicates do not become permanent noise", () => {
  // An audit that always prints a finding is one nobody reads, which is exactly
  // how the stale copies survived for months.
  const result = evaluateDuplicates(
    ["question"],
    [{ name: "Question.md", path: "/elsewhere/Question.md" }],
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.accepted.length, 1);
  assert.ok(ACCEPTED_DUPLICATES.has("question"));
});

test("a clean machine reports an all-clear that still names what was accepted", () => {
  const report = renderAuditReport({ findings: [], accepted: [{ name: "question", path: "/x" }] });
  assert.match(report, /no unexpected definition/);
  assert.match(report, /Known and accepted \(1\): question/);
});

test("a finding names the file and says why deleting it does not hold", () => {
  const report = renderAuditReport({
    findings: [{ name: "nightly-recap", path: "/somewhere/SKILL.md" }],
    accepted: [],
  });
  assert.match(report, /nightly-recap/);
  assert.match(report, /somewhere\/SKILL\.md/);
  assert.match(report, /owning tool's own UI/);
  assert.match(report, /re-materialised/);
});

test("the repository's own definitions are discovered", () => {
  const names = collectRepoNames().map(slugify);
  for (const expected of ["nightly-recap", "release", "semver", "commit-push-semver"]) {
    assert.ok(names.includes(expected), `${expected} must be discovered under .github/agents/`);
  }
});

test("external roots are absolute and tolerate absence", () => {
  const roots = externalSearchRoots("/home/someone");
  assert.ok(roots.every(r => r.startsWith("/home/someone")));
  // Not every tool is installed on every machine; a missing root is normal.
  assert.deepEqual(evaluateDuplicates(["x"], []).findings, []);
});
