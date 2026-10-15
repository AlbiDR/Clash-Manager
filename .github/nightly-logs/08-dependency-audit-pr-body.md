### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped supabase devDependency from ^2.120.0 to ^2.121.0 in catalogs and updated pnpm-lock.yaml

**Why:** Apply safe Tier 1 patch bump

**Result:** pnpm audit:version passed 0 drift lines, pnpm test passed

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-15
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 patch bump
  Change: Bumped supabase devDependency from ^2.120.0 to ^2.121.0 in catalogs and updated pnpm-lock.yaml
  Result: pnpm audit:version passed 0 drift lines, pnpm test passed
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: b58b6d36cc51de923ac137900357707bf905e5fe
-->
