#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Refuses to push a non-merge commit that records no files.
 *
 * @remarks
 * A commit whose tree is identical to its parent's is indistinguishable from a
 * real one in the push output, so it reaches the remote unnoticed. On
 * 2026-09-13 a `chore(release)` bump landed this way: a concurrent session's
 * rebase autostashed the ten version manifests out of the index between
 * `version:bump` and `git commit`, so HEAD claimed 14.50.76 while every
 * manifest on disk still read .75.
 *
 * A merge commit with no files is normal and is never reported.
 */
import { execFileSync } from "node:child_process";

/**
 * Runs a git command and returns its trimmed stdout.
 *
 * @param args - Arguments passed to git.
 * @returns The trimmed stdout, or an empty string if git failed.
 */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/**
 * Commits that this push would send, newest first.
 *
 * @returns An array of commit hashes, empty when the range cannot be resolved.
 */
function commitsBeingPushed() {
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream) return [];
  return git(["rev-list", `${upstream}..HEAD`]).split("\n").filter(Boolean);
}

const hollow = commitsBeingPushed().filter((sha) => {
  const parentCount = git(["rev-list", "--parents", "-n1", sha]).split(" ").length - 1;
  if (parentCount !== 1) return false; // a merge may legitimately record nothing
  return git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]) === "";
});

if (hollow.length > 0) {
  console.error("\nPush refused: these commits record no files.\n");
  for (const sha of hollow) {
    console.error(`  ${sha.slice(0, 9)}  ${git(["log", "-1", "--format=%s", sha])}`);
  }
  console.error(
    "\nA commit whose tree matches its parent's looks identical to a real one once pushed.",
  );
  console.error(
    "Usually the staged changes were taken away mid-commit - a concurrent rebase autostash",
  );
  console.error(
    "is the known cause. Re-apply the change, verify with `git show --stat <sha>`, and amend.\n",
  );
  process.exit(1);
}
