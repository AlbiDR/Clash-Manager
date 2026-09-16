### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- Bumped supabase devDependency from ^2.116.0 to ^2.117.0 in catalog

**Why:** Applied safe autonomous minor/patch version bump within current major range

**Result:** pnpm test passed 2005 of 2005 tests across 204 files; pnpm test:nightly-control-plane passed 122 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-16
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Applied safe autonomous minor/patch version bump within current major range
  Change: package.json -- Bumped supabase devDependency from ^2.116.0 to ^2.117.0 in catalog
  Result: pnpm test passed 2005 of 2005 tests across 204 files; pnpm test:nightly-control-plane passed 122 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: fa4691b5db4f3a98e72baa94aead90d3b02924b6
-->
