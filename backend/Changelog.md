

# To-Do & Development Roadmap

✨ **Feature & Quality of Life (QoL) Improvements**
*These items focus on enhancing usability through practical feature additions and performance tweaks.*
- **Under-the-Hood Optimization**: Continue implementing general "Quality of Life" improvements and performance optimizations for a smoother, more robust application experience.

---

# Changelog

All notable changes to the "Clan Manager" project will be documented in this file.

## [10.8.0] - Layout Engine Hardening
### Fixed
- **Utilities**: Enhanced `applyStandardLayout` to be more aggressive in scrubbing buffer zones.
    - *Robustness*: The function now explicitly clears **Data Validations** and **Notes** from buffer areas (left, right, bottom) in addition to clearing content and formatting. This ensures that when the table shrinks, no "Ghost Checkboxes" or lingering metadata remain in the empty space.
    - *Resilience*: This change guarantees that dynamic schema adjustments (e.g., adding/removing columns) result in a completely clean sheet state outside the data table.

## [10.7.0] - Hybrid War Rate Protocol
### Added
- **ScoringSystem**: Implemented **Time-Boxed War Rate Logic**.
    - **Concept**: A robust optimization to prevent the "Tuesday Morning Drop" where all players would lose ~2% War Rate at the start of a new week before they had a chance to attack.
    - **Logic (Mon-Wed)**: **Grace Period**. During Training Days (ISO Days 1-3), if a player has `0` fame for the current week, the week is *excluded* from the historical denominator. The War Rate remains stable (e.g., 100%).
    - **Logic (Thu-Sun)**: **Strict Mode**. During Battle Days (ISO Days 4-7), if a player has `0` fame, the week *counts* against them. The War Rate drops (e.g., 98%), creating a visual indicator of urgency.
- **Leaderboard**: Implemented **Timezone-Aware Scheduling**.
    - *Fix*: The "Day of Week" is now calculated based on the Clan's Configured Timezone (e.g., `Europe/Rome`) rather than the Google Server Time (USA). This prevents "Fake Data" anomalies where the logic might drift by 6-9 hours depending on server location.

## [10.6.3] - Headhunter Time Precision
### Fixed
- **Recruiter**: Changed the data persistence format for "Found Date".
    - *Problem*: The script was saving the date as a formatted string (`yyyy-MM-dd`), discarding the specific time of discovery. This caused the Web App to calculate "Time Ago" based on midnight, leading to inaccurate displays (e.g., "4h ago" for a recruit found 4 hours after midnight).
    - *Fix*: The script now saves the raw `Date` object to the spreadsheet. This preserves the full timestamp (Hour/Minute/Second).
    - *Visual*: The "Found" column in the Headhunter sheet is now formatted as `yyyy-MM-dd HH:mm:ss` for easier verification.

## [10.6.2] - Instant Bulk Action
### Changed
- **Frontend**: Reduced the "Safety Delay" in the Bulk Open button logic from `500ms` to `50ms`.
    - *Impact*: When using the "Open (N)" button to cycle through recruits, the button now updates to the next player almost instantly.
    - *Technical*: The 500ms delay was a legacy safety buffer to prevent link swapping before the browser registered a click. Modern mobile browsers handle this event propagation much faster, making 500ms unnecessary lag.

## [10.6.1] - Cache Synchronization Fix
### Fixed
- **Orchestrator**: Linked manual triggers (`triggerUpdateLeaderboard`, `triggerUpdateDatabase`, `triggerScoutRecruits`) to the Web App Cache.
    - *Problem*: Clicking "Update Leaderboard" from the menu updated the Spreadsheet correctly, but the Web App continued to display old data because the JSON Cache wasn't being refreshed.
    - *Fix*: Added `refreshWebPayload()` to the success path of all manual triggers. Now, when the Spreadsheet updates, the Web App updates instantly.
- **Configuration**: Rotated `JSON_STORE_KEY` to `WEB_APP_PAYLOAD_V10_6_1`.
    - *Impact*: Forces a "Hard Reset" of the cache for all users, clearing any stuck or stale data immediately.

## [10.6.0] - Time-Decaying Blacklist
### Added
- **Recruiter**: Implemented **Time-Decaying Blacklist** (7 Days).
    - *Logic*: When a recruit is marked as `Invited = TRUE`, their tag is stored in Script Properties with an expiration date of 7 days.
    - *Impact*: These players will be silently ignored by the scanner until the 7-day period expires, preventing them from immediately reappearing in the list after being dismissed.
    - *Maintenance*: The blacklist automatically prunes expired entries on every run to keep storage size low.
- **Configuration**: Added `BLACKLIST_DAYS` setting (Default: 7).

## [10.5.4] - Ignored Tags Logic
### Added
- **Recruiter**: Implemented in-memory `ignoredTags` set.
    - *Logic*: Before running the scan, the script reads the sheet for any rows marked as `Invited`. These IDs are added to a temporary blacklist for the duration of the execution.
    - *Impact*: Ensures that if a player is marked as invited (and thus removed from the list), they are not immediately re-added in the same run if the scanner finds them again in a tournament.

## [10.5.3] - Aggressive Expansion
### Changed
- **Utilities**: Doubled `MAX_FETCH_PER_EXECUTION` from `200` to **`400`**.
    - *Math*: The previous 60-second runtime limit suggested massive headroom. We can safely perform ~240 API calls (150 scans) without risking a timeout, well below the 400 limit.
- **Recruiter**: Doubled the scan depth.
    - **Lottery Pool**: Increased from 200 to **300**.
    - **Scan Target**: Increased from 75 to **150**.
    - *Impact*: The script will now deeply analyze 150 unique high-capacity tournaments every run, practically guaranteeing findings if any exist.

## [10.5.2] - API Budget & Scan Depth Increase
### Changed
- **Recruiter**: Increased the number of "Lottery Winners" (Tournaments scanned in detail) from `60` to **`75`**.
    - *Reasoning*: User preference for three-quarters (75%) instead of 60%.
