### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Verified wrapper integrity: asset links, manifest parity, version code/name sync (v14.55.14 / 14055014), release metadata (clashmanager-v14.55.14+529.apk), and security policy (cleartext forbidden, targetSdk 36).

**Why:** Routine nightly Stage 10 APK integrity audit scan found all wrapper and manifest invariants aligned with zero mismatches.

**Result:** Passed pnpm audit:apk, pnpm apk:verify:source, and pnpm test:apk-release.

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-10-26
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: Routine nightly Stage 10 APK integrity audit scan found all wrapper and manifest invariants aligned with zero mismatches.
  Change: Verified wrapper integrity: asset links, manifest parity, version code/name sync (v14.55.14 / 14055014), release metadata (clashmanager-v14.55.14+529.apk), and security policy (cleartext forbidden, targetSdk 36).
  Result: Passed pnpm audit:apk, pnpm apk:verify:source, and pnpm test:apk-release.
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: b0e7ecaea1a3096d9406b4626ae560f860a03e09
-->
