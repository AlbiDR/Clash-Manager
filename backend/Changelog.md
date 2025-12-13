All notable changes to the project will be documented in this file following the documentation on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and adhering to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# To-Do & Development Roadmap
*Future features, technical debt, and placeholder additions are listed here for safekeeping.*

**Frontend Adaptation Requirements (v6.0 Backend):**
1. **Persistence**: Implement "Stale-While-Revalidate". Load from LocalStorage immediately, then fetch background update.
2. **API**: Switch to `fetch()` based JSON REST API (GET/POST). Handle String Transport Protocol.
3. **Robustness**: Respect `isRefreshing` locks. Show "Syncing..." UI state.
4. **Design**: Use Neo-Material CSS tokens (`--glass-surface`, `--sys-color-primary`).

---



# Changelog
## [11.1.0] - Robust Backup System
### Fixed
- **Utilities**: Hardened `backupSheet` with **Self-Healing** logic. The system now strictly enforces index order (`Source + N`) and visibility (Hidden) for all backup tabs at the end of every execution, fixing issues where UI lag left backups visible.

## [11.0.0] - Backend Modernization & Scaling
### Added
- **Property Sharding**: Implemented `Utils.Props.setChunked` to split large payloads (like Blacklists) into sequential keys, bypassing the 9KB Google Apps Script property limit.
- **Mutex Locking**: All manual and automated triggers are now wrapped in `Utils.executeSafely` to prevent Race Conditions during simultaneous execution.
- **Smart Sync**: The Controller now publishes `LAST_PAYLOAD_TIMESTAMP` to Script Properties, allowing the frontend to perform "Headless Checks" before fetching data.

### Changed
- **Architecture**: Decoupled `API_Public` (Router) from `Controller_Webapp` (Data Layer). The system now operates as a Headless REST API.
- **Recruiter**: Refactored Blacklist persistence to use the new Sharding engine.

## [10.8.0] - Layout & Logic Hardening
### Fixed
- **Utilities**: Enhanced `applyStandardLayout` to aggressively scrub data validations and notes from buffer zones, ensuring no "Ghost Checkboxes" remain when tables shrink.
- **Scoring**: Implemented **Time-Boxed War Rate**.
    - *Training Days (Mon-Wed)*: 0 Fame is ignored (Grace Period).
    - *Battle Days (Thu-Sun)*: 0 Fame counts as a miss (Strict Mode).
- **Leaderboard**: Fixed "Day of Week" calculation to use the Clan's Timezone (e.g., Europe/Rome) instead of Server Time.

## [10.6.0] - [10.6.3] - Time Precision & Blacklists
### Added
- **Recruiter**: Implemented **Time-Decaying Blacklist**. Invited recruits are tracked in Script Properties and ignored for 7 days.
- **Recruiter**: Added `ignoredTags` in-memory set to prevent immediate re-adding of just-invited players during the same execution run.

### Fixed
- **Recruiter**: Changed "Found Date" persistence to store full timestamp (`yyyy-MM-dd HH:mm:ss`) instead of just date, fixing inaccurate "Time Ago" displays.
- **Orchestrator**: Linked manual triggers (`triggerUpdateLeaderboard`, etc.) to `refreshWebPayload()` to ensure the Web App cache updates immediately after a manual run.

## [10.5.0] - [10.5.4] - Sticky Memory & Scan Depth
### Added
- **Recruiter**: Implemented **Sticky Memory Persistence**. If a player has a War Bonus, it is retained even if the battle drops out of the 25-game log.
- **Recruiter**: Increased Scan Depth. Lottery Pool increased to 300, Scan Target to 150.
- **Utilities**: Increased `MAX_FETCH_PER_EXECUTION` to 400 to support deeper scans.