- **Utilities**: Increased `MAX_FETCH_PER_EXECUTION` from `150` to **`200`**.
    - *Math*: Scanning 75 tournaments requires approx 161 API calls (36 search + 75 details + 50 profiles). The previous limit of 150 would have caused premature aborts. 200 is safe given the high speed of batch processing.

## [10.5.1] - Sticky Memory Logic
### Added
- **Recruiter**: Implemented **Sticky Memory Persistence** for War Bonuses.
    - *Problem*: The Clash Royale API battle log only covers the last 25 games (~4-6 hours). If a player earns a "Mercenary Bonus" (500 pts) for playing War at 10 AM, and the script runs again at 4 PM, that battle might be gone, causing their score to drop and them to be potentially removed from the list.
    - *Solution*: The script now compares the player's *Current Score* against their *Stored Score* in the spreadsheet.
    - *Logic*: `FinalWarScore = Math.max(CurrentWarScore, StoredWarScore)`.
    - *Impact*: Once a player is identified as an active warrior, they retain that status even if they go offline for the rest of the day.

## [10.4.2] - Mercenary Scoring Protocol
### Changed
- **Recruiter (Scoring)**: Increased the **War Activity Bonus** (Phantom Wins) from `40` to **`500`**.
    - *Math*: `500 wins * 20 weight` = **10,000 points**.
    - *Reasoning*: The Battle Log scan only sees the last 25 games (a very small window). Finding a war battle there is rare and proves the player is an "Active Mercenary". This massive bonus ensures that any player caught playing war actively will instantly outrank passive players, even those with significantly higher trophies or total donations.

## [10.4.1] - Stochastic Scanning
### Added
- **Recruiter (Strategy)**: Implemented "Stochastic Prioritization" (The Lottery System).
    - *Problem*: Pure deterministic sorting by Capacity often caused the script to get "stuck" scanning the same 60 empty, 1000-capacity tournaments repeatedly.
    - *Solution*: 
        1. Take the **Top 200** tournaments by Capacity (Big Fish Pool).
        2. **Shuffle** this pool randomly using the Fisher-Yates algorithm.
        3. Select the first **60** candidates for detailed scanning.
    - *Benefit*: This introduces variety, ensuring that over multiple runs, the script scans a much wider range of high-capacity tournaments.

## [10.4.0] - Safe State Stabilization
### Fixed
- **Recruiter**: Removed the temporary `API STRUCT INSPECTOR` debugging code.
- **Recruiter**: Reverted to the "Safe State" logic which was proven to find active recruits:
    - **Phase B (Search)**: Scans all tournaments and deduplicates.
    - **Strategy**: Sorts by `capacity` (Descending) as the best available heuristic for potential activity.
    - **Phase C (Filter)**: Applies the **Density Filter** (`membersList.length >= 10`) immediately after fetching details to ensure zero wasted effort on empty rooms.

## [10.3.8] - Density Filter & Sorting Overhaul
### Fixed
- **Recruiter**: Removed the `currentPlayers >= 1` filter in Phase B (Search).
    - *Reasoning*: The `currentPlayers` property is often undefined in the initial search results, causing the filter to incorrectly discard all tournaments.
- **Recruiter**: Implemented **Post-Fetch Density Filtering**.
    - *Logic*: The check for active members (`membersList.length >= 10`) is now performed *after* fetching the full tournament details in Phase C. This ensures we only recruit from active rooms.
- **Recruiter**: Added **Capacity Sorting**.
    - *Strategy*: Search results are now sorted by `capacity` (Descending) before fetching details. This prioritizes larger tournaments (which theoretically have a higher chance of being active) when the API budget is limited.
- **Recruiter**: Added a **Debug Inspector** log to verify the exact structure of the API search response for future debugging.

## [10.3.7] - Activity Filter Refinement
### Changed
- **Recruiter**: Lowered the `currentPlayers` filter threshold from `10` to `1`.
    - *Reasoning*: The "Population-First" sorting strategy already ensures larger tournaments are prioritized. Lowering the floor to 1 prevents the "No matches found" error when no tournaments exceed 10 players (common at night), while still filtering out completely dead/empty API results.
- **Recruiter**: Improved error logging to distinguish between "API Failure" (0 raw results) and "Filter too Strict" (Results found but filtered out).

## [10.3.6] - Population-First Strategy
### Added
- **Recruiter (Strategy)**: Implemented "Population-First" sorting in the tournament scan.
    - *Logic*: After finding all unique tournaments with `>= 10` players, the list is now sorted by `currentPlayers` in Descending order (Largest First).
    - *Benefit*: This ensures that if the script is terminated early due to execution time limits or API quotas, it will have already scanned the most populous tournaments (the "fertile grounds"), maximizing the yield of potential recruits.

## [10.3.5] - Activity Based Filtering
### Changed
- **Recruiter**: Replaced the `capacity >= 10` filter with `currentPlayers >= 10`.
    - *Logic*: Previously, the scanner looked for "Large Rooms". Now, it looks for "Active Rooms".
    - *Benefit*: This prevents the API from scanning tournaments with 1000 capacity but 0 players (dead tournaments), saving the limited API budget for tournaments that actually contain potential recruits.

## [10.3.4] - Capacity Filter Restoration
### Fixed
- **Recruiter**: Restored the `capacity >= 10` filter.
    - *Reasoning*: Scanning every single micro-tournament caused an API Budget Exhaustion error (424/150). Restoring the filter removes the noise and keeps the execution within safe limits.

## [10.3.3] - Capacity Filter Removal
### Changed
- **Recruiter**: Removed the minimum capacity criteria (`>= 25`) for tournament searches. The scanner now processes all tournaments found, regardless of size, to maximize the potential candidate pool.

