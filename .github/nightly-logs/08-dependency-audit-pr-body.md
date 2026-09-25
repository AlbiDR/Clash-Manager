### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- pnpm-workspace.yaml -- pnpm-lock.yaml -- Bumped dependency-cruiser to ^18.4.0 and re-locked dependencies

**Why:** Tier 1 automated minor bump for dependency-cruiser and watchlist maintenance

**Result:** PASS: pnpm test and pnpm test:nightly-control-plane passed

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-25
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 automated minor bump for dependency-cruiser and watchlist maintenance
  Change: package.json -- pnpm-workspace.yaml -- pnpm-lock.yaml -- Bumped dependency-cruiser to ^18.4.0 and re-locked dependencies
  Result: PASS: pnpm test and pnpm test:nightly-control-plane passed
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 120208e423c16582c0f0ce205a168538f6f4790d
-->
