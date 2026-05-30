# Voyage -- Clan Milestone Orchestrator

The **Engagement Hub**. A specialized Feature (Layer 3) responsible for coordinating Clan Voyage events, tracking collective crown contributions, and visualizing progress toward clan-wide milestones.

---

## Purpose
The Voyage feature facilitates collaborative gameplay by providing a centralized interface for managing "Clan Voyage" events. It allows leadership to activate specific crown targets and provides real-time feedback to members on their collective progress and individual contributions.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly siloed. Never imports from `Roster`, `Headhunter`, or `Laboratory`.
- **Dependencies**:
  - `@core/api/SupabaseClient`: Remote state hydration and RPC activation.
  - `@core/types`: Authoritative domain interfaces.
  - `@shared/ui/Icon`: Standardized vector iconography.
  - `@shared/ui/SettingsCard`: Container for the event setup cockpit.

## Logic Subsystems

### Voyage Store (useVoyageStore.ts)
The authoritative reactive manager for the Voyage state.
- **Realtime Synchronization**: Implements a Postgres change listener via the Supabase SDK to instantly reflect crown updates from the `drivers.clan_voyage` and `drivers.clan_voyage_contributions` tables.
- **T2T (Time-to-Timestamp) Utility**: Converts relative user inputs (Days/Hours/Minutes) into absolute ISO-8601 timestamps for backend compatibility.
- **Progress Normalization**: Calculates `progressRatio` (0.0 - 1.0) and `isVictory` status to drive visual feedback across the application.
- **Event Lifecycle**: Orchestrates the multi-phase lifecycle of a Voyage, providing methods for scheduling (`scheduleVoyage`), promoting scheduled events (`activateScheduledVoyage`), and cancellation (`cancelSchedule`).

### Event Management (EventManagement.vue)
The "Mirror Activation Cockpit" located in the Settings feature.
- **Status Monitoring**: Provides real-time feedback on active event progress, including crown counts, completion percentages, and time remaining.
- **Modular Composition**: Acts as a high-level container that delegates configuration logic to `VoyageSetupForm.vue` to maintain SRP and architectural isolation.

### Event Setup Orchestration (useVoyageForm.ts)
The behavioral logic engine for the Voyage configuration interface.
- **State Delegation**: Encapsulates form state, relative time inputs, and validation logic, decoupling the UI from business rules.
- **Validation Boundary**: Enforces strict logical constraints (e.g., target > 0, end date > start date) using centralized utilities like `sanitizeNumericInput` and `durationToSeconds` from `@core/utils/formatters.ts`.
- **Action Brokering**: Maps user intents (Activate, Schedule, Cancel) to the appropriate `useVoyageStore` methods.

### Event Configuration (VoyageSetupForm.vue)
The primary setup and validation interface for Clan Voyage events.
- **Dynamic Configuration**: Consumes `useVoyageForm` to allow leaders to set crown targets and relative event durations.
- **Automatic Hydration**: Synchronizes its form state with the active event upon detection to facilitate rapid updates.

### Visual Feedback (VoyageBanner.vue)
A high-visibility glassmorphism surface injected into the Roster view.
- **Adaptive Styling**: Switches between a standard "Underway" blue glassmorphism and a gold/emerald "Victory" vibrant gradient when the goal is achieved.
- **Live Countdown**: Implements a 1-second interval timer to provide real-time event expiration feedback.
- **Performance Optimized**: Leverages CSS transitions and SVG filters for fluid, 60FPS progress animations.

## Data Flow
1. **Configuration**: User interacts with `VoyageSetupForm`, which delegates state and validation to `useVoyageForm`.
2. **Activation/Scheduling**: User triggers an action -> `useVoyageForm` invokes `useVoyageStore` -> RPC (e.g., `initialize_voyage`) executed on Supabase.
3. **Ingestion**: In-game crown data is ingested via the backend `ingest-royale-data` pipeline.
4. **Broadcasting**: Database triggers update the `voyage_summary` and `voyage_contributions` views.
5. **Reactivity**: `useVoyageStore` receives a Realtime event -> Triggers a `refresh()` -> UI updates via `VoyageBanner`.

## Key Constraints & Integration
- **Cross-Feature Injection**: To maintain Layer 3 isolation while allowing the banner to appear in the Roster, the feature components are globally registered in `app/main.ts` and consumed via `<component :is="'VoyageBanner'" />`.
- **Server-Side Aggregation**: All progress calculations (total crowns, ratios) are performed in the `features` schema views in Supabase to ensure a single source of truth across all clients.
- **No Manual Contribution**: Crown data is strictly derived from the official Supercell API ingestion; the PWA provides no mechanism for manual crown entry.
