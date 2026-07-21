// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * bump-version.mjs
 * Usage: node .github/scripts/bump-version.mjs [patch|minor|major]
 * Bumps version in all three package.json files, then runs validate_project.ts
 * --fix to sync every other version reference in the monorepo automatically.
 */

import fs from "fs";
import { execSync } from "child_process";

const type = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(type)) {
  console.error(`Unknown bump type: ${type}. Use patch, minor, or major.`);
  process.exit(1);
}

const pkgPaths = [
  "package.json",
  "Frontend-PWA/package.json",
  "Backend/package.json",
];

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Bump all package.json files
let newVersion;
for (const pkgPath of pkgPaths) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  newVersion = bumpVersion(pkg.version, type);
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${pkgPath} → ${newVersion}`);
}

// Sync all other version references via the validator's --fix mode
console.log("\nSyncing all version references...");
execSync("npx tsx .github/scripts/validate_project.ts --fix", {
  stdio: "inherit",
});

console.log(`\nDone. Version bumped to ${newVersion}.`);
