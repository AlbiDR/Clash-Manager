### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip devDependency from ^6.44.1 to ^6.44.2 in monorepo catalogs and updated lockfile

**Why:** Safe automated Tier 1 patch maintenance bump for monorepo devDependency knip

**Result:** pnpm install updated pnpm-lock.yaml, knip executed cleanly

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-08
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe automated Tier 1 patch maintenance bump for monorepo devDependency knip
  Change: Bumped knip devDependency from ^6.44.1 to ^6.44.2 in monorepo catalogs and updated lockfile
  Result: pnpm install updated pnpm-lock.yaml, knip executed cleanly
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: dfed510783578a6ad5f70dcd51ce29e5a9b5c8a0
-->
