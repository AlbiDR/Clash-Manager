// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, toValue, type MaybeRefOrGetter } from "vue";

export interface StatusPillProps {
  type: "success" | "warning" | "error" | "loading";
  text: string;
  remoteInfo?: {
    source: string;
    dataAge: string | null;
    diagnosis?: string | null;
    lastCompiled?: string | null;
  };
}

/**
 * COMPOSABLE: useStatusPill
 *
 * @remarks
 * Centralizes the stateful logic for the StatusPill component, managing
 * expansion states, haptic feedback, and responsive label formatting.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Presentation logic orchestrator for connectivity status.
 *
 * @param props - Component props as a reactive object or getter.
 * @returns
 * - `isExpanded`: Reactive toggle for the detailed metadata view.
 * - `isDB`: True if the primary status label is "DB" (cached state).
 * - `displayText`: The caller's label, preserved exactly across viewports.
 * - `displaySource`: Normalized data source label.
 * - `statusSummary`: A concise, state-appropriate description for the
 *   optional disclosure.
 * - `handleToggle`: Expansion orchestrator (haptics are handled by `v-tactile`
 *   on the pill element in `StatusPill.vue`, not here -- see the note below).
 */
export function useStatusPill(props: MaybeRefOrGetter<StatusPillProps>) {
  const isExpanded = ref(false);

  // A state change must not take over the console. Error and loading labels are
  // already visible in the compact control; diagnostic text is a disclosure the
  // reader opens deliberately. Auto-opening it obscured the very controls that
  // let someone respond to a failure and made the panel appear impossible to
  // dismiss when an error state was being refreshed.

  const handleToggle = () => {
    // [DECISION LOG] Synchronized with v-tactile in StatusPill.vue.
    // Manual haptic call removed to prevent double-triggering (Target A.2).
    // A refresh can safely expose the same provenance metadata as a settled
    // state. The component still withholds this affordance when no metadata is
    // available, so a spinner never becomes an empty, distracting popup.
    isExpanded.value = !isExpanded.value;
  };

  const isDB = computed(() => toValue(props).text === 'DB');

  // The control itself owns overflow now, so changing a status from
  // "System Operational" to just "Operational" based on screen width is no
  // longer necessary - and it was an information loss, not responsive design.
  const displayText = computed(() => toValue(props).text);

  const displaySource = computed(() => {
    const statusPillPropsSnapshot = toValue(props);
    if (!statusPillPropsSnapshot.remoteInfo?.source) return null;

    // Redundancy check: if the primary label is 'DB', 'SUPABASE' as source is noise.
    if (isDB.value && statusPillPropsSnapshot.remoteInfo.source === 'SUPABASE') return null;

    return statusPillPropsSnapshot.remoteInfo.source === 'SUPABASE' ? 'DB' : statusPillPropsSnapshot.remoteInfo.source;
  });

  const statusSummary = computed(() => {
    const statusPillPropsSnapshot = toValue(props);

    if (statusPillPropsSnapshot.type === "loading") return "Checking for updates";
    if (statusPillPropsSnapshot.type === "warning") return "Needs attention";
    if (statusPillPropsSnapshot.type === "error") return "Latest update did not complete";
    if (statusPillPropsSnapshot.text === "LOCAL") return "Using saved device data";

    return "Current";
  });

  return {
    isExpanded,
    isDB,
    displayText,
    displaySource,
    statusSummary,
    handleToggle
  };
}
