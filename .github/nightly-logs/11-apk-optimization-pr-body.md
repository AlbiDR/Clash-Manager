### Nightly Stage 11: APK Optimization - Native Wrapper Performance Engineer

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Configure WebSettings cache mode to LOAD_CACHE_ELSE_NETWORK in MainActivity

**Why:** Fulfill webview-cache-mode invariant required by APK performance audit

**Result:** Passed audit:apk-perf and test:apk-performance, test:apk-native

**Files changed:** .github/nightly-logs/11-apk-optimization-coverage.log, APK/src/com/albidr/clashmanager/MainActivity.java

<!--
NIGHTLY_PR_METADATA:
  Domain: apk
  Cycle: nightly-cycle/2026-10-12
  Contract: 63c0229fe16cf4c98e352282307edbee4830cff68ea2d93c5c967a1f5cbd30ea
  Why: Fulfill webview-cache-mode invariant required by APK performance audit
  Change: Configure WebSettings cache mode to LOAD_CACHE_ELSE_NETWORK in MainActivity
  Result: Passed audit:apk-perf and test:apk-performance, test:apk-native
  Files: .github/nightly-logs/11-apk-optimization-coverage.log, APK/src/com/albidr/clashmanager/MainActivity.java
  Nudges: 0
  Execution: d3a28a49fa1c2e1c4509930fd85b44824133260c
-->
