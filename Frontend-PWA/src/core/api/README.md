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
- **fetchRemote**: High-fidelity data orchestrator that performs parallel fetching from authoritative feature views (Direct View Access) and enforces strict validation boundaries.
- **useApiState.ts**: Authoritative connectivity singleton for backend availability and handshake discovery.

### Voyage Client (`VoyageClient.ts`)
The transport orchestrator for the Clan Voyage subsystem.
- **RPC Lifecycle**: Manages voyage activation (`initialize_voyage`), ledger updates (`scheduleVoyageEvent`), event cancellation (`cancelScheduledVoyageEvent`), and completion (`set_voyage_end`).
- **Data Fetching**: Provides high-performance methods for retrieving voyage summaries and contribution ledgers from authoritative database views.

### Recruit Client (`RecruitClient.ts`)
The transport orchestrator for Headhunter recruitment operations.
- **Blacklist Management**: Interfaces with RPCs (`dismiss_recruits`, `undismiss_recruits`) to manage recruit rejection state.
- **Realtime Sync**: Orchestrates Postgres Realtime subscriptions to ensure cross-device consistency for the recruitment blacklist.
- **Scouting**: Provides diagnostic direct-query methods (`scanRecruitsDirect`) for pool auditing.

### Profile Client (`ProfileClient.ts`)
The transport orchestrator for player card synchronization.
- **Edge Proxy**: Interfaces with the `sync-player-cards` Edge Function to perform rarity-relative normalization and backend persistence.

### Maintenance Client (`MaintenanceClient.ts`)
The transport orchestrator for system-level administrative tasks.
- **Nightly Triggers**: Provides an interface for manually triggering the nightly maintenance and database janitor cycles.
- **Push Registration**: Manages the registration of browser `PushSubscription` objects for server-side notification dispatch.

---

## Validation Boundaries (`DataSchemas.ts`)

All inbound data MUST be validated against a Valibot schema at the client entry point to prevent state corruption.
- **Schema Modules**: Decomposed by domain for high-granularity validation. Most are aggregated via the `DataSchemas.ts` barrel for external consumption:
 - `BaseSchemas.ts`: Foundational validation primitives and shared domain constraints.
 - `MemberSchemas.ts`: Authoritative schemas for active clan residents.
 - `RecruitSchemas.ts`: Validation for discovery candidates and recruitment status.
 - `ProfileSchemas.ts`: High-fidelity schemas for player card snapshots and Royale profiles.
 - `VoyageSchemas.ts`: Schemas for Clan Voyage events and contribution ledgers.
 - `AppSchemas.ts`: Validation for global web application data and system-level payloads.
 - `OfflineSchemas.ts`: Schemas for hardening the offline queue and background synchronization boundary.
 - `MaintenanceSchemas.ts`: (Specialized) Internal validation for system maintenance and push subscription ingress. *Exempt from the DataSchemas barrel to maintain domain isolation.*
- **Data Mappers**: Transformation logic for converting raw database rows into Persistence-Ignorant Domain Models. Enforces clinical normalization for telemetry (Voyage history, Heritage tenure) and provides fallback logic for missing metrics (e.g., `potential_score`).

---

## Integration Standards
- **Clinical Purity**: Logic here must focus strictly on transport and validation. Domain-specific business logic belongs in Feature stores or services.
- **Fail-Fast**: Utilize `v.safeParse()` to identify and halt malformed data ingress at the earliest opportunity.
- **Direct View Access**: Prefer querying authoritative feature views (`roster_view`, `headhunter_view`) over complex client-side joins.
