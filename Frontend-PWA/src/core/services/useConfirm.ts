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
  resolve: (isUserActionConfirmed: boolean) => void;
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
  /**
   * Triggers a confirmation dialog request and pauses execution until the user answers.
   *
   * @remarks
   * This is a non-blocking asynchronous method that returns a Promise. When called,
   * it registers the active modal request in the global state, allowing the MD3-styled
   * dialog component in the app container to render.
   * Satisfies ADR Section II: Layer 1 Core services (Global Dialog Confirmation).
   *
   * @param pendingConfirmationOptions - Custom settings for the modal dialog (title, message, button labels, tone).
   * @returns A Promise resolving to true if the user clicks confirm, or false otherwise.
   */
  function confirm(pendingConfirmationOptions: ConfirmOptions): Promise<boolean> {
    return new Promise((resolvePromise) => {
      active.value = {
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        tone: "default",
        ...pendingConfirmationOptions,
        resolve: resolvePromise,
      };
    });
  }

  /**
   * Resolves the single active confirmation request with the user's response.
   *
   * @remarks
   * This method is invoked by the dialog component's buttons. It invokes the active
   * promise resolver and resets the `active` reactive state to null, closing the modal.
   *
   * @param isUserActionConfirmed - Whether the user clicked the affirmative/confirm button.
   */
  function resolve(isUserActionConfirmed: boolean) {
    if (!active.value) return;
    active.value.resolve(isUserActionConfirmed);
    active.value = null;
  }

  return {
    active,
    confirm,
    resolve,
  };
}
