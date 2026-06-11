# Leaderboard Player Harvesting and Dynamic Blitz Integration Plan

This document outlines the architecture, rationale, and implementation details for transiently recruiting clanless players from Clash Royale leaderboards without polluting the persistent database.

## 1. Context and Rationale

*   **Zero Persistent Database Pollution:** Standard recruitment scoring relies on querying individual profiles and recording status rows in the backend database. Leaderboard players change status quickly and do not need to be saved permanently. This feature harvests profiles dynamically on-demand, storing them only in the client-side transient memory.
*   **Minimal API Footprint:** The leaderboard responses include nested clan affiliation details. By parsing this information on the client side, we can filter for clanless players with zero additional API queries.
*   **Aesthetic Controls:** The Floating Action Button (FAB) dock will automatically hide the standard individual "Open" action when Blitz mode is active in the Headhunter view. In its place, the main "Blitz" trigger is displayed next to two new action buttons: "Global Harvest" and "Local Harvest" using custom SVG icon designs.
*   **Selective Button Hiding:** The behavior of hiding the classic "Open" button is scoped strictly to views where Blitz is active (the Headhunter view). In views where Blitz is disabled (such as the Roster view), the classic "Open" action remains fully visible and active.
*   **Dynamic International Rotation:** Since the Clash Royale API does not support local leaderboard queries for the "International" location code, the system will dynamically query the list of all available locations, filter for valid country elements, and choose one country at random. The user is informed of the selected country via a dynamic toast notification.
*   **No Queue Size Capping:** The harvest query will import all identified clanless players onto the recruitment queue without restriction. The recruiter retains full manual control and can halt the Blitz loop at any time.

## 2. Code Documentation Standards

*   **Mandatory JSDoc/TSDoc Blocks:** All new features, variables, methods, and functions must be fully documented using standard TSDoc/JSDoc formats.
*   **README Documentation:** Updates to component and feature structures should be reflected in the respective feature or shared folder README files to maintain project transparency.

## 3. Advanced Implementation Considerations

*   **Resilient Error Handling and UI States:** If either the location list query or the ranking retrieval fails (due to network drops or proxy downtime), the UI should transition out of the loading state and raise a defensive toast notification using `useToast` rather than failing silently.
*   **Location Cache Optimization:** To avoid requesting the entire locations directory on every Local Harvest trigger for International clans, the resolved country array should be cached in memory. Subsequent harvests during the active session will reuse the list.
*   **Haptic Integration:** Trigger high-quality haptic feedback via the existing `useHaptics` service when harvest operations are initiated or successfully loaded.
*   **Screen Wake Lock:** Integrate the project's existing `useWakeLock` helper to prevent mobile screen sleep during extended, uncapped Blitz invite sequences.
*   **Harvest Abort Mechanics:** We will equip the network requests with an `AbortController`. During the active harvest API request, clicking the danger dismiss button in the dock will trigger the abort signal, cancel the fetch, restore UI states, and prevent UI locks if the connection hangs.
*   **Loading Constraints:** During an active harvest fetching state, all other actions in the Floating Dock (including the primary Blitz button) are disabled, and a loading spinner is rendered directly on the selected harvest button to provide unambiguous visual feedback.
*   **Button Sizing Hierarchy:** The Floating Dock will maintain visual hierarchy by keeping the primary Blitz button prominent. The new Global and Local Harvest buttons will be positioned side-by-side as smaller, compact circular actions flanking the main button.

## 4. Component Design and Changes

### Core API and Services

#### useUiCoordinator.ts
*   Add action callback fields for the new harvest operations: `onGlobalHarvest` and `onLocalHarvest`.
*   Add an `isHarvesting` state flag and an `onAbortHarvest` callback.
*   Support hiding the classic "Open" button if Blitz is active.

### Feature Domain (Headhunter)

#### useLeaderboardScraper.ts
*   A new composable dedicated to coordinating the on-demand query.
*   Resolves the target country (dynamically fetching all valid country regions if the clan is set to International, or using the clan's registered region).
*   Requests the leaderboard rankings, filters out players in a clan, updates the selection store, and calls the Blitz execution flow.
*   Manages the `AbortController` instance to support canceling requests.

#### useRecruiter.ts
*   Injects the scraper composable functionality.
*   Registers the FAB callback actions to launch the harvest procedures.
*   Handles loading state transitions and abort signaling.

### Molecule UI Layer

#### FloatingDock.vue
*   Update the selection FAB state view.
*   If Blitz is enabled:
    *   Hide the primary "Open" button.
    *   Add the secondary "Global Harvest" and "Local Harvest" buttons next to the primary "Blitz" button.
*   Integrate two new custom icons: `globe` (for global) and `map_pin` (for local).
*   Integrate disabled states, loading spinners, and abort button routing.

## 5. Verification Plan

### Automated Coverage
*   Implement unit tests for the scraper composable to check parsing logic, clanless filtering, abort signal triggers, and the random country selection fallback.
*   Provide network-layer mocks for the location and ranking endpoints.

### Manual Walkthrough
*   Configure the local settings, toggle Blitz mode, and verify the UI state changes.
*   Simulate an International clan sync and trigger Local Harvest to verify the random country selection.
*   Trigger a harvest, click Abort mid-request, and confirm that the loading state is cancelled.
