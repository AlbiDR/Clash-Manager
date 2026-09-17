### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 3 code files, so the app's behaviour may be affected. It also updates 1 test file.

**What changed:** Removed internal-only dead exports across Backend and Frontend-PWA

**Why:** Realignment with SRP and ADR Section II by purging unused internal exports reported by knip

**Result:** All 2017 PWA tests and 277 Backend tests passed; 0 depcruise violations

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Backend/supabase/functions/_shared/royaleSchemas.ts, Backend/supabase/functions/_shared/types.ts, Frontend-PWA/src/core/theme/theme-tests/wcag.ts, Frontend-PWA/src/shared/directives/ghostBenchmarkState.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Cycle: nightly-cycle/2026-09-17
  Contract: 401ccac4d9a8ca083bc5492dd8958aca42a02d1f4857914b074fb6ad6b2e53f1
  Why: Realignment with SRP and ADR Section II by purging unused internal exports reported by knip
  Change: Removed internal-only dead exports across Backend and Frontend-PWA
  Result: All 2017 PWA tests and 277 Backend tests passed; 0 depcruise violations
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Backend/supabase/functions/_shared/royaleSchemas.ts, Backend/supabase/functions/_shared/types.ts, Frontend-PWA/src/core/theme/theme-tests/wcag.ts, Frontend-PWA/src/shared/directives/ghostBenchmarkState.ts
  Nudges: 0
  Execution: 902c82e9256592ae771eb794fed931f28b2d7b10
-->
