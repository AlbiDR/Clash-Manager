### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip to ^6.43.0 in monorepo catalogs

**Why:** Tier 1 automated patch bump for knip

**Result:** pnpm test:nightly-control-plane passed all tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-25
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 automated patch bump for knip
  Change: Bumped knip to ^6.43.0 in monorepo catalogs
  Result: pnpm test:nightly-control-plane passed all tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 65b8a592d09e2eff5c704f75030107fb291a00ce
-->
