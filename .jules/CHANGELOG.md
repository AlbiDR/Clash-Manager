# Changelog

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
