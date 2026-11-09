### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped eslint-plugin-vue from ^10.10.0 to ^10.12.0 in catalogs and updated pnpm-lock.yaml

**Why:** Safe automated minor bump for ESLint Vue plugin within current major v10

**Result:** eslint passed 0 errors, Vitest passed 221 test files across Backend and Frontend-PWA

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-09
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe automated minor bump for ESLint Vue plugin within current major v10
  Change: Bumped eslint-plugin-vue from ^10.10.0 to ^10.12.0 in catalogs and updated pnpm-lock.yaml
  Result: eslint passed 0 errors, Vitest passed 221 test files across Backend and Frontend-PWA
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 189c4ba9541349fcab370eddfee5943c2f4ba949
-->