## [10.3.1] - Recruiter Sorting Fix
### Fixed
- **Recruiter (Logic)**: Changed pool sorting from `Performance Score` to `Raw Score`.
    - *Issue*: New recruits found during a scan initially have no Performance Score (0/undefined). Sorting by Performance Score was causing high-potential new recruits to be discarded if the pool was full.
    - *Fix*: The pool is now sorted by `Raw Score` (an absolute metric available for all candidates) before being trimmed to the target size.

## [10.3.0] - Full Spectrum Search
### Changed
- **Configuration (Keywords)**: Unlocked the keyword restriction and implemented **Full Spectrum Search**.
    - *Expansion*: The Recruiter now scans `0-9` and `a-z` (36 independent queries).
    - *Impact*: Ensures maximum coverage of available tournaments.
    - *Safeguard*: Relying on the **Deep Net Protocol** (deduplication) to handle the increased data volume without hitting API processing limits.

## [10.2.0] - The Deep Net Protocol
### Changed
- **Recruiter (Core Logic)**: Implemented the **Deep Net Protocol**.
    - *Old Behavior*: Fetched results for keyword '1', took top 15, fetched details. Then repeated for keyword '2'. This was redundant and shallow.
    - *New Behavior*: 
        1. **Broadcasting**: Fires all keyword searches in parallel.
        2. **Deduplication**: Collects ALL results into a unique Map. This solves the overlap issue (e.g., tournament "123" appearing in searches for both '1' and '2').
        3. **Unlimited Scope**: Removed the "Top 15" limit. The script now fetches details for *every* unique tournament found (up to execution time limits).
- **Recruiter (Filters)**: Relaxed recruitment criteria to maximize yield.
    - *Status*: Criteria **removed**. The scanner now accepts tournaments in any state (preparation/inProgress/ended), relying on the live data to find players.
    - *Capacity*: Lowered threshold from `>= 50` to `>= 25`.
    - *Inactivity*: Removed the `HoursSinceSeen < 24` check. If a player is in a tournament list, they are considered active enough to scout.
- **Recruiter (Scoring)**: 
    - **War Bonus**: Doubled from 20 to **40** points. This aggressively prioritizes players who have recently fought in clan wars.
- **Configuration**: Increased `DONATION` weight in Headhunter scoring from `0.05` to `0.07`.

## [10.1.0] - Dynamic Recruitment Thresholds
### Added
- **Recruiter (Feature)**: Implemented **Dynamic Safety Cap**.
    - *Context*: Recruiter now checks the current size of the recruitment pool before searching.
    - *Filling Phase*: If the pool is empty or partially full, the trophy requirement drops to **0.75 * Avg** (the "Safety Cap") to quickly find candidates.
    - *Maintenance Phase*: If the pool is full (>= 50 candidates), the cap is removed and the requirement strictly adheres to **1.0 * Avg**. This ensures that once you have options, you only look for elite upgrades.

## [10.0.3] - Logic Hardening
### Changed
- **Recruiter (Logic Update)**: Increased the **Recruitment Trophy Floor**.
    - *Previous*: `0.7 * Clan Average`. This lowered standards over time.
    - *New*: `1.0 * Clan Average`. New recruits must now meet or exceed the current clan average, ensuring quality growth.
    - *Cap*: Bumped the hard search cap from 7000 to 7500 to account for the higher requirement.
- **Configuration (Protection)**: Hardened the **Keyletter Strategy** comments.
    - Added explicit warnings to preventing changing search terms back to full words, ensuring high yield on tournament discovery.

## [10.0.2] - Keyletter Strategy Protection
### Changed
- **Configuration**: Instituted a **Protected Zone** for the Headhunter Keywords.
    - *Policy*: Explicitly forbids changing the search strategy back to full words (like "open" or "free").
    - *Mechanism*: Added strict warnings in the configuration file to warn future developers. The list is now permanently locked to single characters `['1', '2', '3', 'a', 'b', 'c', 'e', 'i', 'o', 'u']` to maximize tournament discovery yield.

## [10.0.1] - Recruiter Status Filter Patch
### Fixed
- **Recruiter (Logic Patch)**: Fixed issue where Recruiter was ignoring tournaments waiting in the lobby phase.
    - *Observation*: Users searching manually would see dozens of tournaments, while the script reported only 1 or 2.
    - *Root Cause*: The script was strictly filtering for `status === 'inProgress'`. Many open tournaments sit in `preparation` status (lobby) while players join.
    - *Fix*: Updated `scanTournaments` to accept both `'inProgress'` and `'preparation'` statuses.

## [10.0.0] - Gold Master Release
### Added
- **Performance**: Implemented **Batch Network Calls** for Bulk Dismissal.
    - *Previous Behavior*: Dismissing 20 recruits triggered 20 sequential server calls, causing frequent timeouts.
    - *New Behavior*: The client now sends a single array of IDs to the server (`markRecruitsAsInvitedBulk`), which processes the entire batch in one pass. This changes the operation from O(N) to O(1) network overhead.
- **Manifest**: Aligned all module versions to `10.0.0` for the final stable release.

### Fixed
- **Recruiter (Critical Logic Fix)**: Fixed the logic that prevented new recruits from being found.
    - **Capacity Bug**: Changed tournament filter from `> 50` to `>= 50`. The previous code unintentionally excluded all standard 50-player tournaments, leaving only the rare 1000-player ones.
    - **Trophy Threshold**: The filter was too aggressive (`0.85 * Avg`), requiring 8000+ trophies for high-level clans. This has been capped to a maximum of `7000` to ensure elite clans can still recruit active mid-ladder tournament grinders.
    - **Search Breadth**: Expanded keyword list to include common terms like 'open', 'free', and 'tourney'.

