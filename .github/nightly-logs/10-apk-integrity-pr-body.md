### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Audited APK and PWA wrapper integrity across asset links, manifest parity, version codes/names, release metadata, and security policies; all invariants fully aligned.

**Why:** Full audit verified that package names (com.albidr.clashmanager), SHA-256 fingerprints, manifest theme/background colors (#0b0e14), app version (14.50.21), release file (APK/release/latest.json pointing to clashmanager-v14.50.3+279.apk), and cleartext traffic policies are synchronized and valid without requiring source edits.

**Result:** Verified via pnpm audit:apk (all 25 assertions passed) and pnpm test:version-code (11 unit tests passed).

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Why: Full audit verified that package names (com.albidr.clashmanager), SHA-256 fingerprints, manifest theme/background colors (#0b0e14), app version (14.50.21), release file (APK/release/latest.json pointing to clashmanager-v14.50.3+279.apk), and cleartext traffic policies are synchronized and valid without requiring source edits.
  Change: Audited APK and PWA wrapper integrity across asset links, manifest parity, version codes/names, release metadata, and security policies; all invariants fully aligned.
  Result: Verified via pnpm audit:apk (all 25 assertions passed) and pnpm test:version-code (11 unit tests passed).
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
-->
