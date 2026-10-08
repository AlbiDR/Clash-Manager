### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js catalog entry from ^2.117.2 to ^2.117.3

**Why:** Safe Tier 1 patch bump for dependency hygiene

**Result:** pnpm test executed 219 test files and passed 2289 tests without errors

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-08
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch bump for dependency hygiene
  Change: Bumped @supabase/supabase-js catalog entry from ^2.117.2 to ^2.117.3
  Result: pnpm test executed 219 test files and passed 2289 tests without errors
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 07e296c6a0d628a84c24a1fc61cd537c7ac1d785
-->