## [9.0.3] - War History Visualization Fix
### Fixed
- **Frontend (View)**: Fixed a parsing bug where the War History bar diagram would only display the first (most recent) entry.
    - *Root Cause*: The backend joins historical data with `" | "` (Space-Pipe-Space). When splitting by pipe in the frontend, subsequent entries retained a leading space (e.g., `" 2500..."`). Parsing this string via `parseInt` failed because of the leading space, returning `0`.
    - *Fix*: Added a `.trim()` call to the visualization loop in `View_Webapp.html` to strip whitespace before parsing numbers.

## [9.0.2] - Post-Mortem: The War Rate Bug
### Documentation
- **Case Study**: A detailed breakdown of the War Rate bug fix has been added below to satisfy the new "Failure Classification" protocol.
    - **Wrong Behavior**: The web app persistently displayed raw decimals (e.g., `0.9` or `1`) for War Rate, instead of the formatted percentage (`90%` or `100%`).
    - **Root Cause 1 (Backend)**: Google Sheets stores percentages as decimals. `range.getValues()` returns the raw math value (`0.9`), while `range.getDisplayValues()` returns the visual string (`90%`). The Controller was relying on the raw value and failing to format it consistently.
    - **Root Cause 2 (Caching)**: Even after the Controller logic was patched, the global Cache Key (`JSON_STORE_KEY`) remained unchanged. The Apps Script `CacheService` continued to serve the old, buggy payload to users for up to 6 hours, masking the effectiveness of the code fix.
    - **The Solution**:
        1.  **Dual-Fetch Strategy**: The Controller now fetches *both* raw and display values. For text-heavy fields like War Rate, it explicitly prioritizes the Display Value ("Trust the Sheet").
        2.  **Cache Busting**: The `JSON_STORE_KEY` was rotated to `WEB_APP_PAYLOAD_V9_0_1`. This forced an immediate cache invalidation, ensuring all users received the fresh logic instantly.
        3.  **Frontend Failsafe**: A `formatPercent` utility was added to the HTML view. If the backend fails and sends a raw decimal (e.g., `0.9`), the client now detects it and mathematically converts it to `90%` before rendering.

## [9.0.1] - The Definitive War Rate Fix
### Fixed
- **War Rate**: Fixed the persistent bug where War Rate displayed as 1% instead of 90%.
    - *Root Cause*: The mismatch between Google Sheets Raw Values (0.9) and Display Values (90%) was causing previous heuristics to fail in specific formatting scenarios.
    - *Fix*: Implemented **Dual-Layer Data Extraction**. The application now fetches both the Raw Data (for math) and the Display Data (for text) simultaneously. For War Rate, it explicitly prioritizes the Display Value ("90%"). If the spreadsheet shows 90%, the app now guarantees it will show 90%.

## [9.0.0] - The Neo-Material Overhaul
### Added
- **Design System**: Comprehensive UI update to **Neo-Material (2026 Vision)**.
    - **Tokens**: Replaced hardcoded values with semantic tokens (e.g., `--sys-color-primary`, `--sys-elevation-3`) to support true Material 3 theming.
    - **Geometry**: Cards now feature `28px` hyper-rounded corners and "Tonal Pod" badges for scores.
    - **Fluidity**: Implemented glassmorphism in the new Floating Console and Navigation Dock.
- **Components**:
    - **Floating Console**: Replaced sticky header with a detached, floating glass control center.
    - **Floating Dock**: Replaced bottom bar with an iOS-style floating dock for better thumb reach.
    - **Stat Pods**: Replaced squircle badges with Material 3 Tonal Palette pods (Primary/Secondary/Tertiary containers).
- **Features**:
    - **RoyaleAPI Integration**: Added a secondary button to the player detail view to open their RoyaleAPI profile directly.
    - **Expansion in Selection**: Users can now expand card details even while Selection Mode is active, allowing for verification before selection.

### Fixed
- **Role Badges**: Fixed an issue where only "Co-Leader" badges were visible.
    - *Cause*: Case-sensitivity mismatch. The UI renderer expected "Leader" but received "leader".
    - *Fix*: The UI renderer now strictly normalizes all roles to lowercase before checking against an allowlist, ensuring `leader`, `elder`, and `co-leader` badges all appear correctly.
- **Mobile Links**: Fixed deep links on mobile devices by ensuring click propagation is stopped on action buttons and using standard anchor tags.

## [8.3.7] - Deep Link & UI Fixes
### Fixed
- **DEEP LINK POPUPS**: Restored `target="_top"` to the FAB Action Button.
    - *Logic*: The browser requires a combination of `target="_top"` and a valid `href` attribute to treat a link click as a "Trusted User Action" that breaks out of the GAS iframe.
    - *Refinement*: Updated `updateSelectionUI` to dynamically inject the *next* player's deep link into the `href` attribute *before* the user clicks. This ensures that every step in the "Open All" sequence is a genuine, native anchor click, bypassing security prompts.
- **FAB VISIBILITY**: Fixed the issue where the "Open All" button would animate off-screen and become invisible.
    - *Fix*: Changed the CSS transition from `transform: translateY(120px)` to `opacity: 0`. The button now remains physically fixed within the viewport (Bottom 90px) but becomes invisible to clicks when inactive. This prevents layout issues on mobile browsers.

## [8.3.6] - Deep Link Confirmation Fix
### Fixed
- **DEEP LINK POPUP**: Fixed the recurring "Continue in Clash Royale?" browser confirmation popup on steps 2+ of the bulk open process.
    - *Issue*: Subsequent steps in the "Bulk Open" queue were triggering browser security warnings because the navigation was handled programmatically via JavaScript.
    - *Fix*: Refactored `handleFabAction` to rely entirely on the native `<a>` tag behavior. The app now pre-loads the next link into the anchor tag and allows the default browser click action to occur, which is treated as a "Trusted User Event" by modern mobile browsers.
    - *HTML*: Removed `target="_top"` from the action button, as it interferes with deep link navigation in some contexts.

