### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconciled useClashSyncUtils timeout and transient retry engine details in core services README

**Why:** Document SYNC_REQUEST_TIMEOUT_MS update (25s) and SYNC_RETRY_DELAYS_MS transient transport retry sequence

**Result:** git diff --check clean and useClashSyncUtils.spec.ts passed 12/12

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-19
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document SYNC_REQUEST_TIMEOUT_MS update (25s) and SYNC_RETRY_DELAYS_MS transient transport retry sequence
  Change: Reconciled useClashSyncUtils timeout and transient retry engine details in core services README
  Result: git diff --check clean and useClashSyncUtils.spec.ts passed 12/12
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 7c81e63fe07be9543df0bf97fb1cd01f649ccf1b
-->
