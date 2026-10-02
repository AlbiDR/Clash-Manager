### Nightly Stage 10: APK Integrity - PWA Wrapper Auditor

**Status:** CLEAN

In plain terms: nothing needed fixing. This run checked the APK integrity area and found it already correct, so the only file here is the log recording that the check happened.

**What was checked:** Verified APK and PWA wrapper integrity across asset links, manifest parity, version sync, release metadata, and security policy

**Why:** All wrapper configuration properties align cleanly across web manifest, twa-manifest.json, apktool.yml, assetlinks.json, latest.json, and AndroidManifest.xml

**Result:** pnpm audit:apk and pnpm apk:verify:source verified asset links, manifest parity, version 14.50.121/14050121 sync, clashmanager-v14.50.121+422.apk release metadata, and cleartext traffic prohibition

**Files changed:** .github/nightly-logs/10-apk-integrity-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-10-02
  Contract: 4f9b40864d05ffea731090b36800572dd7affedd8532fcd17c8ded8c9e2fbc12
  Why: All wrapper configuration properties align cleanly across web manifest, twa-manifest.json, apktool.yml, assetlinks.json, latest.json, and AndroidManifest.xml
  Change: Verified APK and PWA wrapper integrity across asset links, manifest parity, version sync, release metadata, and security policy
  Result: pnpm audit:apk and pnpm apk:verify:source verified asset links, manifest parity, version 14.50.121/14050121 sync, clashmanager-v14.50.121+422.apk release metadata, and cleartext traffic prohibition
  Files: .github/nightly-logs/10-apk-integrity-coverage.log
  Nudges: 0
  Execution: 0c24feba95e1534ea4eda7fd202cb99022ecaed9
-->