## [8.3.5] - The "Empty Shell" & Visibility Fix
### Fixed
- **CRITICAL UI BUG**: Fixed "Overlapping Views" issue.
    - *Issue*: The Headhunter tab appeared to show Leaderboard data because the inactive view was not being hidden.
    - *Fix*: Restored the missing `.hidden` CSS utility class in `View_Webapp.html`. The tab switching logic (`classList.toggle('hidden')`) now correctly hides the inactive container.

### Documentation
- **Root Cause Analysis**: Identified the definitive cause of the recurring "Empty Shell" bug (UI loads but data hangs).
    - *Diagnosis*: It was NOT a data fetch failure. It was a client-side **`SyntaxError: Unexpected identifier '$'`** caused by **Nested Template Literals** in `View_Webapp.html`.
    - *Mechanism*: Google Apps Script's HTML serving pipeline often fails to correctly parse nested backticks (`` `...${ `...` }...` ``), resulting in broken JavaScript that crashes the app immediately upon load.
    - *Fix*: The solution is to **Flatten Templates**. Complex logic must be computed in variables before string concatenation.
    - *Action*: Added strict warnings to `README.md` and `View_Webapp.html` to prevent re-introduction of this pattern.

## [8.3.4] - HTML Compliance & Syntax Repair
### Fixed
- **CRITICAL SYNTAX ERROR**: Fixed "Unexpected identifier '$'" error.
    - *Issue*: Nested template literals (backticks inside `${...}`) in the client-side rendering functions were causing parsing errors in specific browser environments or during GAS injection.
    - *Fix*: Flattened the `_createLeaderboardCardHTML` and `_createHeadhunterCardHTML` functions. Logic for badges, colors, and conditional HTML is now computed in standard variables *before* constructing the final HTML string, removing the parser ambiguity.
- **HTML Validation**: Fixed multiple validation errors.
    - Added `<!DOCTYPE html>` and `html lang="en"`.
    - Manually defined the `viewport` meta tag in the HTML file instead of generating it via `Controller`, fixing the "missing space" attribute error.
    - Removed obsolete table attributes.

## [8.3.3] - The "String Transport Protocol" Overhaul
### Fixed
- **CRITICAL SERIALIZATION CRASH**: Overhauled the entire client-server data transport layer.
    - *Issue*: `google.script.run` often fails with "Unexpected error" when trying to return complex JSON Objects (deep nesting, Date objects, large arrays).
    - *Fix*: The server now manually serializes data into a **JSON String** before returning it. The client receives the string and parses it. This bypasses the fragile Google Apps Script object serializer entirely, making data fetching 100% robust.
- **Monitoring**: Added a **Global Error Monitor**. A new script runs immediately upon page load to catch any JavaScript errors that occur before the app initializes. These errors are now displayed in a red banner at the top of the screen, ensuring that "Silent Failures" are no longer silent.
- **Compliance**: Fixed HTML validation errors in the `<meta name="viewport">` tag.

## [8.3.2] - The "Zero-Fail" Fix
### Fixed
- **CRITICAL CLIENT HANG**: Fixed the persistent "Initializing..." hang. The issue was traced to `Utilities.base64Encode` adding newlines to long data payloads, which caused the browser's `atob()` function to crash silently. The new `Utils.decode` function now aggressively strips whitespace before decoding.
- **Initialization**: Removed dependency on `window.onload`. The app now initializes immediately upon script execution, ensuring faster startup and avoiding race conditions in iframes.
- **Safety**: Added extra error handling around the `google.script.run` call to catch environment-level failures immediately.

## [8.3.1] - Version Coherency
### Fixed
- **Deployment**: Updated Backend Controllers to match Frontend v8.0.0.
- **Frontend**: Added actionable error message when data fetch fails (guiding users to check 'Anyone' access).

## [8.0.0] - Sleek & Modern UI Refactor
### Added
- **UI/UX**: Complete "Command Console" redesign.
    - *Nav*: New animated "Pill" navigation bar.
    - *Cards*: New rectangular "Stat Pod" design replacing round badges.
    - *Selection*: Added **Select All** / **Deselect All** controls.
    - *Header*: Integrated "Command Center" header that feels more native.

## [7.0.0] - The "Phoenix" Refactor
### Added
- **UI/UX**: Complete "Liquid Glass" redesign.
    - *Aesthetic*: Implemented Glassmorphism across headers and nav bars.
    - *Performance*: Switched to `DocumentFragment` rendering for 50x faster painting.
    - *Animation*: Added staggered list loading and optimistic UI for discards.
    - *State*: Perfected scroll restoration between tabs.

## [6.9.0] - Elegance & Quality of Life
### Added
- **QOL**: Implemented **Stateful Tabs**. The app now remembers your scroll position, search query, and sort preferences for both the Leaderboard and Headhunter tabs independently.
- **QOL**: Added animated **loading indicator** to the refresh button.
- **QOL**: Added specific, helpful **empty state messages** for the Headhunter pool.

### Changed
- **UI**: Re-imagined the **Selection UI** with an elegant, unobtrusive design.
    - *Logic*: Replaced the left-side bubbles with a **120px wide touch target** on the right edge of the card.
    - *Benefit*: This provides clear visual feedback without ever covering informational content, even in the expanded view.
- **Interaction**: The entire card is now clickable to toggle selection when in Selection Mode, removing the need for a small, dedicated touch zone.
- **Performance**: Minor optimizations to rendering pipeline and event listeners.

## [6.8.0] - Manual Staged Open
### Added
- **Frontend (View)**: Implemented **Staged Manual Open**.
    - *Logic*: Replaced the "Auto-Advance" queue with a robust manual workflow. Users click "Start Opening", and the action button transforms into a step-by-step progress controller (e.g., "Open 1 of 5" -> "Open 2 of 5").
    - *Benefit*: This 100% solves browser security restrictions and "Split View" reliability issues by ensuring every app launch corresponds to a direct, physical user click.
