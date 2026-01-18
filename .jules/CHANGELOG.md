# Changelog


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
*PR created automatically by Jules for task [1096648384874374336](https://jules.google.com/task/1096648384874374336) started by @AlbiDR*

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
*PR created automatically by Jules for task [14412656966866360797](https://jules.google.com/task/14412656966866360797) started by @AlbiDR*

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

