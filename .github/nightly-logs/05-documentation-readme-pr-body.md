### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconciled Frontend-PWA/src/core/api/README.md with implementation details from SupabaseClient.ts

**Why:** Documented source-freshness resolution, fetch clock distinction, optional query decoupling, diagnostic boundaries, and client singleton instantiation in Frontend-PWA/src/core/api/README.md

**Result:** 207 Vitest specs passed (2076 tests green) and git diff --check clean

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/api/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-23
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Documented source-freshness resolution, fetch clock distinction, optional query decoupling, diagnostic boundaries, and client singleton instantiation in Frontend-PWA/src/core/api/README.md
  Change: Reconciled Frontend-PWA/src/core/api/README.md with implementation details from SupabaseClient.ts
  Result: 207 Vitest specs passed (2076 tests green) and git diff --check clean
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/api/README.md
  Nudges: 0
  Execution: 960fd987d4ea3a8e984a91932e1e8c351a1e07b4
-->
