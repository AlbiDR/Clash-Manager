### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js catalog entry from ^2.117.3 to ^2.118.0 in package.json and pnpm-workspace.yaml

**Why:** Applied Tier 1 minor version maintenance bump

**Result:** pnpm-test Frontend-PWA passed 2351 of 2353 tests, pnpm audit:version reported 0 drift lines

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-16
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Applied Tier 1 minor version maintenance bump
  Change: Bumped @supabase/supabase-js catalog entry from ^2.117.3 to ^2.118.0 in package.json and pnpm-workspace.yaml
  Result: pnpm-test Frontend-PWA passed 2351 of 2353 tests, pnpm audit:version reported 0 drift lines
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: af24ccd09e45cac8961307417e64003de130b7d6
-->
