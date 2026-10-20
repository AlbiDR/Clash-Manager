### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Calibration pass: verified asset links, manifest parity, version code/name sync, release metadata, and security policy across 8 ordinary CLEAN runs

**Why:** PWA and Android wrapper invariants match expected values across all checks during calibration pass

**Result:** Passed pnpm audit:apk, pnpm test:apk-native, pnpm test:version-code, and pnpm test:apk-release

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-10-20
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: PWA and Android wrapper invariants match expected values across all checks during calibration pass
  Change: Calibration pass: verified asset links, manifest parity, version code/name sync, release metadata, and security policy across 8 ordinary CLEAN runs
  Result: Passed pnpm audit:apk, pnpm test:apk-native, pnpm test:version-code, and pnpm test:apk-release
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: c6b0298293632b83c6bb77133f371831ec8ecaa1
-->
