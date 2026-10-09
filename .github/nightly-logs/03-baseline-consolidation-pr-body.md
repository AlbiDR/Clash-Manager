### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 2 migrations (20260915190000_harden_ingestion_delivery_lease.sql and 20260915190011_backend_health_and_safe_maintenance.sql) into master baseline

**Why:** Declarative schema consolidation and security hardening of master migration

**Result:** pnpm audit:migrations PASS (71 examined, 0 violations); static fold-state checked (26 remaining); database verification DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-09
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Declarative schema consolidation and security hardening of master migration
  Change: Folded 2 migrations (20260915190000_harden_ingestion_delivery_lease.sql and 20260915190011_backend_health_and_safe_maintenance.sql) into master baseline
  Result: pnpm audit:migrations PASS (71 examined, 0 violations); static fold-state checked (26 remaining); database verification DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 48b9c74081a652e914de34dd5fbdd4893a228c46
-->
