// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useAppSettings } from "@core/services/useAppSettings";
import { useExternalLink, buildDeepLink } from "@core/services/useExternalLink";
import { useToast } from "@core/services/useToast";
import { ref, computed, onUnmounted, getCurrentInstance } from "vue";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { useNativeBridge } from "@core/services/useNativeBridge";
import {
  BLITZ_THROTTLE_DEFAULT,
  BLITZ_SAFETY_DELAY,
  BLITZ_RECOVERY_DELAY,
  BLITZ_COMPLETION_DELAY,
  BLITZ_BATCH_SHIFT_DELAY
} from "@core/config";

interface BlitzOptions {
  throttleMs?: number;
}

/**
 * COMPOSABLE: useBlitzMode
 *
 * @remarks
 * Orchestrates the automated batch deep-linking ("Blitz") pipeline shared by
 * console views (Headhunter, Roster). It manages a multi-tier deep-linking
 * strategy for processing a selection of items by their IDs.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Responsibility:** Manages selection-driven, automated "Blitz" execution.
 *   Domain-agnostic: parameterized by the supplied selection store and operates
 *   purely on opaque item IDs, so any console feature can adopt it.
 *
 * **Side Effects:**
 * - Triggers global toast notifications via `useToast`.
 * - Invokes external application protocols via `useExternalLink`.
 *
 * @param selectionStore - The generalized selection store to use.
 * @param options - Configuration for throttling.
 * @returns Reactive state and handlers for batch recruitment operations.
 */
