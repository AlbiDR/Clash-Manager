### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip from ^6.41.0 to ^6.42.0 in monorepo catalogs

**Why:** Tier 1 minor maintenance update for knip static analyzer

**Result:** pnpm knip verified and test:nightly-control-plane passed

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-19
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 minor maintenance update for knip static analyzer
  Change: Bumped knip from ^6.41.0 to ^6.42.0 in monorepo catalogs
  Result: pnpm knip verified and test:nightly-control-plane passed
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 8b59fe13f6be4adda1296f9c16196db54a616d4d
-->
