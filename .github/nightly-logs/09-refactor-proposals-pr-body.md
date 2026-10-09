### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 2 code files, so the app's behaviour may be affected. It also updates 1 test file.

**What changed:** Extracted sync failure classification and backoff span utilities from useClashSync into useClashSyncUtils

**Why:** Satisfied Target B / SRP by decomposing oversized service file useClashSync.ts and extracting stateless pure utilities into useClashSyncUtils.ts

**Result:** PASS: vue-tsc type-check, vitest unit tests (2307 passed), depcruise zero violations

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/core/services/services-tests/useClashSyncUtils.spec.ts, Frontend-PWA/src/core/services/useClashSync.ts, Frontend-PWA/src/core/services/useClashSyncUtils.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Cycle: nightly-cycle/2026-10-09
  Contract: 401ccac4d9a8ca083bc5492dd8958aca42a02d1f4857914b074fb6ad6b2e53f1
  Why: Satisfied Target B / SRP by decomposing oversized service file useClashSync.ts and extracting stateless pure utilities into useClashSyncUtils.ts
  Change: Extracted sync failure classification and backoff span utilities from useClashSync into useClashSyncUtils
  Result: PASS: vue-tsc type-check, vitest unit tests (2307 passed), depcruise zero violations
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/core/services/services-tests/useClashSyncUtils.spec.ts, Frontend-PWA/src/core/services/useClashSync.ts, Frontend-PWA/src/core/services/useClashSyncUtils.ts
  Nudges: 0
  Execution: b0495a5c9cb9fd65cd1c52c1896185c4cbee7b51
-->
