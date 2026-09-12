// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { watch, type Ref, shallowRef, onScopeDispose } from "vue";

/**
 * COMPOSABLE: useProgressiveList
 *
 * @remarks
 * Optimization #44: Progressive Rendering Engine.
 * This service implements a time-sliced rendering strategy to maintain 60FPS when
 * handling large datasets. Instead of overwhelming the DOM with hundreds of
 * items at once, it breaks the list into manageable chunks and schedules their
 * injection during idle browser frames.
 *
 * Satisfies CleanStack Architecture ADR Section IV: Performance & SWR Boundaries.
 *
 * [PERF] Optimized for v14.50.58:
 * - Uses shallowRef to reduce reactive overhead of the visible list.
 * - Utilizes IdleDeadline to process multiple chunks per idle frame.
 * - Implements automated cleanup via onScopeDispose.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @sideeffects
 * - Schedules asynchronous frame timers (`requestIdleCallback` or `requestAnimationFrame`).
 * - Mutates local shallow reactive array `visibleItems`.
 *
 * @typeParam T - The type of elements contained in the progressive list.
 * @param sourceList - The full reactive list of items to be rendered.
 * @param initialSize - The number of items to render immediately on first load (default 12).
 *
 * @returns
 * - `visibleItems`: A reactive slice of the source list that grows progressively over idle frames.
 */
export function useProgressiveList<T>(
  sourceList: Ref<readonly T[]>,
  initialSize: number = 12,
) {
  /**
   * REACTIVE STATE
   * [PERF] shallowRef: Prevents deep reactivity on large arrays,
   * significantly reducing CPU cycles during list expansion.
   */
  const visibleItems = shallowRef<T[]>([]) as Ref<T[]>;

  /**
   * SIDE EFFECTS
   * Manages scheduling and cancellation of frame-based chunk injections.
   */
  let progressiveChunkTimer: number | null = null;

  /**
   * Clears any scheduled idle callback or animation frame timer.
   *
   * @remarks
   * [DECISION LOG] Timer Idempotency: Prevents concurrent chunk injection loops
   * or memory leaks when list source changes rapidly.
   */
  function clearTimer() {
    if (progressiveChunkTimer !== null) {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(progressiveChunkTimer);
      } else {
        cancelAnimationFrame(progressiveChunkTimer);
      }
      progressiveChunkTimer = null;
    }
  }

  // [CLEANUP] Automated disposal of timers on scope unmount
  onScopeDispose(clearTimer);

  watch(
    sourceList,
    (sourceListItems, previousListItems) => {
      /**
       * Logic: Churn Prevention (Bug #17)
       *
       * @remarks
       * [THREAT: Scroll Position Disruption] Resetting the visible item window on minor
       * list updates (e.g., score polling or single item updates) causes sudden scroll jumps.
       *
       * [DECISION LOG] Minor Delta Churn Prevention: A "Refresh" is defined as a minor change
       * in list size (< 5 items). We preserve existing rendered slice length and slice updated data.
       */
      const isRefresh =
        previousListItems &&
        previousListItems.length > 0 &&
        Math.abs(sourceListItems.length - previousListItems.length) < 5;

      if (isRefresh && visibleItems.value.length >= initialSize) {
        clearTimer();
        visibleItems.value = sourceListItems.slice(0, visibleItems.value.length) as T[];
        if (visibleItems.value.length < sourceListItems.length) {
          scheduleChunk(sourceListItems as T[], visibleItems.value.length);
        }
        return;
      }

      // Fresh load or major structural change (e.g., filter applied)
      // We cancel any pending chunk injections to prevent race conditions.
      clearTimer();

      // Initial render for immediate perceived performance
      visibleItems.value = sourceListItems.slice(0, initialSize) as T[];
      if (sourceListItems.length > initialSize) {
        scheduleChunk(sourceListItems as T[], initialSize);
      }
    },
    { immediate: true },
  );

  /**
   * Schedules the next batch of items for time-sliced injection.
   *
   * @remarks
   * Utilizes requestIdleCallback where available to minimize impact on
   * user interaction threads, falling back to requestAnimationFrame.
   *
   * @param fullSourceList - The full source array of type T to render from.
   * @param renderedItemCount - The number of items currently rendered in the visible list.
   */
  function scheduleChunk(fullSourceList: T[], renderedItemCount: number) {
    const frameScheduler =
      window.requestIdleCallback || window.requestAnimationFrame;

    progressiveChunkTimer = (frameScheduler as (cb: (deadline?: IdleDeadline | number) => void) => number)((deadline) => {
      let projectedItemCount = renderedItemCount;

      // [THREAT: Runtime Interface Incompatibility] fallback requestAnimationFrame passes a
      // DOMHighResTimeStamp numeric primitive instead of an IdleDeadline object, causing
      // `deadline.timeRemaining()` to throw TypeError if called directly.
      // [DECISION LOG] Deadline Feature Detection: explicitly verify 'timeRemaining' function existence.
      const hasIdleDeadline = !!(deadline && typeof (deadline as IdleDeadline).timeRemaining === "function");

      // [PERF] IDLE BUDGETING: Process multiple chunks within a single frame
      // if the browser provides an IdleDeadline with sufficient time remaining.
      do {
        const chunkSize = fullSourceList.length > 100 ? 20 : 10;
        projectedItemCount = Math.min(projectedItemCount + chunkSize, fullSourceList.length);

        // Break early if we've reached the end of the list
        if (projectedItemCount >= fullSourceList.length) break;

      } while (hasIdleDeadline && (deadline as IdleDeadline).timeRemaining() > 1 && !(deadline as IdleDeadline).didTimeout);

      visibleItems.value = fullSourceList.slice(0, projectedItemCount);

      if (projectedItemCount < fullSourceList.length) {
        scheduleChunk(fullSourceList, projectedItemCount);
      } else {
        progressiveChunkTimer = null;
      }
    }) as unknown as number;
  }

  return {
    visibleItems,
  };
}
