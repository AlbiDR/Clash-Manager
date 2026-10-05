### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped supabase devDependency from ^2.118.0 to ^2.119.0 in monorepo catalogs and updated pnpm-lock.yaml

**Why:** Maintenance patch update for Supabase CLI devDependency

**Result:** All workspace unit tests passed

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-05
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Maintenance patch update for Supabase CLI devDependency
  Change: Bumped supabase devDependency from ^2.118.0 to ^2.119.0 in monorepo catalogs and updated pnpm-lock.yaml
  Result: All workspace unit tests passed
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 71c9e6f1f527974ff83b417b5e1b2793737b8168
-->
