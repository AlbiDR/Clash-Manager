### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Backend/supabase/functions/ingest-royale-data/client.ts -- docs(tsdoc): harden client interface contracts and inline decision annotations

**Why:** Documented client.ts L1 Core environment broker interface contracts, CONFIG mutations, and syncVault Vault dynamic secret fallback logic.

**Result:** 5/5 unit tests passed in client.spec.ts.

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Backend/supabase/functions/ingest-royale-data/client.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-23
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented client.ts L1 Core environment broker interface contracts, CONFIG mutations, and syncVault Vault dynamic secret fallback logic.
  Change: Backend/supabase/functions/ingest-royale-data/client.ts -- docs(tsdoc): harden client interface contracts and inline decision annotations
  Result: 5/5 unit tests passed in client.spec.ts.
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Backend/supabase/functions/ingest-royale-data/client.ts
  Nudges: 0
  Execution: cd3ed0b410b505b2a427aca13b20f6d8b212bda8
-->
