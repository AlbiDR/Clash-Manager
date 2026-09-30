### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Removed dead export ViewOptionsProps from ViewOptions.vue

**Why:** Target B4 dead export removal per knip report

**Result:** PASSED (knip check and monorepo tests pass)

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/shared/ui/ViewOptions.vue

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Cycle: nightly-cycle/2026-09-30
  Contract: 401ccac4d9a8ca083bc5492dd8958aca42a02d1f4857914b074fb6ad6b2e53f1
  Why: Target B4 dead export removal per knip report
  Change: Removed dead export ViewOptionsProps from ViewOptions.vue
  Result: PASSED (knip check and monorepo tests pass)
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/shared/ui/ViewOptions.vue
  Nudges: 0
  Execution: e95213da645028bb53825e3e83f53e1e44746c5e
-->
