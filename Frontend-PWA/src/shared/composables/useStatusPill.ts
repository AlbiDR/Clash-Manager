// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, watch, computed, toValue, type MaybeRefOrGetter } from "vue";
import { useHaptics } from "./useHaptics";
import { useViewport } from "./useViewport";

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
 * @returns State and computed properties for the StatusPill.
 */
export function useStatusPill(props: MaybeRefOrGetter<StatusPillProps>) {
  const haptics = useHaptics();
  const isExpanded = ref(false);

  // [DECISION LOG] AUTO-EXPANSION: Automatically expand on critical states
  // (loading/error) to ensure user awareness of background sync or failures.
  watch(() => toValue(props).type, (newType) => {
    if (newType === "loading" || newType === "error") {
      isExpanded.value = true;
    }
  }, { immediate: true });

  const handleToggle = () => {
    const statusPillPropsSnapshot = toValue(props);
    if (statusPillPropsSnapshot.type === "loading") return;

    // [DECISION LOG] Synchronized with v-tactile in StatusPill.vue.
    // Manual haptic call removed to prevent double-triggering (Target A.2).
    isExpanded.value = !isExpanded.value;
  };

  const isDB = computed(() => toValue(props).text === 'DB');

  // [DECISION LOG] RESPONSIVE TRUNCATION: On narrow viewports, truncate
  // to the last word to maintain UI stability in header clusters.
  const { isMobileNarrow } = useViewport();
  const displayText = computed(() => {
    const statusPillPropsSnapshot = toValue(props);
    if (isMobileNarrow.value) {
      const parts = statusPillPropsSnapshot.text.split(' ');
      return parts.length > 1 ? parts[parts.length - 1] : statusPillPropsSnapshot.text;
    }
    return statusPillPropsSnapshot.text;
  });

  const displaySource = computed(() => {
    const statusPillPropsSnapshot = toValue(props);
    if (!statusPillPropsSnapshot.remoteInfo?.source) return null;

    // Redundancy check: if the primary label is 'DB', 'SUPABASE' as source is noise.
    if (isDB.value && statusPillPropsSnapshot.remoteInfo.source === 'SUPABASE') return null;

    return statusPillPropsSnapshot.remoteInfo.source === 'SUPABASE' ? 'DB' : statusPillPropsSnapshot.remoteInfo.source;
  });

  return {
    isExpanded,
    isDB,
    displayText,
    displaySource,
    handleToggle
  };
}
