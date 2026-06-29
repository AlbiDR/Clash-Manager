# Core API (@core/api) -- Transport Layer

The **Data Gateway**. The authoritative transport layer responsible for brokering communication between the Clash Manager PWA and the Supabase Binary Stack.

---

## Purpose
The Core API directory (Layer 1) centralizes the logic for data ingestion, remote procedure calls (RPC), and Edge Function interactions. It enforces clinical validation at the system boundary to ensure that external data is safely transformed into persistent domain models.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Data Transport & Validation.
- **Import Boundaries**:
  - **Allowed**: Can import from Layer 0 (@substrate).
  - **Forbidden**: Strictly forbidden from importing from any higher layers (Shared, Features, App).

## Specialized Domain Clients

### Supabase Client (`SupabaseClient.ts`)
The foundational infrastructure gateway.
- **Client Initialization**: Manages the singleton instance of the Supabase client.
- **Auth & Connectivity**: Handles internal authentication and provides the underlying transport for all specialized clients.
- **useApiState.ts**: Authoritative connectivity singleton for backend availability and handshake discovery.

### Voyage Client (`VoyageClient.ts`)
The transport orchestrator for the Clan Voyage subsystem.
- **RPC Lifecycle**: Manages voyage activation (`initialize_voyage`), ledger updates (`scheduleVoyageEvent`), and event cancellation (`cancelScheduledVoyageEvent`).
- **Data Fetching**: Provides high-performance methods for retrieving voyage summaries and contribution ledgers from authoritative database views.

### Recruit Client (`RecruitClient.ts`)
The transport orchestrator for Headhunter recruitment operations.
- **Blacklist Management**: Interfaces with RPCs (`dismiss_recruits`, `undismiss_recruits`) to manage recruit rejection state.
- **Realtime Sync**: Orchestrates Postgres Realtime subscriptions to ensure cross-device consistency for the recruitment blacklist.

### Profile Client (`ProfileClient.ts`)
The transport orchestrator for player card synchronization.
- **Edge Proxy**: Interfaces with the `sync-player-cards` Edge Function to perform rarity-relative normalization and backend persistence.

### Maintenance Client (`MaintenanceClient.ts`)
The transport orchestrator for system-level administrative tasks.
- **Nightly Triggers**: Provides an interface for manually triggering the nightly maintenance and database janitor cycles.

---

## Validation Boundaries (`DataSchemas.ts`)

All inbound data MUST be validated against a Valibot schema at the client entry point to prevent state corruption.
- **Schema Modules**: Decomposed by domain (e.g., `VoyageSchemas.ts`, `MemberSchemas.ts`, `RecruitSchemas.ts`) and aggregated via the `DataSchemas.ts` barrel.
- **Data Mappers**: Transformation logic for converting raw database rows into persistence-ignorant domain models. Enforces clinical normalization for telemetry (Voyage history, Heritage tenure).

---

## Integration Standards
- **Clinical Purity**: Logic here must focus strictly on transport and validation. Domain-specific business logic belongs in Feature stores or services.
- **Fail-Fast**: Utilize `v.safeParse()` to identify and halt malformed data ingress at the earliest opportunity.
- **Direct View Access**: Prefer querying authoritative feature views (`roster_view`, `headhunter_view`) over complex client-side joins.
