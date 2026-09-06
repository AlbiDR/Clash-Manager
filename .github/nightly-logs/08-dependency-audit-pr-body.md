### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue-tsc to ^3.3.11 and aligned package.json catalog entries with pnpm-workspace.yaml

**Why:** Safe patch bump for vue-tsc and catalog synchronization across monorepo root

**Result:** PASS

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Safe patch bump for vue-tsc and catalog synchronization across monorepo root
  Change: Bumped vue-tsc to ^3.3.11 and aligned package.json catalog entries with pnpm-workspace.yaml
  Result: PASS
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
-->
