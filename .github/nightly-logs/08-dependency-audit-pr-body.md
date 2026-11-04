### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this changes 1 code file and 3 dependency files, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Bumped eslint to ^10.14.0 in monorepo catalogs and updated lockfile

**Why:** Tier 1 minor bump to latest release within major version 10

**Result:** pnpm --dir Frontend-PWA run lint and test passed with 0 errors

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, Frontend-PWA/.claude/launch.json, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-04
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 minor bump to latest release within major version 10
  Change: Bumped eslint to ^10.14.0 in monorepo catalogs and updated lockfile
  Result: pnpm --dir Frontend-PWA run lint and test passed with 0 errors
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, Frontend-PWA/.claude/launch.json, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 02ac7d9b89212ed23be7199f2931421427eff49a
-->
