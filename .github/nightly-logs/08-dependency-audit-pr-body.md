### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @supabase/supabase-js to ^2.116.0 and updated major version watchlist

**Why:** Safe Tier 1 minor bump and ongoing Tier 2 watchlist tracking

**Result:** pnpm test passed 195/195 test files (1823 tests passed)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Safe Tier 1 minor bump and ongoing Tier 2 watchlist tracking
  Change: Bumped @supabase/supabase-js to ^2.116.0 and updated major version watchlist
  Result: pnpm test passed 195/195 test files (1823 tests passed)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml
  Nudges: 0
-->
