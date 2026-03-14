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
- **ConsoleList.vue**: Specialized list container with Showcase Mode support and `v-auto-animate` integration.

### UI Primitives
Atomic elements that form the basis of the design system.
- **BaseCard.vue**: The foundational card unit. Implements squish-interactions, selection states, and reactive `stat-pod` coloring.
- **Icon.vue**: The authoritative SVG renderer. Centralizes vector path definitions and ensures CSS variable consistency.
- **StatusPill.vue**: Context-aware indicators for system health and sync status.

### Resilience & Feedback
Components responsible for system stability and user notifications.
- **ErrorBoundary.vue**: Captures runtime anomalies and provides a graceful recovery path (Resilience #45).
- **ToastContainer.vue / Toast.vue**: Global notification system for transient system messages.
- **EmptyState.vue**: Declarative feedback for empty data sets with custom icon and hint support.

## Integration Standards
Components in this layer must adhere to the **Visual Purity** protocol:
- **No Third-Party Libraries**: All icons and styles are custom-crafted.
- **CSS Variable Driven**: Styles must consume `--sys-color-*` variables injected by the Core Theme engine.
- **Accessibility**: Minimum touch targets of 48px and descriptive ARIA labels are mandatory.

## Testing Strategy
Each component is verified via Vitest (`*.spec.ts`) located in the sibling `__tests__/` directory. Tests focus on prop-driven rendering, event emission, and visual state transitions.