- **Frontend (View)**: Split-View optimization.
    - *Fix*: Deep links are now triggered via a hidden `<a>` tag click instead of window navigation. This allows the web app to remain fully active and responsive while the game opens in a side window, enabling rapid-fire opening without page reloads.

## [6.7.0] - The "Auto-Advance" & UX Overhaul
### Added
- **Frontend (View)**: Implemented **Auto-Advance Bulk Open**.
    - *Breakthrough*: Replaced previous methods with a smart queue. Opening a player now launches the app; when the user switches back to the browser, the app automatically detects the return and launches the next player profile. This solves OS intent blocking and popup issues entirely.
- **Frontend (View)**: **Gradient Selection UI**.
    - *Design*: Replaced the left-side bubbles with a **120px wide touch target** on the right edge of the card.
    - *Visuals*: Uses high-vibrancy gradients (0.85 opacity). Red for unselected/discardable, Green for selected.
    - *Gesture*: Added **Long Press (600ms)** support to any card to instantly enter Selection Mode.
- **Frontend (View)**: Enabled Bulk Selection on the **Leaderboard**.
    - *Context Awareness*: The "Dismiss" button is automatically hidden when in Leaderboard mode to prevent accidental removal of clan members.
- **Recruiter**: Added detailed logging to the Execution Transcript (Keywords used + New Recruits count).

### Changed
- **Recruiter**: Relaxed search filters.
    - *Logic*: Removed the `type === 'open'` restriction. The scanner now checks **Password Protected** tournaments as well, significantly increasing the pool of scannable players.
- **Utilities**: Smarter Backup Logic.
    - *Fix*: `backupSheet` now ignores **Row 1** (Timestamp) when comparing sheets, preventing redundant backups when only the time changes.
- **Frontend (View)**: Separated click interactions.
    - *Body Click*: Expands/Collapses card details.
    - *Right Edge Click*: Toggles Selection state.

## [6.4.2] - Stability & Cache Rotation
### Changed
- **Configuration**: Updated `JSON_STORE_KEY` to `WEB_APP_PAYLOAD_V6_2` to force a clean cache generation for the updated V6 schema.
- **Frontend (View)**: Stabilized injection logic to better handle hydration states.
- **Backend**: Synced version numbers across all modules (`Configuration`, `Controller`, `View`) to `6.4.2` to ensure Manifest integrity during Health Checks.

## [6.4.0] - Bulk Actions & Multi-Select
### Added
- **Frontend (View)**: Introduced **Selection Mode** in the Headhunter tab.
    - *UI*: Added a "Select" button to the header. When active, cards display a selection indicator.
    - *Interaction*: Tapping cards in this mode selects/deselects them instead of expanding details.
- **Frontend (View)**: Added **Floating Action Bar (FAB)**.
    - *UI*: A contextual menu slides up from the bottom when items are selected.
    - **Bulk Open**: A new "Open (N)" button iterates through selected recruits and opens their deep links sequentially.
    - **Bulk Dismiss**: A new "Dismiss (N)" button allows mass-removal of recruits.
- **Frontend (Logic)**: Enhanced `DataService` with optimistic bulk removal logic, ensuring the UI feels instant even when processing multiple backend requests.

## [6.2.3] - Bulletproof Rendering
### Fixed
- **Backend (Configuration)**: Changed the Cache Key to `WEB_APP_PAYLOAD_V6_REDUX`.
    - *Breakthrough Fix*: This implements a **"Cache Bust"** that forces all users to ignore previous data caches (V5/V6.0). This resolves the issue where old data structures (missing the `d` details object) caused the frontend renderer to crash silently, leaving the user with persistent Skeleton screens.
- **Frontend (View)**: Implemented **Guard Clauses** in `renderList`.
    - *Fix*: The loop now explicitly checks `if (!p || !p.d) continue;`. If any row in the dataset is malformed or missing keys, it is safely skipped, allowing the rest of the application to render normally instead of stopping execution.
- **Frontend (View)**: Added global `try...catch` blocks around the rendering logic to catch and display specific errors in the UI rather than hanging.

## [6.2.2] - Robust Fetching
### Added
- **Frontend (View)**: Implemented **Exponential Backoff Retry**.
    - *Logic*: If the `google.script.run` fetch fails (e.g., temporary network error), the app now automatically retries up to 3 times (Delay: 2s, 4s, 6s) before showing an error.
    - *Visual*: Status bar updates to "Retrying (1/3)..." during the process.
- **Frontend (View)**: Added **Slow Connection Warning**.
    - *Logic*: If the fetch takes longer than 6 seconds, the status bar displays "Still working..." to reassure the user that the process is ongoing.
- **Frontend (View)**: Smart Skeleton rendering.
    - *Fix*: Skeletons (Loading indicators) now correctly respect the initial mode (Leaderboard vs Pool) instead of always defaulting to Leaderboard, preventing blank screens when opening the app in Headhunter mode.

## [6.2.1] - Hydration Fix
### Fixed
- **Frontend (View)**: Resolved a critical issue where the Web App would hang on "Loading" (Skeletons) if the server cache was empty.
    - *Diagnosis*: The server served a valid but empty "dummy" payload (`{timestamp: 0}`) when the cache was cold. The frontend interpreted this as "Success" and stopped trying to fetch data, leaving the user with an empty screen.
    - *Fix*: The `DataService.init` now explicitly checks for `timestamp === 0`. If found, it treats the injection as a "Cache Miss" and triggers a background fetch to regenerate the payload.

## [6.2.0] - The "World Class" Refactor (Stability & UX)
### Added
- **Frontend (View)**: Implemented **Client-Side Sorting**. Users can now sort the Leaderboard and Headhunter pools by Score, Trophies, or Name instantly without reloading.
- **Frontend (View)**: Added **War History Visualizer**. The raw text history (e.g., `1200 24W01`) is now rendered as a series of mini-bar charts within the player card, providing immediate visual context on performance trends.
- **Backend (Controller)**: Implemented **"Paranoid" Sanitization**. The `extractSheetData` function now strictly forces every cell into a valid Primitive (String/Number) before JSON serialization.
    - *Fix*: This resolves the critical "Tables don't load" crash caused by Google Sheets returning `#N/A` errors or unexpected Objects in formula cells.
