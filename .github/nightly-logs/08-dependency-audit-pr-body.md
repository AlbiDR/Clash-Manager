### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped supabase devDependency from ^2.117.0 to ^2.118.0

**Why:** Safe Tier 1 minor bump for supabase CLI in workspace catalogs

**Result:** pnpm audit:version reported 0 drift lines, pnpm test passed 2102 of 2102 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-30
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 minor bump for supabase CLI in workspace catalogs
  Change: Bumped supabase devDependency from ^2.117.0 to ^2.118.0
  Result: pnpm audit:version reported 0 drift lines, pnpm test passed 2102 of 2102 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 60b4f87ff590b834b373377ff6868bdcdbc79646
-->
