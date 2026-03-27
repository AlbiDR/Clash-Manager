# ADR Specification: PWA Status & Headhunter Freshness

This document defines the clinical transition from a noisy status UI to an **Exception-Based Reporting** model, while simultaneously fortifying the Headhunter data pipeline for the Clash-Manager stack.

---

## I. Core Objectives

1.  **Visual Purity**: Transition the `StatusPill` to a "Dot-Only" design that remains silent in healthy states.
2.  **Interaction Modernization**: Enforce **Pull-to-Refresh** as the primary sync driver, purging legacy manual triggers (ADR compliance).
3.  **Data Freshness**: Resolve the "Just Now" staleness bug by synchronizing the frontend UI with authoritative backend timestamps.
4.  **Operational Depth**: Ensure a persistent "Fresh Pool" of 100 recruits by bridging the active `HH` sheet with the `HH_QUEUE`.

---

## II. UI State Machine Contract

The `StatusPill` behavior is governed by a strict state hierarchy based on **Hub Age** (Time since last Worker compilation) and **Transport Layer**.

| State | Condition | Visual Representation | Label Behavior |
| :--- | :--- | :--- | :--- |
| **NOMINAL** | Hub Age < 15m · Worker active | Green Pulse Dot | **Dot Only** (Hidden Label) |
| **STALE** | Hub Age > 15m · Worker active | Amber Pulse Dot | **Expanded Pill**: "Hub: Xm" |
| **DEGRADED** | GAS Fallback active | Amber Pulse Dot | **Expanded Pill**: "Transport: GAS" |
| **CRITICAL** | Network Error · Offline | Red Pulsing Dot | **Expanded Pill**: "Offline" |

### Interactivity: "Tap-to-Inspect"
- **Single Tap**: Toggles the **Expanded Detail** view regardless of state.
- **Micro-Mechanical**: Triggers a subtle **haptic "heavy" tap** using `useHaptics` in Layer 2.
- **Transparency**: Displays technical metadata in an elegant sub-label:
    - `Transport: Hub/GAS`
    - `Schema: v13.x`
    - `Last Success: [Time] Ago` (Always visible, providing context even when "Offline").
- **Persistence**: Auto-collapses after **5 seconds** of inactivity.

---

## III. Layered Implementation Strategy

### [Layer 1] Core: Logic & Utilities
- **`useClashDataStore.ts`**: Fix `lastSyncTime` hydration. It must consume the payload `timestamp` rather than local `Date.now()`.
- **`formatters.ts`**: Refine time formatting to ensure consistency across the "Status Dot" and "Expanded Detail" labels.

### [Layer 2] Shared: UI Components & Composables
- **`StatusPill.vue`**: 
    - **Visual**: `max-width` + `opacity` transitions for smooth expansion.
    - **Styling**: `backdrop-filter: blur(12px)` and a 1px `border: 255,255,255,0.1` highlight (Glassmorphism).
    - **Animations**: Add a subtle, non-distracting "Pulsing Nucleus" animation to the status dot.
    - **Aesthetics**: Premium HSL tokens: `Mint (Success)`, `Amber (Warning)`, `Coral (Danger)`, `Slate (Shimmer)`.
    - **Shimmer State**: Implement a shivering skeleton dot during the initial hydrate/fetch phase before data becomes available.
- **`index.html` (Substrate)**: Hardcode the initial "Success Dot" and minimal styles to guarantee 100/100 Lighthouse scores.

### [Layer 3] Features: Headhunter
- **`Webapp_Controller.ts` (Backend)**: 
    - Refactor `_generatePayloadInternal` to merge the active `HH` sheet (50) with the `HH_QUEUE` (top 50).
    - **Exclusion Filter**: Both pools must be filtered against `BL` (Blacklist) and `EVT` (Dismissals) in a single pass.

