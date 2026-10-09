### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile StatusPill, BaseSelect, and ConfirmDialog documentation with useDismissOnBack integration

**Why:** doc-debt targets in shared/ui carry accurate useDismissOnBack back navigation overlay dismissal descriptions

**Result:** git diff --check clean, 219 vitest files passed (2299 tests)

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/shared/ui/README.md

**Verified accurate:** Frontend-PWA/src/shared/ui/StatusPill.vue, Frontend-PWA/src/shared/ui/BaseSelect.vue, Frontend-PWA/src/shared/ui/ConfirmDialog.vue

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-09
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: doc-debt targets in shared/ui carry accurate useDismissOnBack back navigation overlay dismissal descriptions
  Change: Reconcile StatusPill, BaseSelect, and ConfirmDialog documentation with useDismissOnBack integration
  Result: git diff --check clean, 219 vitest files passed (2299 tests)
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/shared/ui/README.md
  Verified: Frontend-PWA/src/shared/ui/StatusPill.vue, Frontend-PWA/src/shared/ui/BaseSelect.vue, Frontend-PWA/src/shared/ui/ConfirmDialog.vue
  Nudges: 0
  Execution: f530a1dd5eeb551b5d204d5674675ca40c848809
-->