- **Architecture**: Implemented **Hybrid Data Hydration**.
    - *Fast Path*: Server-side Base64 injection for instant painting.
    - *Reliable Path*: If injection fails or cache is corrupted, the client automatically triggers a background `google.script.run` fetch to "Self-Heal".

## [6.1.0] - UTF-8 & Emoji Stability
### Fixed
- **Frontend**: Replaced legacy `atob()` decoding with the modern **`TextDecoder` API**.
    - *Critical Fix*: Solves the issue where Player Names containing specific complex Emojis caused `JSON.parse` to fail, resulting in a blank white screen.
- **Backend**: Enhanced Date handling in `extractSheetData` to strictly output ISO strings, preventing timezone hydration mismatches on client devices.

## [6.0.0] - Web App V6 Foundation
### Changed
- **Architecture**: Complete rewrite of the Web App ecosystem (`Controller_Webapp` and `View_Webapp`).
- **Frontend**: Moved to a modern **Single Page Application (SPA)** architecture with a central State Store (`Store`) and `DataService`.
- **UI**: Introduced an iOS-style "Card" aesthetic with expanded detail views, skeleton loading states, and pinned player highlighting.

## [5.9.17] - UI Polish
### Changed
- **Utilities**: Updated `drawMobileCheckbox` to remove the red background (`#ea4335`) and white font. The checkbox cell now blends seamlessly with the standard sheet interface.

## [5.9.16] - Generalizing Quick Update
### Changed
- **Orchestrator**: Changed the status message in `handleMobileEdit` from **"⏳ Starting Mobile Update..."** to **"⏳ Updating..."** to better reflect that the checkbox works on both Desktop and Mobile.
- **Utilities**: Updated the Checkbox Tooltip/Note from **"⚡ QUICK UPDATE"**.

## [5.9.15] - Mobile Controls Polish
### Changed
- **Orchestrator**: Implemented `handleMobileEdit` to provide immediate feedback.
    - *Visual*: It now writes **"⏳ Starting Mobile Update..."** to cell `B1` immediately after the checkbox is tapped. This resolves the UX issue where users weren't sure if the button press registered on slow connections.
- **Utilities**: Polished `drawMobileCheckbox`.
    - *Style*: Enforced center/middle alignment and bold text for the checkbox cell (A1) to ensure it looks professional on all devices.
- **Configuration**: Bumped versions for Orchestrator and Utilities.

## [5.9.6] - Mobile Controls
### Added
- **Orchestrator**: Implemented `setupMobileTriggers`.
    - *Function*: Creates an **Installable Trigger** for `onEdit` events. This is necessary because simple triggers cannot access external APIs (RoyaleAPI).
    - *Menu*: Added "📱 Enable Mobile Controls" to the main menu.
- **Orchestrator**: Implemented `handleMobileEdit`.
    - *Logic*: Detects clicks on cell **A1** (Configurable). Automatically unchecks the box (reset) and runs the function corresponding to the current sheet (Leaderboard, Database, or Headhunter).
- **Utilities**: Updated `applyStandardLayout`.
    - *Visuals*: Automatically inserts a **Red Checkbox** in cell A1 of every sheet after a layout refresh, ensuring the mobile control is always present.
- **Configuration**: Added `MOBILE_TRIGGER_CELL` to `CONFIG.UI`.

## [5.9.11] - Menu Polish
### Changed
- **UI Menu**: Consolidated action items for a cleaner, polished look.
    - Removed the separator between "Leaderboard" and "Headhunter" actions to group all Core Actions together.
    - Updated menu labels to be more professional (e.g., "Update Leaderboard" instead of "Recalculate", "Health Check" instead of "System Health Check").
    - Updated Menu Title to "👑 Clan Manager".
- **Orchestrator**: Refactored `onOpen` to reflect the new grouped menu structure.
- **Manifest**: Updated version signatures for Configuration and Orchestrator.

## [5.9.14] - Logic Isolation
### Added
- **ScoringSystem**: Created a dedicated `ScoringSystem.gs` file.
    - *Architectural Change*: Moved the protected `ScoringSystem` object from `Leaderboard.gs` to its own file.
    - *Purpose*: This creates a hard physical separation between the "Business Logic" (Math/Sorting) and "Execution Logic" (UI/Fetching). Future edits to `Leaderboard.gs` (e.g., changing columns, fixing fetches) can be done without touching the sensitive scoring math.
- **Orchestrator**: Updated Health Check to verify `ScoringSystem` version.

## [5.9.13] - Logic Protection
### Added
- **Leaderboard**: Introduced `ScoringSystem`, a protected object encapsulating all mathematical and sorting logic.
    - *Purpose*: Prevents accidental regressions during future UI/Layout updates by physically separating Business Logic from Execution Code.
    - *Logic*: Moved War Rate calculation, Score Formulas (Raw/Perf/Decay), and Comparator Logic into the protected zone.

## [5.9.12] - Layout Standardization
### Changed
- **Utilities**: Updated `applyStandardLayout` to enforce strict UI consistency across all sheets.
    - **Fixed Widths**: All data columns are now locked to width `100`.
    - **Alignment**: All cells (Header & Data) are strictly `Center-Middle` aligned.
    - **Wrapping**: Headers now `Wrap`, while Data cells `Overflow` (Clip).
    - **Borders**: Standardized outer borders and full header borders.
    - **Banding**: Alternating row colors now include the Header row.
- **Leaderboard & Recruiter**: Removed module-specific manual column sizing to comply with the new global standard.

