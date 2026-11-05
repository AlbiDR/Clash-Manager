### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js to ^2.119.0 in monorepo catalogs and updated lockfile

**Why:** Safe automated minor bump within Tier 1 scope

**Result:** pnpm audit:version passed, Frontend-PWA test passed 2376 of 2376, type-check clean

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-05
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe automated minor bump within Tier 1 scope
  Change: Bumped @supabase/supabase-js to ^2.119.0 in monorepo catalogs and updated lockfile
  Result: pnpm audit:version passed, Frontend-PWA test passed 2376 of 2376, type-check clean
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 7482ee6f835c7dce4582860bb03d68bce51221b2
-->
