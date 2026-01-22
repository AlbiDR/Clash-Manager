# Documentation Journal

## 20-01-2026 [Architecture Hub Restoration]
**Learning:** Broken cross-references to a missing central architecture document create significant friction for new developers and undermine project professionality. **Action:** Always ensure any "central" document referenced in a README actually exists and is updated to reflect current technical pivots (e.g., PWA-first shift).

## 22-01-2026 [Bridge Logic Contextualization]
**Learning:** Functional "bridge" components (like Cloud Workers) often appear as black boxes if their architectural constraints (quotas, concurrency targets) aren't explicitly documented alongside the code.
**Action:** Use JSDoc `@remarks` to explicitly link external components to their parent architecture and explain the "Why" behind infrastructure-specific logic like retry backoffs and worker pools.
