### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden useExternalLink interface contracts and inline decision annotations

**Why:** Exported UseExternalLinkReturn interface contract and enhanced TSDoc/decision/threat annotations for OS intent and deep-link brokerage

**Result:** vue-tsc type-check passed and 10/10 Vitest unit tests passed in useExternalLink.spec.ts

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useExternalLink.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-01
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Exported UseExternalLinkReturn interface contract and enhanced TSDoc/decision/threat annotations for OS intent and deep-link brokerage
  Change: docs(tsdoc): harden useExternalLink interface contracts and inline decision annotations
  Result: vue-tsc type-check passed and 10/10 Vitest unit tests passed in useExternalLink.spec.ts
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useExternalLink.ts
  Nudges: 0
  Execution: 721d518c12aca82c0c31472f29ec4a3783d00d20
-->
