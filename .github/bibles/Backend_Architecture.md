# Clinical Architecture: The "Logical Core" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` backend architecture (GAS/Worker). It defines the structural, nomenclatural, and behavioral standards required for a transaction-safe, high-performance runtime.

---

## 1. The Six Layers of "Logical Core"

We employ a **Strict Unitary Architecture**. Logic and data must reside in their assigned layers to ensure atomicity and predictable execution.

### Layer 0: Substrate (@substrate) [Foundation]
**Definition**: Configuration, Environment, and Shared Handshakes.
- **Rule**: Pure data. Zero processing logic.
- **Contents**:
  - `Configuration.ts`: Global weightings and logic constants.
  - `SharedTypes.ts`: Cross-module TypeScript primitives.
  - `appsscript.json`: Runtime configuration and permission manifests.

### Layer 1: Core (@kernel) [Kernel]
**Definition**: Agnostic utility engines.
- **Rule**: Zero dependencies on higher layers. Pure logic.
- **Contents**:
  - `Scoring_Kernel.ts`: Pure mathematical scoring functions.
  - `Network.ts`: Transport logic, cache brokering, and quota guarding.
  - `Time.ts`: Standardized temporal calculations.

### Layer 2: Drivers (@drivers) [Molecules]
**Definition**: Persistence and I/O abstractions.
- **Rule**: Brokered access to external state (Sheets/Worker).
- **Contents**:
  - `Store.ts`: Base persistence layer (ScriptProperties/Metadata).
  - `View.ts`: Sheet rendering engine (Styles/Cleaning).
  - `Database.ts`: Raw data ingestion/ETL substrate.

### Layer 3: Modules (@modules) [Business]
**Definition**: Self-contained domain silos.
- **Rule**: Strictly decoupled. Modules never import from other Modules. 
- **Contents**:
  - `Roster/`, `Headhunter/`, `Scoring/`.

### Layer 4: Orchestrator (@orchestrator) [Glue]
**Definition**: Lifecycle and Event management.
- **Rule**: Orchestrates flow between Layers 1-3.
- **Contents**:
  - `Orchestrator.ts`: Automation lifecycles and cron dispatchers.
  - `Registry.ts`: Service discovery and dependency injection point.

### Layer 5: Control (@root) [Environment]
**Definition**: Public entry points and environment governance.
- **Rule**: Single point of failure. Manages the Public API interface.
- **Contents**:
  - `API_Public.ts`: The `doGet/doPost` surface area.
  - `Controller_Webapp.ts`: Inbound logic for the PWA client.

---

## 2. The "Backend OCD" Checklist

Verify every logic shift against this protocol:
1. [ ] **Atomicity**: Does the function complete a full transaction? No partial state leaks.
2. [ ] **Quota Guard**: Is `Network.quotaCheck()` called before high-volume operations?
3. [ ] **Validation**: Are inbound objects passed through a `Valibot` schema check?
4. [ ] **Caching**: Is L1 (Storage) or L2 (CacheService) utilized for repeated lookups?
5. [ ] **Naming**: Does the file follow the role-suffix convention (e.g., `*_Store.ts`)?
6. [ ] **Isolation**: Does business logic live in `@kernel` or `@modules`, never in `@root`?
7. [ ] **Pruning**: Does the function clean up its execution artifacts?

---

## 3. Remote Delegation Strategy

The GAS engine maintains health by offloading heavy lifting to the **Backend-Worker** (Render).
- **Deep Delegation**: Scoring and bulk scans must be proxied via `Network.ts` to the remote worker.
- **Fallback Protocol**: If the worker is offline, the system must trigger a `Quota Guard` failure instead of exhausting the GAS environment.

---

## 4. Naming Conventions (Strict Case)

| Type | Convention | Example |
| :--- | :--- | :--- |
| **Logic Files** | `PascalCase` | `Network.ts`, `Registry.ts` |
| **Store Modules** | `*_Store.ts` | `Roster_Store.ts` |
| **View Modules** | `*_View.ts` | `Headhunter_View.ts` |
| **Types** | `*_Types.ts` | `Database_Types.ts` |
| **Variables** | `camelCase` | `playerData`, `clanTag` |
| **Constants** | `UPPER_SNAKE` | `BASE_CONCURRENCY` |
