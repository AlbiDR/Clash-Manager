# Changelog


## [2026-01-21] PR #54: perf(frontend): optimize data inflation and deduplicate card styles
**Commit**: `9751fc48b6562418a997c723149e7fb22f9c15c7`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/54)

### Description
### Bottleneck/Risk Identified
1. **Algorithmic Efficiency:** \`inflatePayload\` in \`gasClient.ts\` was performing O(N * M) operations during data sync where N is the number of rows and M is the schema length. This creates unnecessary CPU spikes on mobile devices.
2. **Structural Rot (DRY):** \`MemberCard.vue\` and \`RecruitCard.vue\` shared ~80% of their base styling (player names, trophies, badges, action buttons), leading to bundle bloat and maintenance overhead.
3. **Loop Complexity:** \`parseHistoryString\` used a chain of \`.split().map().filter().map()\` which created multiple intermediate arrays.

### The Fix & Logic (Shadow Mode)
- **Data Inflation:** Pre-calculated schema indices outside the row mapping loop in \`gasClient.ts\`. This transforms the mapping into a direct index access ($O(1)$ per field), resulting in overall $O(N)$ complexity for the payload inflation.
- **CSS Deduplication:** Centralized common card styles in \`BaseCard.vue\` using \`:deep()\` selectors. This ensures that slotted content in \`MemberCard\` and \`RecruitCard\` inherits standard styling without local duplication.
- **Pure Logic Refactor:** Streamlined \`parseHistoryString\` into a single \`for\` loop.
- **Type Safety:** Tightened types in \`gasClient.ts\`, replacing \`any\` with \`Record<string, unknown>\` and \`unknown\` where appropriate, and added explicit schema validation.

### Verification
- **Vitest:** All tests passed, including \`gasClient.spec.ts\` and a new verification suite for \`warMath.ts\`.
- **Frontend Verification:** Confirmed via Playwright screenshot that the application layout and skeleton states remain intact.
- **Build:** Verified that \`pnpm run build\` completes successfully with no TypeScript errors.

---
*PR created automatically by Jules for task [8173700189212895618](https://jules.google.com/task/8173700189212895618) started by @AlbiDR*

---

## [2026-01-20] PR #53: Establish Architecture Hub and Synchronize Documentation
**Commit**: `48ac8c8f5890bed101b62b9beacc7ef19b775c17`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/53)

### Description
Established a centralized Architecture Hub at `docs/ARCHITECTURE.md` and synchronized all project READMEs to resolve broken links and technical inaccuracies. Added the `Backend-Worker` setup to the root Quick Start guide and corrected file extensions in the `Backend-GAS` documentation.

---
*PR created automatically by Jules for task [5693470942394929895](https://jules.google.com/task/5693470942394929895) started by @AlbiDR*

---

## [2026-01-20] PR #52: Optimize manual chunks for view-specific components
**Commit**: `85a2a2f0a9790b8cf17cbf472663ac3595b03efb`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/52)

### Description
Refined `manualChunks` in `vite.config.ts` to exclude route-specific components (MemberCard, RecruitCard, SettingsCard, etc.) from the monolithic `ui-components` bundle. This reduced the `ui-components` chunk size by 41% and the initial JS payload by 15kB.

---
*PR created automatically by Jules for task [15677770083110296391](https://jules.google.com/task/15677770083110296391) started by @AlbiDR*

---
Automated changelog of merges from google-labs-jules.

