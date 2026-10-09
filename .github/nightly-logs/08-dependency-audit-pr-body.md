### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped supabase devDependency to ^2.120.0 in catalogs and updated pnpm-lock.yaml

**Why:** Routine Tier 1 minor bump of supabase CLI

**Result:** pnpm audit:version passed, pnpm test:nightly-lifecycle passed 62 of 62 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-09
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Routine Tier 1 minor bump of supabase CLI
  Change: Bumped supabase devDependency to ^2.120.0 in catalogs and updated pnpm-lock.yaml
  Result: pnpm audit:version passed, pnpm test:nightly-lifecycle passed 62 of 62 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: cc5a6023b335759a567f2e988b23f9fbefce7a77
-->
