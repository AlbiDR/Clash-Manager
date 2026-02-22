# Worker Architecture

## I. Core Philosophy
The Worker operates as the absolute middleware authority between the client substrate and the external network. Its responsibilities are strictly cordoned off from the Vue application layer, ensuring an impenetrable boundary between UI execution and network resilience. Technical purity is maintained by treating the Worker as an isolated, headless proxy.

## II. Exacting Caching Topologies
Caching is not arbitrary; it adheres to a highly deterministic set of rules enforced by the Worker to guarantee zero-latency responsiveness and a 100/100 Lighthouse performance score.

*   **Static Assets (App Shell, Icons, CSS):** 
    *   *Strategy:* Cache-First, Network-Fallback.
    *   *Integrity:* Assets are locked down upon installation. The runtime demands immediate cache retrieval for the structural payload to ensure a sub-100ms first paint.
*   **Dynamic Data & Payloads:** 
    *   *Strategy:* Stale-While-Revalidate or Network-First (strictly enforced per endpoint design).
    *   *Integrity:* The Worker intercepts and evaluates payload freshness, ensuring the UI is never blocked by network stalling, while background fetches guarantee eventual consistency.

## III. Lifecycle and Update Strictures
The update and instantiation protocols ensure instantaneous, non-disruptive migrations to new deployment vectors.

*   **Installation:** Granular pre-caching of the designated critical render path. Failure to cache core assets triggers a hard abort to prevent partial/corrupted application states.
*   **Activation & Garbage Collection:** Mandatory, synchronous purging of obsolete caches. The active Worker aggressively culls legacy data to prevent storage bloat.
*   **Client Claiming:** The Worker forcefully claims uncontrolled clients immediately upon activation, synchronizing all active execution contexts to the current service schema without demanding manual page reloads.

## IV. Offline Operations & State Recovery
The architecture assumes an antagonistic network environment, prioritizing UX stability during connectivity loss.

*   **Fallback Horizons:** In the event of unrecoverable network failure, the Worker serves a deterministic offline execution state or custom fallback UI.
*   **Deferred Operations (Queueing):** Mutative actions performed in a disconnected state are systematically logged to IndexedDB. The Worker autonomously flushes this queue the moment connectivity is restored, preserving data integrity without explicit user intervention.

## V. PWA Substrate Integration
The Worker is the engine enforcing our Progressive Web App structural integrity.

*   **Asset Alignment:** Guarantees that the dynamically injected App Shell and manifest parameters (including edge-to-edge configurations and maskable iconography) are synchronized with the cache, entirely eliminating layout shifts (CLS) on subsequent loads.
