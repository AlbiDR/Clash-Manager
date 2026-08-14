// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Yields one browser frame before work that can trigger broad view churn.
 *
 * @remarks
 * Navigation controls live above feature views. Recovery actions and dataset
 * commits can still make the main thread busy, so callers use this checkpoint
 * after user acknowledgment but before expensive work begins. This gives fixed
 * controls such as the dock a chance to paint their pressed/optimistic state.
 */
export function yieldToInteractionFrame(): Promise<void> {
  if (import.meta.env.MODE === "test") return Promise.resolve();

  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