## [5.9.11] - Tenure Devaluation (Sort Logic)
### Changed
- **Leaderboard**: Updated Sort Logic to prioritize **New Players** over **Inactive Veterans** when scores are tied.
    - *New Rule*: Added "Days Tracked (Ascending)" as Priority 5 tie-breaker. This pushes players with high tenure but zero contributions to the bottom.
- **Configuration**: Reduced `TROPHY` weight from `0.0005` to `0.0002`.
    - *Impact*: 10,000 trophies now yields only 2 points (previously 5). This prevents high-ladder inactive players from maintaining a safe mid-tier rank based solely on trophies.

## [5.9.10] - Leaderboard Tie-Breaker Logic
### Changed
- **Leaderboard**: Implemented deterministic tie-breaking for players with identical scores.
    - *Order*: Performance Score > Raw Score (Pre-Penalty) > War Rate > Total Donations > Trophies.
    - *Impact*: Inactive players with historical contributions (Total Donations) will now rank higher than inactive players with zero history, even if their scores are tied at the minimum.

## [5.9.9] - Leaderboard Scoring Logic
### Changed
- **Leaderboard**: Updated `Raw Score` formula to include **War Participation Rate**.
    - *Reasoning*: Previously, score relied too heavily on current week stats. Inactive players with high historical contribution (80%+ War Rate) were ranked the same as inactive players with 0 contribution.
    - *Impact*: Players with high War Rate now receive a "Veteran Bonus" (War Rate * 100), ensuring they rank higher than pure "Leeches" even when inactive.
- **Configuration**: Added `WAR_RATE: 100` to Leaderboard Weights.

## [5.9.8] - War Score & Backup Ordering
### Fixed
- **Leaderboard**: Implemented **Max-Merge Logic** for War History.
    - *Issue*: `riverracelog` (Past) sometimes contains the current week with a valid score (e.g., 1650), while `currentriverrace` (Live) reports 0 due to API states.
    - *Fix*: The system now uses `Math.max()` when merging the two data sources, ensuring we always display the highest recorded score for the current week instead of overwriting it with 0.
- **Leaderboard**: Added fallbacks (`medals`, `repairPoints`) to `fame` fetching to handle different race day states.
- **Utilities**: Refined `backupSheet` ordering.
    - *Optimization*: Changed the operation order to **Move** the sheet before **Hiding** it. This ensures the Apps Script `moveActiveSheet` command executes reliably.

## [5.9.7] - War History & Backup Fixes
### Fixed
- **Utilities**: Added `parseRoyaleApiDate` to correctly handle RoyaleAPI's compact ISO date format (`YYYYMMDDThhmmss.sssZ`), which previously caused `NaN` in War Week ID calculations (e.g., `aNWNaN`).
- **Leaderboard**: Updated `updateLeaderboard` to use the new date parser for War Logs, fixing the broken "War History" and "War Rate" calculations.
- **Utilities**: Updated `backupSheet` to strictly enforce **Visual Ordering**. New backups (Backup 1) are now moved immediately after the source sheet (e.g., Source -> Backup 1 -> Backup 2), instead of being appended to the end of the list.

## [5.9.0] - Smart Backup System (Utilities)
### Added
- **Utilities**: Overhauled `backupSheet` function with **Smart Redundancy Checking**.
    - *Logic*: Before rotating backups, the system now compares the current sheet content (via `JSON.stringify`) against `Backup 1`.
    - *Impact*: Identical backups are skipped. This prevents "Backup Spam" where the backup history gets filled with identical copies of of the same sheet.

## [5.9.6] - Backup Strategy Refinement
### Changed
- **Leaderboard**: Optimized Backup Logic. Auto-Backup now runs AFTER safety checks pass.
- **Logger**: Optimized Backup Logic.
- **Recruiter**: Optimized Backup Logic.

## [5.9.5] - Safety Lock System
### Added
- **Leaderboard**: Implemented a **Safety Lock** (Integrity Check) mechanism. Aborts update if Member Count or Total Donations drop by >30%.
- **Leaderboard**: Implemented **Auto-Backup**.

## [5.9.4] - Leaderboard Stability Fixes
### Fixed
- **Leaderboard**: Resolved "Columns out of bounds" error.
- **Leaderboard**: Restored `HYPERLINK` for Player Names.
- **Leaderboard**: Fixed "Total Donations" math (Max-per-Week).
- **Leaderboard**: Restored "War History" fetching and "Last Seen" formatting.

## [5.9.3] - Critical Leaderboard Restoration
### Fixed
- **Leaderbord**: Fixed corrupted logic for "Days Tracked" and "Average Daily".
- **Leaderbord**: Restored missing "Performance Score", "War Rate", and "War History" columns.

## [5.9.2] - Deep Health Check
### Added
- **Orchestrator**: Upgraded `checkSystemHealth` to perform real network "ping" tests on API keys.

## [5.8.6] - Leaderboard Logic
### Documentation
- **Leaderboard**: Expanded architectural comments.

## [5.9.2] - Logger Module Update
### Changed
- **Logger**: Refined `upsertDailySnapshots` logic.

## [5.9.1] - Configuration Update
### Changed
- **Configuration**: Updated Manifest versions. Refactored `API_KEYS` to Objects.

## [5.8.2] - API Terminology Fix
### Fixed
- **API_Public**: Renamed `townHallLevel` to `kingLevel`.

## [5.8.5] - Leaderboard Logic
### Added
- **Leaderboard**: Implemented "Inactivity Decay".

## [5.8.3] - Orchestrator
### Changed
- **Orchestrator**: Reordered `sequenceFullUpdate` to prioritize Web App refresh.

## [5.8.1] - Core Systems Stability
### Fixed
- **Utilities**: `CacheHandler` chunking implementation.
- **Recruiter**: Added `TIME_LIMIT_MS`.
- **Controller_Webapp**: Base64 encoding.
