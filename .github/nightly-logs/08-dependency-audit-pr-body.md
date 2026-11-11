### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip devDependency from ^6.44.2 to ^6.45.0 in monorepo catalogs and updated lockfile

**Why:** Tier 1 patch/minor dependency bump to keep static analysis tooling up to date

**Result:** knip 6.45.0 executed successfully, audit:version reported 0 drift lines across 3 manifests, test:nightly-lifecycle passed 65 of 65

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-11
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 patch/minor dependency bump to keep static analysis tooling up to date
  Change: Bumped knip devDependency from ^6.44.2 to ^6.45.0 in monorepo catalogs and updated lockfile
  Result: knip 6.45.0 executed successfully, audit:version reported 0 drift lines across 3 manifests, test:nightly-lifecycle passed 65 of 65
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 8970c0ec8c029eac6be52d8f6ea23856d4482e68
-->
