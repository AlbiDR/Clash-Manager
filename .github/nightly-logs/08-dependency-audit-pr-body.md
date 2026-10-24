### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped supabase devDependency from ^2.121.0 to ^2.122.0

**Why:** Apply safe Tier 1 patch update for supabase

**Result:** pnpm test passed 220 test files and 2359 unit tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-24
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 patch update for supabase
  Change: Bumped supabase devDependency from ^2.121.0 to ^2.122.0
  Result: pnpm test passed 220 test files and 2359 unit tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: bc1172098b9a1bafdd6f708606eb06640842f1c5
-->
