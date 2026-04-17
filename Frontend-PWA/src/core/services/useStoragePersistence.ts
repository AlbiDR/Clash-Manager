// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly, onMounted } from "vue";

/**
 * STORAGE PERSISTENCE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Prevents the browser from clearing IndexedDB/localStorage
 * under storage pressure, ensuring the integrity of synchronized game data.
 * ----------------------------------------------------------------------------
 */

const isPersisted = ref(false);
const isSupported = ref(false);

/**
 * COMPOSABLE: useStoragePersistence
 *
 * @remarks
 * Brokered access to the Storage Manager API. This service manages the
 * "persisted" status of the application's origin, which is critical for
 * PWA reliability as it prevents the browser from silently evicting
 * local data during device storage pressure.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *
 * @returns
 * - `isSupported`: Readonly reactive boolean indicating if the Storage Manager API is available.
 * - `isPersisted`: Readonly reactive boolean indicating if storage persistence is currently granted.
 * - `requestPersistence`: Function to trigger the browser's persistence request flow.
 */
export function useStoragePersistence() {
  /**
   * Queries the browser for the current persistence status.
   * Updates the global `isPersisted` state.
   */
  async function check() {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      navigator.storage.persisted
    ) {
      isPersisted.value = await navigator.storage.persisted();
    }
  }

  /**
   * Requests the browser to grant persistent storage to the application.
   *
   * @remarks
   * Browsers may grant this automatically based on usage heuristics or
   * prompt the user depending on the platform and install state.
   */
  async function requestPersistence() {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      navigator.storage.persist
    ) {
      isSupported.value = true;
      const result = await navigator.storage.persist();
      isPersisted.value = result;
    }
  }

  /**
   * INITIALIZATION: Auto-check on mount.
   * Ensures the UI state reflects the current storage status as soon as
   * a component using this service is instantiated.
   */
  onMounted(() => {
    if (typeof navigator !== "undefined" && "storage" in navigator) {
      isSupported.value = true;
      check();
    }
  });

  return {
    isSupported: readonly(isSupported),
    isPersisted: readonly(isPersisted),
    requestPersistence,
  };
}
