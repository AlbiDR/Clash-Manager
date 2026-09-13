### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js to ^2.116.0 in workspace catalog and updated major version watchlist.

**Why:** Routine Tier 1 dependency patch update and persistent watchlist sync.

**Result:** pnpm test passed 1829 tests across 195 test files

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Routine Tier 1 dependency patch update and persistent watchlist sync.
  Change: Bumped @supabase/supabase-js to ^2.116.0 in workspace catalog and updated major version watchlist.
  Result: pnpm test passed 1829 tests across 195 test files
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
-->
