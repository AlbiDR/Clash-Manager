### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** docs(readme): Reconcile sync-player-cards README with client.ts vault environment broker role

**Why:** Document client.ts role as Supabase service client and vault environment broker

**Result:** PASSED git diff --check and Vitest client.spec.ts (4/4)

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/sync-player-cards/README.md

**Verified accurate:** Backend/supabase/functions/sync-player-cards/client.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-20
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document client.ts role as Supabase service client and vault environment broker
  Change: docs(readme): Reconcile sync-player-cards README with client.ts vault environment broker role
  Result: PASSED git diff --check and Vitest client.spec.ts (4/4)
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/sync-player-cards/README.md
  Verified: Backend/supabase/functions/sync-player-cards/client.ts
  Nudges: 0
  Execution: 194d4d391aebe206512b3ab9674fe7a7991c389a
-->
