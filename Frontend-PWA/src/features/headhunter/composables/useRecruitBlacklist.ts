// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";

// Singleton in-memory state shared across components within this session.
// Intentionally NOT persisted to localStorage — tombstones are ephemeral optimistic-UI
// state only. Authoritative dismissed state lives in drivers.recruit_blacklist (server SSOT),
// propagated to the client via Supabase Realtime subscription in useHeadhunter.
const tombstones = ref<Set<string>>(new Set());

/**
 * COMPOSABLE: useRecruitBlacklist
 *
 * @remarks
 * Manages in-memory "tombstones" for recruits who have been optimistically
 * dismissed but whose removal from the server payload has not yet propagated
 * to the local store. This is a pure optimistic-UI primitive — tombstones hide
 * a recruit for the ~200ms window between user action and Realtime confirmation.
 *
 * Tombstones reset on every page reload. Cross-device and cross-session state
 * is managed exclusively by the Supabase Realtime subscription in `useHeadhunter`,
 * which reflects `drivers.recruit_blacklist` as the SSOT.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Import Boundaries:** Imports from Layer 1 (@core).
 *
 * @returns
 * - `tombstones`: Reactive in-memory Set of dismissed recruit IDs.
 * - `hide`: Adds IDs to the tombstone set.
 * - `restore`: Removes IDs from the tombstone set (rollback on RPC failure).
 */
export function useRecruitBlacklist() {
  function hide(ids: string[]) {
    ids.forEach((id) => tombstones.value.add(id));
  }

  function restore(ids: string[]) {
    ids.forEach((id) => tombstones.value.delete(id));
  }

  return {
    tombstones,
    hide,
    restore,
  };
}
