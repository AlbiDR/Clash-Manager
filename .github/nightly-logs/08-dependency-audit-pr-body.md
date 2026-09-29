### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped valibot to ^1.5.0 in monorepo catalogs

**Why:** Routine Tier 1 minor update for schema validation library

**Result:** pnpm test passed all 2102 tests across 209 spec files

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-29
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Routine Tier 1 minor update for schema validation library
  Change: Bumped valibot to ^1.5.0 in monorepo catalogs
  Result: pnpm test passed all 2102 tests across 209 spec files
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 2f9282899b149c5ac42fb698c696ba58bc34e4b8
-->
