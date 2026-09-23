### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- Bumped @supabase/supabase-js catalog entry from ^2.116.0 to ^2.117.0

**Why:** Apply safe minor bump within current major range for @supabase/supabase-js

**Result:** pnpm -r test passed 2076 of 2076 tests across 207 files

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-23
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe minor bump within current major range for @supabase/supabase-js
  Change: package.json -- Bumped @supabase/supabase-js catalog entry from ^2.116.0 to ^2.117.0
  Result: pnpm -r test passed 2076 of 2076 tests across 207 files
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json
  Nudges: 0
  Execution: de91f9d17221d62bc673e97b9bb81fc989b83126
-->
