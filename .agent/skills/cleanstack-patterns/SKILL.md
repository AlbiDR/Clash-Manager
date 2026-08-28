---
name: CleanStack Patterns
description: Fast-path cheat sheet for ADR compliance. Summarises the most frequently needed rules to avoid re-reading the full 350-line ADR on every routine change.
---
# CleanStack Pattern Cheat Sheet

> [!IMPORTANT]
> **This skill is a fast-track summary.** The definitive source of truth is always the [Authoritative Design Reference (ADR)](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/authoritative-design-references/CleanStack%20Architecture.md). 
> Use this cheat sheet for routine decisions and rapid reference. For precise, accurate, and comprehensive information, or when resolving edge cases and ambiguity, you **MUST consult the actual ADR**.

---

## 1. Core Philosophies - **KISS & POLA**: Keep it simple, predictable, with no hidden magic. - **Visual Purity**: Zero third-party icon libraries or emojis. Use custom SVG paths via `@shared/ui/Icon.vue`. - **Lean Pruning & YAGNI**: Zero waste. Delete unused code. Don't build abstractions until needed. - **Adaptive Pipeline (No Magic Numbers)**: Scoring formulas and thresholds must be data-derived from the live corpus. Hardcoding is an architectural failure. - **SSOT & SRP**: One source of truth, one responsibility per module.

---

## 2. Layers & Isolation (The 6-Layer Stack)

Every file MUST fit exactly into one layer. No exceptions.

| Layer | Alias | Contents |
| :--- | :--- | :--- |
| L0 Substrate | `@substrate` | `index.html`, `manifest.json`, `supabase/config.toml`, `.env`, static assets |
| L1 Core | `@core` | `api/SupabaseClient.ts`, `theme/`, `services/`, `utils/`, Edge Functions, pure SQL |
| L2 Shared | `@shared` | `ui/`, `composables/`, `directives/`, Tables, Views, RLS Policies |
| L3 Features | `@features` | `roster/`, `laboratory/`, `headhunter/`, `scoring/`, `settings/` |
| L4 App | `@app` | `router/`, `layouts/`, `sw.ts`, `App.vue`, Triggers, pg_cron |
| L5 Control | `@root` | `vite.config.ts`, `package.json`, `tsconfig.json`, Public RPCs, Edge endpoints |

**Dependency direction:** L0 <- L1 <- L2 <- L3 <- L4. L5 wraps the public surface.
**Strict isolation rule:** A Feature (L3) NEVER imports from another Feature. Shared logic belongs in L2 or L1.

---

## 3. Naming Conventions (Strict Contract)

### Frontend (Vue / TypeScript) - **Vue Components**: `[Domain][Role].vue` (e.g. `UpgradeCard.vue`) - **Layouts**: `[Domain]Layout.vue` - **Composables/Stores**: `use[Domain].ts`, `use[Domain]Store.ts` - **Directives/Services**: `v[Domain].ts`, `[Domain]Service.ts` - **Constants/Env**: `UPPER_SNAKE_CASE`, `VITE_UPPER_SNAKE` - **Tests**: `[parent]-tests/[Domain].spec.ts` - **Barrel Files**: `index.ts` always

### Backend (SQL / Edge Functions) - **Tables/Views/RPCs/Functions**: `[Domain]_[Role]` (e.g. `roster_members`, `dismiss_recruits`) - **Migrations**: `YYYYMMDDHHMMSS_name.sql`

### CSS - **Classes/Props**: `kebab-case`, BEM Elements `__element`, Modifiers `--modifier`, Custom Props `--var-name`.

### Functions
Verb + Domain-Noun. Allowed verbs: `get`, `fetch`, `load`, `save`, `set`, `update`, `delete`, `purge`, `create`, `validate`, `init`, `handle`. (Never `process` or `run`).

---

## 4. Data Flow & Validation Rules - **Validation Boundary:** All inbound data passes a Valibot schema check at L1. - **DTO Mapping:** Raw Supabase rows map to clean domain objects at L1. - **CQS:** Functions modify state OR return data, never both. - **Atomicity:** Full transaction or fail fast. No partial states. - **Tiered Cache:** L1 = Pinia/refs; L2 = IndexedDB (StorageService). Always exhaust the cache before hitting persistent storage.

---

## 5. Resilience, Security & Performance - **RLS & Zero-Trust:** Strict Row Level Security. Endpoints validate JWTs and permissions. - **PoLP:** Principle of Least Privilege always. - **Brokered Hardware:** Hardware access (Haptics, WakeLock) must be brokered via L2 Composables. - **PWA & SW:** Static assets are Cache-First. Data is Stale-While-Revalidate/Network-First. Worker claims clients on activation. - **Lazy Loading & Shell Sync:** L3 Features code-split. `index.html` structure must exactly match initial Vue render (Hydration Parity).

---

## 6. Dependency Versioning & Governance - **`catalog:` Protocol:** All internal package references must use the `catalog:` shorthand (e.g., `"vitest": "catalog:"`). Unified surface via root `pnpm`. No discrete versions in local `package.json` files. - **Governance:** Use Conventional Commits and SemVer. - **Licensing:** All source files must start with: `// SPDX-License-Identifier: GPL-3.0-only` followed by `// Copyright (C) 2026 AlbiDR`.

---

## 7. Supabase SSOT & Migrations - **GitHub is SSOT:** Supabase is a downstream projection. No dashboard edits. - **Migration Primacy:** All structural changes use sequential migration files. No rogue Edge Function deployments. - **Type Generation:** Always run `supabase gen types typescript` after schema/RPC changes.

---

## 8. Anti-Patterns (Forbidden)
| # | Anti-Pattern | Rule |
| :--- | :--- | :--- |
| 1 | Feature-to-Feature Bridge | Never import Feature-to-Feature. Extract to L2/L1. |
| 2 | Pinia Firewall Bypass | Never mutate global state directly; use Pinia actions. |
| 3 | Trusting the Payload | Never process payloads without Valibot validation. |
| 4 | Magic Number Hardcoding | Never hardcode thresholds; derive from live data. |
| 5 | Unbrokered Hardware Access | Never call hardware APIs directly; broker via L2. |
| 6 | Awaiting Input Stagnation | Never pause or prompt for human input in automated pipelines. |
| 7 | Dashboard Drift | Never modify DB outside migrations. |
| 8 | Permission Requesting | Never prompt for tool costs; auto-resolve via internal logic. |

---

## 9. Testing by Layer
| Layer | Strategy |
| :--- | :--- |
| **L0 Substrate** | Lighthouse CI. |
| **L1 Kernel** | Unit (Vitest) - 100% coverage. |
| **L2 Shared** | Unit + shallow mount. |
| **L3 Features** | Integration (Vitest + `@vue/test-utils`). |
| **L4 App** | Integration (entry/exit contracts). |
| **L5 Control** | E2E (Supabase CLI / pgTAP). |

---

## 10. Pre-Commit Checklist - [ ] **Atomicity** / **Location** / **Registry** (index.ts) / **Naming** - [ ] **Deduplication** / **Validation** (Valibot) / **Caching** (L1/L2) - [ ] **Security** (RLS/JWT) / **Types** (No `any`) / **Tests** - [ ] **Error Propagation** (To L5) / **A11y** (48px targets, ARIA, no emojis) - [ ] **Adaptive Formulas** (No magic numbers) - [ ] **Integrity Checks** (`npx ast-grep scan`, `npx depcruise`, `npx knip`) - [ ] **Licensing** (SPDX + Copyright header at line 1)
