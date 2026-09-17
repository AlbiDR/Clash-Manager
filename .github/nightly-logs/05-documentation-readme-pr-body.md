### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconciled useHeaderScroll.ts hysteresis, pin veto, and KeepAlive lifecycle rules in shared composables README

**Why:** Document recent KeepAlive lifecycle verification and composable behavior in Frontend-PWA/src/shared/composables/README.md

**Result:** All 15 useHeaderScroll tests passed, git diff --check clean

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/shared/composables/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-17
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document recent KeepAlive lifecycle verification and composable behavior in Frontend-PWA/src/shared/composables/README.md
  Change: Reconciled useHeaderScroll.ts hysteresis, pin veto, and KeepAlive lifecycle rules in shared composables README
  Result: All 15 useHeaderScroll tests passed, git diff --check clean
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/shared/composables/README.md
  Nudges: 0
  Execution: 821c1f223dd76b9a4a46c1fd4479494bd9ecfcef
-->
