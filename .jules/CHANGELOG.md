# Changelog


## [2026-01-23] PR #59: Refactor views to specialized composables
**Commit**: `2d8f2beff19595e10b9eb46f1f57fa311c6d83cc`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/59)

### Description
Decomposed monolithic views into specialized composables to improve modularity and testability. Created useLeaderboard and useRecruiter composables and updated the corresponding views. Added unit tests for the new logic.

---
*PR created automatically by Jules for task [1667965608069441909](https://jules.google.com/task/1667965608069441909) started by @AlbiDR*

---

## [2026-01-22] PR #58: docs(worker): document remote worker intent and constraints
**Commit**: `17674795748d5f28024a32a6846e03e810a1cd88`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/58)

### Description
### Context & Reasoning
`Backend-Worker/index.js` is a critical infrastructure component acting as a high-concurrency proxy for Google Apps Script. Previously, it lacked JSDoc and context regarding its architectural role. This update adds "Contextual Density" by explaining the "Why" behind complex logic (retries, timeouts, worker pools) and ensuring parity with GAS documentation standards.

### Changes
- Added TSDoc/JSDoc to all major functions in `Backend-Worker/index.js`.
- Added `@remarks` explaining the worker's role in bypassing GAS quotas and execution limits.
- Added inline "Why" comments for exponential backoff, `Promise.race` timeouts, and ISO week alignment.
- Systematically removed emojis and non-ASCII characters to comply with project documentation constraints.
- Updated the documentation journal in `.jules/document-project.md`.

---
*PR created automatically by Jules for task [6794631074868322166](https://jules.google.com/task/6794631074868322166) started by @AlbiDR*

---

## [2026-01-22] PR #57: Refactor Settings Module: Logic Extraction & Component Decomposition
**Commit**: `60c7688de13aa5a239122188899f21107a905275`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/57)

### Description
This refactor improves the structural integrity and modularity of the settings module in the Frontend PWA. 

By extracting system-level recovery logic into a dedicated composable (`useSystemRecovery`), we decouple the business logic from the view layer, enabling better testability and potential reuse.

The decomposition of `SettingsView.vue` into smaller, atomic components reduces the complexity of the main view and improves maintainability. Each component now handles its own internal state and styling, following the project's atomic execution and modularity principles.

Verification:
- All 55 unit tests passed, including 4 new tests for `useSystemRecovery`.
- Visual verification confirmed that the UI remains consistent and the regression with skeleton animations during refresh has been resolved.
- Type safety has been enhanced with proper interfaces for theme management.

---
*PR created automatically by Jules for task [2676980365018228065](https://jules.google.com/task/2676980365018228065) started by @AlbiDR*

---

## [2026-01-21] PR #55: docs(gas): improve contextual density and decision logging in Leaderboard engine
**Commit**: `87bc65fb03f8bab4abddd8218f59ac2409d228b0`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/55)

### Description
Improved documentation and contextual density in `Backend-GAS/Leaderboard.js` by adding JSDoc and inline comments explaining the rationale behind complex logic. Removed all emojis and buzzwords to align with project standards. Added @warning for GAS quota consumption.

---
*PR created automatically by Jules for task [18080862495891695235](https://jules.google.com/task/18080862495891695235) started by @AlbiDR*

---

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

