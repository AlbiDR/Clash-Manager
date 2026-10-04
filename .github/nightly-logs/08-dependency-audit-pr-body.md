### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js from ^2.117.0 to ^2.117.2 in package.json and pnpm-workspace.yaml catalogs, and re-locked dependencies

**Why:** Tier 1 patch bump for @supabase/supabase-js to maintain ecosystem hygiene and update persistent major version watchlist

**Result:** pnpm test passed all 212 test files (2134 tests)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-04
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 patch bump for @supabase/supabase-js to maintain ecosystem hygiene and update persistent major version watchlist
  Change: Bumped @supabase/supabase-js from ^2.117.0 to ^2.117.2 in package.json and pnpm-workspace.yaml catalogs, and re-locked dependencies
  Result: pnpm test passed all 212 test files (2134 tests)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 86e761a562981b191408ec1660936c1bae5d2db3
-->
