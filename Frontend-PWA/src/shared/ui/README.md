# Shared UI — Atoms & Molecules

The **Component Foundry**. A collection of domain-blind, highly-reusable UI primitives (Layer 2) that form the visual language of the Clash Manager ecosystem.

---

## Purpose
The `@shared/ui` layer provides the fundamental building blocks for all feature views. These components are strictly stateless (receiving data via props and communicating via events) and agnostic to business logic, ensuring they can be reused across different features like the Roster, Headhunter, or Laboratory.

## Architectural Context
- **Layer**: Layer 2 (@shared)
- **Isolation**: Domain-blind. Components must not import from Layer 3 (@features) or Layer 4 (@app).
- **Registry**: All components are exported via the barrel protocol in `src/shared/ui/index.ts`.

## Core Components

### Layout Orchestration
- **ConsoleLayout.vue**: The primary structural shell for feature views. Handles Pull-to-Refresh logic, FAB synchronization via `useUiCoordinator`, and manages sub-states (Loading, Empty, Error).
- **ConsoleHeader.vue**: A sophisticated header component with integrated search debouncing (300ms), sort selection, and status indicators.
- **ConsoleList.vue**: A performance-optimized list renderer that supports "Showcase Mode" (hybrid single-item + skeleton layout) and time-sliced progressive rendering.

### Resilience & Feedback
- **ErrorBoundary.vue**: A "Safety Net" component (Resilience #45) that captures runtime exceptions using `onErrorCaptured`, preventing app-wide crashes and providing diagnostic recovery paths.
- **EmptyState.vue**: A declarative component for representing the absence of data, featuring customizable icons, messages, and action slots.
- **ErrorState.vue**: Specialized feedback for synchronization or network failures, including retry mechanisms.

### UI Primitives
- **BaseCard.vue**: The atomic unit for data display. Implements shared styles for glassmorphism and consistent spacing.
- **Icon.vue**: The hardware broker for the custom SVG icon system. Ensures visual purity and consistent stroke scaling.
- **StatusPill.vue**: A compact indicator for lifecycle states (e.g., "Updated", "Ready", "Syncing").
- **Toast.vue / ToastContainer.vue**: System-level notification components managed via the `useToast` singleton.

## Design Patterns
- **Stateless Molecules**: Components focus on presentation and interaction; state management is delegated to parent views or composables.
- **Hardware-Accelerated blurs**: Utilizes CSS `backdrop-filter` and HSL variable injection for high-performance glassmorphism.
- **Micro-Interactions**: Integration with `@shared/composables` for haptic feedback and fluid spring animations.
