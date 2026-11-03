// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CONFIRMATION DIALOG SERVICE (Layer 1 Core)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes non-blocking confirmation dialog state and promises.
 * Features: Modal Lifecycle Management, In-App MD3 Presentation, Async Resolution.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 * - Satisfaction: Satisfies ADR Section I (Core Services) & ADR Section II (Presentation Orchestration).
 *   Decouples the confirmation request site from dialog rendering, allowing declarative UI
 *   components in higher layers to observe the active confirmation state without prop-drilling.
 * - Import Boundaries: Restricted to Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

import { ref, type Ref } from "vue";

/**
 * Configuration options for a single confirmation dialog request.
 *
 * @remarks
 * Defines the presentation payload and action labels passed when initiating
 * an in-app confirmation workflow.
 */
export interface ConfirmOptions {
  /** Dialog title displayed in the modal header. */
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

/**
 * Internal representation of an active confirmation request, pairing modal
 * configuration options with the pending Promise resolver.
 */
export interface ActiveConfirm extends ConfirmOptions {
  /** Promise resolver callback receiving user decision. */
  resolve: (isUserActionConfirmed: boolean) => void;
}

/**
 * Global reactive singleton tracking the single active confirmation dialog.
 *
 * @remarks
 * [DECISION LOG] Singleton Reactive State: Holding active confirmation state at module
 * scope guarantees that only one modal can be presented at a time, preventing overlapping
 * dialog conflicts while keeping dialog state synchronized across the shell.
 */
const active = ref<ActiveConfirm | null>(null);

/**
 * Return contract interface for `useConfirm`.
 *
 * @remarks
 * Defines the public reactive and operational shape of the confirmation service.
 */
export interface UseConfirmReturn {
  /** Reactive ref to the active confirmation request, or null when idle. */
  active: Ref<ActiveConfirm | null>;
  /** Requests user confirmation, returning a Promise that resolves when answered. */
  confirm: (pendingConfirmationOptions: ConfirmOptions) => Promise<boolean>;
  /** Answers and dismisses the active confirmation request. */
  resolve: (isUserActionConfirmed: boolean) => void;
}

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
 * @returns Object conforming to `UseConfirmReturn` containing reactive state and dialog controllers.
 */
export function useConfirm(): UseConfirmReturn {
  /**
   * Triggers a confirmation dialog request and pauses execution until the user answers.
   *
   * @remarks
   * This is a non-blocking asynchronous method that returns a Promise. When called,
   * it registers the active modal request in the global state, allowing the MD3-styled
   * dialog component in the app container to render.
   * Satisfies ADR Section II: Layer 1 Core services (Global Dialog Confirmation).
   *
   * [THREAT:] Unbounded modal queueing or concurrent dialog collisions.
   * [DECISION LOG] Overwriting `active.value` immediately installs the new options
   * while assigning default fallback labels ("Confirm" / "Cancel" / "default" tone).
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
   * [GUARD] Early exit if no modal is active, preventing redundant invocation or null pointer errors.
   *
   * @param isUserActionConfirmed - Whether the user clicked the affirmative/confirm button.
   */
  function resolve(isUserActionConfirmed: boolean): void {
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