## [10.4.0] - [10.4.2] - Mercenary Protocol & Stochastic Search
### Added
- **Recruiter**: Implemented **Stochastic Prioritization**. Top 200 tournaments by capacity are now shuffled before selection to prevent scanning the same rooms repeatedly.
- **Scoring**: Increased "Mercenary Bonus" (War Activity in Battle Log) from 40 to **500 points**.

## [10.3.0] - [10.3.8] - Density Filtering
### Changed
- **Recruiter**: Switched filter strategy from "Large Rooms" (Capacity) to "Active Rooms" (Population).
- **Recruiter**: Implemented **Post-Fetch Density Filtering**. Now accepts any tournament size but discards results with `< 10` active members after details are fetched.

## [10.2.0] - The Deep Net Protocol
### Changed
- **Recruiter**: Implemented **Deep Net Protocol**.
    - Broadcasts all keyword searches (0-9, a-z) in parallel.
    - Deduplicates results into a unique Map to handle overlap.
    - Removes limits on scan scope, fetching details for all unique hits up to the time limit.

## [10.0.0] - [10.1.0] - Gold Master Logic
### Added
- **Performance**: Implemented **Batch Network Calls** for Bulk Dismissal (O(1) complexity).
- **Recruiter**: Added **Dynamic Safety Cap**. If the pool is empty, the trophy requirement drops to `0.75 * Avg` to fill it quickly.

### Fixed
- **Recruiter**: Fixed logic to accept tournaments in `preparation` (Lobby) state, not just `inProgress`.
- **Recruiter**: Fixed Capacity filter bug that unintentionally excluded standard 50-player tournaments.

## [9.0.0] - [9.0.3] - The Neo-Material Overhaul
### Added
- **Design**: Complete UI refactor to **Neo-Material (2026 Vision)**.
    - Introduced CSS tokens for Glassmorphism, Tonal Pods, and Fluid Animations.
    - Added Floating Console (Header) and Floating Dock (Nav).
- **Feature**: Added **War History Visualizer** (Mini-Bar Charts) to Player Cards.

### Fixed
- **War Rate**: Fixed critical bug where War Rate displayed as decimal (`0.9`) instead of percentage (`90%`). Implemented **Dual-Layer Data Extraction** to prefer "Display Values" from the sheet.

## [8.3.0] - [8.3.7] - Stability & Deep Linking
### Fixed
- **String Transport Protocol**: Replaced `google.script.run` serialization with raw JSON strings (`JSON.stringify`) to prevent crashes caused by Emojis or Dates in the payload.
- **Deep Links**: Fixed "Open All" sequence on iOS/Android. Switched from `window.location` to native hidden `<a>` tag clicks to bypass browser popup blockers.
- **Initialization**: Removed `window.onload` dependency for instant boot.

## [8.0.0] - [8.2.0] - Command Console
### Added
- **UI**: Redesigned "Command Console" header with "Select All" / "Deselect All" controls.
- **UI**: Added "Select Mode" and Floating Action Bar (FAB) for Bulk Open/Dismiss actions.

## [7.0.0] - The Phoenix Refactor
### Changed
- **Rendering**: Switched rendering engine to `DocumentFragment` for 50x faster painting performance.
- **UX**: Implemented **Stateful Tabs**. The app now remembers scroll position, search query, and sort preferences when switching tabs.

## [Legacy Milestones]
### [6.x.x] - Client-Side Intelligence
- **[6.4.0]**: Added Bulk Selection Mode and Floating Action Bar.
- **[6.2.0]**: Implemented Client-Side Sorting and Optimistic UI updates.
- **[6.0.0]**: Initial rewrite to Single Page Application (SPA) architecture with `DataService`.

### [5.x.x] - Foundation
- **[5.9.0]**: Introduced Smart Backup System (Redundancy Checking).
- **[5.8.0]**: Implemented Leaderboard Logic, Inactivity Decay, and War Scoring.
- **[5.0.0]**: Initial Release of the modular file structure (`Controller`, `Leaderboard`, `Recruiter`).
