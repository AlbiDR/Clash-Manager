// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";

/**
 * Configuration for a single confirmation request.
 */
export interface ConfirmOptions {
  /** Dialog title. */
  title: string;
  /** Body message, supports plain text with newlines. */
  message?: string;
  /** Label for the confirming action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancelling action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Visual tone. "danger" styles the confirm button as destructive. */
  tone?: "default" | "danger";
}

interface ActiveConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/** Global reactive state for the single active confirmation dialog. */
const active = ref<ActiveConfirm | null>(null);

/**
 * COMPOSABLE: useConfirm
 *
 * @remarks
 * Provides an in-app, MD3-styled replacement for the native `window.confirm()`
 * dialog, which renders as a legacy unstyled system dialog inside the Android
 * WebView shell.
 *
 * [ARCHITECTURE] ADR LAYER: @core (Layer 1)
 * - Permitted Imports: Other @core services, Vue reactivity.
 * - Forbidden Imports: Any component or service from @shared or @features.
 *
 * @returns
 * - `active`: Reactive ref of the current confirmation request (null when idle).
 * - `confirm`: Requests confirmation and resolves to a boolean once answered.
 * - `resolve`: Answers the active confirmation request.
 */
export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolvePromise) => {
      active.value = {
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        tone: "default",
        ...options,
        resolve: resolvePromise,
      };
    });
  }

  function resolve(confirmed: boolean) {
    if (!active.value) return;
    active.value.resolve(confirmed);
    active.value = null;
  }

  return {
    active,
    confirm,
    resolve,
  };
}
