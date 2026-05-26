# Shared UI - Molecule Layer

The **Atomic Foundry**. A collection of domain-blind UI building blocks and layout orchestrators that define the visual language of the Clash Manager ecosystem.

---

## Purpose
The Shared UI directory (Layer 2) contains reusable components that are agnostic of specific business logic. These components are designed to be "dumb" or brokered, receiving data via props and emitting events for higher-layer orchestration.

## Architectural Context
- **Layer**: Layer 2 (@shared)
- **Isolation**: Strictly decoupled. A Molecule **NEVER** imports from Layer 3 (Features) or Layer 4 (App).
- **Dependencies**:
  - `@core/theme`: Sovereign Design System tokens and injection.
  - `@core/services`: Infrastructure singletons (Haptics, UI Coordinator).
  - `@core/utils`: Pure utility primitives.

## Component Categories

### Layout Orchestration
Standardized containers that manage view-level states like loading, errors, and empty results.
- **ConsoleLayout.vue**: The primary structural shell for feature views. Manages the `ConsoleHeader`, FAB synchronization, pull-to-refresh logic, and `remoteInfo` orchestration.
- **ConsoleHeader.vue**: Standardized view header. Handles search debouncing, sorting controls, and visual status indicators (StatusPill).
- **ConsoleList.vue**: Specialized list container with Showcase Mode support and `v-auto-animate` integration.
- **AppFooter.vue**: Global navigation anchor and legal/version information container.
- **SettingsCard.vue**: Collapsible container for feature settings and configurations. Supports header slots, loading states, and smooth "spring" transition animations.
- **SkeletonSettingsCard.vue**: Placeholder variant for settings cards with staggered skeleton animations to prevent layout shifts.

### Data Visualization
Generic, high-performance visualization components.
- **BaseHistoryChart.vue**: A domain-blind charting engine for visualizing chronological trends. Supports linear best-fit trajectories, projected next values, and theme-specific color palettes (War/Voyage).

### UI Primitives
Atomic elements that form the basis of the design system.
- **BaseBadge.vue**: Low-level atomic component for all badge-like UI elements. Standardizes the 'badge' class styling and provides a consistent interface for metadata display.
- **BaseCard.vue**: The foundational card unit. Implements "squish-interactions," selection states, and semantic container scaling for metrics based on performance scores.
- **BaseCardSkeleton.vue**: Placeholder variant of the card for loading states.
- **Icon.vue**: The authoritative SVG renderer. Centralizes vector path definitions in `@core/theme/icons` and ensures CSS variable consistency with `non-scaling-stroke` vector effects.
- **StatusPill.vue**: Interactive system health indicator. Supports 4-tier status categories and expands to reveal `remoteInfo` metadata, including backend source (Supabase) and data age.
- **MomentumPill.vue**: Specialized indicator for performance trends and momentum metrics.
- **StatisticItem.vue**: Labeled data point with standardized typography and spacing.
- **StatsGrid.vue**: Responsive layout component for displaying player statistics in 2 or 3 columns.
- **SettingRow.vue**: Unified molecule for feature settings, supporting toggles, loading states, and disabled variants.

### Player Identity Badges
Standardized molecules for rendering player-specific metrics and metadata with integrated benchmarking.
- **TrophyBadge.vue**: Displays trophy counts with context-aware benchmarking tooltips (LB: Leaderboard vs HH: Headhunter).
- **ScoreBadge.vue**: Renders PeS (Performance Score) / PoS (Potential Score) with integrated benchmarking and optional `MomentumPill` support.
- **RoleBadge.vue**: Semantic-colored indicator for clan roles (Leader, Co-Leader, Elder, Member).
- **TenureBadge.vue**: High-density display for "Days in Clan" tracking.
- **LongevityBadge.vue**: Displays discovery or activity duration (e.g., '2h 15m').
- **TagBadge.vue**: Standardized component for displaying player tags with consistent truncation (#ABC12).

### Interactive Molecules
Components that facilitate user interaction and state management.
- **DurationInput.vue**: Specialized input molecule for relative Time-to-Timestamp (T2T) configuration. Provides a standardized Days/Hours/Minutes interface with auto-clamping.
- **CardActions.vue**: Extensible action bar for card-level operations (Dismiss, Promote, etc.).
- **SelectionBar.vue**: Contextual bottom bar for bulk operations in multi-select modes.
- **FloatingDock.vue**: Dynamic action hub for global or view-specific high-priority triggers.
- **HeaderInfoOverlay.vue**: Accessible detail layer for explaining view-specific metrics or statuses.

### Resilience & Feedback
Components responsible for system stability and user notifications.
- **ErrorBoundary.vue**: Captures runtime anomalies and provides a graceful recovery path.
- **ErrorState.vue**: Specialized view for displaying handled error messages and recovery actions.
- **ToastContainer.vue / Toast.vue**: Global notification system for transient system messages.
- **EmptyState.vue**: Declarative feedback for empty data sets with custom icon and hint support.

---

## Layout Orchestration Details

### Empty-State Orchestration
`ConsoleLayout.vue` provides a declarative interface for managing empty states, eliminating the need for local boilerplate in feature views. When the `isEmpty` prop is true, it automatically renders the `EmptyState.vue` component using the following orchestration props:

- `emptyMessage`: The primary headline (e.g., "No Recruits Found").
- `emptyHint`: Supporting text or action guidance (e.g., "Try adjusting your filters").
- `emptyIcon`: The name of the icon to display (must correspond to a valid key in `icons.ts`).

### Provenance Orchestration (remoteInfo)
The Molecule Layer centralizes backend provenance reporting. `ConsoleLayout.vue` accepts a `remoteInfo` prop (Standardized in Layer 1 `@core/types`) and propagates it to the `ConsoleHeader` (via `StatusPill`). This ensures that users always have visibility into the data source (Supabase) and its authoritative age across all feature consoles.

## Integration Standards
Components in this layer must adhere to the **Visual Purity** protocol:
- **No Third-Party Libraries**: All icons and styles are custom-crafted.
- **CSS Variable Driven**: Styles must consume `--sys-color-*` variables injected by the Core Theme engine.
- **Accessibility**: Minimum touch targets of 48px and descriptive ARIA labels are mandatory.

## Testing Strategy
Each component is verified via Vitest (`*.spec.ts`) located in the sibling `ui-tests/` directory. Tests focus on prop-driven rendering, event emission, and visual state transitions.
