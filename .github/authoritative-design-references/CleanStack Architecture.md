// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# CleanStack Architecture — Authoritative Design Reference (ADR)

This document is the **Single Source of Truth** for the architectural principles, structural rules, and behavioral standards governing the entire `Clash-Manager` stack (Frontend/PWA, Backend/Supabase). All secondary architecture documents are subordinate to this ADR.

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
- **Adaptive Pipeline Design (No Magic Numbers):** Scoring formulas, normalisation anchors, thresholds, and benchmarks must always be derived from the live data corpus. Hardcoded constants (magic numbers) are architectural failures — they produce brittle, time-decaying references that cease to reflect reality as the game's playerbase and score ranges evolve. Every formula must be self-calibrating: as real-world conditions shift, the system adapts automatically without requiring a code change. The only permitted numeric literals are mathematical identities (e.g., `1` as a zero-division guard, `100` as a percentage ceiling) that carry no business semantics. All business thresholds must be derived from or validated against live data.

---

## II. Structural Unitary Architecture

This project employs a **Strict Unitary Architecture** across six discrete layers. Logic, configuration, and assets must reside exactly where they belong to ensure atomicity and predictable execution.

- **Dependency Inversion Principle (DIP):** Higher layers must depend on abstractions (interfaces or types) of lower layers, not concrete implementations. This ensures that infrastructure shifts in Layer 1 do not oscillate into business logic in Layer 3.
- **Framework as a Detail:** The selected technology stack (Vue, Vite, Supabase) is a replaceable implementation detail. Business logic in Layer 3 must never depend on framework-specific APIs. If the framework were swapped, Layer 3 logic should remain untouched.

### Universal Dependency Cataloging (Unitary Versioning)

To enforce monorepo-wide consistency and eliminate environmental fragmentation, all internal packages (Frontend, Backend) are bound to a strict versioning contract:

- **Unified Surface (SSOT):** All shared infrastructure (Vite, Vitest, Vue, Valibot, etc.) must be declared exclusively in the root `pnpm` catalog. Individual `package.json` files are **prohibited** from declaring discrete version strings for common dependencies.
- **The `catalog:` Protocol:** All internal package references must utilize the `catalog:` shorthand (e.g., `"vitest": "catalog:"`). This ensures that a version jump at the root creates a synchronous, monorepo-wide upgrade path, preventing the formation of "dependency silos".
- **Binary Parity:** Standardizing versions across all discrete layers ensures that test results remain deterministic and idempotent regardless of the execution context.
- **Lean Pruning (Zero-Waste):** Version fragmentation is an architectural failure. If multiple versions of the same library exist in the lockfile due to un-cataloged declarations, it is a direct violation of the **Lean Pruning** principle and must be consolidated immediately.

### Layer 0: Substrate (`@static` / `@substrate`) [Foundation]
**Definition**: The shell, configuration, environment, and public assets.
- **Rule**: Minimum footprint. Data-centric. Zero processing logic.
- **Frontend Contents**: `index.html`, `manifest.json`, optimized assets (`assets/game/`, `fonts/`).
- **Backend Contents**: `supabase/config.toml`, `.env`, `supabase/migrations/`.

### Layer 1: Core (`@core` / `@kernel`) [Kernel]
**Definition**: Agnostic infrastructure and horizontal logic engines.
- **Rule**: Pure logic. Zero dependencies on higher layers.
- **Frontend Contents**: `api/SupabaseClient.ts`, `theme/` tokens, `services/` singletons, `utils/` engines.
- **Backend Contents**: `supabase/functions/` (Edge Functions), `sql/functions/` (Pure SQL logic).

### Layer 2: Shared (`@shared` / `@drivers`) [Molecules]
**Definition**: Domain-blind UI building blocks and persistence drivers.
- **Rule**: Stateless UI or brokered access to external state.
- **Frontend Contents**: `ui/` elements, `composables/` (WakeLock, Haptics), `directives/` (Tactile).
- **Backend Contents**: `supabase/migrations/` (Tables, Views, RLS Policies).

