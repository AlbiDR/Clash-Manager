### Nightly Stage 11: APK Optimization - Native Wrapper Performance Engineer

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Excluded social sharing card asset from PWA precache footprint

**Why:** og-card.png (313 KB) is a social sharing preview image not required by the PWA runtime app shell; excluding it reduces precache footprint from 327.8 KB to 11.1 KB

**Result:** audit:apk-perf PASS, 6 files 11.1 KB precached

**Files changed:** .github/nightly-logs/11-apk-optimization-coverage.log, Frontend-PWA/vite.config.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Why: og-card.png (313 KB) is a social sharing preview image not required by the PWA runtime app shell; excluding it reduces precache footprint from 327.8 KB to 11.1 KB
  Change: Excluded social sharing card asset from PWA precache footprint
  Result: audit:apk-perf PASS, 6 files 11.1 KB precached
  Files: .github/nightly-logs/11-apk-optimization-coverage.log, Frontend-PWA/vite.config.ts
  Nudges: 0
-->
