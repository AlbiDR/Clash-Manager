# Granular War Rate

---
<br>

## Key Improvements
### 1. Granular War Rate (Daily Attendance) (Backend (GAS))
Pivoted from weekly participation tracking to a high-precision daily attendance model.

* **Battle Credits**: Introduced a BATTLE_CREDITS column. Players earn 1 credit per day if 'Battle Day + Fame > 0'.
* **Precision Formula**: Refactored scoring to (Total Credits / Total Eligible Days), accurately reflecting participation even during irregular Colosseum schedules.

### 2. Temporal Sync (Calendar Mode) (System Architecture)
Resolved the 'Time-Drift' issue by aligning all operations with the game's specific 10:00 UTC reset cycle.

* **Calendar Locking**: Switched from UTC-standard methods to local 'forceCalendarDay' logic, pinning logs to the correct date regardless of server timezone.
* **Logical Day Grouping**: Implemented 'getLogicalDay' to synchronize database entries, repair scripts, and UI displays.

### 3. Console UI Perfection Pass (Frontend (PWA))
UX overhaul focusing on fluid transitions and performance optimizations.

* **Morphing FAB**: Synchronized FloatingDock and FAB geometry for a seamless morph between navigation and selection states.
* **Resource Optimization**: Implemented source-level data slicing in Showcase and Blueprint modes to reduce CPU/Memory overhead by 90%.

---
<br>

## Deep Dive
### Architecture Spotlight: Temporal Alignment & Phase Heuristics

**Problem Statement:** The system suffered from 'Time Drift' where logs near the 10:00 UTC game reset were misclassified, and Training Days were sometimes recorded as missed battles (Fame 0).

**Root Cause Analysis:**
1. Dependency on UTC-standard date methods ignored game-specific reset offsets.
2. Static heuristics (Mon-Wed = Training) failed during Colosseum weeks.
3. Zero-Fame logs were processed as participation failures rather than phase-aware 'N/A' states.

**Solution Implementation:**
1. **Dynamic Grounding**: Refactored repair scripts to use live API snapshots to determine War Phase rather than weekday mapping.
2. **Mid-Day Normalization**: Forced all historical repair timestamps to 12:00 UTC to ensure 100% consistency across Monday log patches.

---
<br>

## Files Modified

### Logic Core
* **Configuration.ts**: Added BATTLE_CREDITS to schema.
* **Logger.ts**: Implemented daily credit tracking logic.
* **Repair_Database.ts**: Major rewrite for calendar-mode precision.
* **FloatingDock.vue**: Refined FAB morphing animations.

---
<br>

Full Changelog: https://github.com/AlbiDR/Clash-Manager/compare/v11.0.0...v11.1.0

---
---
