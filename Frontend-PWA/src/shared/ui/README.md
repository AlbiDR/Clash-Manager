# Shared UI — Molecule Layer

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
- **ConsoleLayout.vue**: The primary structural shell for feature views. Manages the `ConsoleHeader`, FAB synchronization, and pull-to-refresh logic.
- **ConsoleHeader.vue**: Standardized view header. Handles search debouncing, sorting controls, and visual status indicators.
- **ConsoleList.vue**: Specialized list container with Showcase Mode support and `v-auto-animate` integration.
- **AppFooter.vue**: Global navigation anchor and legal/version information container.

### UI Primitives
Atomic elements that form the basis of the design system.
- **BaseCard.vue**: The foundational card unit. Implements squish-interactions, selection states, and reactive `stat-pod` coloring.
- **BaseCardSkeleton.vue**: Placeholder variant of the card for loading states.
- **Icon.vue**: The authoritative SVG renderer. Centralizes vector path definitions and ensures CSS variable consistency.
- **StatusPill.vue**: Context-aware indicators for system health and sync status.
- **MomentumPill.vue**: Specialized indicator for performance trends and momentum metrics.
- **StatisticItem.vue**: Labeled data point with standardized typography and spacing.
- **SettingRow.vue**: Unified molecule for feature settings, supporting toggles, loading states, and disabled variants.

### Interactive Molecules
Components that facilitate user interaction and state management.
- **CardActions.vue**: Extensible action bar for card-level operations (Dismiss, Promote, etc.).
- **SelectionBar.vue**: Contextual bottom bar for bulk operations in multi-select modes.
- **FloatingDock.vue**: Dynamic action hub for global or view-specific high-priority triggers.
- **HeaderInfoOverlay.vue**: Accessible detail layer for explaining view-specific metrics or statuses.

### Resilience & Feedback
Components responsible for system stability and user notifications.
- **ErrorBoundary.vue**: Captures runtime anomalies and provides a graceful recovery path (Resilience #45).
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

This ensures visual consistency across the application while allowing features to provide context-specific messaging.

## Integration Standards
Components in this layer must adhere to the **Visual Purity** protocol:
- **No Third-Party Libraries**: All icons and styles are custom-crafted.
- **CSS Variable Driven**: Styles must consume `--sys-color-*` variables injected by the Core Theme engine.
- **Accessibility**: Minimum touch targets of 48px and descriptive ARIA labels are mandatory.

## Testing Strategy
Each component is verified via Vitest (`*.spec.ts`) located in the sibling `ui-tests/` directory. Tests focus on prop-driven rendering, event emission, and visual state transitions.
