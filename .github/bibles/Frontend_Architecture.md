# Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Six Layers of "Antigravity"

We employ a **Strict Unitary Architecture**. Code, configuration, and assets must live exactly where they belong.

### Layer 0: Substrate (@static) [Foundation]
**Definition**: The pre-hydration shell and public environment.
- **Rule**: Minimum footprint. Assets must be optimized (WebP/SVG/WOFF2). Zero legacy artifacts or placeholders permitted.
- **Contents**:
  - `index.html`: The critical path shell (SEO & LCP stability).
  - `assets/`: Domain-specific media silos (e.g., `game/`).
  - `fonts/`: Variable font primitives.
  - `manifest.json`: OS-level PWA integration logic.

### Layer 1: Core (@core) [Kernel]
**Definition**: Agnostic infrastructure. Pure logic required to boot and transport data.
- **Rule**: Pure TypeScript only. Agnostic to specific feature views.
- **Contents**:
  - `api/`: Abstract transport clients.
  - `theme/`: Global styling tokens, shared icons, and base CSS.
  - `services/`: Infrastructure singletons (Loggers, Drivers, Storage).
  - `types/`: Domain-agnostic TypeScript definitions.
  - `utils/`: Algorithmic primitives and math engines.

### Layer 2: Shared (@shared) [Molecules]
**Definition**: Domain-blind UI and logic building blocks.
- **Rule**: Components must be "dumb" (state from props, emit events up).
- **Contents**:
  - `ui/`: Stateless elements (Icon, Button, Card, Skeleton).
  - `composables/`: Reusable browser behaviors (Haptics, WakeLock).
  - `directives/`: Global Vue directives (Tooltip, Tactile).

### Layer 3: Features (@features) [Business]
**Definition**: Self-contained business silos. Fractal structure.
- **Rule**: A Feature **NEVER** imports from another Feature. 
- **Structure**:
  - `laboratory/`, `headhunter/`, `roster/`, `settings/`.

### Layer 4: App (@app) [Glue]
**Definition**: Context-aware orchestration.
- **Rule**: Only App imports from Features.
- **Contents**:
  - `router/`: Navigation and transitions.
  - `layouts/`: The Shell/Container.
  - `sw.ts`: PWA Service Worker logic.
  - `main.ts/App.vue`: Boot sequence.

### Layer 5: Control (@root) [Environment]
**Definition**: Project orchestration and type governance.
- **Rule**: Dependency minimalism. Strict pruning of ephemeral dev-tools and legacy configurations.
- **Contents**:
  - `vite.config.ts`: Alias map and build-time orchestration.
  - `package.json`: Dependency manifests and version truth.
  - `tsconfig.json`: Strict-mode TypeScript configuration.

---

## 2. The "OCD Verification" Checklist