export function useBlitzMode(
  selectionStore: ReturnType<typeof useSelectionStore>,
  options: BlitzOptions = {}
) {
  const { throttleMs = BLITZ_THROTTLE_DEFAULT } = options;
  const { selectedIds, isSelectionMode, clearSelection } = selectionStore;

  /** Sequential queue of tags remaining to be opened. */
  const batchExecutionQueue = ref<string[]>([]);
  /** Timestamp of the last successful deep-link trigger. */
  const lastDeepLinkTriggerTime = ref(0);

  // Blitz State
  const isBlitzActive = ref(false);
  const blitzCurrentItemIndex = ref(0);
  let blitzOperationTimer: ReturnType<typeof setTimeout> | null = null;

  const { error, info } = useToast();
  const { modules } = useAppSettings();
  const { openInGame } = useExternalLink();
  const { isNativeWrapper, bridge: nativeBridge } = useNativeBridge();

  /** Indicates if a manual batch queue is currently being processed. */
  const isProcessing = computed(() => batchExecutionQueue.value.length > 0);

  /**
   * Environment Trust Verification.
   *
   * @remarks
   * An environment is considered trusted if:
   * - The native AndroidBridge JSBridge is available (TWA wrapper context), OR
   * - Navigator is defined (standard browser/PWA context).
   *
   * The native bridge path bypasses all web popup restrictions.
   */
  const isTrusted = computed(() => {
    if (typeof navigator === "undefined") return false;
    return true;
  });

  /**
   * UI State for the Floating Action Button (FAB).
   */
  const fabState = computed(() => {
    if (!isSelectionMode.value) {
      return {
        visible: false,
        label: "",
        actionHref: undefined,
        isProcessing: false,
        isBlasting: false,
        selectionCount: 0,
        blitzEnabled: false,
        dismissIcon: "trash",
      };
    }

    const totalSelectedCount = selectedIds.value.length;
    let label = "Open";

    if (isBlitzActive.value) {
      label = `${blitzCurrentItemIndex.value + 1} / ${totalSelectedCount}`;
    } else if (totalSelectedCount > 0) {
      if (isProcessing.value) {
        const currentlyOpeningItemNumber = totalSelectedCount - batchExecutionQueue.value.length + 1;
        label = `Open (${currentlyOpeningItemNumber}/${totalSelectedCount})`;
      } else {
        label = `Open (1/${totalSelectedCount})`;
      }
    } else {
      label = "Select";
    }

    const targetId = isBlitzActive.value
      ? selectedIds.value[blitzCurrentItemIndex.value]
      : isProcessing.value
        ? batchExecutionQueue.value[0]
        : selectedIds.value[0];

    return {
      visible: true,
      label,
      actionHref: targetId ? buildDeepLink(targetId) : undefined,
      isProcessing: isProcessing.value,
      isBlasting: isBlitzActive.value,
      selectionCount: totalSelectedCount,
      // Blitz is enabled when:
      // 1. The native AndroidBridge is present (TWA wrapper) - always available, no popup required.
      // 2. OR the user has manually enabled the blitzMode module flag in settings.
      blitzEnabled: isNativeWrapper.value || (modules.blitzMode && isTrusted.value),
      dismissIcon: "trash",
    };
  });

  /**
   * Immediately terminates the automated Blitz operation.
   *
   * @remarks
   * Resets the Blitz state and clears any pending execution timers.
   */
  function stopBlitz() {
    isBlitzActive.value = false;
    if (blitzOperationTimer) {
      clearTimeout(blitzOperationTimer);
      blitzOperationTimer = null;
    }
  }

  /**
   * Orchestrates the sequential advancement of the Blitz pipeline.
   *
   * @remarks
   * Satisfies ADR Section IV: Resilience. Implements a safety-throttled
   * recursion pattern to process the selection queue without overwhelming
   * the native intent handler or triggering browser popup guards.
   */
  function advanceBlitz() {
    if (!isBlitzActive.value) return;

    if (blitzCurrentItemIndex.value >= selectedIds.value.length) {
      stopBlitz();
      info("Blitz complete");
      return;
    }

    const activeRecruitId = selectedIds.value[blitzCurrentItemIndex.value];
    if (activeRecruitId) {
      openInGame(activeRecruitId);

      // [THREAT:] Rapid intent firing can lead to OS-level queue saturation or battery drain.
      // [DECISION LOG] Implemented a safety delay for automated blitz
      // to ensure stable deep-link resolution in the native wrapper.
      const safetyDelay = Math.max(throttleMs, BLITZ_SAFETY_DELAY);
      if (blitzCurrentItemIndex.value < selectedIds.value.length - 1) {
        blitzOperationTimer = setTimeout(() => {
          blitzCurrentItemIndex.value++;
          advanceBlitz();
        }, safetyDelay);
      } else {
        blitzOperationTimer = setTimeout(() => {
          stopBlitz();
          info("Blitz complete");
        }, BLITZ_COMPLETION_DELAY);
      }
    } else {
      if (blitzCurrentItemIndex.value < selectedIds.value.length - 1) {
        blitzCurrentItemIndex.value++;
        advanceBlitz();
      } else {
        stopBlitz();
      }
    }
  }

  /**
   * Entry point for initiating the automated Blitz operation.
   *
   * @remarks
   * Detects the environment and delegates to the native Android bridge
   * if available, otherwise initiates the web-based throttled sequence.
   */
  function handleBlitz() {
    if (isBlitzActive.value || selectedIds.value.length === 0) return;

    // [THREAT:] Hardware desynchronization if calling 'any' methods on Window.
    // [DECISION LOG] Enforcing the WindowWithBridge contract for Blitz Mode delegation.
    // This allows the native Android app to handle the full batch in a single
    // high-performance loop, bypassing web-layer constraints.
    if (nativeBridge.value) {
      nativeBridge.value.startBlitz(JSON.stringify(selectedIds.value));
      return;
    }

    if (!isTrusted.value) {
      error("Environment verification failed");
      return;
    }

    isBlitzActive.value = true;
    blitzCurrentItemIndex.value = 0;
    advanceBlitz();
  }

  /**
   * Unified click handler for the floating action button.
   *
   * @remarks
   * Supports two distinct operation modes:
   * 1. **Manual Incremental:** Advances the blitz state on each user click.
   * 2. **Batch Semi-Automated:** Processes a local queue with minimal delay.
   *
   * @param event - The triggering MouseEvent.
   */
  function handleAction(event: MouseEvent) {
    if (isBlitzActive.value) {
      // [DECISION LOG] When Blitz is active, each FAB click acts as a 'manual advance'
      // signal, allowing users to accelerate the sequence while maintaining control.
      event.preventDefault();
      const activeRecruitId = selectedIds.value[blitzCurrentItemIndex.value];
      if (activeRecruitId) {
        openInGame(activeRecruitId);
        blitzCurrentItemIndex.value++;

        if (blitzOperationTimer) {
          clearTimeout(blitzOperationTimer);
          // [THREAT:] Accidental double-clicks triggering overlapping intent calls.
          // [DECISION LOG] Resetting the auto-advance timer to prevent race conditions
          // between manual and automated progression.
          blitzOperationTimer = setTimeout(advanceBlitz, Math.max(throttleMs, BLITZ_RECOVERY_DELAY));
        }
      }
      return;
    }

    const currentTime = Date.now();
    if (currentTime - lastDeepLinkTriggerTime.value < throttleMs) {
      // [THREAT:] Rapid clicking causing browser navigation blocks or 'Popups Blocked' warnings.
      // [DECISION LOG] Enforcing a hard throttle at the action boundary.
      event.preventDefault();
      return;
    }
    lastDeepLinkTriggerTime.value = currentTime;

    if (batchExecutionQueue.value.length === 0) {
      batchExecutionQueue.value = [...selectedIds.value];
    }

    const nextQueueId = batchExecutionQueue.value[0];
    if (nextQueueId) {
      openInGame(nextQueueId);
    }

    setTimeout(() => {
      if (batchExecutionQueue.value.length > 0) {
        batchExecutionQueue.value.shift();
      }
      if (batchExecutionQueue.value.length === 0) {
        info("Batch complete");
      }
    }, BLITZ_BATCH_SHIFT_DELAY);
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      stopBlitz();
    });
  }

  // Wrap clearSelection to ensure blitz is stopped
  const clearSelectionWithStop = () => {
    stopBlitz();
    clearSelection();
    batchExecutionQueue.value = [];
    blitzCurrentItemIndex.value = 0;
  };

  return {
    fabState,
    isProcessing,
    handleAction,
    handleBlitz,
    stopBlitz,
    clearSelection: clearSelectionWithStop,
  };
}
