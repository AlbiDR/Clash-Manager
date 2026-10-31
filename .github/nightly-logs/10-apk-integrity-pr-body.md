### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Verified asset links, manifest parity, version code/name sync (14055014/14.55.14), release metadata (clashmanager-v14.55.14+529.apk), and cleartext traffic policy

**Why:** Daily audit of PWA wrapper configuration and APK packaging boundaries confirmed all invariants hold

**Result:** pnpm audit:apk, pnpm apk:verify, pnpm apk:verify:source, and pnpm test:apk-release passed 11 of 11 tests with 0 drift

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-10-31
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: Daily audit of PWA wrapper configuration and APK packaging boundaries confirmed all invariants hold
  Change: Verified asset links, manifest parity, version code/name sync (14055014/14.55.14), release metadata (clashmanager-v14.55.14+529.apk), and cleartext traffic policy
  Result: pnpm audit:apk, pnpm apk:verify, pnpm apk:verify:source, and pnpm test:apk-release passed 11 of 11 tests with 0 drift
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: 3924161f2819981e309143f213fa39c12c319ea0
-->