### Layer 3: Features (`@features` / `@modules`) [Business]
**Definition**: Self-contained business silos. Fractal structure.
- **Rule**: Strictly decoupled. A Feature **NEVER** imports from another Feature (isolation boundary).
- **Structure**: `roster/`, `laboratory/`, `headhunter/`, `scoring/`, `settings/`.

### Layer 4: App (`@app` / `@orchestrator`) [Glue]
**Definition**: Context-aware orchestration and navigation.
- **Rule**: Orchestrates flow between Layers 1-3. Only App imports from Features.
- **Frontend Contents**: `router/`, `layouts/`, `sw.ts` (Service Worker), `App.vue`.
- **Backend Contents**: `supabase/migrations/` (Triggers, pg_cron Automations, Pipeline Heartbeats).

### Layer 5: Control (`@root` / `@root`) [Environment]
**Definition**: Public entry points, project orchestration, and type governance.
- **Rule**: Minimalist dependency surface. Manages the Public API interface.
- **Frontend Contents**: `vite.config.ts`, `package.json`, `tsconfig.json`.
- **Backend Contents**: `supabase/migrations/` (Public RPC Entry Points), `Edge Function` endpoints.

---

## III. Data Flow & Transactional Integrity

Protocols for data safety, state management, and reliable communication.

- **Validation Boundary (Schema-Gatekeeper):** Mandatory Valibot schema checks for all inbound data at the Layer 1 `api/` or `services/` level. No data enters from external sources (API, LocalStorage, or User Input) without passing this gate.
- **Dependency Flow vs. Control Flow:** While dependencies point strictly **Inward** to the kernel, the **Flow of Control** may move **Outward**. Layer 3 (Features) may trigger Layer 2 (Drivers) only through abstract interfaces defined in Layer 1.
- **Domain Model Transformation (DTO Mapping):** Data crossing the Validation Boundary must be transformed into 'Persistence-Ignorant' domain objects. Raw external structure (Supabase rows) must be mapped to a clean Domain Model at Layer 1.
- **Command-Query Separation (CQS):** A function either modifies state (Command) or returns data (Query), never both.
- **Persistence Ignorance:** Domain logic must remain decoupled from the storage mechanism (PostgreSQL, IndexedDB) to allow for "pluggable" persistence.
- **Liskov Substitution Principle (LSP):** Subclasses must be replaceable by their base class. Prefer Composition over Inheritance.
- **Atomicity:** Every function must complete a full transaction. Partial state leaks are a critical failure. If a function cannot guarantee atomicity, it must fail fast.

### State Management Hierarchy (Frontend)

State must be managed via a strict three-tier hierarchy to maintain clinical isolation:

1. **Local State:** Use `ref()` for primitive values and `reactive()` for complex state scoped to a single component.
2. **Feature State:** Shared state and logic within a Feature must be encapsulated in a Pinia Store. This state is private to the Feature silo and invisible to other Features.
3. **Global State:** Minimalist infrastructure state only (e.g., Theme, Storage status) resides in Layer 1 `services/` or a strictly scoped Pinia Store.

- **Unidirectional Execution:** Features emit events upward; they never mutate props directly. Data flows down; events flow up.

---

## IV. Resilience & Operational Security

Guards for software stability, hardware interaction, and resource management.

