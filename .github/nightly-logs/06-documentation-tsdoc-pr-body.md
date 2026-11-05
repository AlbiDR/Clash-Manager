### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden apkResolverUtils interface contracts and inline decision annotations

**Why:** Documented exported release version, build number, SHA-256 digest, and byte size validation type guards to prevent interface drift across APK release resolution boundaries

**Result:** Vitest apkResolver.spec.ts passed 31 of 31 tests, full frontend suite passed 2376 of 2376 tests, vue-tsc passed with 0 errors

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/apkResolverUtils.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-05
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented exported release version, build number, SHA-256 digest, and byte size validation type guards to prevent interface drift across APK release resolution boundaries
  Change: docs(tsdoc): harden apkResolverUtils interface contracts and inline decision annotations
  Result: Vitest apkResolver.spec.ts passed 31 of 31 tests, full frontend suite passed 2376 of 2376 tests, vue-tsc passed with 0 errors
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/apkResolverUtils.ts
  Nudges: 0
  Execution: 7482ee6f835c7dce4582860bb03d68bce51221b2
-->
