### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Verified PWA wrapper & APK packaging integrity: digital asset links, manifest parity, version code/name sync (14.55.14 / 14055014), release metadata pointer (clashmanager-v14.55.14+529.apk), and cleartext traffic prohibition

**Why:** Routine scheduled wrapper audit; no configuration or packaging drift detected

**Result:** pnpm audit:apk, pnpm apk:verify:source, and pnpm test:apk-release passed with 0 errors

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-11-03
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: Routine scheduled wrapper audit; no configuration or packaging drift detected
  Change: Verified PWA wrapper & APK packaging integrity: digital asset links, manifest parity, version code/name sync (14.55.14 / 14055014), release metadata pointer (clashmanager-v14.55.14+529.apk), and cleartext traffic prohibition
  Result: pnpm audit:apk, pnpm apk:verify:source, and pnpm test:apk-release passed with 0 errors
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: fb4105e590cb9d982751a12328b33b28d8dd75aa
-->
