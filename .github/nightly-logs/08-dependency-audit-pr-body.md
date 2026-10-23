### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @vue/test-utils to ^2.5.1 and updated major version watchlist

**Why:** Safe patch update for @vue/test-utils within Tier 1 scope

**Result:** pnpm install and pnpm test passed (2359 passed)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-23
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe patch update for @vue/test-utils within Tier 1 scope
  Change: Bumped @vue/test-utils to ^2.5.1 and updated major version watchlist
  Result: pnpm install and pnpm test passed (2359 passed)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 2b304c7d231c4f9b7faf5c914fc592a052e73c81
-->
