# Changelog


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