### [Layer 4] App: UI Orchestration & Haptics
- **`ConsoleHeader.vue`**: Aggressive pruning of manual refresh event handlers.
- **`StatusPill` Trigger**: Integrate `useHaptics` to deliver tactile feedback during manual inspection and state transitions.

---

## IV. Data Integrity Protocols

### Headhunter "Fresh Pool" Buffer
To replicate the legacy "refresh for more" UX, the payload maintains a **200% depth** (100 recruits) against the viewable limit (50). This allows the PWA to locally "backfill" slots immediately after a dismissal without requiring a 15-minute wait for the next Worker scout.

---

## VI. Technical Implementation Roadmap

### Phase 1: Core Logic (Layer 1)

1.  **`useClashDataStore.ts`**:
    - Update `startBackgroundSync` and `loadLocal` to extract the `timestamp` from the server payload.
    - Set `lastSyncTime.value = payload.data.timestamp` to ensure freshness is server-authoritative.
2.  **`useConsoleController.ts`**:
    - Implement the `status` computed property using the new hierarchy:
        - `isError` -> `danger`
        - `isGAS` or `hubAge > 15m` -> `warning`
        - `isNominal` -> `success` (Force Dot-Only mode).
3.  **`formatters.ts`**:
    - Ensure `formatTimeAgo` handles the new `timestamp` correctly and provides clean "Xm" labels for the pill.

### Phase 2: Shared UI Primitives (Layer 2)

1.  **`StatusPill.vue`**:
    - **Reactive State**: Add `isHovered` (for desktop) and `isExpanded` (for touch toggle).
    - **Haptics**: Import `useHaptics` and call `vibrate('heavy')` on tap and state changes (Success -> Warning).
    - **Styles**:
        - Class `.status-pill`: Add `backdrop-filter: blur(12px)` and `transition: max-width 0.4s ease, opacity 0.3s`.
        - Class `.status-dot`: Add `@keyframes pulse` for the nucleus animation.
        - Class `--shimmer`: Add linear-gradient animation for the initial loading skeleton.
    - **Logic**: Implement `setTimeout` to reset `isExpanded = false` after 5 seconds.
2.  **`index.html` (Substrate)**:
    - Update `.sh-pill` CSS: Change default `width` to `12px` and `height` to `12px` (Dot shape).
    - Remove `sh-pulse` from the HTML body by default, replacing it with the `shimmer` class for the loading phase.

### Phase 3: Feature Architecture (Layer 3)

1.  **`Webapp_Controller.ts`**:
    - Modify `_generatePayloadInternal`.
    - Add `const queueResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH_QUEUE, "hh")`.
    - Implement `const combinedHH = [...hhResult.rows, ...queueResult.rows.slice(0, 50)]`.
    - Ensure the `exclusionSet` (Dismissals + Blacklist) is applied to the final `combinedHH` array.
    - Cap the final response at 100 recruits.

### Phase 4: App Orchestration (Layer 4)

1.  **`ConsoleHeader.vue`**:
    - Remove the `@click="handleRefresh"` from the template.
    - Delete the `handleRefresh` method and any associated `syncing` local state that is no longer needed.
2.  **`ConsoleLayout.vue`**:
    - Verify that `PullToRefresh` is correctly bound to `store.refresh()` to serve as the exclusive manual sync interaction.

---

## V. Verification Protocol

### Automated
- `vitest` unit tests for `useConsoleController` state transitions.
- Lighthouse CI check for hydration parity on the status substrate.

### Manual
1.  **PWA Load**: Verify minimal shimmer dot transitioning into a green pulse dot.
2.  **Tap Interaction**: Verify tech-metadata expansion, haptic feedback, and 5s auto-collapse.
3.  **Offline Simulation**: Disable network; verify "Offline" pill replaces dot and shows "Last Success: [X]m Ago" in detail.
4.  **Recruit Refill**: Dismiss 5 recruits, pull-to-refresh; verify the list fills from the "Fresh Pool" buffer.
