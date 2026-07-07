// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useClashDataStore } from "./useClashDataStore";

/**
 * CLASH DATA HYDRATION LOADER (Layer 1)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core)
 * - **Role:** Pure async orchestration function for route-level data loading.
 *   Contains zero framework routing imports; router-specific binding (defineBasicLoader)
 *   is applied at the feature view (L3) so the framework glue stays co-located with
 *   the component that declares the navigation contract.
 *
 * **Execution Strategy:**
 * 1. `loadLocal()` - Synchronous IndexedDB hydration path; returns near-instantly
 *    from the L2 cache so the view renders with cached data on the first frame.
 * 2. `refreshFromSupabase()` - Fire-and-forget network refresh. Does NOT block the
 *    returned Promise, preserving the Stale-While-Revalidate PWA topology.
 *
 * **Usage:**
 * Feature views import this function and wrap it in `defineBasicLoader` from
 * `vue-router/experimental`. Registering the result as a named export on the
 * `<script setup>` block allows the `DataLoaderPlugin` to discover and coordinate
 * it during navigation without blocking the view transition.
 */
export async function hydrateClashData(): Promise<void> {
  const store = useClashDataStore();

  // Step 1: Hydrate from IndexedDB (instant - resolves from L2 cache)
  await store.loadLocal();

  // Step 2: Trigger live Supabase refresh without awaiting (fire-and-forget).
  // The store's reactive state updates automatically when the network resolves.
  store.refreshFromSupabase();
}