- **Defensive Programming (Fail Fast):** Detect errors at the earliest possible point and halt execution immediately to prevent corrupted states.
- **Authentication & Authorization (RLS):** Strict enforcement of Row Level Security (RLS) on all Supabase tables. The frontend must only access data through authenticated JWTs or dedicated public RPCs with internal validation.
- **Deep Delegation Strategy:** Delegate heavy computational lifting to Supabase Edge Functions or background Cron triggers. The frontend must never be used for heavy data processing. If a remote function is offline, the system must trigger a failure rather than attempting local fallback for complex logic.
- **Hardware/Browser Brokering:** Decouple hardware APIs (Haptics, WakeLock, Notifications, PWA APIs) into Layer 2 Composables. Business logic never touches hardware directly.
- **Hydration & Shell Parity:** The hardcoded HTML substrate must be a precise replica of the initial Vue render. Mismatches trigger a full client-side re-hydration penalty.
- **Principle of Least Privilege (PoLP):** A module or process should only access the resources necessary for its specific purpose.
- **Zero-Trust Token Boundary:** All Supabase RPC and Edge Function calls must validate the user's identity and permissions. No internal caller is implicitly trusted.
- **Error Propagation Contract:** Errors must never be thrown as raw strings. Every thrown value must conform to a typed error shape. Errors must propagate upward to the nearest Layer 5 control surface before classification.

### Tiered Caching Protocol

Repeated lookups must exploit the cache hierarchy before touching persistent storage:

- **L1 — In-Memory/Store (Frontend):** Reactive state in Pinia or local refs for immediate access.
- **L2 — IndexedDB (StorageService):** Persistent, local-first cache for high-fidelity datasets to guarantee offline operation.

### PWA Caching Topologies

Caching is deterministic and enforced per asset class:

- **Static Assets (App Shell, Icons, CSS):** Cache-First, Network-Fallback. Assets are locked upon installation; sub-100ms first paint.
- **Dynamic Data & Payloads:** Stale-While-Revalidate or Network-First. The Service Worker intercepts and evaluates payload freshness; background fetches guarantee eventual consistency.

### Service Worker Lifecycle

- **Installation:** Granular pre-caching of the critical render path. Failure to cache core assets triggers a **hard abort**.
- **Activation & Garbage Collection:** Mandatory, synchronous purging of obsolete caches upon activation.
- **Client Claiming:** The Worker forcefully claims all uncontrolled clients immediately upon activation.

### Offline Operations & State Recovery

The architecture assumes an antagonistic network environment:

- **Fallback Horizons:** Deterministic offline execution state or custom fallback UI.
- **Deferred Operations (Queue & Flush):** Mutative actions performed in a disconnected state are logged to IndexedDB. The system autonomously flushes this queue the moment connectivity is restored.

---

## V. Performance & Resource Lifecycle

To maintain 100/100 Lighthouse scores, all performance-sensitive interactions follow a brokered protocol.

- **Lazy Loading:** Layer 3 Features are the primary unit of code-splitting. No Feature logic enters the initial bundle.
- **Bundle Integrity:** Layer 1 and Layer 2 logic must be fully tree-shakable. No heavy utilities in the initial bundle.
- **Accessibility (A11y):** Unique IDs for automated testing and descriptive ARIA labels. Touch targets at 48×48px minimum.
- **Resource Cleanup:** Functions must clean up their execution artifacts. No transient state should survive a function's lifecycle.

### Shell Synchronization & Substrate Integrity

1. **Title Mirroring:** Hardcoded `<h1 class="view-title">` in `index.html` must match the Feature label of the default route exactly (e.g., "Roster").
2. **Hydration Parity:** `index.html` DOM structure must be a replica of the initial Vue render.
3. **Manifest Connectivity:** Asset moves require synchronous updates to `manifest.json`.
4. **Critical CSS:** Inline styles in the shell are reserved for Layout Primitives and CSS Variables only.

---

## VI. Governance & Lifecycle

Metadata standards for long-term project health and maintainability.

- **Open/Closed Principle (OCP):** Entities open for extension but closed for modification.
- **Interface Segregation Principle (ISP):** Small, specialized interfaces over monolithic ones.
- **Conventional Commits (ConCom):** Strict machine-readable commit specification.
- **Semantic Versioning (SemVer):** MAJOR.MINOR.PATCH schema.
- **Keep a Changelog (KaC):** Curated, chronological history of notable shifts.
- **Licensing Consistency:** All source files must carry the authoritative licensing header at line 1: `// SPDX-License-Identifier: GPL-3.0-only` followed by `// Copyright (C) 2026 AlbiDR`.

