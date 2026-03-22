---
trigger: always_on
---

# CleanStack Architecture — Authoritative Design Reference (ADR)

A live copy of this ADR can be found in the filesystem of the project at .github/authoritative-design-references/CleanStack Architecture.md

This document is the **Single Source of Truth** for the architectural principles, structural rules, and behavioral standards governing the entire `Clash-Manager` stack (Frontend, Backend/GAS, Worker). All secondary architecture documents are subordinate to this ADR.

---

## I. Foundations of "Clinical" Logic

Core philosophies that prioritize technical purity and the elimination of noise.

- **KISS (Keep It Simple, Stupid):** Reject over-engineering; the most elegant solution is often the most direct one.
- **Principle of Least Astonishment (POLA):** Code must behave predictably; side-effects or "hidden magic" that surprise a developer are architectural failures.
- **Visual Purity (Zero-Library Dependency):** No third-party icon libraries or emojis. Use custom-crafted SVG paths for absolute stylistic control and 100/100 performance. All SVG paths must use `vector-effect="non-scaling-stroke"` to maintain consistency across scales, and must be rendered exclusively via the `@shared/ui/Icon.vue` primitive to unify CSS variable access.
- **Lean Pruning (Zero-Waste):** Proactively purge unused files, dead code, and redundant dependencies. If it doesn't serve the current commit, it shouldn't exist in the workspace.
- **Single Source of Truth (SSOT):** Every piece of data or logic must have one, and only one, authoritative representation across the entire stack.
- **Single Responsibility Principle (SRP):** Each module, class, or function must have one, and only one, reason to change.
- **Componentization:** Deconstruct monolithic views into atomic, reusable components. No view should own logic it cannot fully encapsulate.
- **YAGNI (You Aren't Gonna Need It):** Reject speculative features and pre-emptive abstractions. No logic, layer, or interface is introduced until the current commit explicitly demands it. Pairs with Lean Pruning to enforce minimum viable evolution.

---

## II. Structural Unitary Architecture

This project employs a **Strict Unitary Architecture** across six discrete layers. Logic, configuration, and assets must reside exactly where they belong to ensure atomicity and predictable execution.

- **Dependency Inversion Principle (DIP):** Higher layers must depend on abstractions (interfaces or types) of lower layers, not concrete implementations. This ensures that infrastructure shifts in Layer 1 do not oscillate into business logic in Layer 3.
- **Framework as a Detail:** The selected technology stack (Vue, Vite, Apps Script) is a replaceable implementation detail. Business logic in Layer 3 must never depend on framework-specific APIs. If the framework were swapped, Layer 3 logic should remain untouched.

### Layer 0: Substrate (`@static` / `@substrate`) [Foundation]
**Definition**: The shell, configuration, environment, and public assets.
- **Rule**: Minimum footprint. Data-centric. Zero processing logic.
- **Frontend Contents**: `index.html`, `manifest.json`, optimized assets (`assets/game/`, `fonts/`).
- **Backend Contents**: `Configuration.ts`, `appsscript.json`.

### Layer 1: Core (`@core` / `@kernel`) [Kernel]
**Definition**: Agnostic infrastructure and horizontal logic engines.
- **Rule**: Pure logic. Zero dependencies on higher layers.
- **Frontend Contents**: `api/` clients, `theme/` tokens, `services/` singletons, `utils/` engines.
- **Backend Contents**: `Scoring_Kernel.ts`, `Network.ts`, `Time.ts`.

### Layer 2: Shared (`@shared` / `@drivers`) [Molecules]
**Definition**: Domain-blind UI building blocks and persistence drivers.
- **Rule**: Stateless UI or brokered access to external state.
- **Frontend Contents**: `ui/` elements, `composables/` (WakeLock, Haptics), `directives/` (Tactile).
- **Backend Contents**: `Store.ts` (ScriptProperties), `View.ts` (Sheet rendering), `Database.ts` (ETL).

### Layer 3: Features (`@features` / `@modules`) [Business]
**Definition**: Self-contained business silos. Fractal structure.
- **Rule**: Strictly decoupled. A Feature **NEVER** imports from another Feature (isolation boundary).
- **Structure**: `roster/`, `laboratory/`, `headhunter/`, `scoring/`, `settings/`.

### Layer 4: App (`@app` / `@orchestrator`) [Glue]
**Definition**: Context-aware orchestration and navigation.
- **Rule**: Orchestrates flow between Layers 1-3. Only App imports from Features.
- **Frontend Contents**: `router/`, `layouts/`, `sw.ts` (Service Worker), `App.vue`.
- **Backend Contents**: `Orchestrator.ts` (Automations), `Registry.ts` (Dependency Injection point).

### Layer 5: Control (`@root` / `@root`) [Environment]
**Definition**: Public entry points, project orchestration, and type governance.
- **Rule**: Minimalist dependency surface. Manages the Public API interface.
- **Frontend Contents**: `vite.config.ts`, `package.json`, `tsconfig.json`.
- **Backend Contents**: `API_Public.ts` (`doGet`/`doPost`), `Controller_Webapp.ts`.

---

## III. Data Flow & Transactional Integrity
Integrity

Protocols for data safety, state management, and reliable communication.

- **Validation Boundary (Schema-Gatekeeper):** Mandatory Valibot schema checks for all inbound data at the Layer 1 `api/` or `services/` level. If data doesn't pass the schema, it is rejected before reaching business logic. No data enters from external sources (API, LocalStorage, or User Input) without passing this gate.
- **Dependency Flow vs. Control Flow:** While dependencies point strictly **Inward** to the kernel, the **Flow of Control** may move **Outward**. Layer 3 (Features) may trigger Layer 2 (Drivers) only through abstract interfaces defined in Layer 1. Direct calls to concrete lower-layer implementations from business logic are forbidden.
- **Domain Model Transformation (DTO Mapping):** Data crossing the Validation Boundary must be transformed into 'Persistence-Ignorant' domain objects. The raw structure of external payloads (API responses, sheet rows) must be mapped to a clean Domain Model at Layer 1. Business logic in Layer 3 (Features) never interacts with raw external data shapes.
- **Command-Query Separation (CQS):** A function either modifies state (Command) or returns data (Query), never both.
- **TOON (Token Oriented Object Notation):** Optimization for Determinism and Idempotency. All state transitions must be reproducible and predictable.
- **Persistence Ignorance:** Domain logic must remain decoupled from the storage mechanism (Sheets, Redis, or IndexedDB) to allow for "pluggable" persistence.
- **Liskov Substitution Principle (LSP):** Subclasses must be replaceable by their base class without breaking logic. Prefer Composition over Inheritance.
- **Atomicity:** Every function must complete a full transaction. Partial state leaks are a critical failure. If a function cannot guarantee atomicity, it must fail fast and leave state unchanged.

### State Management Hierarchy (Frontend)

State must be managed via a strict three-tier hierarchy to maintain clinical isolation:

1. **Local State:** Use `ref()` for primitive values and `reactive()` for complex state scoped to a single component.
2. **Feature State:** Shared state and logic within a Feature must be encapsulated in a Pinia Store. This state is private to the Feature silo and invisible to other Features.
3. **Global State:** Minimalist infrastructure state only (e.g., Theme, Storage status) resides in Layer 1 `services/` or a strictly scoped Pinia Store.

- **Unidirectional Execution:** Features emit events upward to communicating layers; they never mutate props directly. Data flows down; events flow up.

---

## IV. Resilience & Operational Security

Guards for software stability, hardware interaction, and resource management.

- **Defensive Programming (Fail Fast):** Detect errors at the earliest possible point and halt execution immediately to prevent corrupted states.
- **Quota & Token Guarding:** Proactive management of resource limits (Memory, API credits) and strict authentication boundaries (Bearer tokens). `Network.quotaCheck()` must be called before all high-volume operations.
- **Deep Delegation Strategy:** Delegate heavy computational lifting from restricted environments (GAS) to high-concurrency workers (Render Muscle). If the remote worker is offline, the system must trigger a Quota Guard failure rather than exhausting the local GAS environment. The local environment must never be used as a fallback for heavy operations.
- **Hardware/Browser Brokering:** Decouple hardware APIs (Haptics, WakeLock, Notifications, PWA APIs) into Layer 2 Composables. Business logic never touches hardware directly.
- **Hydration & Shell Parity:** The hardcoded HTML substrate must be a precise replica of the initial Vue render to ensure 100/100 Lighthouse/CLS scores. The hardcoded `<h1 class="view-title">` must match the Feature label of the default route exactly. Critical CSS is reserved for Layout Primitives and CSS Variables only; no component-level inline styling is permitted.
- **Principle of Least Privilege (PoLP):** A module or process should only access the resources necessary for its specific purpose.
- **Zero-Trust Token Boundary:** The Worker↔GAS token exchange must be treated as an untrusted channel. Bearer tokens must be validated on every inbound request at the Layer 5 control surface, regardless of perceived origin. No internal caller is implicitly trusted.
- **Error Propagation Contract:** Errors must never be thrown as raw strings. Every thrown value must conform to a typed error shape (e.g., `{ code: string; message: string; layer: string }`). Errors must propagate upward to the nearest Layer 5 control surface before being classified as either user-visible (rendered feedback) or silent (Logger only). Swallowing errors at layer boundaries is a critical violation. Unhandled promise rejections in the Worker and uncaught GAS exceptions must be captured and routed through the same contract without exception.

### Tiered Caching Protocol (Backend)

Repeated lookups must exploit the two-tier cache hierarchy before touching persistent storage:

- **L1 — ScriptProperties/Metadata (Storage):** Persistent, cross-execution cache for infrequently mutated data.
- **L2 — CacheService:** Short-lived, in-execution cache for high-frequency repeated lookups within a single run.

### Worker Caching Topologies

Caching is deterministic and enforced per asset class:

- **Static Assets (App Shell, Icons, CSS):** Cache-First, Network-Fallback. Assets are locked upon installation; the runtime demands immediate cache retrieval for the structural payload to guarantee a sub-100ms first paint.
- **Dynamic Data & Payloads:** Stale-While-Revalidate or Network-First, strictly enforced per endpoint design. The Worker intercepts and evaluates payload freshness so the UI is never blocked by network stalling, while background fetches guarantee eventual consistency.

### Worker Lifecycle Strictures

- **Installation:** Granular pre-caching of the designated critical render path. Failure to cache core assets triggers a **hard abort** to prevent partial or corrupted application states.
- **Activation & Garbage Collection:** Mandatory, synchronous purging of obsolete caches upon activation. Legacy cache data is aggressively culled to prevent storage bloat.
- **Client Claiming:** The Worker forcefully claims all uncontrolled clients immediately upon activation, synchronizing every active execution context to the current service schema without requiring manual page reloads.

### Offline Operations & State Recovery

The architecture assumes an antagonistic network environment:

- **Fallback Horizons:** In the event of unrecoverable network failure, the Worker serves a deterministic offline execution state or custom fallback UI.
- **Deferred Operations (Queue & Flush):** Mutative actions performed in a disconnected state are systematically logged to IndexedDB. The Worker autonomously flushes this queue the moment connectivity is restored, preserving data integrity without explicit user intervention.

---

## V. Performance & Resource Lifecycle

To maintain 100/100 Lighthouse scores, all performance-sensitive interactions follow a brokered protocol.

- **Lazy Loading:** Layer 3 Features are the primary and exclusive unit of code-splitting. No Feature logic enters the initial bundle.
- **Bundle Integrity:** Layer 1 and Layer 2 logic must be fully tree-shakable. No heavy utilities are permitted in the initial bundle.
- **Accessibility (A11y):** Every interactive element must carry a unique ID for automated testing and a descriptive ARIA label. Touch targets must adhere to a minimum of **48×48px**.
- **Resource Cleanup:** Functions must clean up their execution artifacts. No transient state, open handles, or temporary writes should survive a function's lifecycle.

### Shell Synchronization & Substrate Integrity

To maintain 100/100 Lighthouse performance and SEO, the Layer 0 substrate must remain a precise reflection of the application's default state.

1. **Title Mirroring:** The hardcoded `<h1 class="view-title">` in `index.html` must match the Feature label of the default route exactly (e.g., "Roster").
2. **Hydration Parity:** The `index.html` DOM structure must be a replica of the initial Vue render. Mismatches trigger a full client-side re-hydration penalty.
3. **Manifest Connectivity:** Asset moves (icons/screenshots) require synchronous updates to `manifest.json` and Layer 5 PWA plugin configurations to prevent installability loss.
4. **Critical CSS:** Inline styles in the shell are reserved for Layout Primitives and CSS Variables only; no component-level inline styling is permitted.

---

## VI. Governance & Lifecycle

Metadata standards for long-term project health and maintainability.

- **Open/Closed Principle (OCP):** Entities should be open for extension but closed for modification to prevent regressions.
- **Interface Segregation Principle (ISP):** No module shall be forced to depend on methods it does not utilize. Prefer smaller, specialized interfaces over monolithic ones to minimize the blast radius of interface changes and simplify testing.
- **Conventional Commits (ConCom):** Strict machine-readable commit specification to automate the generation of human-readable documentation.
- **Semantic Versioning (SemVer):** Clear communication of breaking changes vs. features via the MAJOR.MINOR.PATCH schema.
- **Keep a Changelog (KaC):** A curated, chronologically ordered history of notable shifts to maintain development transparency.
- **Licensing Consistency:** All source files (`.ts`, `.vue`, `.gs`, `.go`, `.py`, `.md`) must carry the project's authoritative licensing header at line 1: `// SPDX-License-Identifier: GPL-3.0-only` followed by `// Copyright (C) 2026 AlbiDR`. This ensures legal clarity and project identity across all environments.

---

## VII. Naming Conventions (Strict Contract)

Naming is not stylistic preference — it is a structural contract. Every file, variable, function, and asset must be identifiable by its name alone, without reading its contents. Deviations are treated as architectural violations on par with layer isolation breaches.

**One convention, two expressions.** The universal pattern across the entire stack is `Domain_Role`. The runtime determines how that pattern is expressed — not the rule itself:

- **Frontend:** `Domain` and `Role` are expressed through `PascalCase` concatenation, prefix, or suffix as afforded by Vue/Vite idioms (e.g., `use[Domain][Role].ts`, `[Domain][Role].vue`).
- **Backend (GAS):** `Domain` and `Role` are separated by an explicit underscore (e.g., `[Domain]_[Role].ts`) because the flat GAS global scope has no prefix/suffix affordances to signal role — the separator does that work.

The shape differs. The logic is identical.

### 1. Frontend Files (Vue / TypeScript)

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Directories | `kebab-case/` | `features/headhunter/`, `shared/ui/` |
| Vue Components | `[Domain][Role].vue` | `UpgradeCard.vue`, `PlayerRow.vue` |
| Layout Components | `[Domain]Layout.vue` | `ShellLayout.vue`, `FeatureLayout.vue` |
| Composables | `use[Domain].ts` | `useLaboratory.ts`, `useHaptics.ts` |
| Pinia Stores | `use[Domain]Store.ts` | `useRosterStore.ts`, `useSettingsStore.ts` |
| Directives | `v[Domain].ts` | `vTactile.ts`, `vTooltip.ts` |
| API / Transport Clients | `[Domain]Client.ts` | `GasClient.ts`, `WorkerClient.ts` |
| Service Singletons | `[Domain]Service.ts` | `StorageService.ts`, `LoggerService.ts` |
| Types / Interfaces | `PascalCase` | `PlayerData`, `OptimizationResult` |
| Enums | `PascalCase` · `UPPER_SNAKE` values | `enum TierLevel { MAX_TH = 'MAX_TH' }` |
| Variables | `camelCase` | `playerData`, `clanTag` |
| Constants | `UPPER_SNAKE_CASE` | `BASE_CONCURRENCY`, `MAX_RETRIES` |
| Environment Variables | `VITE_UPPER_SNAKE` | `VITE_API_URL`, `VITE_WORKER_TOKEN` |
| Assets / Media | `kebab-case.ext` | `currency-gold.webp`, `pwa-maskable.png` |
| Config / Static Files | `kebab-case.ext` | `vite.config.ts`, `manifest.json` |
| Test Files | `[parent]-tests/[Domain].spec.ts` | `features/roster/roster-tests/useRoster.spec.ts` |
| Barrel Files | `index.ts` (always) | `features/roster/index.ts` |

### 2. Backend Files (GAS / TypeScript)

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Logic / Utility | `[Domain].ts` | `Network.ts`, `Registry.ts`, `Time.ts` |
| Kernel / Engine | `[Domain]_Kernel.ts` | `Scoring_Kernel.ts` |
| Store Modules | `[Domain]_Store.ts` | `Roster_Store.ts`, `Scoring_Store.ts` |
| View Modules | `[Domain]_View.ts` | `Headhunter_View.ts`, `Roster_View.ts` |
| Controller Modules | `[Domain]_Controller.ts` | `Webapp_Controller.ts` |
| API Entry Points | `API_[Domain].ts` | `API_Public.ts`, `API_Internal.ts` |
| Type Definitions | `[Domain]_Types.ts` | `Database_Types.ts`, `Roster_Types.ts` |
| Variables | `camelCase` | `playerData`, `clanTag` |
| Constants | `UPPER_SNAKE_CASE` | `BASE_CONCURRENCY`, `QUOTA_LIMIT` |
| Env / Secret Vars | `UPPER_SNAKE_CASE` | `WORKER_BEARER_TOKEN`, `API_BASE_URL` |

### 3. CSS & Styling

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Class Names | `kebab-case` | `.player-card`, `.view-title` |
| BEM Elements | `block__element` | `.player-card__avatar` |
| BEM Modifiers | `block--modifier` | `.player-card--inactive` |
| CSS Custom Properties | `--kebab-case` (namespaced) | `--card-bg`, `--color-primary` |
| Animation Names | `kebab-case` | `fade-in`, `slide-up` |

- Static inline styles are forbidden. The `style` attribute is permitted only for dynamic CSS variable bindings: `:style="{ '--progress': value + '%' }"`.

### 4. Functions & Methods

Every name follows a strict **verb + domain-noun** pattern. The verb declares the operation category; the noun declares the domain. No exceptions.

| Intent | Verb | Example |
| :--- | :--- | :--- |
| Sync data retrieval | `get` | `getPlayerScore()`, `getClanTag()` |
| Network / async fetch | `fetch` | `fetchRosterData()`, `fetchLeagueInfo()` |
| State hydration | `load` | `loadFeatureState()`, `loadCachedView()` |
| Persistence write | `save` | `saveRosterSnapshot()`, `saveSettings()` |
| State mutation | `set` | `setActivePlayer()`, `setThreshold()` |
| Partial update | `update` | `updateScoreWeights()`, `updateClanTag()` |
| Deletion | `delete` | `deleteExpiredCache()`, `deleteRecord()` |
| Purge / bulk clear | `purge` | `purgeObsoleteKeys()`, `purgeStaleCache()` |
| Factory / creation | `create` | `createPlayerRecord()`, `createSession()` |
| Schema validation | `validate` | `validateSchema()`, `validatePayload()` |
| Boolean guard | `is` / `has` / `can` | `isAuthenticated()`, `hasQuota()`, `canDelegate()` |
| Data transformation | `transform` | `transformApiPayload()`, `transformToViewModel()` |
| Data mapping | `map` | `mapToViewModel()`, `mapScoreToTier()` |
| Initialisation | `init` | `initOrchestrator()`, `initQuotaGuard()` |
| Boot sequence | `boot` | `bootServiceWorker()`, `bootFeature()` |
| Setup / teardown | `setup` / `teardown` | `setupListeners()`, `teardownListeners()` |
| Prop event emitter | `on` (prop contract) | `onSubmit`, `onPlayerSelect` |
| Event implementation | `handle` | `handleSubmit()`, `handlePlayerSelect()` |

- Name the *intent*, never the mechanism. `processData()`, `doStuff()`, `runLogic()` are forbidden.
- A name requiring an inline comment to clarify meaning is a naming failure, not a documentation gap.

### 5. TypeScript

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Interfaces | `PascalCase` · no `I` prefix | `PlayerData` ✓ · `IPlayerData` ✗ |
| Type Aliases | `PascalCase` | `ScoringWeight`, `ApiResponse` |
| Generics (unconstrained) | single uppercase | `<T>`, `<K>`, `<V>` |
| Generics (constrained) | `T`-prefixed `PascalCase` | `<TPayload>`, `<TResponse>` |
| Enums | `PascalCase` name · `UPPER_SNAKE` values | `enum Status { ACTIVE = 'ACTIVE' }` |
| Mapped / Utility Types | `PascalCase` + role suffix | `PlayerDataPartial`, `RosterReadonly` |

- Prefer `type` over `interface`; use `interface` only when declaration merging is required.
- `any` is forbidden. Use `unknown` and narrow explicitly.
- Non-null assertions (`!`) are forbidden. Use optional chaining or explicit narrowing.

### 6. Universal Rules

- **No abbreviations** unless universally unambiguous: `id`, `url`, `api`, `db`, `ts`. All other contractions must be spelled in full.
- **No generic filenames:** `utils.ts`, `helpers.ts`, `data.ts`, `common.ts`, `misc.ts` are forbidden. Every filename must declare its domain.
- **No numbered or versioned suffixes:** `Component2.vue`, `handler_v2.ts`, `store_new.ts` are architectural failures. Version through Git, never filenames.
- **No noise words** without domain context: `Manager`, `Handler`, `Processor`, `Info`, `Data` are forbidden as standalone suffixes (e.g., `DataManager.ts` → `RosterStore.ts`). Established suffixes from this document (`_Store`, `_View`, `_Kernel`, `Service`, `Client`) are exempt.
- **Booleans** require a semantic prefix: `is`, `has`, `can`, `should`, `was`, `will`.
- **Plurality is strict:** Arrays and collections are always plural (`players`, `clanTags`). Single entities are always singular (`player`, `clanTag`).
- **Cross-stack consistency:** A domain concept named `roster` in one layer is `roster` in every layer. Synonyms for the same concept (`squad`, `team`, `members`) are forbidden across the stack.

---

## VIII. Execution Protocol

Mandatory workflow that governs how all implementation tasks are approached.

1. **Analysis Phase:** Before writing any code, analyze the existing repository structure to understand current state. Never implement blindly.
2. **Refactor First:** If a task violates DRY, Modularization, or any principle in this ADR, propose the file-split or architectural shift and obtain alignment **before** beginning implementation.
3. **Checklist Verification:** Before marking any task complete, verify against the relevant layer checklist (Frontend OCD / Backend OCD).

### Testing Strategy by Layer

Test type is determined by the layer under test. Mixing strategies across layers is a violation.

| Layer | Scope | Strategy |
| :--- | :--- | :--- |
| L0 · Substrate | Static assets, shell | None — Lighthouse CI only |
| L1 · Kernel | Utils, services, pure functions | Unit (Vitest) · 100% coverage |
| L2 · Shared | Composables, UI primitives | Unit + shallow mount · no DOM traversal |
| L3 · Features | Feature composables, modules | Integration (Vitest + `@vue/test-utils`) |
| L4 · App / Orchestrator | Router, shell, GAS lifecycle | Integration · entry/exit contracts only |
| L5 · Control | `API_Public.ts`, `doGet`/`doPost` | E2E (Playwright / GAS runner) · black box |

- Test files live in a `[parent]-tests/` folder inside the module they cover, as a direct child alongside the source files (e.g., `features/roster/roster-tests/useRoster.spec.ts`).
- L1 service tests must use deep imports, not Barrel aliases, to prevent singleton initialization side effects.

### Universal Pre-Commit Checklist

- [ ] **Atomicity:** Does the function complete a full transaction with zero partial state leaks?
- [ ] **Location:** Does this file live in the correct architectural layer?
- [ ] **Registry:** Is it exported via the module's `index.ts` (Barrel Protocol)?
- [ ] **Naming:** Does every file, variable, constant, and asset comply with the Section VII naming contract?
- [ ] **Deduplication:** Have all redundant code paths been eliminated?
- [ ] **Validation:** Are all inbound objects passed through a Valibot schema check?
- [ ] **Caching:** Is L1/L2 caching utilized for repeated lookups before touching persistence?
- [ ] **Quota Guard:** Is `Network.quotaCheck()` called before high-volume operations?
- [ ] **Types:** Are all public interfaces explicitly typed? No `any`.
- [ ] **Tests:** Is there a corresponding `*.spec.ts` in the sibling `[parent]-tests/` folder, using the correct strategy for this layer?
- [ ] **Error Propagation:** Are all errors typed (never raw strings) and routed to Layer 5 before classification?
- [ ] **A11y:** Are touch targets (48px minimum) and ARIA labels correct?
- [ ] **Visual Purity:** Zero emojis in code, UI, or documentation.
- [ ] **Shell Sync:** Does the `index.html` shell title match the initial Feature registry state?
- [ ] **Pruning:** Have all unused assets, dead code, and legacy files been purged?
- [ ] **Isolation:** Does business logic live in its designated layer, never in the root/control layer?
- [ ] **Zero-Trust:** Are all inbound Bearer tokens validated at the Layer 5 control surface, regardless of origin?
- [ ] **Cleanup:** Does the function purge its execution artifacts upon completion?
- [ ] **Licensing:** Does the file carry the mandatory SPDX and Copyright headers at line 1?
