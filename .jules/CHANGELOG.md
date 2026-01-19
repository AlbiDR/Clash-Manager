# Changelog


## [2026-01-19] PR #50: Optimize Search Performance in useListFilter
**Commit**: `3fa3087f79cef0a20e75712e2661ff634d8eb2f4`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/50)

### Description
Optimized `useListFilter` composable to improve search responsiveness. The change pre-calculates and caches normalized search fields when the source list changes, eliminating redundant string operations (toLowerCase) on every keystroke during active searching. Verified with a new unit test suite.

---
*PR created automatically by Jules for task [14983220874502807738](https://jules.google.com/task/14983220874502807738) started by @AlbiDR*

---
## [10.0.0] - 2026-01-18

### Strategic Pivot: PWA-First Architecture

- **Versioning Reset**: Leaped to v10.0.0 to resolve historical versioning noise (previous automated v9 tags) and establish a clean baseline for the project's next era.
- **Platform Declaration**: Officially abandoned native APK and Tauri-based desktop systems. The project is now a **PWA-First** ecosystem, optimized for high-performance WebAPK delivery on Android and professional dashboarding on Desktop.
- **Deep Net Core**: Integrated the v7 Hybrid Benchmarking engine as the standard for recruitment logic in the v10 base.

## [7.0.1] - 2026-01-18

### Fixed

- **Headhunter**: Enforced a strict 100% cap on "Potential Scores" to prevent score inflation and ensure visual consistency in the dashboard.
- **Architectural Cleanup**: Centralized potential score calculation in `ScoringSystem.gs.js` for better maintainability.

## [7.0.0] - 2026-01-17

### Added

- **Deep Net v7**: Implemented a new "Hybrid Benchmark" system for high-precision recruitment.
- **Scoring Engine**: Shifted to a 40/60 Hybrid split (40% Clan weight / 60% Tournament Pool weight) to stabilize talent discovery.
- **Unified Formula**: Unified the scoring algorithm for both recruits and clan members to enable true "apples-to-apples" comparison.
- **Metadata**: Added `WAR_DAY_WINS` tracking to the Clan Leaderboard to support unified benchmarking.
- **Versioning**: Global project synchronization to v7.0.0 across all modules (Backend, Frontend, and Cloud Worker).

## [2026-01-18] PR #46: Documentation Clarity and Synchronization Overhaul
**Commit**: `3ffb861ee346284089d45b901f4595ec7e74869f`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/46)

### Description
This update addresses several synchronization and clarity gaps in the project's documentation:

1. **Frontend-PWA Synchronization**: Updated the Architectural Components to accurately reflect the use of `Valibot` (replacing `Zod`) and `Tailwind CSS`. Added a new, collapsible "Development" section with explicit instructions for `pnpm dev`.
2. **Standardization**: Removed all prohibited emojis from `Backend-Worker/README.md` to align with the "Document" role's professional guidelines.
3. **Syntax Correction**: Fixed a malformed code block in the root `README.md` where single backticks were incorrectly used for a multi-line environment variable example.
4. **Journaling**: Recorded the clarity gap and solution in `.jules/document-project.md`.

No functional code was modified.

---
*PR created automatically by Jules for task [4431585522102261599](https://jules.google.com/task/4431585522102261599) started by @AlbiDR*

---

## [2026-01-18] PR #45: Optimize List Sync Re-renders
**Commit**: `e54a3d3d08ccad14d57b04e04e699a6ff7596b02`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/45)

### Description
Implemented a performance optimization for the Frontend PWA that reduces unnecessary re-renders during background data synchronization.

By updating the `v-memo` directive in `LeaderboardView.vue` and `RecruiterView.vue`, the application now only triggers re-renders for items that are currently expanded (and thus showing refresh-sensitive data/skeletons) when the background sync state changes. Collapsed items, which make up the vast majority of the list, are now skipped during these updates.

Validation:
- Unit tests for `useConsoleLogic` passed.
- Production build successful.
- Frontend verification confirmed application remains functional.
- Code review completed and verified as correct.

Lighthouse category scores remain above 91%.

---
*PR created automatically by Jules for task [9168661994795018283](https://jules.google.com/task/9168661994795018283) started by @AlbiDR*

---

## [2026-01-17] PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

**Commit**: `0f35a4e6933070f707de63a1de352b9092926266`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

### Description

Refined the Vite `manualChunks` strategy to align with actual project dependencies (`valibot` instead of `zod`) and preserve code-splitting for heavy components. This optimization significantly reduces the initial bundle size and improves hydration performance for the PWA.

---

_PR created automatically by Jules for task [1096648384874374336](https://jules.google.com/task/1096648384874374336) started by @AlbiDR_

---

## [2026-01-17] ❌ FAILED MERGE: PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is not mergeable","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

---

## [2026-01-17] ❌ FAILED MERGE: PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is not mergeable","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

---

## [2026-01-17] ❌ FAILED MERGE: PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is not mergeable","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

---

## [2026-01-17] ❌ FAILED MERGE: PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is not mergeable","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

---

## [2026-01-17] PR #44: Optimize Vite manual chunks for Valibot validation library

**Commit**: `766963bc7e23e5a10b8fd3bd24c4bbc7cda6f86f`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/44)

### Description

Moved valibot into a dedicated manual chunk in the Vite configuration. This was necessary because valibot was being sucked into the main vendor-stable chunk despite being dynamically imported, as the manualChunks configuration lacked a specific rule for it and defaulted to vendor-stable for all node_modules.

Impact:

- Initial vendor-stable chunk size reduced: 85kB -> 6kB.
- Validation logic (valibot) is now truly lazy-loaded in a separate 80kB chunk.
- Improved PWA initial load performance.

---

_PR created automatically by Jules for task [14412656966866360797](https://jules.google.com/task/14412656966866360797) started by @AlbiDR_

---

## [2026-01-17] ❌ FAILED MERGE: PR #43: Optimize Bundle Chunking and Lazy-Loading Strategy

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is still a draft","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/43)

---

## [2026-01-17] ❌ FAILED MERGE: PR #44: Optimize Vite manual chunks for Valibot validation library

> [!CAUTION]
> **Status**: Auto-merge failed after 5 attempts.
> **Error**: `API Error: 405 Method Not Allowed - {"message":"Pull Request is still a draft","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}`  
> **Requirement**: Manual intervention (likely a merge conflict) is required.
> **PR Link**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/44)

---

Automated changelog of merges from google-labs-jules.
