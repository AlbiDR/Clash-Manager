### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Harden useConsoleMetadata interface contracts and inline logic annotations

**Why:** Document visibleCount parameter and ratio badge formatting in useConsoleMetadata.ts TSDoc interface contract

**Result:** PASSED (git diff --check clean and useConsoleMetadata unit tests 15/15 passed)

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useConsoleMetadata.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-20
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Document visibleCount parameter and ratio badge formatting in useConsoleMetadata.ts TSDoc interface contract
  Change: Harden useConsoleMetadata interface contracts and inline logic annotations
  Result: PASSED (git diff --check clean and useConsoleMetadata unit tests 15/15 passed)
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useConsoleMetadata.ts
  Nudges: 0
  Execution: cf447d30fce07df9a7a9cb25bd770a54726fb1f5
-->
