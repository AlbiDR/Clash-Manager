### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip devDependency to ^6.37.0 and updated major version watchlist

**Why:** Applied safe patch/minor Tier 1 maintenance bump for knip and logged breaking changes for Tier 2 major dependencies

**Result:** pnpm knip executed cleanly and pnpm test passed 205 test files (2041 tests)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-20
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Applied safe patch/minor Tier 1 maintenance bump for knip and logged breaking changes for Tier 2 major dependencies
  Change: Bumped knip devDependency to ^6.37.0 and updated major version watchlist
  Result: pnpm knip executed cleanly and pnpm test passed 205 test files (2041 tests)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 75e31363f2a32cce2d4e0add97358f43aa04f78c
-->
