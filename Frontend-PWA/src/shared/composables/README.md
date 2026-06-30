# Shared Composables (@shared/composables)

The **Behavioral Engine Room**. A collection of stateful logic engines that manage component-level behaviors, hardware brokerage, and reactive UI states across the Clash Manager ecosystem.

---

## Purpose
Shared Composables (Layer 2) encapsulate complex, reusable logic that is agnostic of specific business domains. They bridge the gap between low-level Core services and the declarative View layer, providing reactive interfaces for hardware interactions, gesture sensing, and UI orchestration.

## Architectural Context
- **Layer**: Layer 2 (@shared/composables)
- **Role**: Behavioral Logic.
- **Import Boundaries**:
  - **Allowed**: Can import from Layer 1 (@core) and Layer 0 (@substrate).
  - **Forbidden**: Strictly forbidden from importing from Layer 3 (@features) or Layer 4 (@app).

## Composable Registry

### Hardware & OS Brokerage
Reactive interfaces for interacting with device capabilities and OS-level APIs.
- **useHaptics.ts**: Brokered access to the device vibration motor. Supports standardized patterns (tap, medium, success, error) and respects user preferences for tactile feedback.
- **useWakeLock.ts**: Manages the Screen Wake Lock API to prevent device dimming during long-running operations (e.g., simulations or active monitoring).
- **useViewport.ts**: Orchestrates viewport-aware reactivity and breakpoint sensing (Mobile/Tablet/Desktop).
- **useTheme.ts**: Master arbiter for theme-aware visual states. Toggles the 'dark' class, persists preferences, and rewrites the 'theme-color' meta tag.

### Interaction & Gesture Sensing
Logic for detecting and responding to user input patterns.
- **useLongPress.ts**: Hardware-accelerated long-press gesture detection with integrated haptic feedback.
- **usePullToRefresh.ts**: Orchestrates native-feeling pull-to-refresh gestures and synchronization triggers.
- **useHeaderScroll.ts**: Provides reactive scroll-depth detection for adaptive header styling.
- **useCardMechanics.ts**: Manages "squish-interactions," selection states, and semantic scaling for card-based UI elements.

### Data Visualization & Mathematics
Helpers for translating raw data into visual structures.
- **useHistoryChart.ts**: Centralizes history parsing, slicing, and weighted trend prediction for visualization components.
- **useBaseHistoryChart.ts**: Handles the geometric translation of raw values into SVG paths and bar heights.
- **useBenchmarkedStat.ts**: Encapsulates reactive logic for generating benchmarking tooltips against clan averages.

### UI State Orchestration
Logic for managing complex UI patterns and component lifecycles.
- **useCountdown.ts**: High-performance interval timer for real-time expiration feedback (e.g., Voyage banners).
- **useStatusPill.ts**: Centralizes expansion state and reactive label formatting for connectivity status indicators.
- **useSelectionBar.ts**: Encapsulates lifecycle logic for bulk operation surfaces.
- **useScoreSelector.ts**: Orchestrates the UI logic for score threshold picking and comparison mode toggling.

### Voyage Feature Composables
Specialized behavioral logic for the Clan Voyage subsystem, promoted to the Shared layer to resolve cross-feature dependency violations.
- **voyageTypes.ts**: Authoritative domain models and enums for the Voyage subsystem, ensuring type safety across Layer 2 components and composables.
- **useVoyageStore.ts**: Manages the reactive state for active voyages and contributions.
- **useVoyageStatus.ts**: Resolves the current phase and progress of a voyage event.
- **useVoyageActions.ts**: Orchestrates the lifecycle of voyage management (Activation, Ledger Sync).
- **useVoyageForm.ts**: Manages the state and validation for the voyage configuration interface.

---

## Integration Standards
- **Ref/Getter Support**: Composables should favor 'MaybeRefOrGetter' for input parameters to support maximum reactivity.
- **Cleanup Responsibility**: Always use 'onUnmounted' or 'onScopeDispose' to clean up timers, event listeners, or hardware locks.
- **Domain Blindness**: Core shared composables must remain domain-blind. Voyage-specific composables are an architectural exception residing in this layer for structural unitary compliance.
