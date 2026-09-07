### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue-router to ^5.3.1 and updated major version watchlist

**Why:** Tier 1 minor bump to vue-router within declared range and updated Tier 2 major version watchlist in coverage log

**Result:** pnpm -F clash-manager-pwa run build passed cleanly with vue-tsc type-check and Vite build

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Tier 1 minor bump to vue-router within declared range and updated Tier 2 major version watchlist in coverage log
  Change: Bumped vue-router to ^5.3.1 and updated major version watchlist
  Result: pnpm -F clash-manager-pwa run build passed cleanly with vue-tsc type-check and Vite build
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
-->
