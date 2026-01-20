# Changelog


## [2026-01-20] PR #52: Optimize manual chunks for view-specific components
**Commit**: `85a2a2f0a9790b8cf17cbf472663ac3595b03efb`
**Original PR**: [Link](https://github.com/AlbiDR/Clash-Manager/pull/52)

### Description
Refined `manualChunks` in `vite.config.ts` to exclude route-specific components (MemberCard, RecruitCard, SettingsCard, etc.) from the monolithic `ui-components` bundle. This reduced the `ui-components` chunk size by 41% and the initial JS payload by 15kB.

---
*PR created automatically by Jules for task [15677770083110296391](https://jules.google.com/task/15677770083110296391) started by @AlbiDR*

---
Automated changelog of merges from google-labs-jules.

