### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped simple-git-hooks to ^2.14.0 in monorepo catalogs and updated lockfile

**Why:** Apply safe Tier 1 minor bump to simple-git-hooks and keep persistent watchlist up to date

**Result:** simple-git-hooks ^2.14.0 installed, pnpm test:commit-trailers passed

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-06
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 minor bump to simple-git-hooks and keep persistent watchlist up to date
  Change: Bumped simple-git-hooks to ^2.14.0 in monorepo catalogs and updated lockfile
  Result: simple-git-hooks ^2.14.0 installed, pnpm test:commit-trailers passed
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 4e1a9752f9601a272ceed6f190d53e15ee32df12
-->
