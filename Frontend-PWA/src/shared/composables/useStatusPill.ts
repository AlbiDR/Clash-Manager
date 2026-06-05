// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, watch, computed, toValue, type MaybeRefOrGetter } from "vue";
import { useHaptics } from "@core";

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
    const p = toValue(props);
    if (p.type === "loading") return;

    haptics.tap();
    isExpanded.value = !isExpanded.value;
  };

  const isDB = computed(() => toValue(props).text === 'DB');

  // [DECISION LOG] RESPONSIVE TRUNCATION: On narrow viewports, truncate
  // to the last word to maintain UI stability in header clusters.
  const displayText = computed(() => {
    const p = toValue(props);
    if (typeof window !== 'undefined' && window.innerWidth < 360) {
      const parts = p.text.split(' ');
      return parts.length > 1 ? parts[parts.length - 1] : p.text;
    }
    return p.text;
  });

  const displaySource = computed(() => {
    const p = toValue(props);
    if (!p.remoteInfo?.source) return null;

    // Redundancy check: if the primary label is 'DB', 'SUPABASE' as source is noise.
    if (isDB.value && p.remoteInfo.source === 'SUPABASE') return null;

    return p.remoteInfo.source === 'SUPABASE' ? 'DB' : p.remoteInfo.source;
  });

  return {
    isExpanded,
    isDB,
    displayText,
    displaySource,
    handleToggle
  };
}
