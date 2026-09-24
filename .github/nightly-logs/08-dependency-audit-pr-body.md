### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** pnpm-workspace.yaml -- Aligned catalog entries for @supabase/supabase-js (^2.117.0) and @vue/test-utils (^2.5.0) with package.json and re-locked dependencies

**Why:** Ensure pnpm-workspace.yaml monorepo catalog definitions match package.json and pnpm-lock.yaml

**Result:** pnpm test passed 2090/2090 tests and Frontend-PWA type-check completed with zero errors

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-24
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Ensure pnpm-workspace.yaml monorepo catalog definitions match package.json and pnpm-lock.yaml
  Change: pnpm-workspace.yaml -- Aligned catalog entries for @supabase/supabase-js (^2.117.0) and @vue/test-utils (^2.5.0) with package.json and re-locked dependencies
  Result: pnpm test passed 2090/2090 tests and Frontend-PWA type-check completed with zero errors
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 823748640af3478a27833b6d228bb42263609ba2
-->
