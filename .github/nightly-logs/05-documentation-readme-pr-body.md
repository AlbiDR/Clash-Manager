### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile useNativeBridge architecture, permission brokering, lifecycle re-hydration, and Blitz telemetry contracts in core services README

**Why:** Reconcile core services README with recent Stage 6 contract hardening and Stage 2 unit test expansion in useNativeBridge.ts

**Result:** git diff --check passed with 0 errors; pnpm -C Frontend-PWA test useNativeBridge.spec.ts passed 16 of 16 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-10
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Reconcile core services README with recent Stage 6 contract hardening and Stage 2 unit test expansion in useNativeBridge.ts
  Change: Reconcile useNativeBridge architecture, permission brokering, lifecycle re-hydration, and Blitz telemetry contracts in core services README
  Result: git diff --check passed with 0 errors; pnpm -C Frontend-PWA test useNativeBridge.spec.ts passed 16 of 16 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 231fb2ee525073135d7beeedc16d0f43b63d8bcc
-->
