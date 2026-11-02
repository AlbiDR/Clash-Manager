### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Verified digital asset links, manifest parity, version code/name sync (14.55.14 / 14055014), release metadata (clashmanager-v14.55.14+529.apk), and cleartext traffic policy

**Why:** PWA wrapper and native package configurations are fully aligned with no mismatches found

**Result:** All wrapper invariants verified with pnpm audit:apk, pnpm apk:verify:source, pnpm test:apk-native, and pnpm test:apk-release

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-11-02
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: PWA wrapper and native package configurations are fully aligned with no mismatches found
  Change: Verified digital asset links, manifest parity, version code/name sync (14.55.14 / 14055014), release metadata (clashmanager-v14.55.14+529.apk), and cleartext traffic policy
  Result: All wrapper invariants verified with pnpm audit:apk, pnpm apk:verify:source, pnpm test:apk-native, and pnpm test:apk-release
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: 66db2fff73a0675dd263a137c9aa4fc7f9a4c548
-->