---

## VII. Naming Conventions (Strict Contract)

Naming is not stylistic preference — it is a structural contract. Every file, variable, function, and asset must be identifiable by its name alone.

**One convention, two expressions.** The universal pattern across the entire stack is `Domain_Role`:

- **Frontend:** `Domain` and `Role` are expressed through `PascalCase` concatenation (e.g., `use[Domain][Role].ts`, `[Domain][Role].vue`).
- **Backend (Supabase):** `Domain` and `Role` are separated by an explicit underscore (e.g., `[Domain]_[Role]`) for SQL objects (Tables, Views, RPCs) and Edge Functions.

### 1. Frontend Files (Vue / TypeScript)

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Directories | `kebab-case/` | `features/headhunter/`, `shared/ui/` |
| Vue Components | `[Domain][Role].vue` | `UpgradeCard.vue`, `PlayerRow.vue` |
| Layout Components | `[Domain]Layout.vue` | `ShellLayout.vue`, `FeatureLayout.vue` |
| Composables | `use[Domain].ts` | `useLaboratory.ts`, `useHaptics.ts` |
| Pinia Stores | `use[Domain]Store.ts` | `useRosterStore.ts`, `useSettingsStore.ts` |
| Directives | `v[Domain].ts` | `vTactile.ts`, `vTooltip.ts` |
| API Clients | `SupabaseClient.ts` | Authoritative transport |
| Service Singletons | `[Domain]Service.ts` | `StorageService.ts`, `LoggerService.ts` |
| Types / Interfaces | `PascalCase` | `PlayerData`, `OptimizationResult` |
| Enums | `PascalCase` · `UPPER_SNAKE` values | `enum Status { ACTIVE = 'ACTIVE' }` |
| Variables | `camelCase` | `playerData`, `clanTag` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `BASE_DELAY` |
| Env Variables | `VITE_UPPER_SNAKE` | `VITE_SUPABASE_URL` |
| Assets / Media | `kebab-case.ext` | `currency-gold.webp` |
| Config Files | `kebab-case.ext` | `vite.config.ts`, `manifest.json` |
| Test Files | `[parent]-tests/[Domain].spec.ts` | `useRoster.spec.ts` |
| Barrel Files | `index.ts` (always) | `features/roster/index.ts` |

### 2. Backend Files (SQL / Edge Functions)

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Tables / Views | `[Domain]_[Role]` | `roster_members`, `headhunter_view` |
| RPC Functions | `[Domain]_[Role]` | `dismiss_recruits`, `trigger_sync` |
| Edge Functions | `[Domain]_[Role]` | `data_ingestor`, `push_notifier` |
| Migrations | `YYYYMMDDHHMMSS_name.sql` | `20260430000000_reset.sql` |
| Types | `PascalCase` (from gen) | `Database`, `Tables` |

### 3. CSS & Styling

| Type | Pattern | Example |
| :--- | :--- | :--- |
| Class Names | `kebab-case` | `.player-card`, `.view-title` |
| BEM Elements | `block__element` | `.player-card__avatar` |
| BEM Modifiers | `block--modifier` | `.player-card--inactive` |
| CSS Custom Props | `--kebab-case` | `--card-bg`, `--color-primary` |

### 4. Functions & Methods

Every name follows a strict **verb + domain-noun** pattern.

| Intent | Verb | Example |
| :--- | :--- | :--- |
| Sync data retrieval | `get` | `getPlayerScore()` |
| Network / async fetch | `fetch` | `fetchRosterData()` |
| State hydration | `load` | `loadFeatureState()` |
| Persistence write | `save` | `saveRosterSnapshot()` |
| State mutation | `set` | `setActivePlayer()` |
| Partial update | `update` | `updateScoreWeights()` |
| Deletion | `delete` | `deleteRecord()` |
| Schema validation | `validate` | `validateSchema()` |
| Initialisation | `init` | `initOrchestrator()` |
| Event implementation | `handle` | `handlePlayerSelect()` |

