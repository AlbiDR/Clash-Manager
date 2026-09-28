### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 2 code files, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Eliminate dead components barrel index export in roster feature

**Why:** ADR target Target B dead-export removal identified by knip scan

**Result:** pnpm test and depcruise passed clean with 0 violations

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/features/roster/components/index.ts, Frontend-PWA/src/features/roster/views/RosterView.vue

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Cycle: nightly-cycle/2026-09-28
  Contract: 401ccac4d9a8ca083bc5492dd8958aca42a02d1f4857914b074fb6ad6b2e53f1
  Why: ADR target Target B dead-export removal identified by knip scan
  Change: Eliminate dead components barrel index export in roster feature
  Result: pnpm test and depcruise passed clean with 0 violations
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/features/roster/components/index.ts, Frontend-PWA/src/features/roster/views/RosterView.vue
  Nudges: 0
  Execution: 673cfa1e8296b02c62dfa70eb926a8cb481664fe
-->