Before completing any task, verify:
1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts` (Barrel Protocol)?
3. [ ] **Naming**: Does it follow the strict naming table?
4. [ ] **Deduplication**: Have you eliminated redundant code paths?
5. [ ] **Tests**: Is there a corresponding test in a sibling `__tests__` folder?
6. [ ] **Types**: Are all public interfaces explicitly typed? No `any`.
7. [ ] **A11y**: Are touch targets and ARIA labels correct?
8. [ ] **Visual Purity**: Absolutely zero emojis present in the code or documentation.
9. [ ] **Synchronization**: Does the `index.html` shell title match the initial Feature registry state?
10. [ ] **Pruning**: Have all unused assets/legacy files been purged from the environment?

---

## 3. The Registry Strategy (Barrel Protocol)

To prevent "Graph Spaghetti," every significant module defines a **Public API** via an `index.ts` file.
- **Consumer Rule**: Always import from the Registry alias (`@features/laboratory`).
- **Internal Rule**: Internal files can use relative imports; external consumers must use the alias.

---

## 4. Naming Conventions (Strict Case)

| Type | Convention | Example |
| :--- | :--- | :--- |
| **Directories** | `kebab-case` | `features/headhunter`, `shared/ui` |
| **Components** | `PascalCase` | `UpgradeCard.vue`, `Icon.vue` |
| **Composables** | `camelCase` (prefixed `use`) | `useLaboratory.ts` |
| **Classes/Singletons** | `PascalCase` | `GasClient.ts`, `StorageService.ts` |
| **Types/Interfaces** | `PascalCase` | `PlayerData`, `OptimizationResult` |
| **Assets/Media** | `kebab-case` | `currency-gold.webp`, `pwa-maskable.png` |
| **Config/Static** | `kebab-case.ext` | `vite.config.ts`, `manifest.json` |
| **Tests** | `*.spec.ts` | `useLaboratory.spec.ts` |

---

## 5. The Shell Synchronization Protocol

To ensure 100/100 performance and SEO, the `index.html` shell must remain a hardcoded reflection of the application's default landing state.
1. **Title Mirroring**: The hardcoded `<h1 class="view-title">` must match the Feature label of the default route exactly (e.g., "Roster").
2. **Critical CSS**: Inline CSS is reserved for Layout Primitives and CSS Variables. No component-level styling is permitted.
3. **No Flashes**: Any structural changes to the primary Feature UI must be mirrored in the shell to prevent LCP layout shifts.

---

## 6. Substrate Integrity & Refactoring Safety

Refactoring Layer 0 (@static) is a high-precision operation. Any structural shift must account for the following risks to maintain Lighthouse parity:

1. **Hydration Parity**: The `index.html` DOM structure must be a precise replica of the initial Vue render. Mismatches trigger a full client-side re-hydration, causing an LCP flicker and performance penalty.
2. **Manifest Connectivity**: If assets (icons/screenshots) are siloed, the `manifest.json` and the PWA plugin configuration in Layer 5 must be updated synchronously. Failure results in PWA installability loss.
3. **Reference Integrity**: Any move of static media requires a comprehensive audit of all `src/` references (templates, CSS variables, and logic) to prevent broken asset links.
4. **Signal-to-Noise Ratio**: Maintenance of Layer 0 requires proactive pruning. Carrying unused placeholders or developmental scripts is considered technical debt.

---

## 7. The Data Flow & State Protocol

To maintain clinical isolation and predictability, state must be managed via a strict hierarchy.

1. **Hierarchy of Truth**:
   - **Local State**: Use `ref()` for primitive values and `reactive()` for complex state within a single component.
   - **Feature State**: Shared logic within a Feature must be encapsulated in a Singleton Composable. This state is private to the Feature silo.
   - **Global State**: Minimalist infrastructure state (e.g., Theme, Storage status) resides in Layer 1 `services/`.
2. **The Validation Boundary**:
   - **Rule**: No data enters the "Clean Stack" from external sources (API, LocalStorage, or User Input) without passing through a **Valibot Schema**.
   - Transformation logic must be executed at the Layer 1 `api/` or `services/` level before reaching the Feature layer.
3. **Unidirectional Execution**:
   - Features emit events to communicating upward; they never mutate props directly.

---

## 8. Visual Purity & Icon Aesthetics (The "No Library" Rule)

Visual elements must be mathematically precise and technically pure to ensure a premium User Experience.

1. **Zero Library Dependency**:
   - Strictly forbidden: FontAwesome, Lucide, Material Icons, or any external icon library.
   - Strictly forbidden: Emojis in any part of the UI or documentation.
2. **Custom SVG Protocol**:
   - All visual markers are custom-crafted SVG paths stored as constants in `@core/theme/icons.ts`.
   - Icons must use the `vector-effect="non-scaling-stroke"` attribute to maintain consistency across different scales.
3. **Rendering Pipeline**:
   - All icons must be rendered via the `@shared/ui/Icon.vue` primitive to ensure unified access to the CSS variable system.

---

## 9. The "Zero Leak" Service Registry

Infrastructure logic is centralized to prevent "Spaghetti Dependencies" and ensure predictable initialization.

1. **Service Lifecycle**:
   - Infrastructure singletons (Logger, Storage, API Clients) live in Layer 1 `services/`.
   - Services must be context-agnostic and should not import from Layers 2, 3, or 4.
2. **The Mocking Strategy**:
   - Testing logic (Vitest) must use deep imports for services to prevent side effects from Barrel imports (e.g., `import { storage } from '@core/services/StorageService'`).

---

## 10. Performance & Resource Lifecycle

To maintain 100/100 Lighthouse scores, hardware and browser interactions follow a brokered protocol.

1. **Hardware Brokering**:
   - Interaction with browser APIs (WakeLock, Haptics, Notifications) must be handled by Layer 2 `@shared/composables`.
2. **Resource Strategy**:
   - **Lazy Loading**: Layer 3 Features are the primary unit of code-splitting. 
   - **Bundle Integrity**: Layer 1 and Layer 2 logic must be tree-shakable. No "Heavy Utils" are permitted in the initial bundle.
3. **Accessibility (A11y)**:
   - Every interactive element must have a unique ID for automated testing and a descriptive ARIA label.
   - Touch targets must adhere to a 48x48px minimum standard.


