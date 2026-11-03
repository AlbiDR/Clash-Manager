### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Frontend-PWA/src/core/services/useConfirm.ts -- docs(tsdoc): harden useConfirm TSDoc interface contracts and inline decision annotations

**Why:** Documented Layer 1 dialog confirmation contracts, exported UseConfirmReturn, and annotated modal lifecycle and singleton mechanics per ADR Section II

**Result:** vue-tsc type-check passed cleanly and vitest services-tests passed 40 files (600 of 600 tests)

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useConfirm.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-03
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented Layer 1 dialog confirmation contracts, exported UseConfirmReturn, and annotated modal lifecycle and singleton mechanics per ADR Section II
  Change: Frontend-PWA/src/core/services/useConfirm.ts -- docs(tsdoc): harden useConfirm TSDoc interface contracts and inline decision annotations
  Result: vue-tsc type-check passed cleanly and vitest services-tests passed 40 files (600 of 600 tests)
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useConfirm.ts
  Nudges: 0
  Execution: 437b30cd34c739a0d778f099c55a3f1450e9a73d
-->
