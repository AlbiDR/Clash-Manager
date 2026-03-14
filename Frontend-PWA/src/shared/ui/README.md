# Shared UI — Molecule Layer

The **Atomic Foundry**. A collection of domain-blind UI components (Layer 2) that provide the structural and interactive primitives for the Clash Manager interface.

---

## Purpose
The `@shared/ui` layer enforces visual consistency and interaction standards across all features. It encapsulates complex UI logic (e.g., Pull-to-Refresh, FAB synchronization, and squish interactions) so that feature developers can focus on domain-specific data.

## Architectural Context
- **Layer**: Layer 2 (@shared)
- **Isolation**: Domain-blind. Components in this layer must **never** import from Layer 3 (@features) or Layer 4 (@app).
- **Dependencies**:
  - `@core`: For haptics, UI coordination, and mode settings.
  - `vanilla-css`: All styling is encapsulated in scoped `<style>` blocks following the Sovereign Design System.

---

## Core Orchestration

### Layout Orchestration (`ConsoleLayout.vue`)
The primary shell for all feature views. It declaratively manages the view lifecycle:
- **States**: Seamlessly transitions between `loading` (skeletons), `empty`, `error`, and `content` states.
- **FAB Synchronization**: Orchestrates the Floating Action Button via the `useUiCoordinator` singleton, ensuring content is hydrated before visibility toggles to prevent layout shifts.
- **Pull-to-Refresh**: Integrated haptic-enabled refresh logic for mobile-first responsiveness.

### Interaction Primitives (`BaseCard.vue`)
The foundational data container.
- **Visual Feedback**: Implements "Squish" interactions and haptic patterns via the `v-tactile` directive.
- **Dynamic Theming**: Features "Stat Pods" that dynamically scale their background color based on performance scores using `color-mix`.
- **Selection Mode**: Supports integrated multi-select states with unified border and background transitions.

---

## Component Catalog

| Component | Responsibility |
| :--- | :--- |
| **ConsoleLayout** | Master view shell with integrated header, FAB, and PTR logic. |
| **ConsoleHeader** | Standardized view header with search, sort, and status pills. |
| **BaseCard** | The primary container for data items (Members, Recruits). |
| **SelectionBar** | Contextual controls for batch operations and score-based filtering. |
| **EmptyState** | Declarative empty-state display with custom icons and hints. |
| **ErrorState** | Full-view error recovery interface with retry logic. |
| **ErrorBoundary** | Resilience wrapper that catches component-level crashes. |
| **SettingRow** | Unified, accessible row for settings toggles and inputs. |
| **StatusPill** | Semantic labels for "Ready", "Error", or "In-Sync" states. |
| **FloatingDock** | The global orchestrator for the Floating Action Button (FAB). |

---

## Visual Integrity
All components adhere to the **Sovereign Design System**:
- **Glassmorphism**: Surface containers use hardware-accelerated blurs and variable translucency.
- **Motion**: Transitions use the standard `--sys-motion-spring` curve for organic-feeling interactions.
- **Accessibility**: Hit targets are enforced at a minimum of 44px (via `.hit-target` helper) to ensure mobile usability.