---

## VIII. Supabase SSOT & Migration Clinicality

To maintain a clinical, drift-free stack, the GitHub repository is the **Absolute Single Source of Truth (SSOT)**. Supabase is merely a downstream projection of this repository.

- **Zero-Drift Tolerance:** Modifying the database schema, RPCs, or RLS policies directly via the Supabase Dashboard, external DB clients, or un-tracked MCP commands is **strictly prohibited**. 
- **Migration Primacy:** Every structural change MUST exist as a sequentially numbered migration file in `supabase/migrations/` before it is applied to any environment. 
- **Diff & Sync:** Use `supabase db diff` to detect and capture any accidental drift. 
- **Edge Function Mirroring:** Edge Functions deployed to the cloud must exactly mirror the code in `supabase/functions/`. No rogue, untracked deployments.
- **Clinical Pruning in SQL:** Migrations must be surgically precise. No commented-out SQL, no "test" tables, and no orphan functions. When an RPC or View changes, use `CREATE OR REPLACE` cleanly, or explicitly drop deprecated versions.
- **Type Generation Parity:** After any schema or RPC mutation, `supabase gen types typescript` MUST be executed to synchronize the TypeScript definitions. This guarantees the Validation Boundary (Layer 1) remains impermeable.

---

## IX. Execution Protocol

1. **Analysis Phase:** Analyze existing repository structure. Never implement blindly.
2. **Refactor First:** Propose architectural shifts before beginning implementation.
3. **Checklist Verification:** Verify against the relevant layer checklist.

### Testing Strategy by Layer

| Layer | Scope | Strategy |
| :--- | :--- | :--- |
| L0 · Substrate | Static assets, shell | None — Lighthouse CI only |
| L1 · Kernel | Utils, services, pure functions | Unit (Vitest) · 100% coverage |
| L2 · Shared | Composables, UI primitives | Unit + shallow mount |
| L3 · Features | Feature composables, modules | Integration (Vitest + `@vue/test-utils`) |
| L4 · App / Orchestrator | Router, shell, SW | Integration · entry/exit contracts only |
| L5 · Control | Public RPCs, Edge Functions | E2E (Supabase CLI / pgTAP) · black box |

- Test files live in a `[parent]-tests/` folder inside the module they cover.
- L1 service tests must use deep imports, not Barrel aliases.

### Universal Pre-Commit Checklist

- [ ] **Atomicity:** Zero partial state leaks.
- [ ] **Location:** Correct architectural layer.
- [ ] **Registry:** Exported via the module's `index.ts` (Barrel Protocol).
- [ ] **Naming:** Complies with Section VII naming contract.
- [ ] **Deduplication:** All redundant code paths eliminated.
- [ ] **Validation:** All inbound objects passed through Valibot schema check.
- [ ] **Caching:** L1/L2 caching utilized.
- [ ] **Security:** RLS policies enforced and JWTs validated.
- [ ] **Types:** All public interfaces explicitly typed. No `any`.
- [ ] **Tests:** Corresponding `*.spec.ts` in the sibling `[parent]-tests/` folder.
- [ ] **Error Propagation:** All errors typed and routed to Layer 5.
- [ ] **A11y:** Touch targets (48px minimum) and ARIA labels correct.
- [ ] **Visual Purity:** Zero emojis.
- [ ] **Adaptive Formulas:** No magic numbers or hardcoded business thresholds. All scoring anchors, benchmarks, and normalisation denominators are data-derived from the live corpus.
- [ ] **Structural IQ:** `npx ast-grep scan` run for pattern compliance.
- [ ] **Architectural IQ:** `npx depcruise` run to verify zero layer violations.
- [ ] **Licensing:** Mandatory SPDX and Copyright headers at line 1.
